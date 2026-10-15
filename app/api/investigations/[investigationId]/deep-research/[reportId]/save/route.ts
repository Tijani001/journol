import { NextResponse } from "next/server";
import { apiError } from "@/lib/api";
import { getOrCreateCurrentUser } from "@/lib/server/auth";
import { requireInvestigationAccess } from "@/lib/server/authorization";
import { getPostgresRepository } from "@/lib/server/postgres-repository";

const privateHeaders = { "Cache-Control": "private, no-store" };

async function accessibleReport(investigationId: string, reportId: string) {
  const repository = getPostgresRepository();
  const user = await getOrCreateCurrentUser(repository);
  if (!user) return { error: apiError("UNAUTHORIZED", "Authentication is required.", 401) };
  try { await requireInvestigationAccess(repository, user, investigationId, "editor"); }
  catch { return { error: apiError("INVESTIGATION_UNAVAILABLE", "Investigation unavailable.", 404) }; }
  const report = await repository.getDeepResearchReport(reportId);
  if (!report || report.investigationId !== investigationId || report.createdByUserId !== user.id) {
    return { error: apiError("INVESTIGATION_UNAVAILABLE", "Investigation unavailable.", 404) };
  }
  return { repository, user, report };
}

export async function GET(_: Request, context: { params: Promise<{ investigationId: string; reportId: string }> }) {
  const { investigationId, reportId } = await context.params;
  const result = await accessibleReport(investigationId, reportId);
  if ("error" in result) return result.error;
  const saved = await result.repository.isDeepResearchReportSavedForUser(result.user.id, result.report.id);
  return NextResponse.json({ success: true, saved }, { headers: privateHeaders });
}

export async function POST(_: Request, context: { params: Promise<{ investigationId: string; reportId: string }> }) {
  const { investigationId, reportId } = await context.params;
  const result = await accessibleReport(investigationId, reportId);
  if ("error" in result) return result.error;
  const savedAt = await result.repository.saveDeepResearchReportForUser(result.user.id, result.report.id);
  return NextResponse.json({ success: true, saved: true, savedAt }, { headers: privateHeaders });
}

export async function DELETE(_: Request, context: { params: Promise<{ investigationId: string; reportId: string }> }) {
  const { investigationId, reportId } = await context.params;
  const result = await accessibleReport(investigationId, reportId);
  if ("error" in result) return result.error;
  await result.repository.unsaveDeepResearchReportForUser(result.user.id, result.report.id);
  return NextResponse.json({ success: true, saved: false }, { headers: privateHeaders });
}
