import { describe, expect, it } from "vitest";
import { classifyTopics, normalizeFeedItems, selectStories, shortSummary, timeAgo } from "@/lib/news";

const source = { publisher: "Punch", feedUrl: "https://punchng.com/feed/" };

describe("today's stories", () => {
  it("cleans feed items", () => {
    const [story] = normalizeFeedItems(source, [
      { link: "https://punchng.com/a/", title: "Lagos raises bridge toll &#8211; to &#8358;500", contentSnippet: "The state says the money will fund repairs. The post Lagos raises toll appeared first on Punch.", isoDate: "2026-10-27T07:00:00Z" },
      { link: "", title: "No link" },
      { link: "javascript:void(0)", title: "Bad" },
    ]);
    expect(story).toMatchObject({ url: "https://punchng.com/a/", title: "Lagos raises bridge toll – to ₦500", summary: "The state says the money will fund repairs.", publisher: "Punch" });
    expect(story.topics).toContain("Money");
  });

  it("tags topics from the headline and summary", () => {
    expect(classifyTopics("Kano hires 4,000 teachers for rural schools")).toEqual(["Education"]);
    expect(classifyTopics("Gunmen abduct 12 in Zamfara")).toEqual(["Security"]);
    expect(classifyTopics("FG to build clinics with ₦4.5bn")).toEqual(expect.arrayContaining(["Health", "Money"]));
  });

  it("keeps recent, unique stories, newest first", () => {
    const now = new Date("2026-10-27T12:00:00Z");
    const make = (url: string, publishedAt: string | null) => ({ url, title: url, publisher: "P", publishedAt, summary: "", topics: [] });
    const picked = selectStories([
      make("https://a.example/1", "2026-10-27T08:00:00Z"),
      make("https://a.example/1/", "2026-10-27T08:00:00Z"),
      make("https://a.example/2", "2026-10-27T10:00:00Z"),
      make("https://a.example/old", "2026-10-20T10:00:00Z"),
      make("https://a.example/undated", null),
    ], { now });
    expect(picked.map((story) => story.url)).toEqual(["https://a.example/2", "https://a.example/1", "https://a.example/undated"]);
  });

  it("writes short summaries and friendly times", () => {
    expect(shortSummary("One sentence here that is quite long. ".repeat(10), 120)).toBe("One sentence here that is quite long. One sentence here that is quite long. One sentence here that is quite long.");
    const now = new Date("2026-10-27T12:00:00Z");
    expect(timeAgo("2026-10-27T10:00:00Z", now)).toBe("2 hours ago");
    expect(timeAgo("2026-10-27T11:59:30Z", now)).toBe("just now");
    expect(timeAgo("2026-10-26T10:00:00Z", now)).toBe("yesterday");
  });
});
