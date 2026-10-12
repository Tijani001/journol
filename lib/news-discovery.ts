export type NewsSource = {
  id: string;
  publisher: string;
  sourceUrl: string;
  feedUrl: string;
  region: string;
  active: boolean;
};

export type FeedItem = {
  guid?: string;
  link?: string;
  title?: string;
  isoDate?: string;
  pubDate?: string;
  contentSnippet?: string;
  content?: string;
};

export type NewsArticle = {
  id: string;
  title: string;
  source: string;
  url: string;
  publishedAt: string | null;
  description: string;
};

/** Official publisher feeds verified to return RSS/XML at integration time. */
export const NEWS_SOURCES: NewsSource[] = [
  { id: "premium-times", publisher: "Premium Times", sourceUrl: "https://www.premiumtimesng.com", feedUrl: "https://www.premiumtimesng.com/feed/", region: "Nigeria", active: true },
  { id: "guardian-ng", publisher: "The Guardian Nigeria", sourceUrl: "https://guardian.ng", feedUrl: "https://guardian.ng/feed/", region: "Nigeria", active: true },
  { id: "punch", publisher: "Punch", sourceUrl: "https://punchng.com", feedUrl: "https://punchng.com/feed/", region: "Nigeria", active: true },
  { id: "bbc-africa", publisher: "BBC Africa", sourceUrl: "https://www.bbc.com/news/world/africa", feedUrl: "https://feeds.bbci.co.uk/news/world/africa/rss.xml", region: "Africa", active: true },
  { id: "al-jazeera", publisher: "Al Jazeera", sourceUrl: "https://www.aljazeera.com", feedUrl: "https://www.aljazeera.com/xml/rss/all.xml", region: "International", active: true },
];

export const TOPICS = ["Politics", "Governance", "Corruption", "Public Finance", "Economy", "Business", "Technology", "Artificial Intelligence", "Cybersecurity", "Data Protection", "Human Rights", "Justice", "Crime", "Security", "Conflict", "Environment", "Climate Change", "Energy", "Health", "Education", "Agriculture", "Migration", "Infrastructure", "International Affairs"] as const;

const TOPIC_PATTERNS: Array<[typeof TOPICS[number], RegExp]> = [
  ["Corruption", /corruption|bribery|embezzl|procurement|audit|misappropriation/i],
  ["Public Finance", /budget|public funds|revenue|tax|spending|debt/i],
  ["Governance", /government|minister|agency|official|election|policy/i],
  ["Politics", /politic|election|party|parliament|senate|presiden/i],
  ["Artificial Intelligence", /artificial intelligence|\bai\b|machine learning/i],
  ["Cybersecurity", /cyber|ransomware|hack|data breach/i],
  ["Data Protection", /data protection|privacy|personal data/i],
  ["Technology", /technology|software|digital|internet|telecom/i],
  ["Economy", /inflation|economy|unemployment|currency|interest rate/i],
  ["Business", /business|company|market|investment|bank/i],
  ["Human Rights", /human rights|rights abuse|discrimination/i],
  ["Justice", /court|judge|justice|lawsuit|legal/i],
  ["Crime", /crime|arrest|kidnap|murder|fraud/i],
  ["Security", /security|armed|terror|insurgency|police|military/i],
  ["Conflict", /conflict|clash|war|violence/i],
  ["Climate Change", /climate change|climate crisis/i],
  ["Environment", /pollution|flood|oil spill|mining|environment/i],
  ["Energy", /energy|electricity|power|oil|gas|fuel/i],
  ["Health", /health|hospital|disease|vaccine|medical/i],
  ["Education", /education|school|university|student|teacher/i],
  ["Agriculture", /agriculture|farmer|crop|food security/i],
  ["Migration", /migration|migrant|refugee|displaced/i],
  ["Infrastructure", /road|bridge|infrastructure|water supply|transport/i],
  ["International Affairs", /africa|international|foreign|diplomat/i],
];

