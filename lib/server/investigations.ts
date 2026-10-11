import "server-only";

import type { Investigation, User } from "@/lib/domain/types";
import { requireInvestigationAccess } from "@/lib/server/authorization";
import type { JournolRepository } from "@/lib/server/repository";

export async function createInvestigationForUser(
  repository: JournolRepository,
  user: User,
  title: string,
): Promise<Investigation> {
  return repository.createInvestigation({ ownerUserId: user.id, title });
}

export async function getInvestigationForUser(
  repository: JournolRepository,
  user: User,
  investigationId: string,
): Promise<Investigation> {
  return requireInvestigationAccess(repository, user, investigationId);
}
