// Imports federal contract awards from the Bureau of Public Procurement's
// open contracting data (NOCOPO, published in OCDS format) into the
// procurement_awards table that powers public-record search.
//
// Usage:
//   npm run records:import-procurement                  # downloads the latest full file
//   npm run records:import-procurement -- ./full.jsonl.gz   # imports a local copy
//
// The Open Contracting Partnership refreshes this file monthly. Re-running the
// import updates existing awards in place; it never deletes rows.
import dotenv from "dotenv";
dotenv.config({ path: ".env.local" });
import { createReadStream } from "node:fs";
import { createInterface } from "node:readline";
import { Readable } from "node:stream";
import { createGunzip } from "node:zlib";
import pg from "pg";
import { awardsFromOcdsLine } from "./ocds-awards.mjs";

const PUBLICATION = "nigeria_bpp";
const DEFAULT_SOURCE = "https://data.open-contracting.org/en/publication/64/download?name=full.jsonl.gz";
const BATCH_SIZE = 400;

function databaseTlsConfig() {
  if (process.env.DATABASE_SSL !== "true") return undefined;
  const rawCa = process.env.DATABASE_SSL_CA_CERT?.trim();
  if (!rawCa) return { rejectUnauthorized: true };
  const ca = rawCa.replace(/\\n/g, "\n");
  if (!ca.includes("-----BEGIN CERTIFICATE-----") || !ca.includes("-----END CERTIFICATE-----")) {
    throw new Error("DATABASE_SSL_CA_CERT must contain a PEM-encoded certificate authority.");
  }
  return { ca, rejectUnauthorized: true };
}

async function openSource(source) {
  if (/^https:\/\//i.test(source)) {
    const response = await fetch(source, { redirect: "follow" });
    if (!response.ok || !response.body) throw new Error(`Download failed with HTTP ${response.status}`);
    return Readable.fromWeb(response.body);
  }
  return createReadStream(source);
}

const COLUMNS = ["ocid", "award_id", "publication", "buyer_name", "title", "description", "supplier_names", "amount", "currency", "award_date", "award_status", "procurement_method", "contract_amount", "contract_currency", "release_date", "search_text"];

async function upsert(client, awards) {
  if (!awards.length) return 0;
  // An OCID can repeat within a batch; keep the last occurrence of each key.
  const unique = [...new Map(awards.map((award) => [`${award.ocid}\u0000${award.awardId}`, award])).values()];
  const values = [];
  const rows = unique.map((award, rowIndex) => {
    const row = [award.ocid, award.awardId, PUBLICATION, award.buyerName, award.title, award.description, award.supplierNames, award.amount, award.currency, award.awardDate, award.awardStatus, award.procurementMethod, award.contractAmount, award.contractCurrency, award.releaseDate, award.searchText];
    values.push(...row);
    return `(${row.map((_, columnIndex) => `$${rowIndex * COLUMNS.length + columnIndex + 1}`).join(",")})`;
  });
  const updates = COLUMNS.filter((column) => column !== "ocid" && column !== "award_id").map((column) => `${column} = EXCLUDED.${column}`).join(", ");
  await client.query(
    `INSERT INTO procurement_awards (${COLUMNS.join(", ")}) VALUES ${rows.join(",")} ON CONFLICT (ocid, award_id) DO UPDATE SET ${updates}, ingested_at = now()`,
    values,
  );
  return unique.length;
}

const connectionString = process.env.DATABASE_URL?.trim();
if (!connectionString) {
  console.error("DATABASE_URL is required to import procurement data.");
  process.exit(1);
}

const source = process.argv[2] || process.env.JOURNOL_PROCUREMENT_SOURCE || DEFAULT_SOURCE;
const pool = new pg.Pool({ connectionString, ssl: databaseTlsConfig(), max: 2 });
const run = await pool.query("INSERT INTO procurement_ingestion_runs (publication, source_file, status) VALUES ($1, $2, 'running') RETURNING id", [PUBLICATION, source.slice(0, 500)]);
const runId = run.rows[0].id;
let processesRead = 0;
let awardsUpserted = 0;
let malformedLines = 0;

try {
  const raw = await openSource(source);
  const stream = /\.gz($|\?|&)|name=[^&]*\.gz/i.test(source) ? raw.pipe(createGunzip()) : raw;
  const lines = createInterface({ input: stream, crlfDelay: Infinity });
  const client = await pool.connect();
  try {
    let batch = [];
    for await (const line of lines) {
      if (!line.trim()) continue;
      let awards;
      try {
        awards = awardsFromOcdsLine(line);
      } catch {
        malformedLines += 1;
        continue;
      }
      processesRead += 1;
      batch.push(...awards);
      if (batch.length >= BATCH_SIZE) {
        awardsUpserted += await upsert(client, batch);
        batch = [];
        if (processesRead % 5_000 < 50) console.log(`Read ${processesRead.toLocaleString()} processes; ${awardsUpserted.toLocaleString()} awards stored`);
      }
    }
    awardsUpserted += await upsert(client, batch);
  } finally {
    client.release();
  }
  if (processesRead === 0) throw new Error("The source contained no readable contracting processes.");
  await pool.query("UPDATE procurement_ingestion_runs SET status = 'succeeded', processes_read = $2, awards_upserted = $3, finished_at = now() WHERE id = $1", [runId, processesRead, awardsUpserted]);
  console.log(`Imported ${awardsUpserted.toLocaleString()} awards from ${processesRead.toLocaleString()} contracting processes${malformedLines ? ` (${malformedLines} unreadable lines skipped)` : ""}.`);
} catch (error) {
  const message = error instanceof Error ? error.message : String(error);
  await pool.query("UPDATE procurement_ingestion_runs SET status = 'failed', processes_read = $2, awards_upserted = $3, error = $4, finished_at = now() WHERE id = $1", [runId, processesRead, awardsUpserted, message.slice(0, 1000)]);
  console.error(`Procurement import failed: ${message}`);
  process.exitCode = 1;
} finally {
  await pool.end();
}
