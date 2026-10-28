import { NextResponse } from "next/server";
import { apiError, isRecord, readJsonBody } from "@/lib/api";
import { currentUserId } from "@/lib/server/auth";
import { setFeedback, type Verdict } from "@/lib/server/store";

/** Records whether an angle was useful: {"verdict":"useful"|"not_useful"|null}. */
export async function PUT(request: Request, context: { params: Promise<{ angleId: string }> }) {
  const { angleId } = await context.params;
  const parsed = await readJsonBody(request);
  if ("error" in parsed) return parsed.error;
  const verdict = isRecord(parsed.value) ? parsed.value.verdict : undefined;
  if (verdict !== null && verdict !== "useful" && verdict !== "not_useful") return apiError("Choose useful or not useful.", 400);
  try {
    const userId = await currentUserId();
    if (!userId) return apiError("Sign in to rate angles.", 401);
    const saved = await setFeedback(userId, angleId, verdict as Verdict | null);
    if (!saved) return apiError("That angle isn't in your account.", 404);
    return NextResponse.json({ ok: true, verdict }, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return apiError("Journol couldn't save your rating. Try again in a moment.", 503);
  }
}
