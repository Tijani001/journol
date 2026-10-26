import { NextResponse } from "next/server";
import { apiError } from "@/lib/api";
import { evidenceRemovalBlocker } from "@/lib/claims";
import { claimInInvestigation } from "@/lib/server/claim-board";
import { openInvestigationRequest, storageErrorResponse } from "@/lib/server/investigation-request";

type Context = { params: Promise<{ investigationId: string; claimId: string; evidenceId: string }> };

export async function DELETE(_: Request, { params }: Context) {
  const { investigationId, claimId, evidenceId } = await params;
  const opened = await openInvestigationRequest(investigationId, "editor");
  if ("response" in opened) return opened.response;
  try {
    const { repository } = opened;
    const claim = await claimInInvestigation(repository, investigationId, claimId);
    if (!claim) return apiError("NOT_FOUND", "This claim is not on the board.", 404);
    const evidence = await repository.listClaimEvidence(claimId);
    if (!evidence.some((item) => item.id === evidenceId)) return apiError("NOT_FOUND", "This evidence is not attached to the claim.", 404);
    const blocker = evidenceRemovalBlocker(claim.verdict, claim.verdictRationale, evidence, evidenceId);
    if (blocker) return apiError("CONFLICT", blocker, 409);
    await repository.deleteClaimEvidence(evidenceId);
    return NextResponse.json({ success: true });
  } catch (error) {
    return storageErrorResponse(error, "remove this evidence");
  }
}
