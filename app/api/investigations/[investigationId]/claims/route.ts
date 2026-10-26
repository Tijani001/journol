import { NextResponse } from "next/server";
import { apiError, isRecord, readJsonBody } from "@/lib/api";
import { CLAIM_LIMITS, cleanClaimText } from "@/lib/claims";
import { PRIVATE_NO_STORE, openInvestigationRequest, storageErrorResponse } from "@/lib/server/investigation-request";

type Context = { params: Promise<{ investigationId: string }> };

export async function GET(_: Request, { params }: Context) {
  const { investigationId } = await params;
  const opened = await openInvestigationRequest(investigationId, "viewer");
  if ("response" in opened) return opened.response;
  try {
    const claims = await opened.repository.listClaimsWithEvidence(investigationId);
    return NextResponse.json({ success: true, claims, hasPlan: Boolean(opened.investigation.currentPlanId) }, { headers: PRIVATE_NO_STORE });
  } catch (error) {
    return storageErrorResponse(error, "load the claim board");
  }
}

/** Adds a claim the journalist wrote. */
export async function POST(request: Request, { params }: Context) {
  const { investigationId } = await params;
  const parsed = await readJsonBody(request, 16_000);
  if ("error" in parsed) return parsed.error;
  const statement = isRecord(parsed.value) ? cleanClaimText(parsed.value.statement, CLAIM_LIMITS.statement) : null;
  if (!statement) return apiError("BAD_REQUEST", `Write the claim in ${CLAIM_LIMITS.statement.toLocaleString("en-GB")} characters or fewer.`, 400);

  const opened = await openInvestigationRequest(investigationId, "editor");
  if ("response" in opened) return opened.response;
  try {
    const { repository, user } = opened;
    const existing = await repository.listClaimsWithEvidence(investigationId);
    if (existing.length >= CLAIM_LIMITS.claimsPerInvestigation) {
      return apiError("CONFLICT", "This claim board is full. Remove claims you no longer need first.", 409);
    }
    const claim = await repository.createClaim({ investigationId, statement, origin: "manual", originKey: null, createdByUserId: user.id });
    return NextResponse.json({ success: true, claim: { ...claim, evidence: [], history: [] } }, { status: 201 });
  } catch (error) {
    return storageErrorResponse(error, "add this claim");
  }
}
