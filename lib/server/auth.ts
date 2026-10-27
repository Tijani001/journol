import "server-only";

import { cache } from "react";
import { auth } from "@clerk/nextjs/server";
import { connection } from "next/server";
import { redirect } from "next/navigation";
import { isClerkConfigured } from "@/lib/server/clerk-config";
import { upsertUser } from "@/lib/server/store";

export type Identity = { issuer: string; subject: string };

/**
 * The signed-in journalist, from Clerk's verified server session. In local
 * development without Clerk keys, JOURNOL_DEV_USER_ID stands in for a user.
 * Identity never comes from request bodies or the browser.
 */
export async function currentIdentity(): Promise<Identity | null> {
  // Who is signed in is only known per request, so nothing that depends on it is prerendered.
  await connection();
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

let resolverForTesting: (() => Promise<Identity | null>) | null = null;

/** Test-only seam. */
export function setIdentityForTesting(resolver: (() => Promise<Identity | null>) | null) {
  if (process.env.NODE_ENV === "production") throw new Error("Not available in production.");
  resolverForTesting = resolver;
}

/** Journol's internal user id for the signed-in journalist, created on first use. */
export const currentUserId = cache(async (): Promise<string | null> => {
  const identity = resolverForTesting ? await resolverForTesting() : await currentIdentity();
  if (!identity) return null;
  return upsertUser(identity.issuer, identity.subject);
});

/** For pages: the signed-in journalist's id, or a redirect to sign in that comes back here. */
export async function requireUserId(returnTo: string): Promise<string> {
  const userId = await currentUserId();
  if (!userId) redirect(`/sign-in?redirect_url=${encodeURIComponent(returnTo)}`);
  return userId;
}
