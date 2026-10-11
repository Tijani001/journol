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
});
