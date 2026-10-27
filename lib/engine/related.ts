import type { RelatedReport, SearchStatus } from "@/lib/engine/types";

/**
 * Searches the web for other reporting on the same people, places and
 * promises, then folds copies of the same report into one entry so that a
 * press release printed by eight outlets counts once.
 */

export const TAVILY_ENDPOINT = "https://api.tavily.com/search";
export const MAX_QUERIES = 4;
export const RESULTS_PER_QUERY = 6;
export const MAX_RELATED_REPORTS = 14;
const SEARCH_TIMEOUT_MS = 8_000;

export type SearchHit = {
  title: string;
  url: string;
  publisher: string;
  publishedAt: string | null;
  snippet: string;
};

export type RelatedCoverage = {
  status: SearchStatus;
  reports: RelatedReport[];
  /** How many search hits were copies of a report already counted. */
  repeatedCount: number;
};

export type FetchLike = (input: string, init: RequestInit) => Promise<Response>;

export function cleanUrl(value: unknown): string | null {
  if (typeof value !== "string") return null;
  try {
    const url = new URL(value);
    if (url.protocol !== "https:" && url.protocol !== "http:") return null;
    for (const key of [...url.searchParams.keys()]) {
      if (/^(utm_|fbclid$|gclid$|ref$|amp$)/i.test(key)) url.searchParams.delete(key);
    }
    url.hash = "";
    return url.toString();
  } catch {
    return null;
  }
}

