import "server-only";

import {
  PUBLIC_RECORD_TYPES,
  parseCacRegistrationNumber,
  publicRecordType,
  type PublicRecordCollectionOutcome,
  type PublicRecordResult,
  type PublicRecordTypeId,
} from "@/lib/public-record-types";
import type { ProcurementAward } from "@/lib/domain/types";
import type { JournolRepository } from "@/lib/server/repository";

/**
 * Searches Nigerian public records for an investigation. Each collection is
 * searched independently: one being unavailable or unconfigured is reported
 * for that collection and never hides results from the others.
 */

export const PROCUREMENT_PUBLICATION = "nigeria_bpp";
const PROCUREMENT_DATASET_URL = "https://data.open-contracting.org/en/publication/64";
const TAVILY_ENDPOINT = "https://api.tavily.com/search";
const SEARCH_TIMEOUT_MS = 8_000;
const RESULTS_PER_COLLECTION = 6;

/** Official sites each web-searched collection is restricted to. */
export const OFFICIAL_DOMAINS: Partial<Record<PublicRecordTypeId, string[]>> = {
  treasury_payments: ["opentreasury.gov.ng", "govspend.ng"],
  audit_reports: ["oaugf.ng"],
  court_judgments: ["nigerialii.org"],
};

export type PublicRecordSearchDependencies = {
  fetch: typeof fetch;
  env: Record<string, string | undefined>;
};

const defaultDependencies = (): PublicRecordSearchDependencies => ({ fetch, env: process.env });

export type PublicRecordSearchOutcome = {
  results: PublicRecordResult[];
  outcomes: PublicRecordCollectionOutcome[];
};

function outcome(recordType: PublicRecordTypeId, status: PublicRecordCollectionOutcome["status"], message: string | null, dataAsOf: string | null = null): PublicRecordCollectionOutcome {
  return { recordType, status, message, manualLookupUrl: publicRecordType(recordType).manualLookupUrl, dataAsOf };
}

function text(value: unknown, maxLength: number) {
  return typeof value === "string" ? value.replace(/\s+/g, " ").trim().slice(0, maxLength) : "";
}

function hostname(url: string) {
  try { return new URL(url).hostname.replace(/^www\./, ""); } catch { return ""; }
}

/** Keeps a result only if it really is on one of the collection's official domains. */
function onDomain(url: string, domains: string[]) {
  const host = hostname(url);
  return domains.some((domain) => host === domain || host.endsWith(`.${domain}`));
}

function cleanResultUrl(value: unknown) {
  if (typeof value !== "string") return null;
  try {
    const url = new URL(value);
    if (url.protocol !== "https:" && url.protocol !== "http:") return null;
    for (const key of [...url.searchParams.keys()]) if (/^(utm_|fbclid$|gclid$)/i.test(key)) url.searchParams.delete(key);
    url.hash = "";
    return url.toString();
  } catch {
    return null;
  }
}

function formatAmount(amount: number | null, currency: string | null) {
  if (amount === null) return null;
  const formatted = amount.toLocaleString("en-GB", { maximumFractionDigits: 2 });
  return currency === "NGN" ? `₦${formatted}` : `${currency ? `${currency} ` : ""}${formatted}`;
}

function formatDate(value: Date | null) {
  return value ? value.toISOString().slice(0, 10) : null;
}

export function procurementResult(award: ProcurementAward, index: number): PublicRecordResult {
  const details: PublicRecordResult["details"] = [];
  const add = (label: string, value: string | null | undefined) => { if (value) details.push({ label, value }); };
  add("Contractor", award.supplierNames.join("; ") || null);
  add("Procuring agency", award.buyerName);
  add("Award value", formatAmount(award.amount, award.currency));
  add("Contract value", award.contractAmount !== null && award.contractAmount !== award.amount ? formatAmount(award.contractAmount, award.contractCurrency) : null);
  add("Award date", formatDate(award.awardDate));
  add("Procurement method", award.procurementMethod);
  add("Award status", award.awardStatus);
  add("OCID", award.ocid);
  return {
    id: `procurement-${index + 1}`,
    recordType: "procurement",
    title: award.title || `Contract award ${award.ocid}`,
    url: PROCUREMENT_DATASET_URL,
    publisher: "Bureau of Public Procurement (NOCOPO open data)",
    snippet: award.description ? award.description.slice(0, 600) : "",
    publishedAt: formatDate(award.awardDate ?? award.releaseDate),
    details,
    access: "indexed_open_data",
    caveats: publicRecordType("procurement").caveats,
  };
}

