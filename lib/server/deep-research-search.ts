import "server-only";

import type { ResearchSourceCard } from "@/lib/server/deep-research-quality";

export type ResearchSearchResult = ResearchSourceCard;
// Included in every report snapshot. Bump this only when a material change to
// the evidence contract should produce a fresh report rather than reuse one.
export const DEEP_RESEARCH_ENGINE_VERSION = "2.2.2";

export class DeepResearchSearchConfigurationError extends Error {}
export class DeepResearchSearchError extends Error {}
export class DeepResearchInsufficientSourcesError extends DeepResearchSearchError {}
export class DeepResearchSearchUnavailableError extends DeepResearchSearchError {}

export type DeepResearchSearchOutcome = ResearchSearchResult[] & {
  warnings: string[];
};

const SEARCH_ENDPOINT = "https://api.tavily.com/search";
function boundedEnvironmentNumber(name: string, fallback: number, maximum: number) {
  const value = Number.parseInt(process.env[name] ?? "", 10);
  return Number.isInteger(value) && value > 0 ? Math.min(value, maximum) : fallback;
}

// These remain deliberately capped even if an environment value is supplied:
// Deep Research is a journalist-triggered feature, not a recursive crawler.
const MAX_QUERIES = boundedEnvironmentNumber("JOURNOL_DEEP_RESEARCH_MAX_QUERIES", 4, 4);
const MAX_RESULTS_PER_QUERY = boundedEnvironmentNumber("JOURNOL_DEEP_RESEARCH_MAX_RESULTS_PER_QUERY", 5, 5);

/**
 * Generates a small, transparent query plan without using model knowledge.
 * It is deliberately bounded: Deep Research is journalist-triggered and no
 * more than three external searches run for one report.
 */
export function buildResearchPlan(input: { title: string; publisher: string | null; instructions: string | null }) {
  const subject = input.title.trim().slice(0, 350);
  const queries = [
    input.instructions?.trim() ? `${subject} ${input.instructions.trim().slice(0, 500)}` : `${subject} current reporting`,
    `${subject} previous incidents historical background`,
    `${subject} official records government response policy`,
    `${subject} figures statistics conflicting accounts`,
  ];
  return {
    engineVersion: DEEP_RESEARCH_ENGINE_VERSION,
    purpose: "Find externally published context, documented precedents, public records, numerical claims, and potentially conflicting accounts.",
    queries: [...new Set(queries.map((query) => query.replace(/\s+/g, " ").trim()).filter(Boolean))].slice(0, MAX_QUERIES),
    sourcePublisher: input.publisher,
    limitations: [
      "Search results are leads for verification, not proof.",
      "Result snippets may be incomplete, syndicated, or omit material context.",
      "A citation to a retrieved snippet does not independently establish a claim as true.",
    ],
  };
}

function cleanUrl(value: unknown) {
  if (typeof value !== "string") return null;
  try {
    const url = new URL(value);
    if (url.protocol !== "https:" && url.protocol !== "http:") return null;
    for (const key of [...url.searchParams.keys()]) {
      if (/^(utm_|fbclid$|gclid$)/i.test(key)) url.searchParams.delete(key);
    }
    url.hash = "";
    return url.toString();
  } catch { return null; }
}

function string(value: unknown, maxLength: number) {
  return typeof value === "string" ? value.trim().slice(0, maxLength) : "";
}

function publisherFromUrl(url: string) {
  try { return new URL(url).hostname.replace(/^www\./, "") || null; } catch { return null; }
}

function sourceType(url: string): ResearchSearchResult["sourceType"] {
  const hostname = publisherFromUrl(url)?.toLowerCase() ?? "";
  if (hostname === "gov.ng" || hostname === "gov.uk" || hostname === "gov.za" || hostname.endsWith(".gov") || hostname.endsWith(".gov.ng") || hostname.endsWith(".gov.uk") || hostname.endsWith(".gov.za") || hostname.includes(".gov.")) return "official";
  if (/(court|judiciary|justice)/.test(hostname)) return "court_or_legal";
  if (/\.(edu|ac\.[a-z]{2,})$/.test(hostname)) return "academic";
  if (/(amnesty|transparency|humanrights|ngo|civilsociety)/.test(hostname)) return "civil_society";
  if (/(news|times|guardian|reuters|bbc|apnews|aljazeera|premiumtimes|thecable|punchng)/.test(hostname)) return "journalism";
  return "other";
}

