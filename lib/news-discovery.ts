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

export const NIGERIAN_STATES = ["Abia", "Adamawa", "Akwa Ibom", "Anambra", "Bauchi", "Bayelsa", "Benue", "Borno", "Cross River", "Delta", "Ebonyi", "Edo", "Ekiti", "Enugu", "Federal Capital Territory", "Gombe", "Imo", "Jigawa", "Kaduna", "Kano", "Katsina", "Kebbi", "Kogi", "Kwara", "Lagos", "Nasarawa", "Niger", "Ogun", "Ondo", "Osun", "Oyo", "Plateau", "Rivers", "Sokoto", "Taraba", "Yobe", "Zamfara"] as const;
export const LOCATIONS = ["Nigeria", ...NIGERIAN_STATES, "Abuja", "Lagos", "Kano", "Ibadan", "Port Harcourt", "Kaduna", "Benin City", "Enugu", "Kenya", "Ghana", "South Africa", "Ethiopia", "Sudan", "Democratic Republic of the Congo", "Africa", "International"] as const;

export function classifyTopics(article: Pick<NewsArticle, "title" | "description">): string[] {
  const text = `${article.title} ${article.description}`;
  return TOPIC_PATTERNS.filter(([, pattern]) => pattern.test(text)).map(([topic]) => topic);
}

/** Keyword detection is a discovery aid; it is not verified event geolocation. */
export function classifyLocations(article: Pick<NewsArticle, "title" | "description">): string[] {
  const text = `${article.title} ${article.description}`;
  const matched = LOCATIONS.filter((location) => new RegExp(`\\b${location.replace(/[.*+?^${}()|[\\]\\\\]/g, "\\$&")}\\b`, "i").test(text));
  return matched.includes("Nigeria") || NIGERIAN_STATES.some((state) => matched.includes(state)) || ["Abuja", "Lagos", "Kano", "Ibadan", "Port Harcourt", "Kaduna", "Benin City", "Enugu"].some((city) => matched.includes(city as typeof LOCATIONS[number]))
    ? [...new Set(["Nigeria", ...matched])]
    : matched;
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
    const text = `${article.title} ${article.description} ${article.source} ${topics.join(" ")} ${locations.join(" ")}`.toLowerCase();
    return (!query || text.includes(query)) &&
      // OR within topic/location groups; groups combine with AND.
      (!filters.topics?.length || filters.topics.some((topic) => topics.includes(topic))) &&
      (!filters.locations?.length || filters.locations.some((location) => locations.includes(location))) &&
      (!filters.publishers?.length || filters.publishers.includes(article.source));
  });
}

export function contextualSuggestions(articles: NewsArticle[], query = "", limit = 8) {
  const keywordMatches = filterArticles(articles, { query });
  const rank = (values: string[][]) => [...values.flat().reduce((counts, value) => counts.set(value, (counts.get(value) ?? 0) + 1), new Map<string, number>()).entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).slice(0, limit).map(([value]) => value);
  return { topics: rank(keywordMatches.map(classifyTopics)), locations: rank(keywordMatches.map(classifyLocations)) };
}
