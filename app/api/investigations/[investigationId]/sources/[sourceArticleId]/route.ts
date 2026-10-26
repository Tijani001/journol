import { NextResponse } from "next/server";
import { apiError } from "@/lib/api";
import { openInvestigationRequest, storageErrorResponse } from "@/lib/server/investigation-request";

type Context = { params: Promise<{ investigationId: string; sourceArticleId: string }> };

/**
 * Removes a source from the investigation. Sources the investigation relies on
 * (its lead, a Deep Research report or claim evidence) stay attached so the
 * record of what was assessed is never broken.
 */
export async function DELETE(_: Request, { params }: Context) {
  const { investigationId, sourceArticleId } = await params;
  const opened = await openInvestigationRequest(investigationId, "editor");
  if ("response" in opened) return opened.response;
  try {
    const { repository } = opened;
    if (!(await repository.investigationHasSource(investigationId, sourceArticleId))) {
      return apiError("NOT_FOUND", "This source is not part of the investigation.", 404);
    }
    const usage = await repository.getSourceUsage(investigationId, sourceArticleId);
    if (usage.lead || usage.deepResearch) {
      return apiError("CONFLICT", "This source underpins the investigation's lead or research, so it cannot be removed.", 409);
    }
    if (usage.claimEvidence) {
      return apiError("CONFLICT", "This source is cited as evidence on the claim board. Remove that evidence first.", 409);
    }
    await repository.detachSourceFromInvestigation(investigationId, sourceArticleId);
    return NextResponse.json({ success: true });
  } catch (error) {
    return storageErrorResponse(error, "remove this source");
  }
}
