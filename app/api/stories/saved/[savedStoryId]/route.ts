import { NextResponse } from "next/server";
import { apiError } from "@/lib/api";
import { getOrCreateCurrentUser } from "@/lib/server/auth";
import { isClerkConfigured } from "@/lib/server/clerk-config";
import { isDatabaseConfigured } from "@/lib/server/database";
import { getPostgresRepository } from "@/lib/server/postgres-repository";

type Context = { params: Promise<{ savedStoryId: string }> };

export async function DELETE(_: Request, { params }: Context) {
  try {
    if (!isClerkConfigured() || !isDatabaseConfigured()) return apiError("UNAUTHORIZED", "Sign in to remove saved stories.", 401, { "Cache-Control": "private, no-store" });
    const repository = getPostgresRepository();
    const user = await getOrCreateCurrentUser(repository);
    if (!user) return apiError("UNAUTHORIZED", "Sign in to remove saved stories.", 401, { "Cache-Control": "private, no-store" });
    const { savedStoryId } = await params;
    // Ownership is part of the DELETE predicate; do not disclose whether a
    // different journalist has this bookmark.
    await repository.unsaveStoryForUser(user.id, savedStoryId);
    return NextResponse.json({ success: true }, { headers: { "Cache-Control": "private, no-store" } });
  } catch {
    return apiError("SERVICE_UNAVAILABLE", "Unable to remove saved story.", 503, { "Cache-Control": "private, no-store" });
  }
}
