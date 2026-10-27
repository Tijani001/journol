/** Today's stories for the Discover page, from publishers' own RSS feeds. */

export type NewsSource = { publisher: string; feedUrl: string };

export const NEWS_SOURCES: NewsSource[] = [
  { publisher: "Premium Times", feedUrl: "https://www.premiumtimesng.com/feed/" },
  { publisher: "The Guardian Nigeria", feedUrl: "https://guardian.ng/feed/" },
  { publisher: "Punch", feedUrl: "https://punchng.com/feed/" },
  { publisher: "BBC Africa", feedUrl: "https://feeds.bbci.co.uk/news/world/africa/rss.xml" },
  { publisher: "Al Jazeera", feedUrl: "https://www.aljazeera.com/xml/rss/all.xml" },
];

export const TOPICS = ["Money", "Health", "Education", "Security", "Politics"] as const;
export type Topic = (typeof TOPICS)[number];

// Word stems, matched at the start of a word so plurals and endings count ("clinics", "kidnapped").
const TOPIC_STEMS: Record<Topic, string[]> = {
  Money: ["budget", "naira", "tax", "toll", "tariff", "fuel", "petrol", "price", "loan", "debt", "bank", "econom", "inflation", "contract", "fund", "revenue", "salar", "cbn", "nnpc", "subsid", "allocation", "procurement", "billion", "trillion"],
  Health: ["health", "hospital", "clinic", "disease", "vaccin", "medic", "doctor", "nurse", "cholera", "malaria", "outbreak", "patient", "dialysis", "ncdc"],
  Education: ["education", "school", "universit", "student", "teacher", "asuu", "waec", "jamb", "exam", "lecturer", "pupil"],
  Security: ["security", "bandit", "kidnap", "attack", "police", "army", "military", "troops", "terror", "insurgen", "gunmen", "killed", "abduct", "dss", "efcc", "arrest", "court"],
  Politics: ["election", "inec", "senate", "senator", "governor", "president", "tinubu", "minister", "apc", "pdp", "assembly", "lawmaker", "politic", "campaign"],
};

const TOPIC_PATTERNS = Object.fromEntries(
  Object.entries(TOPIC_STEMS).map(([topic, stems]) => [topic, new RegExp(`(?<![\\p{L}\\p{N}])(?:${stems.join("|")})`, "iu")]),
) as Record<Topic, RegExp>;

export function classifyTopics(text: string): Topic[] {
  return TOPICS.filter((topic) => TOPIC_PATTERNS[topic].test(text) || (topic === "Money" && /₦/.test(text)));
}

export type NewsStory = {
  url: string;
  title: string;
  publisher: string;
  publishedAt: string | null;
  summary: string;
  topics: Topic[];
};

export type FeedItem = {
  link?: string;
  title?: string;
  isoDate?: string;
  pubDate?: string;
  contentSnippet?: string;
  content?: string;
};

function decodeEntities(value: string): string {
  return value
    .replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(Number(code)))
    .replace(/&#x([0-9a-f]+);/gi, (_, code) => String.fromCodePoint(parseInt(code, 16)))
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&apos;|&rsquo;|&lsquo;/g, "'")
    .replace(/&ldquo;|&rdquo;/g, '"')
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">");
}

function plain(value: string | undefined): string {
  return decodeEntities((value ?? "").replace(/<[^>]*>/g, " ")).replace(/\s+/g, " ").trim();
}

/** Trims a feed summary to whole sentences, dropping "The post … appeared first on …" footers. */
export function shortSummary(value: string, max = 220): string {
  const text = value.replace(/\s*The post .* appeared first on .*$/i, "").replace(/\s*\[…\]|\s*\[\.\.\.\]/g, "…").trim();
  if (text.length <= max) return text;
  const cut = text.slice(0, max);
  const sentenceEnd = Math.max(cut.lastIndexOf(". "), cut.lastIndexOf("? "), cut.lastIndexOf("! "));
  return sentenceEnd > 80 ? cut.slice(0, sentenceEnd + 1) : `${cut.slice(0, cut.lastIndexOf(" "))}…`;
}

export function normalizeFeedItems(source: NewsSource, items: FeedItem[]): NewsStory[] {
  return items.flatMap((item) => {
    const url = item.link?.trim();
    const title = plain(item.title);
    if (!url || !title || !/^https?:\/\//i.test(url)) return [];
    const summary = shortSummary(plain(item.contentSnippet || item.content));
    const date = item.isoDate || item.pubDate || null;
    const publishedAt = date && !Number.isNaN(Date.parse(date)) ? new Date(date).toISOString() : null;
    return [{ url, title, publisher: source.publisher, publishedAt, summary, topics: classifyTopics(`${title} ${summary}`) }];
  });
}

/** Newest first, one entry per URL, only the last `hours` when dates are known. */
export function selectStories(stories: NewsStory[], options: { now: Date; hours?: number; limit?: number }): NewsStory[] {
  const cutoff = options.now.getTime() - (options.hours ?? 36) * 3_600_000;
  const seen = new Set<string>();
  return stories
    .filter((story) => {
      const key = story.url.replace(/[?#].*$/, "").replace(/\/$/, "").toLowerCase();
      if (seen.has(key)) return false;
      seen.add(key);
      return !story.publishedAt || Date.parse(story.publishedAt) >= cutoff;
    })
    .sort((left, right) => (right.publishedAt ? Date.parse(right.publishedAt) : 0) - (left.publishedAt ? Date.parse(left.publishedAt) : 0))
    .slice(0, options.limit ?? 30);
}

export function timeAgo(iso: string | null, now: Date): string {
  if (!iso) return "";
  const minutes = Math.max(0, Math.round((now.getTime() - Date.parse(iso)) / 60_000));
  if (minutes < 60) return minutes <= 1 ? "just now" : `${minutes} minutes ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return hours === 1 ? "1 hour ago" : `${hours} hours ago`;
  const days = Math.round(hours / 24);
  return days === 1 ? "yesterday" : `${days} days ago`;
}
