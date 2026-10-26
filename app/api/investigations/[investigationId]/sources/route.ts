import { NextResponse } from "next/server";
import { apiError } from "@/lib/api";
import { PRIVATE_NO_STORE, openInvestigationRequest, storageErrorResponse } from "@/lib/server/investigation-request";

type Context = { params: Promise<{ investigationId: string }> };

/** Lists every source attached to the investigation, without full text. */
export async function GET(_: Request, { params }: Context) {
  const { investigationId } = await params;
  const opened = await openInvestigationRequest(investigationId, "viewer");
  if ("response" in opened) return opened.response;
  try {
    const { repository, investigation } = opened;
    const sources = await repository.listInvestigationSources(investigation.id);
    const lead = investigation.currentLeadId
      ? await repository.getLead(investigation.currentLeadId)
      : await repository.getLatestLeadForInvestigation(investigation.id);
    return NextResponse.json(
      { success: true, sources, primarySourceArticleId: lead?.sourceArticleId ?? null },
      { headers: PRIVATE_NO_STORE },
    );
  } catch (error) {
    return storageErrorResponse(error, "load this investigation's sources");
  }
}

/**
 * Source creation goes through the retrieval endpoints: /api/article for web
 * pages and ./documents for uploads. Accepting extracted text here would make
 * browser input appear to be authoritative source material.
 */
export async function POST() {
  return apiError(
    "BAD_REQUEST",
    "Create sources through the article retrieval or document upload endpoints.",
    410,
  );
}
