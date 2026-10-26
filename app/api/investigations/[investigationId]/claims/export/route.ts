import { buildFactCheckMarkdown, factCheckFileName } from "@/lib/fact-check-export";
import { openInvestigationRequest, storageErrorResponse } from "@/lib/server/investigation-request";

type Context = { params: Promise<{ investigationId: string }> };

/** Downloads the claim board as a Markdown fact-check report. */
export async function GET(_: Request, { params }: Context) {
  const { investigationId } = await params;
  const opened = await openInvestigationRequest(investigationId, "viewer");
  if ("response" in opened) return opened.response;
  try {
    const { repository, investigation } = opened;
    const [claims, sources] = await Promise.all([
      repository.listClaimsWithEvidence(investigationId),
      repository.listInvestigationSources(investigationId),
    ]);
    const generatedAt = new Date();
    const markdown = buildFactCheckMarkdown({ investigationTitle: investigation.title, claims, sources, generatedAt });
    return new Response(markdown, {
      headers: {
        "Content-Type": "text/markdown; charset=utf-8",
        "Content-Disposition": `attachment; filename="${factCheckFileName(investigation.title, generatedAt)}"`,
        "Cache-Control": "private, no-store",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (error) {
    return storageErrorResponse(error, "prepare the fact-check report");
  }
}
