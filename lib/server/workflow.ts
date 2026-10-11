import { createHash } from "node:crypto";
import type { Id, User } from "@/lib/domain/types";
import { requireInvestigationAccess } from "@/lib/server/authorization";
import type { JournolRepository } from "@/lib/server/repository";

/** Resource IDs are the future route contract; article/lead text stays server-side. */
export type LeadSelectionContext = {
  investigationId: Id;
  sourceArticleId: Id;
  articleText: string;
};

export type EvidenceAssessmentContext = LeadSelectionContext & { leadId: Id; leadContent: Record<string, unknown> };
export type InvestigationPlanContext = EvidenceAssessmentContext & { evidenceAssessmentId: Id; evidenceAssessment: Record<string, unknown> };

export async function resolveLeadSelectionContext(repository: JournolRepository, user: User, investigationId: Id, sourceArticleId: Id): Promise<LeadSelectionContext> {
  await requireInvestigationAccess(repository, user, investigationId, "editor");
  const article = await repository.getSourceArticle(sourceArticleId);
  if (!article || article.ownerUserId !== user.id || !(await repository.investigationHasSource(investigationId, sourceArticleId))) {
    throw new Error("SOURCE_ARTICLE_NOT_FOUND");
  }
  return { investigationId, sourceArticleId, articleText: article.extractedText };
}

export async function resolveEvidenceAssessmentContext(repository: JournolRepository, user: User, investigationId: Id, leadId: Id): Promise<EvidenceAssessmentContext> {
  const lead = await repository.getLead(leadId);
  if (!lead || lead.investigationId !== investigationId || lead.status !== "approved") throw new Error("APPROVED_LEAD_NOT_FOUND");
  const source = await resolveLeadSelectionContext(repository, user, investigationId, lead.sourceArticleId);
  return { ...source, leadId, leadContent: lead.content };
}

export async function resolveInvestigationPlanContext(repository: JournolRepository, user: User, investigationId: Id, evidenceAssessmentId: Id): Promise<InvestigationPlanContext> {
  const assessment = await repository.getEvidenceAssessment(evidenceAssessmentId);
  if (!assessment || assessment.investigationId !== investigationId) throw new Error("EVIDENCE_ASSESSMENT_NOT_FOUND");
  const evidence = await resolveEvidenceAssessmentContext(repository, user, investigationId, assessment.leadId);
  return { ...evidence, evidenceAssessmentId, evidenceAssessment: assessment.content };
}

/** Hashes inputs for provenance without writing sensitive article text to logs. */
export function snapshotHash(value: unknown): string {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}
