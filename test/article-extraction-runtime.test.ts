import { describe, expect, it } from "vitest";
import { createRequire } from "node:module";
import { Readability } from "@mozilla/readability";
import { JSDOM } from "jsdom";

describe("article extraction runtime dependencies", () => {
  it("loads JSDOM's complete CommonJS CSS dependency chain and extracts a controlled article", () => {
    // Vercel loads the server bundle through CommonJS externals. Importing only
    // JSDOM through Vitest can mask an incompatible require() branch, so test
    // the exact package entry points Node resolves for that production path.
    const requireFromThisTest = createRequire(import.meta.url);
    expect(() => requireFromThisTest("jsdom")).not.toThrow();
    expect(() => requireFromThisTest("@asamuzakjp/css-color")).not.toThrow();
    expect(() => requireFromThisTest("@csstools/css-calc")).not.toThrow();

    const dom = new JSDOM(`
      <!doctype html>
      <html>
        <head><title>Fixture story</title></head>
        <body>
          <style>.article { width: calc(100% - 1px); color: rgb(12 34 56); }</style>
          <main>
            <article class="article">
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
