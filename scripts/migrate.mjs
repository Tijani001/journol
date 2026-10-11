import dotenv from "dotenv";
dotenv.config({ path: ".env.local" });
import { createHash } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import pg from "pg";

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

function isCertificateVerificationError(error) {
  return error?.code === "SELF_SIGNED_CERT_IN_CHAIN" || error?.code === "UNABLE_TO_VERIFY_LEAF_SIGNATURE";
}

const connectionString = process.env.DATABASE_URL?.trim();
if (!connectionString) {
  console.error("DATABASE_URL is required to run migrations.");
  process.exit(1);
}

const migrationsDirectory = join(process.cwd(), "db", "migrations");
const files = (await readdir(migrationsDirectory)).filter((file) => file.endsWith(".sql")).sort();
const pool = new pg.Pool({
  connectionString,
  ssl: databaseTlsConfig(),
});

try {
  await pool.query(`CREATE TABLE IF NOT EXISTS schema_migrations (
    name text PRIMARY KEY,
    checksum text NOT NULL,
    applied_at timestamptz NOT NULL DEFAULT now()
  )`);

  for (const file of files) {
    const sql = await readFile(join(migrationsDirectory, file), "utf8");
    const checksum = createHash("sha256").update(sql).digest("hex");
    const existing = await pool.query("SELECT checksum FROM schema_migrations WHERE name = $1", [file]);
    if (existing.rowCount) {
      if (existing.rows[0].checksum !== checksum) throw new Error(`Migration checksum changed: ${file}`);
      continue;
    }

    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      await client.query(sql);
      await client.query("INSERT INTO schema_migrations (name, checksum) VALUES ($1, $2)", [file, checksum]);
      await client.query("COMMIT");
      console.log(`Applied ${file}`);
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }
} catch (error) {
  if (isCertificateVerificationError(error)) {
    throw new Error(
      "PostgreSQL TLS certificate verification failed. Download the database CA certificate from Supabase Database Settings → SSL Configuration and set DATABASE_SSL_CA_CERT to that PEM value (with \\n for line breaks). TLS verification remains enabled.",
      { cause: error },
    );
  }
  throw error;
} finally {
  await pool.end();
}
