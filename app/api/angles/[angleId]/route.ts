import { NextResponse } from "next/server";
import { apiError, isRecord, readJsonBody } from "@/lib/api";
import { currentUserId } from "@/lib/server/auth";
import { isDatabaseConfigured } from "@/lib/server/database";
import { ANGLE_STATUSES, updateAngle, type AngleStatus } from "@/lib/server/store";

/** Saves or unsaves an angle, changes its status, or ticks off its steps. */
export async function PATCH(request: Request, context: { params: Promise<{ angleId: string }> }) {
  const { angleId } = await context.params;
  if (!isDatabaseConfigured()) return apiError("Journol's storage isn't set up yet.", 503);

  const parsed = await readJsonBody(request);
  if ("error" in parsed) return parsed.error;
  const body = parsed.value;
  if (!isRecord(body)) return apiError("Nothing to change.", 400);

  const changes: { saved?: boolean; status?: AngleStatus; stepsDone?: boolean[] } = {};
  if ("saved" in body) {
    if (typeof body.saved !== "boolean") return apiError("Nothing to change.", 400);
    changes.saved = body.saved;
  }
  if ("status" in body) {
    if (!ANGLE_STATUSES.includes(body.status as AngleStatus)) return apiError("That status isn't recognised.", 400);
    changes.status = body.status as AngleStatus;
  }
  if ("stepsDone" in body) {
    if (!Array.isArray(body.stepsDone) || body.stepsDone.length > 10 || !body.stepsDone.every((value) => typeof value === "boolean")) {
      return apiError("Nothing to change.", 400);
    }
    changes.stepsDone = body.stepsDone;
  }
  if (!Object.keys(changes).length) return apiError("Nothing to change.", 400);

  try {
    const userId = await currentUserId();
    if (!userId) return apiError("Sign in to save angles.", 401);
    const angle = await updateAngle(userId, angleId, changes);
    if (!angle) return apiError("That angle isn't in your account.", 404);
    return NextResponse.json(
      { ok: true, angle: { id: angle.id, savedAt: angle.savedAt, status: angle.status, stepsDone: angle.stepsDone } },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch {
    return apiError("Journol couldn't save that change. Try again in a moment.", 503);
  }
}
