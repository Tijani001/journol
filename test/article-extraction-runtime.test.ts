import { describe, expect, it } from "vitest";
import { Readability } from "@mozilla/readability";
import { JSDOM } from "jsdom";

describe("article extraction runtime dependencies", () => {
  it("loads JSDOM and Readability and extracts a controlled HTML article", () => {
    const dom = new JSDOM(`
      <!doctype html>
      <html>
        <head><title>Fixture story</title></head>
        <body>
          <main>
            <article>
              <h1>Fixture story</h1>
              <p>${"This is controlled article material for extraction. ".repeat(8)}</p>
            </article>
          </main>
        </body>
      </html>
    `, { url: "https://publisher.example/fixture" });

    try {
      const article = new Readability(dom.window.document).parse();

      expect(article?.title).toBe("Fixture story");
      expect(article?.textContent).toContain("controlled article material");
    } finally {
      dom.window.close();
    }
  });
});
