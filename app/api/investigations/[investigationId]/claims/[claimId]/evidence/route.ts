import { NextResponse } from "next/server";
import { apiError, isRecord, readJsonBody } from "@/lib/api";
import { CLAIM_LIMITS } from "@/lib/claims";
import { claimInInvestigation, evidenceInputFromBody } from "@/lib/server/claim-board";
import { openInvestigationRequest, storageErrorResponse } from "@/lib/server/investigation-request";

type Context = { params: Promise<{ investigationId: string; claimId: string }> };

/** Attaches a source passage, public record, web page or reporting note to a claim. */
export async function POST(request: Request, { params }: Context) {
  const { investigationId, claimId } = await params;
  const parsed = await readJsonBody(request, 32_000);
  if ("error" in parsed) return parsed.error;
  if (!isRecord(parsed.value)) return apiError("BAD_REQUEST", "The request body must be a JSON object.", 400);

  const opened = await openInvestigationRequest(investigationId, "editor");
  if ("response" in opened) return opened.response;
  try {
    const { repository, user } = opened;
    const claim = await claimInInvestigation(repository, investigationId, claimId);
    if (!claim) return apiError("NOT_FOUND", "This claim is not on the board.", 404);
    const existing = await repository.listClaimEvidence(claimId);
    if (existing.length >= CLAIM_LIMITS.evidencePerClaim) {
      return apiError("CONFLICT", "This claim already has the maximum amount of evidence attached.", 409);
    }
    const result = await evidenceInputFromBody(repository, { investigationId, claimId, userId: user.id }, parsed.value);
    if ("error" in result) return apiError("BAD_REQUEST", result.error, result.status);
    const evidence = await repository.addClaimEvidence(result.input);
    return NextResponse.json({ success: true, evidence }, { status: 201 });
  } catch (error) {
    return storageErrorResponse(error, "attach this evidence");
  }
}
