import { NextResponse } from "next/server";
import { apiError } from "@/lib/api";
import { getOrCreateCurrentUser } from "@/lib/server/auth";
import { getPostgresRepository } from "@/lib/server/postgres-repository";

export async function GET() {
  const repository = getPostgresRepository();
  const user = await getOrCreateCurrentUser(repository);
  if (!user) return apiError("UNAUTHORIZED", "Authentication is required.", 401);
  const saved = await repository.listSavedDeepResearchReportsForUser(user.id);
  const items = await Promise.all(saved.map(async ({ report, savedAt }) => {
    const [investigation, source] = await Promise.all([
      repository.getInvestigation(report.investigationId),
      repository.getSourceArticle(report.sourceArticleId),
    ]);
    return { report, savedAt, investigation: investigation ? { id: investigation.id, title: investigation.title } : null, source: source ? { id: source.id, title: source.title, publisher: source.publisher, originalUrl: source.originalUrl } : null };
  }));
  return NextResponse.json({ success: true, saved: items }, { headers: { "Cache-Control": "private, no-store" } });
}
