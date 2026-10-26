import { NextResponse } from "next/server";
import { apiError } from "@/lib/api";
import { CLAIM_LIMITS, claimsFromPlan } from "@/lib/claims";
import { openInvestigationRequest, storageErrorResponse } from "@/lib/server/investigation-request";

type Context = { params: Promise<{ investigationId: string }> };

/**
 * Seeds the board with the claims in the current investigation plan. Claims
 * already imported are skipped, so running it again after a new plan version
 * adds only what is new.
 */
export async function POST(_: Request, { params }: Context) {
  const { investigationId } = await params;
  const opened = await openInvestigationRequest(investigationId, "editor");
  if ("response" in opened) return opened.response;
  try {
    const { repository, user, investigation } = opened;
    if (!investigation.currentPlanId) {
      return apiError("CONFLICT", "Build an investigation plan first; its claims are imported from there.", 409);
    }
    const plan = await repository.getInvestigationPlan(investigation.currentPlanId);
    if (!plan) return apiError("CONFLICT", "The investigation plan could not be found.", 409);
    const candidates = claimsFromPlan(plan.content);
    const existing = await repository.listClaimsWithEvidence(investigationId);
    const room = Math.max(0, CLAIM_LIMITS.claimsPerInvestigation - existing.length);
    const created = await repository.createClaimsIfAbsent(candidates.slice(0, room).map((candidate) => ({
      investigationId,
      statement: candidate.statement,
      origin: candidate.origin,
      originKey: candidate.originKey,
      createdByUserId: user.id,
    })));
    const claims = await repository.listClaimsWithEvidence(investigationId);
    return NextResponse.json({ success: true, added: created.length, found: candidates.length, claims });
  } catch (error) {
    return storageErrorResponse(error, "import claims from the plan");
  }
}
