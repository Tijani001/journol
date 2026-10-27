import { describe, expect, it } from "vitest";
import { ArticleReadError, extractStory, fetchHtml, paragraphsFromHtml } from "@/lib/server/article-reader";
import { STORY } from "@/test/fixtures";

const page = (body: string) => `<!doctype html><html><head><title>FG to build 12 clinics | The Sentinel</title>
<meta property="og:site_name" content="The Sentinel">
<meta property="article:published_time" content="2026-10-26T08:00:00Z"></head>
<body><nav>Home Politics Sport</nav><article><h1>FG to build 12 clinics in Zamfara mining communities</h1>${body}</article><footer>© The Sentinel</footer></body></html>`;

describe("article reader", () => {
  it("extracts headline, outlet, date and paragraphs", () => {
    const story = extractStory(page(STORY.paragraphs.map((text) => `<p>${text}</p>`).join("")), "https://sentinel.example/news/clinics");
    expect(story.publisher).toBe("The Sentinel");
    expect(story.publishedAt).toBe("2026-10-26T08:00:00.000Z");
    expect(story.title).toContain("FG to build 12 clinics");
    expect(story.paragraphs).toEqual(STORY.paragraphs);
  });

  it("does not take nested paragraphs twice and drops boilerplate", () => {
    expect(paragraphsFromHtml("<blockquote><p>Quoted words here.</p></blockquote><p>Advertisement</p><p>Real text.</p>")).toEqual(["Quoted words here.", "Real text."]);
  });

  it("refuses pages with too little story text", () => {
    expect(() => extractStory(page("<p>Short.</p>"), "https://sentinel.example/x")).toThrow(ArticleReadError);
  });

  it("refuses private and local addresses before connecting", async () => {
    await expect(fetchHtml("http://127.0.0.1/admin")).rejects.toMatchObject({ code: "ARTICLE_ADDRESS_NOT_ALLOWED" });
    await expect(fetchHtml("http://localhost:3000/")).rejects.toBeInstanceOf(ArticleReadError);
    await expect(fetchHtml("file:///etc/passwd")).rejects.toMatchObject({ code: "INVALID_ARTICLE_PROTOCOL" });
  });
});
