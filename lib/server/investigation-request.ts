import "server-only";

import type { NextResponse } from "next/server";
import { apiError } from "@/lib/api";
import type { Investigation, User } from "@/lib/domain/types";
import { getOrCreateCurrentUser } from "@/lib/server/auth";
import { AuthorizationError, requireInvestigationAccess, type InvestigationAccess } from "@/lib/server/authorization";
import { DatabaseConfigurationError, isDatabaseConfigured, isDatabaseUnavailableError } from "@/lib/server/database";
import { getPostgresRepository } from "@/lib/server/postgres-repository";
import type { JournolRepository } from "@/lib/server/repository";

export type InvestigationRequest = { repository: JournolRepository; user: User; investigation: Investigation };

/**
 * Shared opening for investigation-desk routes: resolve the signed-in user and
 * confirm their access before any resource is read. An inaccessible
 * investigation is reported as unavailable so its existence is not disclosed.
 */
export async function openInvestigationRequest(
  investigationId: string,
  minimumAccess: InvestigationAccess,
): Promise<InvestigationRequest | { response: NextResponse }> {
  if (!isDatabaseConfigured()) {
    return { response: apiError("SERVICE_UNAVAILABLE", "Database persistence is not configured.", 503) };
  }
  try {
    const repository = getPostgresRepository();
    const user = await getOrCreateCurrentUser(repository);
    if (!user) return { response: apiError("UNAUTHORIZED", "Sign in to use this investigation.", 401) };
    const investigation = await requireInvestigationAccess(repository, user, investigationId, minimumAccess);
    return { repository, user, investigation };
  } catch (error) {
    if (error instanceof AuthorizationError) {
      return { response: apiError("INVESTIGATION_UNAVAILABLE", "Investigation unavailable.", 404) };
    }
    return { response: storageErrorResponse(error) };
  }
}

/** Maps storage failures to a retryable response without leaking details. */
export function storageErrorResponse(error: unknown, action = "complete this request") {
  if (error instanceof DatabaseConfigurationError) {
    return apiError("SERVICE_UNAVAILABLE", "Database persistence is not configured.", 503);
  }
  console.error(`[journol:desk] storage failure while trying to ${action}`, {
    name: error instanceof Error ? error.name : "UnknownError",
    unavailable: isDatabaseUnavailableError(error),
  });
  return apiError("SERVICE_UNAVAILABLE", `Journol could not ${action}. Please try again.`, 503);
}

/** Private, per-account data must never be cached by browsers or proxies. */
export const PRIVATE_NO_STORE = { "Cache-Control": "private, no-store" } as const;
