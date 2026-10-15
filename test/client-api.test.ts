import { describe, expect, it } from "vitest";
import { JournolApiError, readApiResponse } from "@/lib/client/api";
import { journalistMessageForApiFailure } from "@/lib/client/journalist-messages";

describe("client API response handling", () => {
  it("returns valid JSON success payloads", async () => {
    await expect(readApiResponse(new Response(JSON.stringify({ success: true, plan: {} }), { status: 200 }), "Plan")).resolves.toMatchObject({ success: true });
  });

  it("turns an empty technical response into a safe journalist-facing message", async () => {
    await expect(readApiResponse(new Response(null, { status: 502 }), "Investigation builder")).rejects.toThrow("Something prevented Journol from completing this stage of the investigation.");
  });

  it("does not expose parsing details or HTTP status for a non-JSON response", async () => {
    const result = readApiResponse(new Response("<html>error</html>", { status: 500 }), "Investigation builder");
    await expect(result).rejects.toThrow("Something prevented Journol from completing this stage of the investigation.");
    await expect(result).rejects.not.toThrow(/HTTP|JSON|500/);
  });

  it("turns an authenticated API JSON error into a sign-in message without its status", async () => {
    await expect(readApiResponse(
      new Response(JSON.stringify({ success: false, code: "UNAUTHORIZED", error: "Authentication is required." }), { status: 401 }),
      "Saving investigation",
    )).rejects.toThrow("Please sign in to continue.");
  });

  it("uses the article-unavailable message for a source retrieval failure", async () => {
    await expect(readApiResponse(
      new Response(JSON.stringify({
        success: false,
        code: "SERVICE_UNAVAILABLE",
        error: "Journol retrieved the article but could not save it to this investigation. Please try again.",
      }), { status: 503 }),
      "Article retrieval",
    )).rejects.toThrow("Journol couldn’t access the original article needed for this research.");
  });

  it("keeps the hourly research limit distinct from a research session already in progress", () => {
    expect(journalistMessageForApiFailure({ code: "RESEARCH_LIMIT_REACHED" })).toMatchObject({
      title: "Research limit reached",
      detail: "You’ve used your four Deep Research requests for the current hour. You can start another research session when your limit resets.",
    });
    expect(journalistMessageForApiFailure({ code: "RESEARCH_IN_PROGRESS" })).toMatchObject({
      title: "Research already in progress",
      detail: "Another Deep Research session is currently running. Please wait for it to finish before starting a new one.",
    });
  });

  it("maps research failure categories without exposing technical details", () => {
    for (const code of ["INSUFFICIENT_SOURCES", "RESEARCH_TEMPORARILY_UNAVAILABLE", "SOURCE_ARTICLE_UNAVAILABLE", "INVESTIGATION_UNAVAILABLE", "RESEARCH_FAILED"]) {
      const message = journalistMessageForApiFailure({ code });
      expect(`${message.title} ${message.detail}`).not.toMatch(/HTTP|API|OpenAI|Tavily|database|timeout/i);
    }
  });

  it("keeps structured category information available to the interface", async () => {
    try {
      await readApiResponse(new Response(JSON.stringify({ success: false, code: "RESEARCH_IN_PROGRESS" }), { status: 409 }), "Deep Research");
    } catch (error) {
      expect(error).toBeInstanceOf(JournolApiError);
      expect((error as JournolApiError).journalistMessage.title).toBe("Research already in progress");
    }
  });
});
