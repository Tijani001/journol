import type { Investigation, User } from "@/lib/domain/types";
import type { JournolRepository } from "@/lib/server/repository";

export type InvestigationAccess = "owner" | "editor" | "viewer";

export class AuthorizationError extends Error {
  constructor() { super("INVESTIGATION_ACCESS_DENIED"); }
}

/**
 * Current policy is owner-only. The return type intentionally supports future
 * member roles so route code will not need a broad authorization rewrite.
 */
export async function getInvestigationAccess(
  repository: JournolRepository,
  user: User,
  investigationId: string,
): Promise<{ investigation: Investigation; access: InvestigationAccess } | null> {
  const investigation = await repository.getInvestigation(investigationId);
  if (!investigation || investigation.ownerUserId !== user.id) return null;
  return { investigation, access: "owner" };
}

export async function requireInvestigationAccess(
  repository: JournolRepository,
  user: User,
  investigationId: string,
  minimumAccess: InvestigationAccess = "viewer",
): Promise<Investigation> {
  const result = await getInvestigationAccess(repository, user, investigationId);
  if (!result) throw new AuthorizationError();

  const rank: Record<InvestigationAccess, number> = { viewer: 1, editor: 2, owner: 3 };
  if (rank[result.access] < rank[minimumAccess]) throw new AuthorizationError();
  return result.investigation;
}