function provenance(url: string) {
  const hostname = publisherFromUrl(url)?.toLowerCase() ?? "";
  if (/(un\.org|unhcr|unicef|who\.int)/.test(hostname)) return { institutionCategory: "Intergovernmental organisation or UN agency", contentRole: "Institutional reporting" };
  if (/(icrc|redcross|redcrescent|msf)/.test(hostname)) return { institutionCategory: "Humanitarian organisation", contentRole: "Primary institutional statement" };
  if (/(court|judiciary|justice|parliament|assembly|senate|legislature)/.test(hostname)) return { institutionCategory: "Court or legislative institution", contentRole: "Official record or statement" };
  if (sourceType(url) === "official") return { institutionCategory: "Government or regulatory institution", contentRole: "Official record or statement" };
  if (sourceType(url) === "academic") return { institutionCategory: "Academic institution", contentRole: "Research publication" };
  if (sourceType(url) === "civil_society") return { institutionCategory: "Civil society or research organisation", contentRole: "Research or advocacy publication" };
  if (sourceType(url) === "journalism") return { institutionCategory: "News organisation", contentRole: "Secondary reporting" };
  if (/(x\.com|twitter\.com|facebook\.com|instagram\.com|youtube\.com|tiktok\.com)/.test(hostname)) return { institutionCategory: "Social media publication", contentRole: "Platform publication" };
  return { institutionCategory: "Unclassified or unclear provenance", contentRole: "Unclear content role" };
}

function fingerprint(value: string) {
  return value.toLowerCase().replace(/[^\p{L}\p{N} ]/gu, " ").replace(/\s+/g, " ").trim().split(" ").slice(0, 18).join(" ");
}

function sourcePriority(source: ResearchSearchResult) {
  // This is a triage order for reporting, not a truth score. Every source
  // remains subject to the report's evidence limitations.
  return ({ official: 0, court_or_legal: 1, academic: 2, civil_society: 3, journalism: 4, other: 5 } as const)[source.sourceType];
}

export async function searchExternalResearch(queries: string[]): Promise<DeepResearchSearchOutcome> {
  const apiKey = process.env.TAVILY_API_KEY?.trim();
  if (!apiKey) throw new DeepResearchSearchConfigurationError("Deep Research search is not configured.");

  const responses = await Promise.allSettled(queries.slice(0, MAX_QUERIES).map(async (query) => {
    const response = await fetch(SEARCH_ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({ query, search_depth: "basic", max_results: MAX_RESULTS_PER_QUERY, include_answer: false, include_raw_content: false }),
      signal: AbortSignal.timeout(5_000),
    });
    if (!response.ok) throw new DeepResearchSearchError("The external research service did not return a usable result.");
    const body: unknown = await response.json();
    const results = body && typeof body === "object" && "results" in body ? (body as { results?: unknown }).results : [];
    return Array.isArray(results) ? results : [];
  }));

  const unique = new Map<string, ResearchSearchResult>();
  const byFingerprint = new Map<string, string>();
  for (const response of responses) {
    if (response.status !== "fulfilled") continue;
    for (const entry of response.value) {
      if (!entry || typeof entry !== "object") continue;
      const row = entry as Record<string, unknown>;
      const url = cleanUrl(row.url);
      const title = string(row.title, 500);
      const snippet = string(row.content, 3_000);
      if (!url || !title || !snippet || unique.has(url)) continue;
      const repeatedSourceId = byFingerprint.get(fingerprint(`${title} ${snippet}`));
      const provenanceMetadata = provenance(url);
      const source: ResearchSearchResult = {
        id: `source-${unique.size + 1}`,
        title,
        url,
        publisher: publisherFromUrl(url),
        publishedAt: typeof row.published_date === "string" ? row.published_date.slice(0, 80) : null,
        snippet,
        sourceType: sourceType(url),
        evidenceMode: "search_snippet",
        limitations: ["This is a search-result excerpt. Review the original source before treating it as verified evidence."],
        likelyRepeatedSourceIds: repeatedSourceId ? [repeatedSourceId] : [],
        institutionCategory: provenanceMetadata.institutionCategory,
        contentRole: provenanceMetadata.contentRole,
        originatingClaimSourceId: repeatedSourceId ?? null,
      };
      unique.set(url, source);
      byFingerprint.set(fingerprint(`${title} ${snippet}`), source.id);
    }
  }
  const results = [...unique.values()].sort((a, b) => sourcePriority(a) - sourcePriority(b)).slice(0, 12);
  if (!results.length) {
    if (responses.every((response) => response.status === "rejected")) {
      throw new DeepResearchSearchUnavailableError("The external search service was unavailable for every planned query.");
    }
    throw new DeepResearchInsufficientSourcesError("No usable external sources were found for this research request.");
  }
  const failedQueries = responses.filter((response) => response.status === "rejected").length;
  Object.defineProperty(results, "warnings", {
    value: failedQueries > 0
      ? ["Some external sources could not be retrieved. This report is based on the material that was available."]
      : [],
    enumerable: false,
  });
  return results as DeepResearchSearchOutcome;
}