export const CONTINENTS = [
  "Africa",
  "Asia",
  "Europe",
  "North America",
  "South America",
  "Oceania",
  "Antarctica",
] as const;

export type Continent = typeof CONTINENTS[number];

export type GeographicClassification = {
  continents: Continent[];
  countries: string[];
};

export const NIGERIAN_STATES = ["Abia", "Adamawa", "Akwa Ibom", "Anambra", "Bauchi", "Bayelsa", "Benue", "Borno", "Cross River", "Delta", "Ebonyi", "Edo", "Ekiti", "Enugu", "Federal Capital Territory", "Gombe", "Imo", "Jigawa", "Kaduna", "Kano", "Katsina", "Kebbi", "Kogi", "Kwara", "Lagos", "Nasarawa", "Niger", "Ogun", "Ondo", "Osun", "Oyo", "Plateau", "Rivers", "Sokoto", "Taraba", "Yobe", "Zamfara"] as const;
const NIGERIAN_CITIES = ["Abuja", "Lagos", "Kano", "Ibadan", "Port Harcourt", "Kaduna", "Benin City", "Enugu"] as const;
const SUBNATIONAL_LOCATIONS = [...NIGERIAN_STATES, ...NIGERIAN_CITIES] as const;

/**
 * ISO 3166-1 alpha-2 country codes grouped by continent. Display names come
 * from the platform's English locale data, keeping the reference compact while
 * avoiding a publisher-country shortcut. Only article text is classified.
 */
const COUNTRY_CODES_BY_CONTINENT: Record<Exclude<Continent, "Antarctica">, readonly string[]> = {
  Africa: ["DZ", "AO", "BJ", "BW", "BF", "BI", "CV", "CM", "CF", "TD", "KM", "CD", "CG", "CI", "DJ", "EG", "GQ", "ER", "SZ", "ET", "GA", "GM", "GH", "GN", "GW", "KE", "LS", "LR", "LY", "MG", "MW", "ML", "MR", "MU", "MA", "MZ", "NA", "NE", "NG", "RW", "ST", "SN", "SC", "SL", "SO", "ZA", "SS", "SD", "TZ", "TG", "TN", "UG", "ZM", "ZW"],
  Asia: ["AF", "AM", "AZ", "BH", "BD", "BT", "BN", "KH", "CN", "CY", "GE", "IN", "ID", "IR", "IQ", "IL", "JP", "JO", "KZ", "KW", "KG", "LA", "LB", "MY", "MV", "MN", "MM", "NP", "KP", "OM", "PK", "PS", "PH", "QA", "SA", "SG", "KR", "LK", "SY", "TJ", "TH", "TL", "TR", "TM", "AE", "UZ", "VN", "YE", "TW"],
  Europe: ["AL", "AD", "AT", "BY", "BE", "BA", "BG", "HR", "CZ", "DK", "EE", "FI", "FR", "DE", "GR", "HU", "IS", "IE", "IT", "LV", "LI", "LT", "LU", "MT", "MD", "MC", "ME", "NL", "MK", "NO", "PL", "PT", "RO", "RU", "SM", "RS", "SK", "SI", "ES", "SE", "CH", "UA", "GB", "VA"],
  "North America": ["AG", "BS", "BB", "BZ", "CA", "CR", "CU", "DM", "DO", "SV", "GD", "GT", "HT", "HN", "JM", "MX", "NI", "PA", "KN", "LC", "VC", "TT", "US"],
  "South America": ["AR", "BO", "BR", "CL", "CO", "EC", "GY", "PY", "PE", "SR", "UY", "VE"],
  Oceania: ["AU", "FJ", "KI", "MH", "FM", "NR", "NZ", "PW", "PG", "WS", "SB", "TO", "TV", "VU"],
};

