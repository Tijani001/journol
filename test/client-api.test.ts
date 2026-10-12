import { describe, expect, it } from "vitest";
import { readApiResponse } from "@/lib/client/api";

describe("client API response handling", () => {
  it("returns valid JSON success payloads", async () => {
    await expect(readApiResponse(new Response(JSON.stringify({ success: true, plan: {} }), { status: 200 }), "Plan")).resolves.toMatchObject({ success: true });
  });

  it("reports an empty response with endpoint and HTTP status", async () => {
    await expect(readApiResponse(new Response(null, { status: 502 }), "Investigation builder")).rejects.toThrow("Investigation builder returned an empty or invalid response (HTTP 502)");
  });

  it("reports non-JSON response bodies without a JSON parser exception", async () => {
    await expect(readApiResponse(new Response("<html>error</html>", { status: 500 }), "Investigation builder")).rejects.toThrow("Investigation builder returned a non-JSON response (HTTP 500)");
  });

  it("turns an authenticated API JSON error into a sign-in message", async () => {
    await expect(readApiResponse(
      new Response(JSON.stringify({ success: false, code: "UNAUTHORIZED", error: "Authentication is required." }), { status: 401 }),
      "Saving investigation",
    )).rejects.toThrow("Saving investigation: Sign in to continue. (HTTP 401)");
  });

  it("preserves a source-persistence error for the article-analysis flow", async () => {
    await expect(readApiResponse(
      new Response(JSON.stringify({
        success: false,
        code: "SERVICE_UNAVAILABLE",
        error: "Journol retrieved the article but could not save it to this investigation. Please try again.",
      }), { status: 503 }),
      "Article retrieval",
    )).rejects.toThrow("Article retrieval: Journol retrieved the article but could not save it to this investigation. Please try again. (HTTP 503)");
  });
});
