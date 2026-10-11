import { describe, expect, it } from "vitest";
import { NEWS_SOURCES, classifyLocations, classifyTopics, contextualSuggestions, deduplicateArticles, filterArticles, normalizeFeedItems } from "@/lib/news-discovery";

const articles = [
  { id: "1", title: "Audit finds mining permits in Zamfara", source: "Premium Times", url: "https://example.test/a", publishedAt: "2026-01-01", description: "Nigeria public funds and corruption questions." },
  { id: "2", title: "Kenya expands digital health programme", source: "BBC Africa", url: "https://example.test/b", publishedAt: "2026-01-02", description: "Health technology policy." },
];

describe("news discovery", () => {
  it("normalizes valid feed records and removes URL duplicates", () => {
    const source = NEWS_SOURCES[0];
    const normalized = normalizeFeedItems(source, [{ title: "A story", link: "https://example.test/a", contentSnippet: "Summary" }, { title: "Missing URL" }]);
    expect(normalized).toHaveLength(1);
    expect(deduplicateArticles([...normalized, { ...normalized[0], id: "duplicate", url: "https://example.test/a/" }])).toHaveLength(1);
  });

  it("classifies filters as heuristic discovery metadata", () => {
    expect(classifyTopics(articles[0])).toEqual(expect.arrayContaining(["Corruption", "Public Finance"]));
    expect(classifyLocations(articles[0])).toEqual(expect.arrayContaining(["Nigeria", "Zamfara"]));
  });

  it("combines keyword, topic and location filters instead of ignoring them", () => {
    expect(filterArticles(articles, { query: "mining", topics: ["Corruption"], locations: ["Zamfara"] })).toEqual([articles[0]]);
    expect(filterArticles(articles, { topics: ["Health"], locations: ["Kenya"] })).toEqual([articles[1]]);
    expect(filterArticles(articles, { locations: ["Lagos"] })).toEqual([]);
  });

  it("derives compact, ranked suggestions from the keyword-matched article index", () => {
    expect(contextualSuggestions(articles, "mining")).toMatchObject({
      topics: expect.arrayContaining(["Corruption", "Environment"]),
      locations: expect.arrayContaining(["Nigeria", "Zamfara"]),
    });
    expect(contextualSuggestions(articles, "health").locations).toEqual(expect.arrayContaining(["Kenya"]));
    expect(contextualSuggestions(articles, "no matching text")).toEqual({ topics: [], locations: [] });
  });

  it("uses OR within each selected suggestion group and AND between groups", () => {
    expect(filterArticles(articles, { topics: ["Health", "Corruption"] })).toEqual(articles);
    expect(filterArticles(articles, { topics: ["Health", "Corruption"], locations: ["Zamfara"] })).toEqual([articles[0]]);
  });
});
