import { describe, expect, it } from "vitest";
import { APIConnectionError, APIError } from "openai";
import { isProviderUnavailable } from "@/lib/server/provider-errors";

const apiError = (status: number, code?: string) => new APIError(status, { error: { message: "x", code } } as never, "x", new Headers());

describe("provider errors", () => {
  it("treats out-of-credits, rate limits, outages and connection failures as provider problems", () => {
    expect(isProviderUnavailable(apiError(429, "insufficient_quota"))).toBe(true);
    expect(isProviderUnavailable(apiError(429))).toBe(true);
    expect(isProviderUnavailable(apiError(503))).toBe(true);
    expect(isProviderUnavailable(new APIConnectionError({ message: "down" } as never))).toBe(true);
  });

  it("does not treat a bad request or an ordinary error as a provider outage", () => {
    expect(isProviderUnavailable(apiError(400))).toBe(false);
    expect(isProviderUnavailable(new Error("EMPTY_MODEL_OUTPUT"))).toBe(false);
  });
});
