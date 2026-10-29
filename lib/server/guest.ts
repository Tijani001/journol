import "server-only";

import { createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";

/**
 * Guest identity: a random ID signed with a server secret, kept in an
 * httpOnly cookie. Only the server can mint one, and a tampered cookie is
 * ignored. Guests are tied to one browser.
 */

export const GUEST_COOKIE = "journol_guest";
export const GUEST_ISSUER = "journol-guest";
export const GUEST_MAX_AGE_SECONDS = 30 * 24 * 3_600;

function secret(): string | null {
  const explicit = process.env.JOURNOL_GUEST_SECRET?.trim();
  if (explicit) return explicit;
  // Without a dedicated secret, derive one from the sign-in secret, which is already private.
  const clerk = process.env.CLERK_SECRET_KEY?.trim();
  if (clerk) return createHash("sha256").update(`journol-guest:${clerk}`).digest("hex");
  return process.env.NODE_ENV === "production" ? null : "journol-development-guest-secret";
}

/** Guest mode is on unless JOURNOL_GUEST_MODE=off, and needs a secret to sign cookies. */
export function guestModeEnabled(): boolean {
  return process.env.JOURNOL_GUEST_MODE !== "off" && Boolean(secret());
}

function sign(id: string, key: string): string {
  return createHmac("sha256", key).update(id).digest("base64url");
}

export function mintGuestToken(): { id: string; token: string } | null {
  const key = secret();
  if (!key) return null;
  const id = randomBytes(18).toString("base64url");
  return { id, token: `${id}.${sign(id, key)}` };
}

/** The guest ID from a cookie value, or null if it's missing or wasn't signed by this server. */
export function verifyGuestToken(token: string | undefined | null): string | null {
  const key = secret();
  if (!key || !token) return null;
  const [id, signature, extra] = token.split(".");
  if (!id || !signature || extra !== undefined || !/^[A-Za-z0-9_-]{16,40}$/.test(id)) return null;
  const expected = Buffer.from(sign(id, key));
  const given = Buffer.from(signature);
  return expected.length === given.length && timingSafeEqual(expected, given) ? id : null;
}

export function guestCookieHeader(token: string): string {
  const secure = process.env.NODE_ENV === "production" ? "; Secure" : "";
  return `${GUEST_COOKIE}=${token}; Path=/; Max-Age=${GUEST_MAX_AGE_SECONDS}; HttpOnly; SameSite=Lax${secure}`;
}

export function clearGuestCookieHeader(): string {
  return `${GUEST_COOKIE}=; Path=/; Max-Age=0; HttpOnly; SameSite=Lax`;
}

export function readCookie(header: string | null, name: string): string | null {
  if (!header) return null;
  for (const part of header.split(";")) {
    const [key, ...rest] = part.trim().split("=");
    if (key === name) return rest.join("=");
  }
  return null;
}

/**
 * The address the request came from, as a one-way hash. Render sits behind
 * Cloudflare, which sets CF-Connecting-IP itself, so a visitor can't fake it.
 */
export function connectionHash(request: Request): string | null {
  const headers = request.headers;
  const address = headers.get("cf-connecting-ip")
    || headers.get("true-client-ip")
    || headers.get("x-forwarded-for")?.split(",")[0]?.trim()
    || headers.get("x-real-ip");
  const key = secret();
  if (!address || !key) return null;
  return createHmac("sha256", key).update(`ip:${address}`).digest("base64url").slice(0, 32);
}
