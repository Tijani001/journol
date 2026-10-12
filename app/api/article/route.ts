import { createHash } from "node:crypto";
import { NextResponse } from "next/server";
import { Readability } from "@mozilla/readability";
import { JSDOM } from "jsdom";
import { fetch as undiciFetch } from "undici";
import {
  validateArticleUrl,
  createPinnedDispatcher,
} from "@/lib/safe-url";
import { apiError, isRecord, readJsonBody } from "@/lib/api";
import { getOrCreateCurrentUser } from "@/lib/server/auth";
import { requireInvestigationAccess } from "@/lib/server/authorization";
import { isClerkConfigured } from "@/lib/server/clerk-config";
import { isDatabaseConfigured } from "@/lib/server/database";
import { getPostgresRepository } from "@/lib/server/postgres-repository";
import { limitRequest, requestRateLimitSubject } from "@/lib/access";

export const maxDuration = 30;

const MAX_REDIRECTS = 3;
const MAX_HTML_BYTES = 5_000_000;
const MAX_ARTICLE_CHARACTERS = 30_000;
const MAX_REQUEST_BODY_BYTES = 16_000;

const TOTAL_TIMEOUT_MS = 25_000;
const REQUEST_TIMEOUT_MS = 10_000;

function extractPublishedAt(document: Document): Date | null {
  const raw = [
    document.querySelector('meta[property="article:published_time"]')?.getAttribute("content"),
    document.querySelector('meta[name="date"]')?.getAttribute("content"),
    document.querySelector('meta[name="publish-date"]')?.getAttribute("content"),
    document.querySelector("time[datetime]")?.getAttribute("datetime"),
  ].find((value): value is string => typeof value === "string" && value.trim().length > 0);
  if (!raw) return null;
  const parsed = new Date(raw);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

async function readLimitedBody(
  response: Awaited<ReturnType<typeof undiciFetch>>,
  maxBytes: number,
): Promise<string> {
  const contentLength = response.headers.get("content-length");

  if (contentLength) {
    const size = Number(contentLength);

    if (Number.isFinite(size) && size > maxBytes) {
      throw new Error("ARTICLE_TOO_LARGE");
    }
  }

  if (!response.body) {
    throw new Error("EMPTY_RESPONSE");
  }

  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let totalBytes = 0;

  try {
    while (true) {
      const { done, value } = await reader.read();

      if (done) break;

      totalBytes += value.byteLength;

      if (totalBytes > maxBytes) {
        await reader.cancel();
        throw new Error("ARTICLE_TOO_LARGE");
      }

      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }

  const combined = new Uint8Array(totalBytes);
  let offset = 0;

  for (const chunk of chunks) {
    combined.set(chunk, offset);
    offset += chunk.byteLength;
  }

  return new TextDecoder("utf-8", { fatal: false }).decode(combined);
}

async function retrieveHtml(
  initialUrl: string,
  deadline: number,
): Promise<{ html: string; finalUrl: string }> {
  let currentUrl = initialUrl;

  for (let redirectCount = 0; ; redirectCount++) {
    if (Date.now() >= deadline) {
      throw new Error("ARTICLE_TOTAL_TIMEOUT");
    }

    const destination = await validateArticleUrl(currentUrl);

    if (Date.now() >= deadline) {
      throw new Error("ARTICLE_TOTAL_TIMEOUT");
    }

    const dispatcher = createPinnedDispatcher(destination);

    let response:
      | Awaited<ReturnType<typeof undiciFetch>>
      | undefined;

    const remainingMs = deadline - Date.now();

    if (remainingMs <= 0) {
      await dispatcher.close();
      throw new Error("ARTICLE_TOTAL_TIMEOUT");
    }

    try {
      response = await undiciFetch(destination.url.toString(), {
        dispatcher,
        redirect: "manual",
        signal: AbortSignal.timeout(
          Math.min(REQUEST_TIMEOUT_MS, remainingMs),
        ),
        headers: {
          "User-Agent":
            "Mozilla/5.0 (compatible; Journol/1.0; news article reader)",
          Accept: "text/html,application/xhtml+xml",
        },
      });

      if ([301, 302, 303, 307, 308].includes(response.status)) {
        const location = response.headers.get("location");

        await response.body?.cancel();

        if (!location) {
          throw new Error("REDIRECT_WITHOUT_LOCATION");
        }

        if (redirectCount >= MAX_REDIRECTS) {
          throw new Error("TOO_MANY_REDIRECTS");
        }

        let nextUrl: URL;

        try {
          nextUrl = new URL(location, destination.url);
        } catch {
          throw new Error("INVALID_REDIRECT_URL");
        }

        // The next loop validates the redirect target independently.
        currentUrl = nextUrl.toString();
        continue;
      }

      if (!response.ok) {
        throw new Error(`PUBLISHER_HTTP_${response.status}`);
      }

      const contentType = response.headers.get("content-type") || "";

      if (!contentType.toLowerCase().includes("text/html")) {
        throw new Error("NOT_HTML");
      }

      const html = await readLimitedBody(response, MAX_HTML_BYTES);

      if (Date.now() >= deadline) {
        throw new Error("ARTICLE_TOTAL_TIMEOUT");
      }

      return {
        html,
        finalUrl: destination.url.toString(),
      };
    } catch (error) {
      if (error instanceof Error && error.name === "TimeoutError") {
        throw new Error("ARTICLE_REQUEST_TIMEOUT");
      }

      throw error;
    } finally {
      if (response?.body && !response.body.locked) {
        await response.body.cancel().catch(() => {});
      }

      await dispatcher.close().catch(() => {});
    }
  }
}

export async function POST(request: Request) {
  const rateLimit = await limitRequest("article", requestRateLimitSubject(request), {
    limit: 20,
    windowSeconds: 600,
    concurrency: 2,
  });

  if (!rateLimit.allowed) {
    return apiError("RATE_LIMITED", "Too many article requests. Please try again later.", 429, {
      "Retry-After": String(rateLimit.retryAfterSeconds),
    });
  }

  const deadline = Date.now() + TOTAL_TIMEOUT_MS;

  try {
    const parsed = await readJsonBody(request, MAX_REQUEST_BODY_BYTES);
    if ("error" in parsed) return parsed.error;
    const body = parsed.value;

    if (!isRecord(body)) {
      return apiError("BAD_REQUEST", "The request body must be a JSON object.", 400);
    }

    const url = (body as { url?: unknown }).url;
    const investigationId = (body as { investigationId?: unknown }).investigationId;

    if (typeof url !== "string" || !url.trim()) {
      return apiError("BAD_REQUEST", "A valid article URL is required.", 400);
    }

    if (typeof investigationId !== "string" || !investigationId.trim()) {
      return apiError("BAD_REQUEST", "The investigation ID is invalid.", 400);
    }

    let requestedUrl: URL;

    try {
      requestedUrl = new URL(url);
    } catch {
      return apiError("BAD_REQUEST", "The article URL is invalid.", 400);
    }

    if (!["http:", "https:"].includes(requestedUrl.protocol)) {
      return apiError("BAD_REQUEST",
        "Only HTTP and HTTPS article URLs are supported.",
        400,
      );
    }

    // The article reader is part of the authenticated investigation workflow.
    // Authorize before DNS lookup or publisher retrieval so an anonymous caller
    // cannot use it as a server-side fetch primitive.
    if (!isClerkConfigured() || !isDatabaseConfigured()) {
      return apiError("SERVICE_UNAVAILABLE", "Authenticated source persistence is not configured.", 503);
    }

    const repository = getPostgresRepository();
    let user;

    try {
      user = await getOrCreateCurrentUser(repository);
    } catch (error) {
      console.error("Journol could not resolve the authenticated article reader user:", {
        name: error instanceof Error ? error.name : "UnknownError",
        message: error instanceof Error ? error.message : String(error),
      });
      return apiError("SERVICE_UNAVAILABLE", "Journol could not access account storage. Please try again.", 503);
    }

    if (!user) {
      return apiError("UNAUTHORIZED", "Sign in to retrieve an article for an investigation.", 401);
    }

    try {
      await requireInvestigationAccess(repository, user, investigationId, "editor");
    } catch {
      // Do not disclose the existence of an inaccessible investigation.
      return apiError("BAD_REQUEST", "Investigation not found.", 404);
    }

    const { html, finalUrl } = await retrieveHtml(
      requestedUrl.toString(),
      deadline,
    );

    if (Date.now() >= deadline) {
      return apiError("TIMEOUT",
        "Article retrieval timed out. Please try again.",
        504,
      );
    }

    // JSDOM/Readability processing is bounded by the HTML byte limit.
    // This work is synchronous and cannot be safely interrupted by an
    // AbortSignal once parsing has started.
    let article: ReturnType<Readability["parse"]>;
    let publishedAt: Date | null = null;

    try {
      const dom = new JSDOM(html, { url: finalUrl });
      try {
        article = new Readability(dom.window.document).parse();
        publishedAt = extractPublishedAt(dom.window.document);
      } finally {
        dom.window.close();
      }
    } catch (error) {
      console.error("Journol article content processing failed:", {
        name: error instanceof Error ? error.name : "UnknownError",
        message: error instanceof Error ? error.message : String(error),
      });
      return apiError(
        "UPSTREAM_FAILURE",
        "Journol retrieved the article but could not process its content. Please try again or choose another source.",
        422,
      );
    }

    if (!article || !article.textContent?.trim()) {
      return apiError("UPSTREAM_FAILURE",
        "Journol could not extract the article text. The publisher may block automated access or use an unsupported page format.",
        422,
      );
    }

    const text = article.textContent.replace(/\s+/g, " ").trim();

    if (text.length < 200) {
      return apiError("UPSTREAM_FAILURE",
        "Too little article text was extracted for reliable analysis.",
        422,
      );
    }

    const limitedText = text.slice(0, MAX_ARTICLE_CHARACTERS);

    let sourceArticle: { id: string; title: string | null };

    try {
      const persisted = await repository.createSourceArticle({
        ownerUserId: user.id,
        originalUrl: requestedUrl.toString(),
        canonicalUrl: finalUrl,
        title: article.title || null,
        publisher: new URL(finalUrl).hostname.replace(/^www\./, ""),
        publishedAt,
        extractedText: limitedText,
        contentHash: createHash("sha256").update(limitedText).digest("hex"),
        retrievalStatus: "retrieved",
        retrievedAt: new Date(),
      });
      await repository.attachSourceToInvestigation({
        investigationId,
        sourceArticleId: persisted.id,
        addedByUserId: user.id,
      });
      sourceArticle = { id: persisted.id, title: persisted.title };
    } catch (error) {
      console.error("Journol article retrieval succeeded but source persistence failed:", {
        name: error instanceof Error ? error.name : "UnknownError",
        message: error instanceof Error ? error.message : String(error),
      });
      return apiError(
        "SERVICE_UNAVAILABLE",
        "Journol retrieved the article but could not save it to this investigation. Please try again.",
        503,
      );
    }

    return NextResponse.json({
      success: true,
      title: article.title || "",
      text: limitedText,
      wordCount: limitedText.split(/\s+/).filter(Boolean).length,
      url: finalUrl,
      sourceArticle,
      message:
        "Article text extracted. The returned text may be truncated for processing.",
    });
  } catch (error) {
    if (error instanceof Error) {
      if (error.message === "ARTICLE_TOO_LARGE") {
        return apiError("PAYLOAD_TOO_LARGE", "The webpage is too large to process.", 413);
      }

      if (error.message === "NOT_HTML") {
        return apiError("BAD_REQUEST",
          "The supplied URL did not return an HTML article page.",
          415,
        );
      }

      if (error.message === "TOO_MANY_REDIRECTS") {
        return apiError("UPSTREAM_FAILURE",
          "The article redirected too many times.",
          502,
        );
      }

      if (
        error.message === "ARTICLE_TOTAL_TIMEOUT" ||
        error.message === "ARTICLE_REQUEST_TIMEOUT" ||
        error.message === "DNS_TIMEOUT"
      ) {
        return apiError("TIMEOUT",
          "Article retrieval timed out. Please try again.",
          504,
        );
      }

      if (
        error.message === "INVALID_ARTICLE_URL" ||
        error.message === "INVALID_ARTICLE_PROTOCOL" ||
        error.message === "ARTICLE_URL_CREDENTIALS_NOT_ALLOWED" ||
        error.message === "ARTICLE_URL_PORT_NOT_ALLOWED" ||
        error.message === "ARTICLE_HOST_NOT_ALLOWED" ||
        error.message === "ARTICLE_ADDRESS_NOT_ALLOWED"
      ) {
        return apiError("BAD_REQUEST",
          "The article URL points to an address that Journol cannot access.",
          400,
        );
      }

      if (error.message.startsWith("PUBLISHER_HTTP_")) {
        return apiError("UPSTREAM_FAILURE",
          "The publisher could not provide the article.",
          502,
        );
      }

      if (error.message === "ARTICLE_HOST_RESOLUTION_FAILED") {
        return apiError("UPSTREAM_FAILURE",
          "Journol could not resolve the article website.",
          502,
        );
      }
    }

    console.error("Journol article extraction failed:", {
      name: error instanceof Error ? error.name : "UnknownError",
      message: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
    });

    return apiError("UPSTREAM_FAILURE",
      "Journol could not retrieve this article. Check the URL and try again.",
      502,
    );
  } finally {
    rateLimit.release();
  }
}
