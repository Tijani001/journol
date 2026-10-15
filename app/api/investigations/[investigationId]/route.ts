import { apiError } from "@/lib/api";
import { getOrCreateCurrentUser } from "@/lib/server/auth";
import { AuthorizationError } from "@/lib/server/authorization";
import { DatabaseConfigurationError } from "@/lib/server/database";
import { getInvestigationForUser } from "@/lib/server/investigations";
import { getPostgresRepository } from "@/lib/server/postgres-repository";

export async function GET(_: Request, context: { params: Promise<{ investigationId: string }> }) {
  try {
    const { investigationId } = await context.params;
    const repository = getPostgresRepository();
    const user = await getOrCreateCurrentUser(repository);
    if (!user) return apiError("UNAUTHORIZED", "Authentication is required for this endpoint.", 401);
    const investigation = await getInvestigationForUser(repository, user, investigationId);
    const lead = investigation.currentLeadId
      ? await repository.getLead(investigation.currentLeadId)
      : await repository.getLatestLeadForInvestigation(investigation.id);
    const evidenceAssessment = investigation.currentEvidenceAssessmentId
      ? await repository.getEvidenceAssessment(investigation.currentEvidenceAssessmentId)
      : null;
    const plan = investigation.currentPlanId ? await repository.getInvestigationPlan(investigation.currentPlanId) : null;
    const actions = plan ? await repository.listInvestigationActions(plan.id) : [];
    const source = lead ? await repository.getSourceArticle(lead.sourceArticleId) : null;
    const deepResearch = await repository.getLatestDeepResearchReport(investigation.id);
    const saved = await repository.isInvestigationSavedForUser(user.id, investigation.id);
    return Response.json(
      { success: true, investigation, saved, source, workflow: { lead, evidenceAssessment, plan, actions, deepResearch } },
      { headers: { "Cache-Control": "private, no-store" } },
    );
  } catch (error) {
    // Do not reveal whether an inaccessible investigation exists.
    if (error instanceof AuthorizationError) return apiError("INVESTIGATION_UNAVAILABLE", "Investigation unavailable.", 404);
    if (error instanceof DatabaseConfigurationError) return apiError("SERVICE_UNAVAILABLE", "Database persistence is not configured.", 503);
    return apiError("SERVICE_UNAVAILABLE", "Investigations are temporarily unavailable.", 503);
  }
}
