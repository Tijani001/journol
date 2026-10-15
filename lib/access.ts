import { createHash, randomUUID, timingSafeEqual } from "node:crypto";
import { apiError } from "@/lib/api";

type RateLimitResult = { allowed: boolean; retryAfterSeconds: number; reason?: "limit" | "concurrency" | "unavailable" };
type Entry = { count: number; resetAt: number; active: number; activeUntil?: number };
type UpstashPipelineEntry = { result?: unknown; error?: unknown };

const memoryStore = new Map<string, Entry>();

function configuredToken() {
  return process.env.JOURNOL_ACCESS_TOKEN?.trim() || "";
}

function tokenMatches(candidate: string, expected: string) {
  const candidateBytes = Buffer.from(candidate);
  const expectedBytes = Buffer.from(expected);
  return candidateBytes.length === expectedBytes.length && timingSafeEqual(candidateBytes, expectedBytes);
}

function subjectFromRequest(request: Request) {
  const authorization = request.headers.get("authorization") || "";
  const token = authorization.startsWith("Bearer ") ? authorization.slice(7).trim() : "";
  return token ? createHash("sha256").update(token).digest("hex").slice(0, 24) : "anonymous";
}

/**
 * A rate-limit subject for unauthenticated, non-billable endpoints. It uses
 * forwarded addresses only after the deployment has explicitly opted into a
 * proxy that overwrites those headers; otherwise requests safely share an
 * anonymous bucket instead of trusting attacker-supplied headers.
 */
export function requestRateLimitSubject(request: Request) {
  if (process.env.JOURNOL_TRUST_PROXY !== "true") return "anonymous";
  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0].trim().slice(0, 100) || "anonymous";
  return request.headers.get("x-real-ip")?.trim().slice(0, 100) || "anonymous";
}

export function requireProtectedAccess(request: Request) {
  const token = configuredToken();
  const requireAuth = process.env.JOURNOL_REQUIRE_AUTH === "true" || process.env.NODE_ENV === "production";

  if (!requireAuth && !token) return { subject: subjectFromRequest(request) };
  if (!token) {
    return { error: apiError("SERVICE_UNAVAILABLE", "Protected API access is not configured.", 503) };
  }

  const authorization = request.headers.get("authorization") || "";
  const supplied = authorization.startsWith("Bearer ") ? authorization.slice(7).trim() : "";
  if (!supplied || !tokenMatches(supplied, token)) {
    return { error: apiError("UNAUTHORIZED", "Authentication is required for this endpoint.", 401, { "WWW-Authenticate": "Bearer" }) };
  }
  return { subject: subjectFromRequest(request) };
}

function sharedLimiterConfiguration(): { url: string; token: string } | null {
  const configuredUrl = process.env.JOURNOL_RATE_LIMIT_REDIS_URL?.trim();
  const token = process.env.JOURNOL_RATE_LIMIT_REDIS_TOKEN;
  if (!configuredUrl || !token) return null;

  let url: URL;
  try {
    url = new URL(configuredUrl);
  } catch {
    throw new Error("RATE_LIMIT_STORE_INVALID_CONFIGURATION");
  }
  if (url.protocol !== "https:") throw new Error("RATE_LIMIT_STORE_INVALID_CONFIGURATION");

  return { url: url.toString().replace(/\/$/, ""), token };
}

function upstashPipelineCount(result: unknown): number {
  if (!Array.isArray(result) || result.length < 2) {
    throw new Error("RATE_LIMIT_STORE_INVALID_RESPONSE");
  }

  const [increment, expiry] = result;
  if (
    typeof increment !== "object" || increment === null || Array.isArray(increment) ||
    typeof expiry !== "object" || expiry === null || Array.isArray(expiry)
  ) {
    throw new Error("RATE_LIMIT_STORE_INVALID_RESPONSE");
  }

  const incrementEntry = increment as UpstashPipelineEntry;
  const expiryEntry = expiry as UpstashPipelineEntry;
  if (typeof incrementEntry.error === "string" || typeof expiryEntry.error === "string") {
    throw new Error("RATE_LIMIT_STORE_INVALID_RESPONSE");
  }
  if (typeof incrementEntry.result !== "number" || !Number.isSafeInteger(incrementEntry.result)) {
    throw new Error("RATE_LIMIT_STORE_INVALID_RESPONSE");
  }
  return incrementEntry.result;
}

async function sharedLimit(key: string, limit: number, windowSeconds: number): Promise<RateLimitResult | null> {
  const configuration = sharedLimiterConfiguration();
  if (!configuration) return null;

  const response = await fetch(`${configuration.url}/pipeline`, {
    method: "POST",
    headers: { Authorization: `Bearer ${configuration.token}`, "Content-Type": "application/json" },
    // Upstash pipelines return [{ result }, { result }]. Expire only when the
    // key is new, so steady traffic cannot indefinitely extend the window.
    body: JSON.stringify([["INCR", key], ["EXPIRE", key, windowSeconds, "NX"]]),
    signal: AbortSignal.timeout(2_000),
  });
  if (!response.ok) throw new Error("RATE_LIMIT_STORE_UNAVAILABLE");
  const result: unknown = await response.json();
  const count = upstashPipelineCount(result);
  return { allowed: count <= limit, retryAfterSeconds: count <= limit ? 0 : windowSeconds };
}

