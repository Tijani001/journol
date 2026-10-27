import "server-only";

import Parser from "rss-parser";
import { NEWS_SOURCES, normalizeFeedItems, selectStories, type NewsStory } from "@/lib/news";

const parser = new Parser();

/** Fetches every feed (cached for 15 minutes); a feed that fails is skipped. */
export async function loadTodaysStories(now = new Date()): Promise<{ stories: NewsStory[]; failed: string[] }> {
  const results = await Promise.allSettled(NEWS_SOURCES.map(async (source) => {
    const response = await fetch(source.feedUrl, {
      headers: { "User-Agent": "Journol/2.0 (+https://github.com/Tijani001/journol)", Accept: "application/rss+xml, application/xml, text/xml" },
      signal: AbortSignal.timeout(8_000),
      next: { revalidate: 900 },
    });
    if (!response.ok) throw new Error(`FEED_HTTP_${response.status}`);
    const feed = await parser.parseString(await response.text());
    return normalizeFeedItems(source, feed.items);
  }));
  const stories = results.flatMap((result) => (result.status === "fulfilled" ? result.value : []));
  const failed = results.flatMap((result, index) => (result.status === "rejected" ? [NEWS_SOURCES[index].publisher] : []));
  return { stories: selectStories(stories, { now }), failed };
}
