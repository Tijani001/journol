import { describe, expect, it } from "vitest";
import { cleanUrl, groupReports, parseTavilyResults, searchRelatedCoverage, urlKey, type SearchHit } from "@/lib/engine/related";

const hit = (overrides: Partial<SearchHit>): SearchHit => ({
  title: "A report",
  url: "https://a.example/report",
  publisher: "a.example",
  publishedAt: null,
  snippet: "Some original reporting about the clinics contract in Zamfara state and the company behind it.",
  ...overrides,
});

describe("related coverage", () => {
  it("cleans tracking parameters and compares URLs loosely", () => {
    expect(cleanUrl("https://www.x.example/a?utm_source=t&id=2#top")).toBe("https://www.x.example/a?id=2");
    expect(urlKey("https://www.x.example/story/amp/")).toBe(urlKey("http://x.example/story"));
    expect(cleanUrl("javascript:alert(1)")).toBeNull();
  });

  it("counts copies of the same press release once", () => {
    const release = "The Federal Government has approved the construction of twelve primary health clinics in mining communities across Zamfara State at a cost of 4.5 billion naira, the ministry said in a statement.";
    const { reports, repeatedCount } = groupReports([
      hit({ url: "https://one.example/a", title: "FG approves Zamfara clinics", snippet: release }),
      hit({ url: "https://two.example/b", title: "Zamfara gets 12 clinics", snippet: `${release} Read more.` }),
      hit({ url: "https://three.example/c", title: "FG approves Zamfara clinics", snippet: "Different words entirely about the same thing happening." }),
      hit({ url: "https://four.example/d", title: "Acme's past contracts", snippet: "An investigation into the contractor's earlier public works in Sokoto and Kebbi." }),
    ]);
    expect(reports.map((report) => report.url)).toEqual(["https://one.example/a", "https://four.example/d"]);
    expect(reports[0].copies).toHaveLength(2);
    expect(reports.map((report) => report.id)).toEqual(["R1", "R2"]);
    expect(repeatedCount).toBe(2);
  });

  it("leaves out the story itself and its syndicated copies", () => {
    const { reports, repeatedCount } = groupReports([
      hit({ url: "https://sentinel.example/news/story/", title: "FG to build clinics" }),
      hit({ url: "https://aggregator.example/x", title: "FG To Build Clinics!" }),
      hit({ url: "https://other.example/y", title: "Something else", snippet: "Unrelated phrasing about clinics in a different place altogether." }),
    ], { excludeUrl: "https://www.sentinel.example/news/story", excludeTitle: "FG to build clinics" });
    expect(reports.map((report) => report.url)).toEqual(["https://other.example/y"]);
    expect(repeatedCount).toBe(1);
  });

  it("parses Tavily results and skips unusable rows", () => {
    expect(parseTavilyResults({ results: [
      { url: "https://www.n.example/a", title: " T ", content: "Body", published_date: "Mon, 12 Mar 2024 00:00:00 GMT" },
      { url: "ftp://bad", title: "x", content: "y" },
      { url: "https://n.example/b", title: "", content: "y" },
    ] })).toEqual([{ title: "T", url: "https://www.n.example/a", publisher: "n.example", publishedAt: "2024-03-12T00:00:00.000Z", snippet: "Body" }]);
    expect(parseTavilyResults(null)).toEqual([]);
  });

  it("reports the search as unavailable without a key or when every query fails", async () => {
    expect((await searchRelatedCoverage(["q"], { apiKey: "", excludeUrl: "", excludeTitle: "" })).status).toBe("unavailable");
    const failing = async () => new Response("no", { status: 500 });
    expect((await searchRelatedCoverage(["q1", "q2"], { apiKey: "k", excludeUrl: "", excludeTitle: "", fetchImpl: failing })).status).toBe("unavailable");
  });

  it("sends the key as a bearer token, caps queries and interleaves results", async () => {
    const requests: Array<{ auth: string | null; query: string }> = [];
    const fetchImpl = async (_url: string, init: RequestInit) => {
      const body = JSON.parse(String(init.body));
      requests.push({ auth: new Headers(init.headers).get("authorization"), query: body.query });
      return Response.json({ results: [1, 2].map((rank) => ({ url: `https://${body.query.replace(/\W/g, "")}.example/${rank}`, title: `${body.query} ${rank}`, content: `${body.query.repeat(rank + 3)} ${rank}` })) });
    };
    const result = await searchRelatedCoverage(["a", "b", "c", "d", "e"], { apiKey: "secret", excludeUrl: "https://x.example", excludeTitle: "x", fetchImpl });
    expect(requests).toHaveLength(4);
    expect(requests[0].auth).toBe("Bearer secret");
    expect(result.status).toBe("searched");
    expect(result.reports.slice(0, 4).map((report) => report.title)).toEqual(["a 1", "b 1", "c 1", "d 1"]);
  });

  it("says no_results when the search ran but found nothing", async () => {
    const fetchImpl = async () => Response.json({ results: [] });
    expect((await searchRelatedCoverage(["q"], { apiKey: "k", excludeUrl: "", excludeTitle: "", fetchImpl })).status).toBe("no_results");
  });
});

describe("outlet names", () => {
  it("shows a readable name for known outlets", async () => {
    const { publisherFromUrl } = await import("@/lib/engine/related");
    expect(publisherFromUrl("https://www.premiumtimesng.com/news/x.html")).toBe("Premium Times");
    expect(publisherFromUrl("https://news.bbc.co.uk/x")).toBe("BBC");
    expect(publisherFromUrl("https://smallpaper.example/x")).toBe("smallpaper.example");
  });
});