const CONCURRENCY_LEASE_SECONDS = 120;

/**
 * Claims one short-lived shared lease. The value is a per-request token so a
 * late completion cannot delete a lease acquired by a later request.
 */
async function sharedConcurrencyAcquire(key: string, token: string): Promise<"acquired" | "busy" | "unavailable" | null> {
  try {
    const configuration = sharedLimiterConfiguration();
    if (!configuration) return null;
    const response = await fetch(configuration.url, {
      method: "POST",
      headers: { Authorization: `Bearer ${configuration.token}`, "Content-Type": "application/json" },
      body: JSON.stringify(["SET", key, token, "NX", "EX", CONCURRENCY_LEASE_SECONDS]),
      signal: AbortSignal.timeout(2_000),
    });
    if (!response.ok) return "unavailable";
    const result: unknown = await response.json();
    if (result && typeof result === "object" && "result" in result && (result as { result?: unknown }).result === "OK") return "acquired";
    return "busy";
  } catch { return "unavailable"; }
}

async function sharedConcurrencyRelease(key: string, token: string) {
  const script = "if redis.call('GET', KEYS[1]) == ARGV[1] then return redis.call('DEL', KEYS[1]) else return 0 end";
  try {
    const configuration = sharedLimiterConfiguration();
    if (!configuration) return;
    await fetch(`${configuration.url}/pipeline`, {
      method: "POST",
      headers: { Authorization: `Bearer ${configuration.token}`, "Content-Type": "application/json" },
      body: JSON.stringify([["EVAL", script, 1, key, token]]),
      signal: AbortSignal.timeout(2_000),
    });
  } catch {
    // The expiry is the recovery path for a terminated function or a failed
    // release. A release failure must not affect the completed response.
  }
}

export function resetRateLimitStateForTesting() {
  memoryStore.clear();
}

export async function limitRequest(
  scope: string,
  subject: string,
  options: { limit: number; windowSeconds: number; concurrency: number },
): Promise<RateLimitResult & { release: () => Promise<void> }> {
  const key = `journol:${scope}:${subject}`;
  const concurrencyKey = `${key}:concurrency`;
  // Per-instance memory is not a safe production control: Vercel can serve
  // requests from more than one warm function. Production therefore fails
  // closed until a shared limiter is configured.
  const requireShared =
    process.env.NODE_ENV === "production" ||
    process.env.JOURNOL_REQUIRE_SHARED_RATE_LIMIT === "true";
  const leaseToken = randomUUID();
  const remoteConcurrency = await sharedConcurrencyAcquire(concurrencyKey, leaseToken);
  if (remoteConcurrency === "unavailable") {
    return { allowed: false, retryAfterSeconds: options.windowSeconds, reason: "unavailable", release: async () => {} };
  }
  if (remoteConcurrency === "busy") {
    return { allowed: false, retryAfterSeconds: CONCURRENCY_LEASE_SECONDS, reason: "concurrency", release: async () => {} };
  }

  const now = Date.now();
  const entry = memoryStore.get(key);
  const current = !entry || entry.resetAt <= now
    ? { count: 0, active: 0, activeUntil: 0, resetAt: now + options.windowSeconds * 1_000 }
    : entry;
  // Old in-memory entries do not carry a lease timestamp. Treat them as
  // expired rather than allowing a dev-server refresh to block a journalist.
  if (!current.activeUntil || current.activeUntil <= now) current.active = 0;
  if (remoteConcurrency === null && current.active >= options.concurrency) {
    return { allowed: false, retryAfterSeconds: CONCURRENCY_LEASE_SECONDS, reason: "concurrency", release: async () => {} };
  }

  let remote: RateLimitResult | null = null;
  try {
    remote = await sharedLimit(key, options.limit, options.windowSeconds);
  } catch {
    if (remoteConcurrency === "acquired") await sharedConcurrencyRelease(concurrencyKey, leaseToken);
    return { allowed: false, retryAfterSeconds: options.windowSeconds, reason: "unavailable", release: async () => {} };
  }
  if (!remote && requireShared) {
    if (remoteConcurrency === "acquired") await sharedConcurrencyRelease(concurrencyKey, leaseToken);
    return { allowed: false, retryAfterSeconds: options.windowSeconds, reason: "unavailable", release: async () => {} };
  }

  const nextCount = current.count + 1;
  const hourlyLimitReached = !(remote?.allowed ?? nextCount <= options.limit);
  if (hourlyLimitReached) {
    if (remoteConcurrency === "acquired") await sharedConcurrencyRelease(concurrencyKey, leaseToken);
    return { allowed: false, retryAfterSeconds: Math.max(1, Math.ceil((current.resetAt - now) / 1_000)), reason: "limit", release: async () => {} };
  }
  current.count = nextCount;
  current.active += 1;
  current.activeUntil = now + CONCURRENCY_LEASE_SECONDS * 1_000;
  memoryStore.set(key, current);
  let released = false;
  return {
    allowed: true,
    retryAfterSeconds: 0,
    release: async () => {
      if (!released) {
        released = true;
        current.active = Math.max(0, current.active - 1);
        if (current.active === 0) current.activeUntil = 0;
        if (remoteConcurrency === "acquired") await sharedConcurrencyRelease(concurrencyKey, leaseToken);
      }
    },
  };
}
