import { ArticleReadError } from "@/lib/server/article-reader";
import { apiError, isRecord, readJsonBody } from "@/lib/api";
import { cleanUrl } from "@/lib/engine/related";
import { analyzeStory, type Stage } from "@/lib/engine/run";
import { ENGINE_VERSION, type StoryInput } from "@/lib/engine/types";
import { parsePastedStory } from "@/lib/pasted-story";
import { currentUserId } from "@/lib/server/auth";
import { isDatabaseConfigured } from "@/lib/server/database";
import { engineConfigured, engineServices } from "@/lib/server/engine";
import { claimRun } from "@/lib/server/quota";
import { findRecentAnalysis, isPastedUrl, recordFailure, saveAnalysis } from "@/lib/server/store";

export const maxDuration = 90;

/**
 * Finds angles in a published story, from its link or from pasted text.
 * Progress is streamed as one JSON object per line:
 *   {"stage":"reading"|"searching"|"thinking"} … then {"analysisId":"…"} or {"error":"…","canPaste":true?}.
 */
export type AnalysisEvent = { stage: "reading" | Stage } | { analysisId: string } | { error: string; canPaste?: boolean };

const MAX_BODY_BYTES = 120_000;

export async function POST(request: Request) {
  if (!isDatabaseConfigured()) return apiError("Journol's storage isn't set up yet.", 503);

  let userId: string | null;
  try {
    userId = await currentUserId();
  } catch {
    return apiError("Journol couldn't reach its storage. Try again in a moment.", 503);
  }
  if (!userId) return apiError("Sign in to find angles.", 401);

  const parsed = await readJsonBody(request, MAX_BODY_BYTES);
  if ("error" in parsed) return parsed.error;
  const body = isRecord(parsed.value) ? parsed.value : {};
  const text = typeof body.text === "string" ? body.text : "";
  const rawUrl = typeof body.url === "string" ? body.url.trim().slice(0, 2_000) : "";

  // Either a link to read, or text the journalist pasted.
  let pasted: StoryInput | null = null;
  let url: string | null = null;
  if (text.trim()) {
    const result = parsePastedStory({
      text,
      title: typeof body.title === "string" ? body.title : undefined,
      publisher: typeof body.publisher === "string" ? body.publisher : undefined,
      url: rawUrl || undefined,
    });
    if ("error" in result) return apiError(result.error, 400);
    pasted = result.story;
    url = pasted.url;
  } else {
    if (!rawUrl) return apiError("Paste the link to a published story.", 400);
    url = cleanUrl(rawUrl);
    if (!url || isPastedUrl(url)) return apiError("That doesn't look like a link. Paste the full address of a published story.", 400);
  }

  let claim: Awaited<ReturnType<typeof claimRun>>;
  try {
    // A link analysed recently is reused. Pasted text is analysed again, since the text may have changed.
    const existing = pasted ? null : await findRecentAnalysis(userId, url);
    if (existing) return streamOf([{ analysisId: existing }]);
    if (!engineConfigured()) return apiError("Journol's AI isn't set up yet.", 503);
    claim = await claimRun(userId, "analysis");
  } catch {
    return apiError("Journol couldn't reach its storage. Try again in a moment.", 503);
  }
  if (!claim.ok) return apiError(claim.message, 429);

  const run = claim;
  const owner = userId;
  const link = url;
  const services = engineServices();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const encoder = new TextEncoder();
      const send = (event: AnalysisEvent) => controller.enqueue(encoder.encode(`${JSON.stringify(event)}\n`));
      try {
        send({ stage: "reading" });
        let story: StoryInput;
        if (pasted) {
          story = pasted;
        } else {
          try {
            story = await services.readStory(link);
          } catch (error) {
            await run.refund();
            const code = error instanceof ArticleReadError ? error.code : "READ_FAILED";
            await recordFailure({ userId: owner, kind: "read", code, url: link });
            send({ error: error instanceof ArticleReadError ? error.userMessage : "Journol couldn't read that story.", canPaste: true });
            return;
          }
          const earlier = story.url !== link ? await findRecentAnalysis(owner, story.url) : null;
          if (earlier) {
            await run.refund();
            send({ analysisId: earlier });
            return;
          }
        }

        const result = await analyzeStory(story, { model: services.model, search: services.search, onStage: (stage) => send({ stage }) });
        if (result.searchStatus === "unavailable") await recordFailure({ userId: owner, kind: "search", code: "SEARCH_UNAVAILABLE", url: story.url });
        if (!result.angles.length) {
          await recordFailure({ userId: owner, kind: "angles", code: "NO_GROUNDED_ANGLES", url: story.url });
          send({ error: "Journol couldn't find angles it could stand behind in this story. Try another story." });
          return;
        }
        const analysisId = await saveAnalysis({
          userId: owner,
          story,
          ...result,
          engineVersion: ENGINE_VERSION,
          model: services.modelName,
          pasted: Boolean(pasted),
        });
        send({ analysisId });
      } catch (error) {
        const code = error instanceof Error ? error.message.slice(0, 80) : "UNKNOWN";
        console.error("Journol analysis failed:", code);
        await recordFailure({ userId: owner, kind: "analysis", code, url: link });
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
