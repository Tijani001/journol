import { NextResponse } from "next/server";
import { apiError } from "@/lib/api";
import { getOrCreateCurrentUser } from "@/lib/server/auth";
import { getPostgresRepository } from "@/lib/server/postgres-repository";

export async function GET() {
  try {
    const repository = getPostgresRepository();
    const user = await getOrCreateCurrentUser(repository);
    if (!user) return apiError("UNAUTHORIZED", "Authentication is required.", 401);
    const saved = await repository.listSavedInvestigationsForUser(user.id);
    const enrichedSaved = await Promise.all(saved.map(async (entry) => {
      const lead = entry.investigation.currentLeadId
        ? await repository.getLead(entry.investigation.currentLeadId)
        : null;
      const source = lead ? await repository.getSourceArticle(lead.sourceArticleId) : null;
      return {
        ...entry,
        source: source ? {
          title: source.title,
          publisher: source.publisher,
          originalUrl: source.originalUrl,
        } : null,
        lead: lead ? {
          id: lead.id,
          status: lead.status,
          primaryLead: typeof lead.content.primaryLead === "string" ? lead.content.primaryLead : null,
        } : null,
      };
    }));
    return NextResponse.json(
      { success: true, saved: enrichedSaved },
      { headers: { "Cache-Control": "private, no-store" } },
    );
  } catch { return apiError("SERVICE_UNAVAILABLE", "Unable to load saved investigations.", 503); }
}
