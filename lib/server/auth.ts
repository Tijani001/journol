import { cache } from "react";
import { auth as clerkAuth } from "@clerk/nextjs/server";
import { apiError } from "@/lib/api";
import type { User } from "@/lib/domain/types";
import type { JournolRepository } from "@/lib/server/repository";
import { isClerkConfigured } from "@/lib/server/clerk-config";

export type VerifiedIdentity = {
  issuer: string;
  subject: string;
  email: string | null;
};

export class AuthenticationRequiredError extends Error {
  constructor() {
    super("AUTHENTICATION_REQUIRED");
  }
}

/**
 * Provider seam. Replace this resolver with a verified managed-provider
 * session reader; do not pass identity from route JSON or client state.
 */
export type IdentityResolver = () => Promise<VerifiedIdentity | null>;

async function resolveDevelopmentIdentity(): Promise<VerifiedIdentity | null> {
  if (process.env.NODE_ENV === "production") return null;
  const subject = process.env.JOURNOL_DEV_USER_ID?.trim();
  if (!subject) return null;
  return { issuer: "journol-development", subject, email: null };
}

async function resolveClerkIdentity(): Promise<VerifiedIdentity | null> {
  if (!isClerkConfigured()) return resolveDevelopmentIdentity();

  try {
    const session = await clerkAuth();
    if (!session.userId) return null;
    const claims = session.sessionClaims as { iss?: unknown } | null;
    const issuer = typeof claims?.iss === "string" ? claims.iss : "";
    if (!issuer) return null;
    // `userId` and `iss` come from Clerk's verified server session, not a
    // request payload. Email is intentionally not copied into Journol here.
    return { issuer, subject: session.userId, email: null };
  } catch {
    // A protected handler remains fail-closed through requireCurrentUser().
    return null;
  }
}

let identityResolver: IdentityResolver = resolveClerkIdentity;

/** Test-only registration point; production integrations should configure a resolver at startup. */
export function setIdentityResolverForTesting(resolver: IdentityResolver | null) {
  if (process.env.NODE_ENV === "production") throw new Error("Identity resolver cannot be changed in production.");
  identityResolver = resolver ?? resolveClerkIdentity;
}

export async function getCurrentIdentity(): Promise<VerifiedIdentity | null> {
  return identityResolver();
}

/** Maps a verified external subject to Journol's internal user record. */
export async function getCurrentUser(repository: JournolRepository): Promise<User | null> {
  const identity = await getCurrentIdentity();
  if (!identity) return null;
  return repository.getUserByIdentity(identity.issuer, identity.subject);
}

/**
 * Creates the internal mapping only after a provider identity has been
 * verified on the server. Use this during a provider callback or first signed-
 * in request, never from a client-supplied profile payload.
 */
export async function getOrCreateCurrentUser(repository: JournolRepository): Promise<User | null> {
  const identity = await getCurrentIdentity();
  if (!identity) return null;
  const existing = await repository.getUserByIdentity(identity.issuer, identity.subject);
  return existing ?? repository.createUser({
    authIssuer: identity.issuer,
    authSubject: identity.subject,
    email: identity.email,
  });
}

export async function requireCurrentUser(repository: JournolRepository): Promise<User> {
  const user = await getCurrentUser(repository);
  if (!user) throw new AuthenticationRequiredError();
  return user;
}

/** Safe adapter for route handlers that choose to catch authentication errors. */
export function authenticationErrorResponse() {
  return apiError("UNAUTHORIZED", "Authentication is required for this endpoint.", 401);
}

// Prevent accidental request-local resolver work from being repeated in future server components.
export const getCachedCurrentIdentity = cache(getCurrentIdentity);