/** A comparable form of a URL: no scheme, no www, no trailing slash or /amp. */
export function urlKey(value: string): string {
  return value
    .toLowerCase()
    .replace(/^https?:\/\//, "")
    .replace(/^www\./, "")
    .replace(/[?#].*$/, "")
    .replace(/\/amp\/?$/, "")
    .replace(/\/$/, "");
}

/** Readable names for outlets that often appear in results; anything else shows its web address. */
const OUTLET_NAMES: Record<string, string> = {
  "premiumtimesng.com": "Premium Times",
  "punchng.com": "Punch",
  "guardian.ng": "The Guardian Nigeria",
  "thecable.ng": "TheCable",
  "vanguardngr.com": "Vanguard",
  "dailytrust.com": "Daily Trust",
  "channelstv.com": "Channels TV",
  "thisdaylive.com": "ThisDay",
  "leadership.ng": "Leadership",
  "saharareporters.com": "Sahara Reporters",
  "businessday.ng": "BusinessDay",
  "nairametrics.com": "Nairametrics",
  "humanglemedia.com": "HumAngle",
  "icirnigeria.org": "The ICIR",
  "dailypost.ng": "Daily Post",
  "tribuneonlineng.com": "Nigerian Tribune",
  "thenationonlineng.net": "The Nation",
  "independent.ng": "Independent",
  "blueprint.ng": "Blueprint",
  "sunnewsonline.com": "The Sun",
  "bbc.com": "BBC",
  "bbc.co.uk": "BBC",
  "aljazeera.com": "Al Jazeera",
  "reuters.com": "Reuters",
  "apnews.com": "AP",
  "theguardian.com": "The Guardian",
  "africanews.com": "Africanews",
};

export function publisherFromUrl(url: string): string {
  try {
    const host = new URL(url).hostname.replace(/^www\./, "").toLowerCase();
    const known = Object.keys(OUTLET_NAMES).find((domain) => host === domain || host.endsWith(`.${domain}`));
    return known ? OUTLET_NAMES[known] : host;
  } catch {
    return "";
  }
}

function words(value: string): string[] {
  return value
    .toLowerCase()
    .replace(/[^\p{L}\p{N} ]/gu, " ")
    .split(/\s+/)
    .filter(Boolean);
}

function shingles(value: string, size = 3): Set<string> {
  const list = words(value);
  const result = new Set<string>();
  for (let index = 0; index + size <= list.length; index++) result.add(list.slice(index, index + size).join(" "));
  return result;
}

function overlap(left: Set<string>, right: Set<string>): number {
  if (!left.size || !right.size) return 0;
  let shared = 0;
  for (const item of left) if (right.has(item)) shared++;
  return shared / Math.min(left.size, right.size);
}

/**
 * Two hits are the same report when their titles match, or when most of the
 * shorter snippet's phrasing appears word for word in the other. Different
 * outlets covering the same event in their own words stay separate.
 */
export function isSameReport(left: SearchHit, right: SearchHit): boolean {
  const leftTitle = words(left.title).join(" ");
  const rightTitle = words(right.title).join(" ");
  if (leftTitle && leftTitle === rightTitle) return true;
  return overlap(shingles(left.snippet), shingles(right.snippet)) >= 0.6;
}

export function parseTavilyResults(body: unknown): SearchHit[] {
  const results = body && typeof body === "object" && "results" in body ? (body as { results?: unknown }).results : null;
  if (!Array.isArray(results)) return [];
  return results.flatMap((entry) => {
    if (!entry || typeof entry !== "object") return [];
    const row = entry as Record<string, unknown>;
    const url = cleanUrl(row.url);
    const title = typeof row.title === "string" ? row.title.replace(/\s+/g, " ").trim().slice(0, 300) : "";
    const snippet = typeof row.content === "string" ? row.content.replace(/\s+/g, " ").trim().slice(0, 1_200) : "";
    if (!url || !title || !snippet) return [];
    const publishedAt = typeof row.published_date === "string" && !Number.isNaN(Date.parse(row.published_date))
      ? new Date(row.published_date).toISOString()
      : null;
    return [{ title, url, publisher: publisherFromUrl(url), publishedAt, snippet }];
  });
}

/** Folds hits into distinct reports, in the order first seen. */
export function groupReports(hits: SearchHit[], options: { excludeUrl?: string; excludeTitle?: string } = {}) {
  const excluded = options.excludeUrl ? urlKey(options.excludeUrl) : null;
  const excludedTitle = options.excludeTitle ? words(options.excludeTitle).join(" ") : null;
  const seenUrls = new Set<string>();
  const groups: Array<{ lead: SearchHit; copies: SearchHit[] }> = [];
  let repeatedCount = 0;

  for (const hit of hits) {
    const key = urlKey(hit.url);
    if (seenUrls.has(key)) continue;
    seenUrls.add(key);
    // The story being read is not "related coverage" of itself, and neither
    // are its syndicated copies on other sites.
    if (key === excluded) continue;
    if (excludedTitle && words(hit.title).join(" ") === excludedTitle) {
      repeatedCount++;
      continue;
    }
    const group = groups.find((candidate) => isSameReport(candidate.lead, hit));
    if (group) {
      group.copies.push(hit);
      repeatedCount++;
    } else {
      groups.push({ lead: hit, copies: [] });
    }
  }

  const reports: RelatedReport[] = groups.slice(0, MAX_RELATED_REPORTS).map((group, index) => ({
    id: `R${index + 1}`,
    title: group.lead.title,
    url: group.lead.url,
    publisher: group.lead.publisher,
    publishedAt: group.lead.publishedAt,
    snippet: group.lead.snippet,
    note: "",
    copies: group.copies.map(({ title, url, publisher }) => ({ title, url, publisher })),
  }));
  return { reports, repeatedCount };
}

export async function searchRelatedCoverage(
  queries: string[],
  options: { apiKey: string | undefined; excludeUrl: string; excludeTitle: string; fetchImpl?: FetchLike },
): Promise<RelatedCoverage> {
  const apiKey = options.apiKey?.trim();
  const planned = [...new Set(queries.map((query) => query.replace(/\s+/g, " ").trim().slice(0, 300)).filter(Boolean))].slice(0, MAX_QUERIES);
  if (!apiKey || planned.length === 0) return { status: "unavailable", reports: [], repeatedCount: 0 };
  const fetchImpl = options.fetchImpl ?? fetch;

  const responses = await Promise.allSettled(planned.map(async (query) => {
    const response = await fetchImpl(TAVILY_ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        query,
        search_depth: "basic",
        topic: "general",
        max_results: RESULTS_PER_QUERY,
        include_answer: false,
        include_raw_content: false,
      }),
      signal: AbortSignal.timeout(SEARCH_TIMEOUT_MS),
    });
    if (!response.ok) throw new Error(`SEARCH_HTTP_${response.status}`);
    return parseTavilyResults(await response.json());
  }));

  if (responses.every((response) => response.status === "rejected")) {
    return { status: "unavailable", reports: [], repeatedCount: 0 };
  }

  // Interleave results so each query's best hits come before any query's tail.
  const lists = responses.map((response) => (response.status === "fulfilled" ? response.value : []));
  const hits: SearchHit[] = [];
  for (let rank = 0; rank < RESULTS_PER_QUERY; rank++) {
    for (const list of lists) if (list[rank]) hits.push(list[rank]);
  }

  const { reports, repeatedCount } = groupReports(hits, { excludeUrl: options.excludeUrl, excludeTitle: options.excludeTitle });
  return { status: reports.length ? "searched" : "no_results", reports, repeatedCount };
}
