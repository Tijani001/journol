import { NextResponse } from "next/server";
import Parser from "rss-parser";
import { apiError } from "@/lib/api";
import { NEWS_SOURCES, deduplicateArticles, normalizeFeedItems } from "@/lib/news-discovery";
import { limitRequest, requestRateLimitSubject } from "@/lib/access";
const parser = new Parser({
  timeout: 10000,
  headers: {
    "User-Agent": "Journol/1.0",
  },
});

export async function GET(request: Request) {
  const quota = await limitRequest("news", requestRateLimitSubject(request), {
    limit: 60,
    windowSeconds: 600,
    concurrency: 4,
  });
  if (!quota.allowed) {
    return apiError("RATE_LIMITED", "Too many news requests. Please try again later.", 429, {
      "Retry-After": String(quota.retryAfterSeconds),
    });
  }

  try {
  const activeSources = NEWS_SOURCES.filter((source) => source.active);
  const results = await Promise.allSettled(
    activeSources.map(async (source) => {
      const feed = await parser.parseURL(source.feedUrl);
      return normalizeFeedItems(source, feed.items);
    })
  );

  const articles = deduplicateArticles(results.flatMap((result) =>
    result.status === "fulfilled" ? result.value : []
  ));
  const unavailableSources = results.flatMap((result, index) =>
    result.status === "rejected" ? [activeSources[index].publisher] : [],
  );

  articles.sort((a, b) => {
    const dateA = a.publishedAt ? new Date(a.publishedAt).getTime() : 0;
    const dateB = b.publishedAt ? new Date(b.publishedAt).getTime() : 0;
    return dateB - dateA;
  });

  if (articles.length === 0 && unavailableSources.length === activeSources.length) {
    return apiError("UPSTREAM_FAILURE", "News feeds are temporarily unavailable. Please try again later.", 502);
  }

  return NextResponse.json({
    success: true,
    count: articles.length,
    sourcesChecked: activeSources.length,
    sourcesAvailable: activeSources.length - unavailableSources.length,
    unavailableSources,
    articles,
    message:
      articles.length > 0
        ? "News retrieved successfully."
        : "No articles were retrieved from the available feeds.",
  });
  } finally {
    quota.release();
  }
}
