import { NextResponse } from "next/server";
import { apiError } from "@/lib/api";
import { findMoreAngles } from "@/lib/engine/run";
import { MAX_ROUNDS } from "@/lib/engine/types";
import { currentUserId } from "@/lib/server/auth";
import { isDatabaseConfigured } from "@/lib/server/database";
import { engineConfigured, engineServices } from "@/lib/server/engine";
import { claimRun } from "@/lib/server/quota";
import { addAngleRound, getAnalysis, recordFailure } from "@/lib/server/store";

export const maxDuration = 60;

/** Finds a fresh round of angles for a story, different from every angle already shown. */
export async function POST(_request: Request, context: { params: Promise<{ analysisId: string }> }) {
  const { analysisId } = await context.params;
  if (!isDatabaseConfigured()) return apiError("Journol's storage isn't set up yet.", 503);

  let userId: string | null;
  try {
    userId = await currentUserId();
  } catch {
    return apiError("Journol couldn't reach its storage. Try again in a moment.", 503);
  }
  if (!userId) return apiError("Sign in to find angles.", 401);

  const analysis = await getAnalysis(userId, analysisId).catch(() => undefined);
  if (analysis === undefined) return apiError("Journol couldn't reach its storage. Try again in a moment.", 503);
  if (!analysis) return apiError("That story isn't in your account.", 404);

  const lastRound = Math.max(0, ...analysis.angles.map((angle) => angle.round));
  if (lastRound >= MAX_ROUNDS) {
    return apiError("You've seen every angle Journol can suggest for this story.", 409);
  }
  if (!engineConfigured()) return apiError("Journol's AI isn't set up yet.", 503);
  const claim = await claimRun(userId, "angles").catch(() => undefined);
  if (claim === undefined) return apiError("Journol couldn't reach its storage. Try again in a moment.", 503);
  if (!claim.ok) return apiError(claim.message, 429);

  try {
    const services = engineServices();
    const angles = await findMoreAngles({
      story: analysis.article,
      gaps: analysis.gaps,
      related: analysis.related,
      searchStatus: analysis.searchStatus,
      previous: analysis.angles,
    }, { model: services.model });
    if (!angles.length) {
      await recordFailure({ userId, kind: "angles", code: "NO_MORE_ANGLES", url: analysis.article.url });
      return apiError("Journol couldn't find more angles it could stand behind for this story.", 422);
    }
    const round = lastRound + 1;
    await addAngleRound(userId, analysisId, round, angles);
    const updated = await getAnalysis(userId, analysisId);
    return NextResponse.json(
      { ok: true, round, angles: updated?.angles.filter((angle) => angle.round === round) ?? [] },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    console.error("Journol could not find more angles:", error instanceof Error ? error.message : String(error));
    await recordFailure({ userId, kind: "more_angles", code: error instanceof Error ? error.message.slice(0, 80) : "UNKNOWN", url: analysis.article.url });
    return apiError("Something went wrong while finding more angles. Please try again.", 502);
  }
}
