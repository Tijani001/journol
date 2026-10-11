import { expect, it } from "vitest";
import { validateArticleUrl } from "../lib/safe-url.ts";

async function rejects(url: string, code: string) {
  await expect(validateArticleUrl(url)).rejects.toThrow(code);
}

it("rejects private, loopback, and link-local literal article addresses", async () => {
  await rejects("http://127.0.0.1/article", "ARTICLE_ADDRESS_NOT_ALLOWED");
  await rejects("http://10.0.0.1/article", "ARTICLE_ADDRESS_NOT_ALLOWED");
  await rejects("http://169.254.169.254/latest/meta-data", "ARTICLE_ADDRESS_NOT_ALLOWED");
  await rejects("http://[::1]/article", "ARTICLE_ADDRESS_NOT_ALLOWED");
});

it("rejects unsafe URL features before network access", async () => {
  await rejects("file:///etc/passwd", "INVALID_ARTICLE_PROTOCOL");
  await rejects("http://user:pass@example.com/article", "ARTICLE_URL_CREDENTIALS_NOT_ALLOWED");
  await rejects("http://example.com:8080/article", "ARTICLE_URL_PORT_NOT_ALLOWED");
  await rejects("http://localhost/article", "ARTICLE_HOST_NOT_ALLOWED");
});
