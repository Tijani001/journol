import "server-only";

import { Readability } from "@mozilla/readability";
import { JSDOM } from "jsdom";
import { fetch as undiciFetch } from "undici";
import { createPinnedDispatcher, validateArticleUrl } from "@/lib/safe-url";
import type { StoryInput } from "@/lib/engine/types";

/**
 * Fetches a published story and extracts its headline and paragraphs. Every
 * hop (including redirects) is checked against private network addresses and
 * the connection is pinned to the address that was checked.
 */

const MAX_REDIRECTS = 3;
const MAX_HTML_BYTES = 5_000_000;
const MAX_STORY_CHARACTERS = 30_000;
const REQUEST_TIMEOUT_MS = 10_000;
const TOTAL_TIMEOUT_MS = 20_000;

export class ArticleReadError extends Error {
  constructor(
    readonly code: string,
    readonly userMessage: string,
  ) {
    super(code);
  }
}

const MESSAGES: Record<string, string> = {
  INVALID_ARTICLE_URL: "That doesn't look like a link. Paste the full address of a published story.",
  INVALID_ARTICLE_PROTOCOL: "Only web links (http or https) can be read.",
  ARTICLE_URL_CREDENTIALS_NOT_ALLOWED: "That link can't be read.",
  ARTICLE_URL_PORT_NOT_ALLOWED: "That link can't be read.",
  ARTICLE_HOST_NOT_ALLOWED: "That link can't be read.",
  ARTICLE_ADDRESS_NOT_ALLOWED: "That link can't be read.",
  ARTICLE_HOST_RESOLUTION_FAILED: "Journol couldn't find that website. Check the link and try again.",
  DNS_TIMEOUT: "The website took too long to answer. Try again in a moment.",
  TIMEOUT: "The website took too long to answer. Try again in a moment.",
  TOO_MANY_REDIRECTS: "That link redirects too many times to be read.",
  NOT_HTML: "That link isn't a web page with a story on it.",
  TOO_LARGE: "That page is too large to read.",
  BLOCKED: "The website didn't let Journol read this story. Try another link.",
  NO_TEXT: "Journol couldn't find the story text on that page. It may be behind a paywall or not an article.",
  TOO_SHORT: "There isn't enough story text on that page to find angles in.",
};

function fail(code: string): never {
  throw new ArticleReadError(code, MESSAGES[code] ?? "Journol couldn't read that story. Try another link.");
}

async function readLimitedBody(response: Awaited<ReturnType<typeof undiciFetch>>): Promise<string> {
  const declared = Number(response.headers.get("content-length"));
  if (Number.isFinite(declared) && declared > MAX_HTML_BYTES) fail("TOO_LARGE");
  if (!response.body) fail("NO_TEXT");
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > MAX_HTML_BYTES) {
        await reader.cancel();
        fail("TOO_LARGE");
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  return Buffer.concat(chunks).toString("utf8");
}

export async function fetchHtml(startUrl: string): Promise<{ html: string; finalUrl: string }> {
  const deadline = Date.now() + TOTAL_TIMEOUT_MS;
  let currentUrl = startUrl;

  for (let redirects = 0; ; redirects++) {
    let destination;
    try {
      destination = await validateArticleUrl(currentUrl);
    } catch (error) {
      fail(error instanceof Error ? error.message : "INVALID_ARTICLE_URL");
    }
    const remaining = deadline - Date.now();
    if (remaining <= 0) fail("TIMEOUT");
    const dispatcher = createPinnedDispatcher(destination);
    let response: Awaited<ReturnType<typeof undiciFetch>> | undefined;
    try {
      response = await undiciFetch(destination.url.toString(), {
        dispatcher,
        redirect: "manual",
        signal: AbortSignal.timeout(Math.min(REQUEST_TIMEOUT_MS, remaining)),
        headers: {
          "User-Agent": "Mozilla/5.0 (compatible; Journol/2.0; +https://github.com/Tijani001/journol)",
          Accept: "text/html,application/xhtml+xml",
        },
      });
      if ([301, 302, 303, 307, 308].includes(response.status)) {
        const location = response.headers.get("location");
        if (!location || redirects >= MAX_REDIRECTS) fail("TOO_MANY_REDIRECTS");
        currentUrl = new URL(location, destination.url).toString();
        continue;
      }
      if (response.status === 401 || response.status === 403 || response.status === 429) fail("BLOCKED");
      if (!response.ok) fail("BLOCKED");
      if (!(response.headers.get("content-type") ?? "").toLowerCase().includes("html")) fail("NOT_HTML");
      return { html: await readLimitedBody(response), finalUrl: destination.url.toString() };
    } catch (error) {
      if (error instanceof ArticleReadError) throw error;
      if (error instanceof Error && (error.name === "TimeoutError" || error.name === "AbortError")) fail("TIMEOUT");
      fail("BLOCKED");
    } finally {
      if (response?.body && !response.body.locked) await response.body.cancel().catch(() => {});
      await dispatcher.close().catch(() => {});
    }
  }
}

