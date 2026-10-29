import { NextResponse } from "next/server";
import { apiError, isRecord, readJsonBody } from "@/lib/api";
import { PitchError, writePitch, type Pitch } from "@/lib/engine/pitch";
import { currentUserId, signedInIdentity } from "@/lib/server/auth";
import { isDatabaseConfigured } from "@/lib/server/database";
import { engineConfigured, engineServices } from "@/lib/server/engine";
import { claimRun } from "@/lib/server/quota";
import { getPitchContext, recordFailure, setPitch } from "@/lib/server/store";

export const maxDuration = 60;

type Context = { params: Promise<{ angleId: string }> };

function text(value: unknown, max: number): string {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

/**
 * Writes a ~250-word pitch from the angle. Optional body:
 * {"pitchingTo": "editor or outlet", "aboutMe": "one line about the journalist"}.
 */
export async function POST(request: Request, context: Context) {
  const { angleId } = await context.params;
  if (!isDatabaseConfigured()) return apiError("Journol's storage isn't set up yet.", 503);
  const parsed = await readJsonBody(request);
  if ("error" in parsed) return parsed.error;
  const body = isRecord(parsed.value) ? parsed.value : {};

  let userId: string | null;
  try {
    userId = await currentUserId();
  } catch {
    return apiError("Journol couldn't reach its storage. Try again in a moment.", 503);
  }
  if (!userId) return apiError("Sign in to write a pitch.", 401);
  if ((await signedInIdentity().catch(() => null))?.guest) {
    return Response.json(
      { ok: false, needsAccount: true, error: "Create a free account to write pitches." },
      { status: 403, headers: { "Cache-Control": "no-store" } },
    );
  }

  const material = await getPitchContext(userId, angleId).catch(() => undefined);
  if (material === undefined) return apiError("Journol couldn't reach its storage. Try again in a moment.", 503);
  if (!material) return apiError("That angle isn't in your account.", 404);
  if (!engineConfigured()) return apiError("Journol's AI isn't set up yet.", 503);

  const claim = await claimRun(userId, "pitch").catch(() => undefined);
  if (claim === undefined) return apiError("Journol couldn't reach its storage. Try again in a moment.", 503);
  if (!claim.ok) return apiError(claim.message, 429);

  try {
    const written = await writePitch(
      { ...material, pitchingTo: text(body.pitchingTo, 200), aboutMe: text(body.aboutMe, 300) },
      { model: engineServices().model },
    );
    const pitch: Pitch = { ...written, createdAt: new Date().toISOString(), edited: false };
    await setPitch(userId, angleId, pitch);
    return NextResponse.json({ ok: true, pitch }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    const code = error instanceof PitchError ? "PITCH_FAILED_CHECKS" : error instanceof Error ? error.message.slice(0, 80) : "UNKNOWN";
    await recordFailure({ userId, kind: "pitch", code, url: material.story.url });
    return apiError("Journol couldn't write a pitch it could stand behind for this angle. Please try again.", 502);
  }
}

/** Saves the journalist's own edits to the pitch: {"title": "...", "body": "..."}. */
export async function PUT(request: Request, context: Context) {
  const { angleId } = await context.params;
  const parsed = await readJsonBody(request, 24_000);
  if ("error" in parsed) return parsed.error;
  const body = isRecord(parsed.value) ? parsed.value : {};
  const title = text(body.title, 200);
  const pitchBody = typeof body.body === "string" ? body.body.replace(/\r\n?/g, "\n").trim().slice(0, 12_000) : "";
  if (!pitchBody) return apiError("The pitch can't be empty.", 400);
  try {
    const userId = await currentUserId();
    if (!userId) return apiError("Sign in to save your pitch.", 401);
    const pitch: Pitch = { title, body: pitchBody, createdAt: new Date().toISOString(), edited: true };
    if (!(await setPitch(userId, angleId, pitch))) return apiError("That angle isn't in your account.", 404);
    return NextResponse.json({ ok: true, pitch }, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return apiError("Journol couldn't save your pitch. Try again in a moment.", 503);
  }
}
