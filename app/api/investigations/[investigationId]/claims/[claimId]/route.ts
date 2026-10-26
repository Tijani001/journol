import { NextResponse } from "next/server";
import { apiError, isRecord, readJsonBody } from "@/lib/api";
import { CLAIM_LIMITS, cleanClaimText, isClaimVerdict, verdictBlocker } from "@/lib/claims";
import { claimInInvestigation } from "@/lib/server/claim-board";
import { openInvestigationRequest, storageErrorResponse } from "@/lib/server/investigation-request";

type Context = { params: Promise<{ investigationId: string; claimId: string }> };

/**
 * Edits a claim's wording, or records its verdict. A verdict needs a rationale
 * and evidence of the matching kind; each change is kept in the claim's history.
 */
export async function PATCH(request: Request, { params }: Context) {
  const { investigationId, claimId } = await params;
  const parsed = await readJsonBody(request, 16_000);
  if ("error" in parsed) return parsed.error;
  if (!isRecord(parsed.value)) return apiError("BAD_REQUEST", "The request body must be a JSON object.", 400);
  const body = parsed.value;
  const changingStatement = body.statement !== undefined;
  const changingVerdict = body.verdict !== undefined;
  if (changingStatement === changingVerdict) return apiError("BAD_REQUEST", "Change either the claim's wording or its verdict.", 400);

  const opened = await openInvestigationRequest(investigationId, "editor");
  if ("response" in opened) return opened.response;
  try {
    const { repository, user } = opened;
    const claim = await claimInInvestigation(repository, investigationId, claimId);
    if (!claim) return apiError("NOT_FOUND", "This claim is not on the board.", 404);

    if (changingStatement) {
      const statement = cleanClaimText(body.statement, CLAIM_LIMITS.statement);
      if (!statement) return apiError("BAD_REQUEST", `Write the claim in ${CLAIM_LIMITS.statement.toLocaleString("en-GB")} characters or fewer.`, 400);
      if (claim.verdict !== "unverified") {
        return apiError("CONFLICT", "Reset the verdict to “Not yet checked” before rewording a claim, so the verdict still matches what was checked.", 409);
      }
      const updated = await repository.updateClaimStatement(claimId, statement);
      return NextResponse.json({ success: true, claim: updated });
    }

    if (!isClaimVerdict(body.verdict)) return apiError("BAD_REQUEST", "Choose a valid verdict.", 400);
    const rationale = body.rationale === undefined || body.rationale === null || body.rationale === ""
      ? null
      : cleanClaimText(body.rationale, CLAIM_LIMITS.rationale);
    if (body.rationale && !rationale) return apiError("BAD_REQUEST", `Keep the rationale to ${CLAIM_LIMITS.rationale.toLocaleString("en-GB")} characters or fewer.`, 400);
    const evidence = await repository.listClaimEvidence(claimId);
    const blocker = verdictBlocker(body.verdict, rationale, evidence);
    if (blocker) return apiError("CONFLICT", blocker, 409);
    const updated = await repository.setClaimVerdict({
      claimId,
      verdict: body.verdict,
      rationale: body.verdict === "unverified" ? null : rationale,
      setByUserId: user.id,
    });
    return NextResponse.json({ success: true, claim: updated });
  } catch (error) {
    return storageErrorResponse(error, "update this claim");
  }
}

export async function DELETE(_: Request, { params }: Context) {
  const { investigationId, claimId } = await params;
  const opened = await openInvestigationRequest(investigationId, "editor");
  if ("response" in opened) return opened.response;
  try {
    const claim = await claimInInvestigation(opened.repository, investigationId, claimId);
    if (!claim) return apiError("NOT_FOUND", "This claim is not on the board.", 404);
    await opened.repository.deleteClaim(claimId);
    return NextResponse.json({ success: true });
  } catch (error) {
    return storageErrorResponse(error, "remove this claim");
  }
}
