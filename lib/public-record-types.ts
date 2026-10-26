/**
 * Nigerian public-record collections Journol can search, shared by the server
 * and the browser. Each entry says exactly how Journol reaches the records,
 * so a journalist knows what a result is and is not.
 */

export type PublicRecordTypeId = "procurement" | "company_registry" | "treasury_payments" | "audit_reports" | "court_judgments";

export type PublicRecordAccess =
  /** Journol keeps an indexed copy of the official open data. */
  | "indexed_open_data"
  /** A licensed provider queries the official register on Journol's behalf. */
  | "registry_provider"
  /** A web search restricted to the official site or its recognised mirror. */
  | "official_site_search";

export type PublicRecordType = {
  id: PublicRecordTypeId;
  label: string;
  holder: string;
  description: string;
  access: PublicRecordAccess;
  /** Official page where the journalist can check a result by hand. */
  manualLookupUrl: string;
  caveats: string[];
};

export const PUBLIC_RECORD_TYPES: readonly PublicRecordType[] = [
  {
    id: "procurement",
    label: "Federal contract awards",
    holder: "Bureau of Public Procurement (NOCOPO)",
    description: "Contract awards published by federal ministries, departments and agencies, searchable by contractor, agency or contract title.",
    access: "indexed_open_data",
    manualLookupUrl: "https://nocopo.bpp.gov.ng/",
    caveats: [
      "Covers what agencies chose to publish on NOCOPO; many awards are never published.",
      "An award is not a payment. Check treasury records before saying money was paid.",
    ],
  },
  {
    id: "company_registry",
    label: "Company registry (CAC)",
    holder: "Corporate Affairs Commission",
    description: "Registration details and listed directors or proprietors for a company or business name, looked up by its RC or BN number.",
    access: "registry_provider",
    manualLookupUrl: "https://search.cac.gov.ng",
    caveats: [
      "Automatic lookups need an RC or BN number. Search names on CAC's public search, then look up the number here.",
      "Register entries can be out of date. A certified true copy from CAC is the authoritative record.",
    ],
  },
  {
    id: "treasury_payments",
    label: "Treasury payments",
    holder: "Office of the Accountant-General (Open Treasury Portal) and BudgIT's GovSpend",
    description: "Daily federal payment reports, searched on the Open Treasury Portal and on GovSpend, which republishes them in cleaner form.",
    access: "official_site_search",
    manualLookupUrl: "https://www.opentreasury.gov.ng/",
    caveats: [
      "Many daily payment reports are missing from the portal, so absence of a payment is not proof it was not made.",
      "Payments are rarely linked to contracts; match them by beneficiary, amount and date.",
    ],
  },
  {
    id: "audit_reports",
    label: "Auditor-General reports",
    holder: "Office of the Auditor-General for the Federation",
    description: "Annual audit reports and audit queries on federal ministries, departments and agencies.",
    access: "official_site_search",
    manualLookupUrl: "https://oaugf.ng/index.php/audit-reports",
    caveats: [
      "Audit queries are findings put to agencies, not final determinations. Look for the agency's response and any Public Accounts Committee hearing.",
    ],
  },
  {
    id: "court_judgments",
    label: "Court judgments",
    holder: "Nigeria Legal Information Institute (NigeriaLII)",
    description: "Published judgments of the Supreme Court, Court of Appeal and other courts.",
    access: "official_site_search",
    manualLookupUrl: "https://nigerialii.org/search",
    caveats: [
      "NigeriaLII publishes a selection of judgments. A missing case does not mean there was none; check the court registry.",
      "Name matches can be different people or companies. Confirm the parties and suit number.",
    ],
  },
];

export const PUBLIC_RECORD_TYPE_IDS = PUBLIC_RECORD_TYPES.map((type) => type.id);

export function isPublicRecordTypeId(value: unknown): value is PublicRecordTypeId {
  return typeof value === "string" && (PUBLIC_RECORD_TYPE_IDS as readonly string[]).includes(value);
}

export function publicRecordType(id: PublicRecordTypeId): PublicRecordType {
  const type = PUBLIC_RECORD_TYPES.find((entry) => entry.id === id);
  if (!type) throw new Error(`Unknown public record type: ${id}`);
  return type;
}

/** A single search result, stored with the lookup for the investigation's audit trail. */
export type PublicRecordResult = {
  id: string;
  recordType: PublicRecordTypeId;
  title: string;
  url: string;
  publisher: string;
  snippet: string;
  publishedAt: string | null;
  /** Structured fields such as contractor, amount or RC number. */
  details: Array<{ label: string; value: string }>;
  access: PublicRecordAccess;
  caveats: string[];
};

/** Per-collection outcome, so one unavailable collection never hides the others. */
export type PublicRecordCollectionOutcome = {
  recordType: PublicRecordTypeId;
  status: "ok" | "no_results" | "not_configured" | "needs_registration_number" | "unavailable";
  message: string | null;
  manualLookupUrl: string;
  dataAsOf: string | null;
};

export const PUBLIC_RECORD_QUERY_MAX = 200;

/**
 * Reads a CAC registration number such as "RC 1234567", "BN 3456789" or
 * "IT 12345". A bare number is treated as a company (RC) number.
 */
export function parseCacRegistrationNumber(query: string): { number: string; companyType: "COMPANY" | "BUSINESS_NAME" | "INCORPORATED_TRUSTEES" | "LIMITED_PARTNERSHIP" | "LIMITED_LIABILITY_PARTNERSHIP" } | null {
  const match = /^\s*(RC|BN|IT|LP|LLP)?[\s\-:#.]*(\d{3,9})\s*$/i.exec(query);
  if (!match) return null;
  const prefix = (match[1] ?? "RC").toUpperCase();
  const companyType = ({ RC: "COMPANY", BN: "BUSINESS_NAME", IT: "INCORPORATED_TRUSTEES", LP: "LIMITED_PARTNERSHIP", LLP: "LIMITED_LIABILITY_PARTNERSHIP" } as const)[prefix as "RC" | "BN" | "IT" | "LP" | "LLP"];
  return { number: match[2], companyType };
}