type CountryReference = { code: string; name: string; continent: Exclude<Continent, "Antarctica"> };
const englishRegions = new Intl.DisplayNames(["en"], { type: "region" });
const COUNTRY_REFERENCE: CountryReference[] = Object.entries(COUNTRY_CODES_BY_CONTINENT).flatMap(([continent, codes]) =>
  codes.map((code) => ({
    code,
    name: englishRegions.of(code) ?? code,
    continent: continent as Exclude<Continent, "Antarctica">,
  })),
);
const COUNTRY_BY_CODE = new Map(COUNTRY_REFERENCE.map((country) => [country.code, country]));
// These names also commonly denote subnational places in the current reporting
// regions. Require a less ambiguous reference instead of presenting them as a
// country filter option on a heuristic text match.
const AMBIGUOUS_BARE_COUNTRY_CODES = new Set(["GE", "NE"]);

// Common editorial aliases are normalized to their ISO-backed display name.
// Short abbreviations are matched case-sensitively to avoid matching ordinary
// words such as "us" in article prose.
const COUNTRY_ALIASES: Record<string, string> = {
  "Cape Verde": "CV", "Czech Republic": "CZ", "Democratic Republic of Congo": "CD",
  "DR Congo": "CD", "Congo-Kinshasa": "CD", "Republic of the Congo": "CG",
  "Congo-Brazzaville": "CG", "Ivory Coast": "CI", "Swaziland": "SZ",
  "United States of America": "US", USA: "US", "U.S.": "US", "U.S.A.": "US", US: "US",
  "United Kingdom": "GB", UK: "GB", "U.K.": "GB", Britain: "GB", "Great Britain": "GB",
  Russia: "RU", Syria: "SY", Iran: "IR", Laos: "LA", Vietnam: "VN", Myanmar: "MM",
  "South Korea": "KR", "North Korea": "KP", Tanzania: "TZ", Moldova: "MD",
  Bolivia: "BO", Venezuela: "VE", Brunei: "BN", Palestine: "PS", Vatican: "VA",
  "Republic of Georgia": "GE", "Republic of Niger": "NE",
};

