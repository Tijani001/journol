import "server-only";

import type { Id, InvestigativeLead } from "@/lib/domain/types";
import type { JournolRepository } from "@/lib/server/repository";

/**
 * Leads proposed together are one angle set: they share an angleSetId in
 * their content. Leads stored before angle sets existed stand alone.
 */
export function angleSetIdOf(lead: InvestigativeLead): string | null {
  const id = lead.content.angleSetId;
  return typeof id === "string" && id ? id : null;
}

/** The angles proposed alongside this lead, in the order they were offered. */
export async function angleSetForLead(repository: JournolRepository, investigationId: Id, lead: InvestigativeLead): Promise<InvestigativeLead[]> {
  const setId = angleSetIdOf(lead);
  if (!setId) return [lead];
  const leads = await repository.listLeadsForInvestigation(investigationId);
  const position = (entry: InvestigativeLead) => (typeof entry.content.anglePosition === "number" ? entry.content.anglePosition : entry.version);
  return leads.filter((entry) => angleSetIdOf(entry) === setId).sort((a, b) => position(a) - position(b));
}

/** The browser's view of one angle: the stored content plus its lead record id and status. */
export function angleForClient(lead: InvestigativeLead) {
  return { ...lead.content, leadId: lead.id, status: lead.status };
}
