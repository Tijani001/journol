import { createHash, timingSafeEqual } from "node:crypto";
import { apiError } from "@/lib/api";

type RateLimitResult = { allowed: boolean; retryAfterSeconds: number };
type Entry = { count: number; resetAt: number; active: number };

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

async function sharedLimit(key: string, limit: number, windowSeconds: number): Promise<RateLimitResult | null> {
  const url = process.env.JOURNOL_RATE_LIMIT_REDIS_URL;
  const token = process.env.JOURNOL_RATE_LIMIT_REDIS_TOKEN;
  if (!url || !token) return null;

  const response = await fetch(`${url.replace(/\/$/, "")}/pipeline`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify([["INCR", key], ["EXPIRE", key, String(windowSeconds)]]),
    signal: AbortSignal.timeout(2_000),
  });
  if (!response.ok) throw new Error("RATE_LIMIT_STORE_UNAVAILABLE");
  const result: unknown = await response.json();
  if (!Array.isArray(result) || !Array.isArray(result[0]) || typeof result[0][0] !== "number") {
    throw new Error("RATE_LIMIT_STORE_INVALID_RESPONSE");
  }
  const count = result[0][0];
  return { allowed: count <= limit, retryAfterSeconds: count <= limit ? 0 : windowSeconds };
}

export async function limitRequest(
  scope: string,
  subject: string,
  options: { limit: number; windowSeconds: number; concurrency: number },
): Promise<RateLimitResult & { release: () => void }> {
  const key = `journol:${scope}:${subject}`;
  // Per-instance memory is not a safe production control: Vercel can serve
  // requests from more than one warm function. Production therefore fails
  // closed until a shared limiter is configured.
  const requireShared =
    process.env.NODE_ENV === "production" ||
    process.env.JOURNOL_REQUIRE_SHARED_RATE_LIMIT === "true";
  let remote: RateLimitResult | null = null;
  try {
    remote = await sharedLimit(key, options.limit, options.windowSeconds);
  } catch {
    return { allowed: false, retryAfterSeconds: options.windowSeconds, release: () => {} };
  }
  if (!remote && requireShared) {
    return { allowed: false, retryAfterSeconds: options.windowSeconds, release: () => {} };
  }

  const now = Date.now();
  const entry = memoryStore.get(key);
  const current = !entry || entry.resetAt <= now
    ? { count: 0, active: 0, resetAt: now + options.windowSeconds * 1_000 }
    : entry;
  current.count += 1;
  current.active += 1;
  memoryStore.set(key, current);

  const allowed = (remote?.allowed ?? current.count <= options.limit) && current.active <= options.concurrency;
  const retryAfterSeconds = allowed ? 0 : Math.max(1, Math.ceil((current.resetAt - now) / 1_000));
  let released = false;
  return {
    allowed,
    retryAfterSeconds,
    release: () => {
      if (!released) {
        released = true;
        current.active = Math.max(0, current.active - 1);
      }
    },
  };
}
