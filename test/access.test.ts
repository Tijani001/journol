import { afterEach, expect, it, vi } from "vitest";
import { limitRequest, requireProtectedAccess, resetRateLimitStateForTesting } from "@/lib/access";

const priorRequired = process.env.JOURNOL_REQUIRE_AUTH;
const priorToken = process.env.JOURNOL_ACCESS_TOKEN;
const priorNodeEnv = process.env.NODE_ENV;
const priorRedisUrl = process.env.JOURNOL_RATE_LIMIT_REDIS_URL;
const priorRedisToken = process.env.JOURNOL_RATE_LIMIT_REDIS_TOKEN;
const mutableEnvironment = process.env as unknown as Record<string, string | undefined>;

afterEach(() => {
  if (priorRequired === undefined) delete process.env.JOURNOL_REQUIRE_AUTH;
  else process.env.JOURNOL_REQUIRE_AUTH = priorRequired;
  if (priorToken === undefined) delete process.env.JOURNOL_ACCESS_TOKEN;
  else process.env.JOURNOL_ACCESS_TOKEN = priorToken;
  if (priorNodeEnv === undefined) delete mutableEnvironment.NODE_ENV;
  else mutableEnvironment.NODE_ENV = priorNodeEnv;
  if (priorRedisUrl === undefined) delete process.env.JOURNOL_RATE_LIMIT_REDIS_URL;
  else process.env.JOURNOL_RATE_LIMIT_REDIS_URL = priorRedisUrl;
  if (priorRedisToken === undefined) delete process.env.JOURNOL_RATE_LIMIT_REDIS_TOKEN;
  else process.env.JOURNOL_RATE_LIMIT_REDIS_TOKEN = priorRedisToken;
  resetRateLimitStateForTesting();
  vi.unstubAllGlobals();
  vi.useRealTimers();
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

it("uses the Upstash HTTPS pipeline response contract for the shared rate limit", async () => {
  mutableEnvironment.NODE_ENV = "production";
  process.env.JOURNOL_RATE_LIMIT_REDIS_URL = "https://journol-rate-limit.upstash.io/";
  process.env.JOURNOL_RATE_LIMIT_REDIS_TOKEN = "test-only-upstash-token";
  const fetchMock = vi.fn()
    .mockResolvedValueOnce(new Response(JSON.stringify({ result: "OK" }), { status: 200 }))
    .mockResolvedValueOnce(new Response(JSON.stringify([
      { result: 1 },
      { result: 1 },
    ]), { status: 200 }))
    .mockResolvedValueOnce(new Response(JSON.stringify([{ result: 1 }]), { status: 200 }));
  vi.stubGlobal("fetch", fetchMock);

  const result = await limitRequest("ai", "user-1", { limit: 20, windowSeconds: 600, concurrency: 2 });

  expect(result.allowed).toBe(true);
  expect(fetchMock.mock.calls[0]?.[0]).toBe("https://journol-rate-limit.upstash.io");
  expect(JSON.parse(String((fetchMock.mock.calls[0]?.[1] as RequestInit).body))).toMatchObject(["SET", "journol:ai:user-1:concurrency", expect.any(String), "NX", "EX", 120]);
  const [url, options] = fetchMock.mock.calls[1] as [string, RequestInit];
  expect(url).toBe("https://journol-rate-limit.upstash.io/pipeline");
  expect(options.headers).toMatchObject({ Authorization: "Bearer test-only-upstash-token" });
  expect(JSON.parse(String(options.body))).toEqual([
    ["INCR", "journol:ai:user-1"],
    ["EXPIRE", "journol:ai:user-1", 600, "NX"],
  ]);
  await result.release();
});

it("fails closed in production when Upstash is unavailable or returns an error entry", async () => {
  mutableEnvironment.NODE_ENV = "production";
  process.env.JOURNOL_RATE_LIMIT_REDIS_URL = "https://journol-rate-limit.upstash.io";
  process.env.JOURNOL_RATE_LIMIT_REDIS_TOKEN = "test-only-upstash-token";
  vi.stubGlobal("fetch", vi.fn()
    .mockResolvedValueOnce(new Response(JSON.stringify({ result: "OK" }), { status: 200 }))
    .mockResolvedValueOnce(new Response(JSON.stringify([
      { error: "ERR unavailable" },
      { result: 0 },
    ]), { status: 200 }))
    .mockResolvedValueOnce(new Response(JSON.stringify([{ result: 1 }]), { status: 200 })));

  const result = await limitRequest("ai", "user-1", { limit: 20, windowSeconds: 600, concurrency: 2 });

  expect(result.allowed).toBe(false);
  expect(result.retryAfterSeconds).toBe(600);
});

it("fails closed in production when the shared limiter is absent", async () => {
  mutableEnvironment.NODE_ENV = "production";
  delete process.env.JOURNOL_RATE_LIMIT_REDIS_URL;
  delete process.env.JOURNOL_RATE_LIMIT_REDIS_TOKEN;

  await expect(limitRequest("ai", "user-1", { limit: 20, windowSeconds: 600, concurrency: 2 }))
    .resolves.toMatchObject({ allowed: false, retryAfterSeconds: 600 });
});

it("distinguishes an in-progress request from an hourly limit", async () => {
  mutableEnvironment.NODE_ENV = "test";
  delete process.env.JOURNOL_RATE_LIMIT_REDIS_URL;
  delete process.env.JOURNOL_RATE_LIMIT_REDIS_TOKEN;
  const first = await limitRequest("deep-research", "journalist", { limit: 4, windowSeconds: 3_600, concurrency: 1 });
  const concurrent = await limitRequest("deep-research", "journalist", { limit: 4, windowSeconds: 3_600, concurrency: 1 });
  expect(first.allowed).toBe(true);
  expect(concurrent).toMatchObject({ allowed: false, reason: "concurrency" });
  await first.release();
  await concurrent.release();
});

it("releases a completed request so a new research request can claim the slot", async () => {
  mutableEnvironment.NODE_ENV = "test";
  const first = await limitRequest("deep-research", "journalist", { limit: 4, windowSeconds: 3_600, concurrency: 1 });
  await first.release();
  await expect(limitRequest("deep-research", "journalist", { limit: 4, windowSeconds: 3_600, concurrency: 1 })).resolves.toMatchObject({ allowed: true });
});

it("does not leave a phantom local lock when a concurrent request is rejected", async () => {
  mutableEnvironment.NODE_ENV = "test";
  const first = await limitRequest("deep-research", "journalist", { limit: 4, windowSeconds: 3_600, concurrency: 1 });
  const rejected = await limitRequest("deep-research", "journalist", { limit: 4, windowSeconds: 3_600, concurrency: 1 });
  expect(rejected).toMatchObject({ allowed: false, reason: "concurrency" });
  await first.release();
  await expect(limitRequest("deep-research", "journalist", { limit: 4, windowSeconds: 3_600, concurrency: 1 })).resolves.toMatchObject({ allowed: true });
});

it("recovers an abandoned local concurrency lease after its bounded expiry", async () => {
  mutableEnvironment.NODE_ENV = "test";
  vi.useFakeTimers();
  const first = await limitRequest("deep-research", "journalist", { limit: 4, windowSeconds: 3_600, concurrency: 1 });
  expect(first.allowed).toBe(true);
  await vi.advanceTimersByTimeAsync(121_000);
  await expect(limitRequest("deep-research", "journalist", { limit: 4, windowSeconds: 3_600, concurrency: 1 })).resolves.toMatchObject({ allowed: true });
});