async function searchProcurement(repository: JournolRepository, query: string) {
  const ingestion = await repository.getLatestProcurementIngestion(PROCUREMENT_PUBLICATION);
  if (!ingestion) {
    return { results: [], outcome: outcome("procurement", "not_configured", "Federal contract data has not been loaded into Journol yet. An administrator needs to run the procurement data import.") };
  }
  const dataAsOf = ingestion.finishedAt.toISOString().slice(0, 10);
  const awards = await repository.searchProcurementAwards(query, RESULTS_PER_COLLECTION);
  return {
    results: awards.map(procurementResult),
    outcome: outcome("procurement", awards.length ? "ok" : "no_results", awards.length ? null : "No published federal contract awards matched this search.", dataAsOf),
  };
}

type DojahAffiliate = { first_name?: unknown; last_name?: unknown; affiliate_type?: unknown };

/**
 * Looks up a registration number through Dojah's CAC service. Only company
 * details and the names and roles of affiliates are kept; affiliates' phone
 * numbers, gender and other personal fields are discarded on receipt.
 */
async function searchCompanyRegistry(query: string, dependencies: PublicRecordSearchDependencies) {
  const registration = parseCacRegistrationNumber(query);
  if (!registration) {
    return { results: [], outcome: outcome("company_registry", "needs_registration_number", "Enter an RC or BN number (for example RC 1234567) to look up a company. Search by name on CAC's public search first.") };
  }
  const appId = dependencies.env.DOJAH_APP_ID?.trim();
  const secret = dependencies.env.DOJAH_SECRET_KEY?.trim();
  if (!appId || !secret) {
    return { results: [], outcome: outcome("company_registry", "not_configured", "Automatic CAC lookups are not set up. Use CAC's public search for now.") };
  }
  const base = (dependencies.env.DOJAH_BASE_URL?.trim() || "https://api.dojah.io").replace(/\/+$/, "");
  const url = new URL(`${base}/api/v1/kyc/cac/advance`);
  url.searchParams.set("rc_number", registration.number);
  url.searchParams.set("company_type", registration.companyType);
  const response = await dependencies.fetch(url, {
    headers: { AppId: appId, Authorization: secret, Accept: "application/json" },
    signal: AbortSignal.timeout(SEARCH_TIMEOUT_MS),
  });
  if (response.status === 404 || response.status === 400) {
    return { results: [], outcome: outcome("company_registry", "no_results", `No ${registration.companyType === "BUSINESS_NAME" ? "business name" : "company"} was found with number ${registration.number}.`) };
  }
  if (!response.ok) throw new Error(`CAC_PROVIDER_HTTP_${response.status}`);
  const body: unknown = await response.json();
  const entity = body && typeof body === "object" ? (body as { entity?: unknown }).entity : null;
  if (!entity || typeof entity !== "object") {
    return { results: [], outcome: outcome("company_registry", "no_results", `No record was returned for number ${registration.number}.`) };
  }
  const record = entity as Record<string, unknown>;
  const name = text(record.company_name, 300);
  const affiliates = (Array.isArray(record.affiliates) ? record.affiliates as Array<DojahAffiliate | null> : [])
    .map((affiliate) => {
      const fullName = [text(affiliate?.first_name, 100), text(affiliate?.last_name, 100)].filter(Boolean).join(" ");
      const role = text(affiliate?.affiliate_type, 60).toLowerCase().replace(/_/g, " ");
      return fullName ? `${fullName}${role ? ` (${role})` : ""}` : "";
    })
    .filter(Boolean)
    .slice(0, 30);
  const details: PublicRecordResult["details"] = [];
  const add = (label: string, value: string) => { if (value) details.push({ label, value }); };
  add("Registration number", text(record.rc_number, 30) || registration.number);
  add("Type", text(record.type_of_company, 60).replace(/_/g, " ").toLowerCase());
  add("Status", text(record.status, 60));
  add("Registered", text(record.date_of_registration, 30).slice(0, 10));
  add("Registered address", text(record.address, 300));
  add("State", text(record.state, 60));
  add("Nature of business", text(record.nature_of_business, 300));
  add("Directors, proprietors and shareholders", affiliates.join("; "));
  return {
    results: [{
      id: "company_registry-1",
      recordType: "company_registry",
      title: name || `Registration ${registration.number}`,
      url: publicRecordType("company_registry").manualLookupUrl,
      publisher: "Corporate Affairs Commission (via Dojah)",
      snippet: "",
      publishedAt: null,
      details,
      access: "registry_provider",
      caveats: publicRecordType("company_registry").caveats,
    } satisfies PublicRecordResult],
    outcome: outcome("company_registry", "ok", null),
  };
}