function escapedPattern(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function hasLabel(text: string, label: string, caseSensitive = false) {
  return new RegExp(`(?<![\\p{L}\\p{N}])${escapedPattern(label)}(?![\\p{L}\\p{N}])`, caseSensitive ? "gu" : "giu").test(text);
}

function subnationalMentions(text: string) {
  return SUBNATIONAL_LOCATIONS.filter((location) => hasLabel(text, location));
}

function countryMatches(text: string): CountryReference[] {
  const candidates = [
    ...COUNTRY_REFERENCE.map((country) => ({ label: country.name, country, caseSensitive: false })),
    ...Object.entries(COUNTRY_ALIASES).flatMap(([label, code]) => {
      const country = COUNTRY_BY_CODE.get(code);
      return country ? [{ label, country, caseSensitive: /^[A-Z.]+$/.test(label) }] : [];
    }),
  ].sort((left, right) => right.label.length - left.label.length);
  const occupied: Array<[number, number]> = [];
  const matched = new Map<string, CountryReference>();

  for (const candidate of candidates) {
    if (AMBIGUOUS_BARE_COUNTRY_CODES.has(candidate.country.code) && candidate.label === candidate.country.name) {
      continue;
    }
    const expression = new RegExp(
      `(?<![\\p{L}\\p{N}])${escapedPattern(candidate.label)}(?![\\p{L}\\p{N}])`,
      candidate.caseSensitive ? "gu" : "giu",
    );
    for (const match of text.matchAll(expression)) {
      const start = match.index ?? 0;
      const end = start + match[0].length;
      if (occupied.some(([occupiedStart, occupiedEnd]) => start < occupiedEnd && end > occupiedStart)) continue;
      occupied.push([start, end]);
      matched.set(candidate.country.code, candidate.country);
    }
  }

  return [...matched.values()];
}

/**
 * Heuristic discovery metadata based solely on article title and description.
 * It identifies country/continent mentions, not a verified event location.
 */
export function classifyGeography(article: Pick<NewsArticle, "title" | "description">): GeographicClassification {
  const text = `${article.title} ${article.description}`;
  const countries = countryMatches(text);
  const countryContinents = countries.map((country) => country.continent);
  const explicitContinents = CONTINENTS.filter((continent) => hasLabel(text, continent));
  const mentionsNigeria = subnationalMentions(text).length > 0;
  const nigeria = COUNTRY_BY_CODE.get("NG");
  if (mentionsNigeria && nigeria && !countries.some((country) => country.code === nigeria.code)) {
    countries.push(nigeria);
    countryContinents.push(nigeria.continent);
  }

  return {
    countries: countries.map((country) => country.name).sort((left, right) => left.localeCompare(right)),
    continents: CONTINENTS.filter((continent) => explicitContinents.includes(continent) || countryContinents.includes(continent as Exclude<Continent, "Antarctica">)),
  };
}

export function classifyTopics(article: Pick<NewsArticle, "title" | "description">): string[] {
  const text = `${article.title} ${article.description}`;
  return TOPIC_PATTERNS.filter(([, pattern]) => pattern.test(text)).map(([topic]) => topic);
}

/** Keyword detection is a discovery aid; it is not verified event geolocation. */
export function classifyLocations(article: Pick<NewsArticle, "title" | "description">): string[] {
  const text = `${article.title} ${article.description}`;
  const geography = classifyGeography(article);
  // Retain subnational mentions for existing story context and legacy callers,
  // while the Filters UI deliberately exposes only countries and continents.
  return [...new Set([...geography.countries, ...subnationalMentions(text), ...geography.continents])];
}

export function normalizeFeedItems(source: NewsSource, items: FeedItem[]): NewsArticle[] {
  return items.flatMap((item) => {
    const url = item.link?.trim();
    const title = item.title?.trim();
    if (!url || !title) return [];
    return [{ id: item.guid?.trim() || url, title, source: source.publisher, url, publishedAt: item.isoDate || item.pubDate || null, description: (item.contentSnippet || item.content || "").replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim() }];
  });
}

export function deduplicateArticles(articles: NewsArticle[]): NewsArticle[] {
  const seen = new Set<string>();
  return articles.filter((article) => {
    const key = article.url.replace(/#.*$/, "").replace(/\/$/, "").toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export function filterArticles(articles: NewsArticle[], filters: { query?: string; topics?: string[]; locations?: string[]; publishers?: string[] }) {
  const query = filters.query?.trim().toLowerCase() ?? "";
  return articles.filter((article) => {
    const topics = classifyTopics(article);
    const locations = classifyLocations(article);
    const geography = classifyGeography(article);
    const text = `${article.title} ${article.description} ${article.source} ${topics.join(" ")} ${locations.join(" ")}`.toLowerCase();
    return (!query || text.includes(query)) &&
      // OR within topic/location groups; groups combine with AND.
      (!filters.topics?.length || filters.topics.some((topic) => topics.includes(topic))) &&
      (!filters.locations?.length || filters.locations.some((location) =>
        locations.includes(location) || geography.countries.includes(location) || geography.continents.includes(location as Continent),
      )) &&
      (!filters.publishers?.length || filters.publishers.includes(article.source));
  });
}

export function contextualSuggestions(articles: NewsArticle[], query = "", limit = 8) {
  const keywordMatches = filterArticles(articles, { query });
  const rank = (values: string[][]) => [...values.flat().reduce((counts, value) => counts.set(value, (counts.get(value) ?? 0) + 1), new Map<string, number>()).entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).slice(0, limit).map(([value]) => value);
  const geographicResults = keywordMatches.map(classifyGeography);
  const continents = rank(geographicResults.map((result) => result.continents));
  const countries = rank(geographicResults.map((result) => result.countries));
  return {
    topics: rank(keywordMatches.map(classifyTopics)),
    continents,
    countries,
    // Kept for non-UI callers during the incremental migration to grouped
    // geographic suggestions.
    locations: [...continents, ...countries],
  };
}
