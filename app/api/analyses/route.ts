import { ArticleReadError } from "@/lib/server/article-reader";
import { apiError, isRecord, readJsonBody } from "@/lib/api";
import { cleanUrl } from "@/lib/engine/related";
import { analyzeStory, type Stage } from "@/lib/engine/run";
import { ENGINE_VERSION } from "@/lib/engine/types";
import { currentUserId } from "@/lib/server/auth";
import { isDatabaseConfigured } from "@/lib/server/database";
import { engineConfigured, engineServices } from "@/lib/server/engine";
import { QUOTA_MESSAGE, claimRun } from "@/lib/server/quota";
import { findRecentAnalysis, saveAnalysis } from "@/lib/server/store";

export const maxDuration = 60;

/**
 * Reads a published story, searches related coverage and finds angles.
 * Progress is streamed as one JSON object per line:
 *   {"stage":"reading"|"searching"|"thinking"} … then {"analysisId":"…"} or {"error":"…"}.
 */
export type AnalysisEvent = { stage: "reading" | Stage } | { analysisId: string } | { error: string };

export async function POST(request: Request) {
  if (!isDatabaseConfigured()) return apiError("Journol's storage isn't set up yet.", 503);

  let userId: string | null;
  try {
    userId = await currentUserId();
  } catch {
    return apiError("Journol couldn't reach its storage. Try again in a moment.", 503);
  }
  if (!userId) return apiError("Sign in to find angles.", 401);

  const parsed = await readJsonBody(request);
  if ("error" in parsed) return parsed.error;
  const rawUrl = isRecord(parsed.value) && typeof parsed.value.url === "string" ? parsed.value.url.trim() : "";
  if (!rawUrl || rawUrl.length > 2_000) return apiError("Paste the link to a published story.", 400);
  const url = cleanUrl(rawUrl);
  if (!url) return apiError("That doesn't look like a link. Paste the full address of a published story.", 400);

  let run: Awaited<ReturnType<typeof claimRun>>;
  try {
    const existing = await findRecentAnalysis(userId, url);
    if (existing) return streamOf([{ analysisId: existing }]);
    if (!engineConfigured()) return apiError("Journol's AI isn't set up yet.", 503);
    run = await claimRun(userId, "analysis");
  } catch {
    return apiError("Journol couldn't reach its storage. Try again in a moment.", 503);
  }
  if (!run) return apiError(QUOTA_MESSAGE, 429);

  const claimed = run;
  const owner = userId;
  const services = engineServices();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const encoder = new TextEncoder();
      const send = (event: AnalysisEvent) => controller.enqueue(encoder.encode(`${JSON.stringify(event)}\n`));
      try {
        send({ stage: "reading" });
        let story;
        try {
          story = await services.readStory(url);
        } catch (error) {
          await claimed.refund();
          send({ error: error instanceof ArticleReadError ? error.userMessage : "Journol couldn't read that story. Try another link." });
          return;
        }

        const earlier = story.url !== url ? await findRecentAnalysis(owner, story.url) : null;
        if (earlier) {
          await claimed.refund();
          send({ analysisId: earlier });
          return;
        }

        const result = await analyzeStory(story, { model: services.model, search: services.search, onStage: (stage) => send({ stage }) });
        if (!result.angles.length) {
          send({ error: "Journol couldn't find angles it could stand behind in this story. Try another story." });
          return;
        }
        const analysisId = await saveAnalysis({
          userId: owner,
          story,
          ...result,
          engineVersion: ENGINE_VERSION,
          model: services.modelName,
        });
        send({ analysisId });
      } catch (error) {
        console.error("Journol analysis failed:", error instanceof Error ? error.message : String(error));
        send({ error: "Something went wrong while finding angles. Please try again." });
      } finally {
        controller.close();
      }
    },
  });
  return streamResponse(stream);
}

function streamResponse(stream: ReadableStream<Uint8Array>) {
  return new Response(stream, {
    headers: {
      "Content-Type": "application/x-ndjson; charset=utf-8",
      "Cache-Control": "no-store",
      "X-Accel-Buffering": "no",
    },
  });
}

function streamOf(events: AnalysisEvent[]) {
  const body = events.map((event) => `${JSON.stringify(event)}\n`).join("");
  return streamResponse(new Response(body).body as ReadableStream<Uint8Array>);
}