async function searchOfficialSite(recordType: PublicRecordTypeId, query: string, dependencies: PublicRecordSearchDependencies) {
  const domains = OFFICIAL_DOMAINS[recordType] ?? [];
  const apiKey = dependencies.env.TAVILY_API_KEY?.trim();
  if (!apiKey) {
    return { results: [], outcome: outcome(recordType, "not_configured", "Official-site search is not set up for this deployment. Use the official site directly.") };
  }
  const response = await dependencies.fetch(TAVILY_ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({
      query,
      search_depth: "basic",
      max_results: RESULTS_PER_COLLECTION,
      include_domains: domains,
      include_answer: false,
      include_raw_content: false,
    }),
    signal: AbortSignal.timeout(SEARCH_TIMEOUT_MS),
  });
  if (!response.ok) throw new Error(`OFFICIAL_SITE_SEARCH_HTTP_${response.status}`);
  const body: unknown = await response.json();
  const rows = body && typeof body === "object" && Array.isArray((body as { results?: unknown }).results) ? (body as { results: unknown[] }).results : [];
  const type = publicRecordType(recordType);
  const seen = new Set<string>();
  const results: PublicRecordResult[] = [];
  for (const row of rows) {
    if (!row || typeof row !== "object") continue;
    const entry = row as Record<string, unknown>;
    const url = cleanResultUrl(entry.url);
    const title = text(entry.title, 300);
    if (!url || !title || seen.has(url) || !onDomain(url, domains)) continue;
    seen.add(url);
    const publisher = hostname(url);
    results.push({
      id: `${recordType}-${results.length + 1}`,
      recordType,
      title,
      url,
      publisher,
      snippet: text(entry.content, 1_200),
      publishedAt: typeof entry.published_date === "string" ? entry.published_date.slice(0, 40) : null,
      details: url.toLowerCase().endsWith(".pdf") ? [{ label: "Format", value: "PDF — download it and upload it to Sources to quote from it" }] : [],
      access: "official_site_search",
      caveats: [...type.caveats, "This is a search excerpt. Open the record before relying on it."],
    });
  }
  return {
    results,
    outcome: outcome(recordType, results.length ? "ok" : "no_results", results.length ? null : `Nothing on ${domains.join(" or ")} matched this search.`),
  };
}

export async function searchPublicRecords(
  repository: JournolRepository,
  input: { query: string; recordTypes: PublicRecordTypeId[] },
  dependencies: PublicRecordSearchDependencies = defaultDependencies(),
): Promise<PublicRecordSearchOutcome> {
  const requested = PUBLIC_RECORD_TYPES.map((type) => type.id).filter((id) => input.recordTypes.includes(id));
  const settled = await Promise.allSettled(requested.map((recordType) => {
    if (recordType === "procurement") return searchProcurement(repository, input.query);
    if (recordType === "company_registry") return searchCompanyRegistry(input.query, dependencies);
    return searchOfficialSite(recordType, input.query, dependencies);
  }));

  const results: PublicRecordResult[] = [];
  const outcomes: PublicRecordCollectionOutcome[] = [];
  settled.forEach((entry, index) => {
    const recordType = requested[index];
    if (entry.status === "fulfilled") {
      results.push(...entry.value.results);
      outcomes.push(entry.value.outcome);
      return;
    }
    console.warn(`[journol:public-records] collection=${recordType} category=${entry.reason instanceof Error ? entry.reason.message.slice(0, 60) : "unknown"}`);
    outcomes.push(outcome(recordType, "unavailable", "This collection could not be searched just now. Try again, or use the official site."));
  });
  return { results, outcomes };
}
