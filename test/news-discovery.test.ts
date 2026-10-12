import { describe, expect, it } from "vitest";
import { NEWS_SOURCES, classifyGeography, classifyLocations, classifyTopics, contextualSuggestions, deduplicateArticles, filterArticles, normalizeFeedItems } from "@/lib/news-discovery";

const articles = [
  { id: "1", title: "Audit finds mining permits in Zamfara", source: "Premium Times", url: "https://example.test/a", publishedAt: "2026-01-01", description: "Nigeria public funds and corruption questions." },
  { id: "2", title: "Kenya expands digital health programme", source: "BBC Africa", url: "https://example.test/b", publishedAt: "2026-01-02", description: "Health technology policy." },
  { id: "3", title: "USA and UK discuss security policy", source: "Reuters", url: "https://example.test/c", publishedAt: "2026-01-03", description: "International talks mention Lagos and Anambra." },
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

  it("normalizes countries and continents while excluding subnational and generic labels from geographic filters", () => {
    expect(classifyGeography(articles[0])).toEqual({ countries: ["Nigeria"], continents: ["Africa"] });
    expect(classifyGeography(articles[2])).toEqual({
      countries: expect.arrayContaining(["United Kingdom", "United States"]),
      continents: expect.arrayContaining(["Europe", "North America"]),
    });
    expect(classifyGeography(articles[2]).countries).not.toEqual(expect.arrayContaining(["Lagos", "Anambra", "International"]));
    expect(classifyGeography({ title: "Niger State budget", description: "Lagos officials discussed the proposal." }).countries).not.toContain("Niger");
  });

  it("combines keyword, topic and location filters instead of ignoring them", () => {
    expect(filterArticles(articles, { query: "mining", topics: ["Corruption"], locations: ["Zamfara"] })).toEqual([articles[0]]);
    expect(filterArticles(articles, { topics: ["Health"], locations: ["Kenya"] })).toEqual([articles[1]]);
    // Legacy callers may still search a subnational mention, but it is never
    // offered as a location-filter option in the Editorial Radar UI.
    expect(filterArticles(articles, { locations: ["Lagos"] })).toEqual([articles[2]]);
  });

  it("derives compact, ranked suggestions from the keyword-matched article index", () => {
    expect(contextualSuggestions(articles, "mining")).toMatchObject({
      topics: expect.arrayContaining(["Corruption", "Environment"]),
      continents: ["Africa"],
      countries: ["Nigeria"],
    });
    expect(contextualSuggestions(articles, "health").countries).toEqual(["Kenya"]);
    expect(contextualSuggestions(articles, "security").countries).not.toEqual(expect.arrayContaining(["Lagos", "Anambra"]));
    expect(contextualSuggestions(articles, "no matching text")).toEqual({ topics: [], continents: [], countries: [], locations: [] });
  });

  it("uses OR within each selected suggestion group and AND between groups", () => {
    expect(filterArticles(articles, { topics: ["Health", "Corruption"] })).toEqual([articles[0], articles[1]]);
    expect(filterArticles(articles, { topics: ["Health", "Corruption"], locations: ["Zamfara"] })).toEqual([articles[0]]);
  });

  it("uses continent-to-country matching and OR within the combined location group", () => {
    expect(filterArticles(articles, { locations: ["Africa"] })).toEqual([articles[0], articles[1], articles[2]]);
    expect(filterArticles(articles, { locations: ["Nigeria"] })).toEqual([articles[0], articles[2]]);
    expect(filterArticles(articles, { locations: ["Africa", "United Kingdom"] })).toEqual([articles[0], articles[1], articles[2]]);
    expect(filterArticles(articles, { query: "mining", topics: ["Corruption"], locations: ["Nigeria"] })).toEqual([articles[0]]);
  });
});
