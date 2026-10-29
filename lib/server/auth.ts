import "server-only";

import { cache } from "react";
import { auth } from "@clerk/nextjs/server";
import { cookies } from "next/headers";
import { connection } from "next/server";
import { redirect } from "next/navigation";
import { isClerkConfigured } from "@/lib/server/clerk-config";
import { GUEST_COOKIE, GUEST_ISSUER, guestModeEnabled, verifyGuestToken } from "@/lib/server/guest";
import { mergeGuestInto, upsertUser } from "@/lib/server/store";

/** Who is using Journol: a signed-in journalist, or a guest on this browser. */
export type Identity = { issuer: string; subject: string; guest?: boolean };

async function clerkIdentity(): Promise<Identity | null> {
  if (!isClerkConfigured()) {
    if (process.env.NODE_ENV === "production") return null;
    const subject = process.env.JOURNOL_DEV_USER_ID?.trim();
    return subject ? { issuer: "journol-development", subject } : null;
  }
  try {
    const session = await auth();
    if (!session.userId) return null;
    const issuer = (session.sessionClaims as { iss?: unknown } | null)?.iss;
    return { issuer: typeof issuer === "string" && issuer ? issuer : "clerk", subject: session.userId };
  } catch {
    return null;
  }
}

/** The guest ID from this browser's signed cookie, if any. */
export async function guestSubject(): Promise<string | null> {
  if (!guestModeEnabled()) return null;
  try {
    return verifyGuestToken((await cookies()).get(GUEST_COOKIE)?.value);
  } catch {
    return null;
  }
}

/**
 * The verified identity: Clerk's server session first, then this browser's
 * guest cookie. Identity never comes from request bodies.
 */
export async function currentIdentity(): Promise<Identity | null> {
  // Who is signed in is only known per request, so nothing that depends on it is prerendered.
  await connection();
  const signedIn = await clerkIdentity();
  if (signedIn) return signedIn;
  const guest = await guestSubject();
  return guest ? { issuer: GUEST_ISSUER, subject: guest, guest: true } : null;
}

let resolverForTesting: (() => Promise<Identity | null>) | null = null;

/** Test-only seam. */
export function setIdentityForTesting(resolver: (() => Promise<Identity | null>) | null) {
  if (process.env.NODE_ENV === "production") throw new Error("Not available in production.");
  resolverForTesting = resolver;
}

/** The verified identity, honouring the test seam. */
export async function signedInIdentity(): Promise<Identity | null> {
  return resolverForTesting ? resolverForTesting() : currentIdentity();
}

/**
 * Journol's internal user id, created on first use. When someone who used
 * Journol as a guest signs in, their guest work moves into their account.
 */
export const currentUserId = cache(async (): Promise<string | null> => {
  const identity = await signedInIdentity();
  if (!identity) return null;
  const userId = await upsertUser(identity.issuer, identity.subject, Boolean(identity.guest));
  if (!identity.guest && !resolverForTesting) {
    const leftover = await guestSubject();
    if (leftover) await mergeGuestInto(userId, GUEST_ISSUER, leftover).catch(() => {});
  }
  return userId;
});

/** True when the current visitor is a guest rather than a signed-in journalist. */
export const isGuest = cache(async (): Promise<boolean> => Boolean((await signedInIdentity())?.guest));

/** For pages: the journalist's (or guest's) id, or a redirect to sign in that comes back here. */
export async function requireUserId(returnTo: string): Promise<string> {
  const userId = await currentUserId();
  if (!userId) redirect(`/sign-in?redirect_url=${encodeURIComponent(returnTo)}`);
  return userId;
}

/**
 * The owner (or owners) of this Journol, who can see the dashboard. Set
 * JOURNOL_ADMIN_USER_IDS to a comma-separated list of Clerk user IDs (shown on
 * the account page).
 */
export async function isOwner(): Promise<boolean> {
  const allowed = (process.env.JOURNOL_ADMIN_USER_IDS ?? "").split(",").map((id) => id.trim()).filter(Boolean);
  if (!allowed.length) return false;
  const identity = await signedInIdentity();
  return Boolean(identity && !identity.guest && allowed.includes(identity.subject));
}

/** The signed-in journalist's sign-in account ID (Clerk user ID), or null for guests. */
export async function currentAccountId(): Promise<string | null> {
  const identity = await signedInIdentity();
  return identity && !identity.guest ? identity.subject : null;
}
