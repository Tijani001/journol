import { afterEach, expect, it } from "vitest";
import { requireProtectedAccess } from "@/lib/access";

const priorRequired = process.env.JOURNOL_REQUIRE_AUTH;
const priorToken = process.env.JOURNOL_ACCESS_TOKEN;

afterEach(() => {
  if (priorRequired === undefined) delete process.env.JOURNOL_REQUIRE_AUTH;
  else process.env.JOURNOL_REQUIRE_AUTH = priorRequired;
  if (priorToken === undefined) delete process.env.JOURNOL_ACCESS_TOKEN;
  else process.env.JOURNOL_ACCESS_TOKEN = priorToken;
});

it("fails closed when protected access is enabled but no server token exists", async () => {
  process.env.JOURNOL_REQUIRE_AUTH = "true";
  delete process.env.JOURNOL_ACCESS_TOKEN;
  const result = requireProtectedAccess(new Request("http://test"));
  expect("error" in result).toBe(true);
  if ("error" in result) {
    if (!result.error) throw new Error("Expected an error response");
    expect(result.error.status).toBe(503);
  }
});

it("requires the configured bearer token in protected mode", async () => {
  process.env.JOURNOL_REQUIRE_AUTH = "true";
  process.env.JOURNOL_ACCESS_TOKEN = "test-only-token";
  const denied = requireProtectedAccess(new Request("http://test"));
  const allowed = requireProtectedAccess(new Request("http://test", { headers: { authorization: "Bearer test-only-token" } }));
  expect("error" in denied).toBe(true);
  expect("subject" in allowed).toBe(true);
});