function metaContent(document: Document, selectors: string[]): string | null {
  for (const selector of selectors) {
    const value = document.querySelector(selector)?.getAttribute("content") ?? document.querySelector(selector)?.getAttribute("datetime");
    if (value?.trim()) return value.trim();
  }
  return null;
}

function publishedAt(document: Document): string | null {
  const raw = metaContent(document, [
    'meta[property="article:published_time"]',
    'meta[name="article:published_time"]',
    'meta[itemprop="datePublished"]',
    'meta[name="date"]',
    'meta[name="publish-date"]',
    "time[datetime]",
  ]);
  if (!raw) return null;
  const parsed = new Date(raw);
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
}

function publisherName(document: Document, url: string): string {
  const site = metaContent(document, ['meta[property="og:site_name"]', 'meta[name="application-name"]']);
  if (site && site.length <= 60) return site;
  return new URL(url).hostname.replace(/^www\./, "");
}

const BOILERPLATE = /^(advertisement|read more|related|also read|share this|subscribe|follow us|click here|sign up)\b/i;

/** Splits Readability's cleaned HTML into readable paragraphs. */
export function paragraphsFromHtml(contentHtml: string): string[] {
  const dom = new JSDOM(`<body>${contentHtml}</body>`);
  try {
    const blocks = [...dom.window.document.body.querySelectorAll("p, h2, h3, li, blockquote")]
      // Skip blocks nested inside another block we already take (e.g. <p> inside <blockquote>).
      .filter((element) => !element.parentElement?.closest("p, li, blockquote"));
    const paragraphs: string[] = [];
    let total = 0;
    for (const block of blocks) {
      const text = (block.textContent ?? "").replace(/\s+/g, " ").trim();
      if (text.length < 3 || BOILERPLATE.test(text)) continue;
      if (total + text.length > MAX_STORY_CHARACTERS) break;
      total += text.length;
      paragraphs.push(text);
    }
    return paragraphs;
  } finally {
    dom.window.close();
  }
}

export function extractStory(html: string, url: string): StoryInput {
  const dom = new JSDOM(html, { url });
  try {
    const document = dom.window.document;
    const date = publishedAt(document);
    const publisher = publisherName(document, url);
    const headline = (document.querySelector("h1")?.textContent ?? "").replace(/\s+/g, " ").trim();
    const ogTitle = metaContent(document, ['meta[property="og:title"]'])?.replace(/\s+[|–—-]\s+[^|–—-]{2,40}$/, "") ?? "";
    const article = new Readability(document).parse();
    if (!article?.content) fail("NO_TEXT");
    let paragraphs = paragraphsFromHtml(article.content);
    if (paragraphs.join(" ").length < 400 && article.textContent) {
      // Some sites use <div>s instead of <p>s; fall back to Readability's plain text.
      paragraphs = article.textContent.split(/\n\s*\n/).map((part) => part.replace(/\s+/g, " ").trim()).filter((part) => part.length > 2);
    }
    const title = (ogTitle || (headline.length >= 15 ? headline : "") || article.title || "Untitled story").replace(/\s+/g, " ").trim().slice(0, 300);
    // Readability often keeps the headline as the first block; it's already shown as the title.
    const comparable = (value: string) => value.toLowerCase().replace(/[^\p{L}\p{N}]/gu, "");
    const repeats = new Set([comparable(title), comparable(headline)]);
    paragraphs = paragraphs.filter((paragraph) => !repeats.has(comparable(paragraph)));
    const length = paragraphs.join(" ").length;
    if (length === 0) fail("NO_TEXT");
    if (length < 400) fail("TOO_SHORT");
    return { url, title, publisher, publishedAt: date, paragraphs };
  } finally {
    dom.window.close();
  }
}

export async function readStory(url: string): Promise<StoryInput> {
  const { html, finalUrl } = await fetchHtml(url);
  return extractStory(html, finalUrl);
}
