import { NextResponse } from "next/server";
import { apiError } from "@/lib/api";
import { getOrCreateCurrentUser } from "@/lib/server/auth";
import { requireInvestigationAccess, AuthorizationError } from "@/lib/server/authorization";
import { getPostgresRepository } from "@/lib/server/postgres-repository";

type Context = { params: Promise<{ investigationId: string }> };

export async function POST(_: Request, { params }: Context) {
  try {
    const repository = getPostgresRepository(); const user = await getOrCreateCurrentUser(repository);
    if (!user) return apiError("UNAUTHORIZED", "Authentication is required.", 401);
    const { investigationId } = await params;
    const investigation = await requireInvestigationAccess(repository, user, investigationId, "editor");
    if (!investigation.currentPlanId) return apiError("BAD_REQUEST", "A valid investigation plan is required before saving.", 409);
    const savedAt = await repository.saveInvestigationForUser(user.id, investigation.id);
    return NextResponse.json({ success: true, savedAt });
  } catch (error) { if (error instanceof AuthorizationError) return apiError("BAD_REQUEST", "Investigation not found.", 404); return apiError("SERVICE_UNAVAILABLE", "Unable to save investigation.", 503); }
}

export async function DELETE(_: Request, { params }: Context) {
  try {
    const repository = getPostgresRepository(); const user = await getOrCreateCurrentUser(repository);
    if (!user) return apiError("UNAUTHORIZED", "Authentication is required.", 401);
    const { investigationId } = await params;
    await requireInvestigationAccess(repository, user, investigationId, "editor");
    await repository.unsaveInvestigationForUser(user.id, investigationId);
    return NextResponse.json({ success: true });
  } catch (error) { if (error instanceof AuthorizationError) return apiError("BAD_REQUEST", "Investigation not found.", 404); return apiError("SERVICE_UNAVAILABLE", "Unable to remove saved investigation.", 503); }
}
