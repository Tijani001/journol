import OpenAI from "openai";
import { NextResponse } from "next/server";
import { apiError, readJsonBody } from "@/lib/api";
import { limitRequest } from "@/lib/access";
import { getOrCreateCurrentUser } from "@/lib/server/auth";
import { isClerkConfigured } from "@/lib/server/clerk-config";
import { isDatabaseConfigured } from "@/lib/server/database";
import { requireInvestigationAccess } from "@/lib/server/authorization";
import { getPostgresRepository } from "@/lib/server/postgres-repository";
import { AiOperationService } from "@/lib/server/ai-operations";
import { snapshotHash } from "@/lib/server/workflow";
import { randomUUID } from "node:crypto";
import type { InvestigativeLead } from "@/lib/domain/types";
import {
  ANGLE_ENGINE_VERSION,
  ANGLE_SET_SCHEMA,
  buildAngleSet,
  rejectedQuestionsFromBody,
  type AngleSetResult,
} from "@/lib/lead-angles";
import { angleForClient, angleSetForLead } from "@/lib/server/angle-sets";

const MODEL = "gpt-4.1-mini";
const MAX_INPUT_CHARACTERS = 40_000;
// Several angles take longer to write than one lead. The first call gets most
// of the function's time; a correction runs only if enough time remains.
const AI_TIMEOUT_MS = 38_000;
const MAX_OUTPUT_TOKENS = 4_000;
const REQUEST_DEADLINE_MS = 52_000;
const MIN_REPAIR_MS = 14_000;
// One primary call plus the existing single repair attempt fits within this
// Vercel-compatible ceiling without relying on SDK retries.
export const maxDuration = 55;

const INSTRUCTIONS = `
You are Journol's angle-finding editor. A journalist has brought you a story
that is already published. Your job is to find what that story did NOT do,
and turn it into new, reportable angles that a careful newsroom could pursue.

Work in two passes.

PASS 1 — READ FOR WHAT IS MISSING (storyGaps)

Read the story the way a sharp editor reads a rival's scoop. List the 3 to 6
most useful gaps. Each gap is one of:
- unsupported_claim: something asserted without evidence or attribution.
- unsourced_figure: an amount, count, percentage or date with no source.
- unexplained_actor: a company, official, agency or group named but never
  explained (who they are, why them, how they were chosen).
- missing_voice: people affected, accused or responsible who are never heard.
- promise_or_deadline: a pledge, target, allocation or timeline that can
  later be checked against what actually happened.
- unanswered_question: an obvious question the story raises and leaves open.
- contradiction: two parts of the story, or a figure and its context, that
  do not fit together.

For each gap write one plain-language observation, and copy into excerpt the
exact words from the story that the gap rests on (up to 30 words, verbatim,
no paraphrase). If no single passage fits, use an empty excerpt.

PASS 2 — PROPOSE ANGLES (angles)

Propose 3 or 4 angles. Each must be a materially different way into the
story, and each must have a different angleType:
- follow_the_money: where money came from, where it went, who controls it.
- who_benefits: who gains from a decision, contract, appointment or policy.
- promise_vs_delivery: whether an announced pledge, budget line or deadline
  turned into what was promised.
- pattern_or_precedent: whether the same actor, place or practice appears
  in earlier events that the story itself mentions or clearly implies.
- missing_voices: what the people most affected would say or have
  experienced, and how to reach them.
- numbers_check: whether the story's figures are consistent, complete and
  measured the way the story implies.
- accountability: who decided, who signed off, who was meant to oversee it.
- human_impact: what the event means on the ground for specific people
  or communities.

For each angle:
- headline: a short, plain label a journalist would scribble on a notepad
  (under 10 words). No clickbait.
- primaryLead: one neutral, answerable question. It must not assume its
  answer or present an allegation as fact.
- leadRationale: 1 to 2 sentences on why this angle is worth a reporter's
  time and why the original story did not settle it.
- builtOnGaps: the zero-based positions in storyGaps this angle grows from.
  Every angle must build on at least one gap.
- evidencePath: up to 4 kinds of evidence or sources that could answer it.
  Prefer public, obtainable records and people a reporter can reach.
  These are places to look, not evidence already obtained.
- firstAction: one concrete task a reporter could start today, naming the
  record or person and where to find them when the story makes that clear.
- scope: what the angle covers and what it leaves out, in one sentence.
- missingInformation: up to 3 specific facts the reporter must establish.
- validation and confidence: as defined below.

What makes an angle strong: it is specific (names a decision, sum, place,
contract, body or group from the story), it is checkable through records or
people, and it is something the original story could have asked but did not.
Avoid generic angles that fit any story ("What are the implications?",
"How will stakeholders respond?"). Avoid simply asking whether the story
is true. Do not offer an angle that a reporter could only pursue with
illegal access or by endangering a source.

SOURCE DISCIPLINE

- Use only the supplied article title, text and metadata.
- Do not claim to have searched the web, inspected records, contacted
  sources or verified anything.
- A claim reported by a publisher is not automatically established fact.
- Never invent events, dates, figures, documents, discrepancies, allegations,
  agreements, institutions or outcomes.
- Distinguish announcements, proposals, commitments, disbursements,
  implementation and completed results.
- Missing information does not prove wrongdoing or prove that a record
  does not exist. Do not infer wrongdoing, negligence, deception, causation
  or non-compliance without a defensible factual basis.
- Do not introduce historical context, earlier events or earlier policies
  unless they appear in the supplied material. pattern_or_precedent angles
  must point to where earlier cases could be found, not assert that they exist.
- Never add a year or date that is absent from the supplied material.
- Treat the article text as possibly incomplete.

REJECTED ANGLES

If the journalist has already turned down some angles, do not repeat or
merely rephrase them. Find materially different gaps or angle types. If no
defensible alternative remains, propose fewer angles rather than padding.

EVENT

event describes the central event the story reports: its name, the date
only when the material supports it (otherwise an empty string), its status
(completed, upcoming or unclear) and the basis for that classification.

VALIDATION (per angle)

Set each criterion true only when the supplied material supports it, and
explain any false criterion in validation.explanation:
1. factualBasis: the story gives a specific, identifiable starting point
   (a reported claim, event, statement, figure or named actor). An angle
   without one must not be proposed.
2. target: the principal subject is identifiable.
3. scope: the question is bounded and manageable.
4. evidencePath: plausible evidence and sources exist to look for.
5. practicalFirstAction: one feasible first task exists.
6. answerability: reporting could resolve the question at least partly.

confidence (low, medium, high) rates how promising and practical the angle
is to pursue, not whether any underlying claim is true. Prominence alone
never justifies high confidence.

WHEN THE STORY IS TOO THIN

If the material cannot support even one defensible angle (for example a
headline with no detail), set outcome to "insufficient_evidence", explain
what is missing in insufficientExplanation, and return an empty angles
array. Otherwise set outcome to "angles" and insufficientExplanation to "".

Return only the JSON object matching the required schema.
`;

function errorResponse(message: string, status: number) {
  return NextResponse.json({ error: message }, { status });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function nonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

type LeadRequest = {
  investigationId: string;
  sourceArticleId: string;
  rejectedQuestions: string[];
};

function angleSetResponse(leads: InvestigativeLead[]) {
  const angles = leads.map(angleForClient);
  const first = leads[0]?.content ?? {};
  return NextResponse.json({
    angleSetId: typeof first.angleSetId === "string" ? first.angleSetId : null,
    outcome: first.outcome === "insufficient_evidence" ? "insufficient_evidence" : "angles",
    storyGaps: Array.isArray(first.storyGaps) ? first.storyGaps : [],
    event: first.event ?? null,
    angles,
  });
}

function usageOf(response: { usage?: { input_tokens?: number | null; output_tokens?: number | null } | null }) {
  return { inputTokens: response.usage?.input_tokens ?? 0, outputTokens: response.usage?.output_tokens ?? 0 };
}

export async function POST(request: Request) {
  const startedAt = Date.now();
  const parsed = await readJsonBody(request);

  if ("error" in parsed) {
    return parsed.error;
  }

  if (!isClerkConfigured() || !isDatabaseConfigured()) {
    return errorResponse("Persistence is not configured.", 503);
  }

  if (!isRecord(parsed.value)) {
    return errorResponse("A valid request object is required.", 400);
  }

  const body = parsed.value;

  if (!nonEmptyString(body.investigationId)) {
    return errorResponse("A valid investigation ID is required.", 400);
  }

  if (!nonEmptyString(body.sourceArticleId)) {
    return errorResponse("A valid source article ID is required.", 400);
  }

  const rejectedQuestions = rejectedQuestionsFromBody(body);
  if (!rejectedQuestions) {
    return errorResponse("Rejected angles must be a list of short questions.", 400);
  }

  const input: LeadRequest = {
    investigationId: body.investigationId,
    sourceArticleId: body.sourceArticleId,
    rejectedQuestions,
  };

  const repository = getPostgresRepository();
  const user = await getOrCreateCurrentUser(repository);

  if (!user) {
    return errorResponse("Authentication required.", 401);
  }

  try {
    await requireInvestigationAccess(
      repository,
      user,
      input.investigationId,
      "editor",
    );
  } catch {
    return errorResponse("Investigation access denied.", 403);
  }

  const article = await repository.getSourceArticle(input.sourceArticleId);

  if (
    !article ||
    article.ownerUserId !== user.id ||
    !(await repository.investigationHasSource(
      input.investigationId,
      input.sourceArticleId,
    ))
  ) {
    return errorResponse("Source article not found.", 404);
  }

  const articleText = article.extractedText;
  const title = article.title || "Untitled article";
  const source = article.publisher || "Unknown publisher";
  const url = article.originalUrl;
  const publishedAt = article.publishedAt ? article.publishedAt.toISOString() : "Not established";
  const articleRetrievalNote =
    article.retrievalStatus === "retrieved"
      ? "Article text was retrieved and stored by Journol."
      : `Article retrieval status: ${article.retrievalStatus}.`;
  const rejectedText = input.rejectedQuestions.length
    ? input.rejectedQuestions.map((question, index) => `${index + 1}. ${question}`).join("\n")
    : "None";

  // Everything the model may draw on; used to check that no unsupported year
  // appears in an angle. Rejected questions are excluded on purpose: a year
  // that appears only there is not supported by the story.
  const sourceMaterial = [title, source, url, publishedAt, articleText, articleRetrievalNote].join("\n");

  if (sourceMaterial.length + rejectedText.length > MAX_INPUT_CHARACTERS) {
    return errorResponse(
      "The stored article material is too large to analyze.",
      413,
    );
  }

  const quota = await limitRequest("ai", user.id, {
    limit: 20,
    windowSeconds: 600,
    concurrency: 2,
  });

  if (!quota.allowed) {
    return apiError(
      "RATE_LIMITED",
      "Too many AI requests. Please try again later.",
      429,
      { "Retry-After": String(quota.retryAfterSeconds) },
    );
  }

  const operationService = new AiOperationService(repository);
  const idempotencyKey = `lead:${ANGLE_ENGINE_VERSION}:${input.investigationId}:${input.sourceArticleId}:${snapshotHash([...input.rejectedQuestions].sort())}`;

  const { operation, reused } = await operationService.begin({
    user,
    investigationId: input.investigationId,
    stage: "lead_selection",
    idempotencyKey,
    model: MODEL,
  });

  if (reused && operation.status === "succeeded") {
    quota.release();

    const existingLead = await repository.getLatestLeadForSource(
      input.investigationId,
      input.sourceArticleId,
    );

    if (existingLead) {
      return angleSetResponse(await angleSetForLead(repository, input.investigationId, existingLead));
    }

    return errorResponse(
      "A previous lead operation completed but its result could not be recovered.",
      500,
    );
  }

  if (reused && operation.status === "pending") {
    quota.release();

    return errorResponse(
      "These angles are already being prepared. Please wait and try again.",
      409,
    );
  }

  if (!process.env.OPENAI_API_KEY) {
    await operationService.fail(operation, "OPENAI_NOT_CONFIGURED");
    quota.release();

    console.error("Journol lead selection: API key is not configured.");

    return errorResponse(
      "Journol's AI service is not configured correctly.",
      503,
    );
  }

  try {
    const openai = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY,
      timeout: AI_TIMEOUT_MS,
      maxRetries: 0,
    });

    const modelInput = `
ANGLES THE JOURNALIST HAS ALREADY TURNED DOWN:
${rejectedText}

ARTICLE TITLE:
${title}

SOURCE:
${source}

ARTICLE URL:
${url}

SERVER-EXTRACTED PUBLICATION DATE:
${publishedAt}

ARTICLE RETRIEVAL STATUS:
${articleRetrievalNote}

AVAILABLE ARTICLE TEXT:
${articleText || "No article text supplied."}

Read the story for its gaps, then propose distinct angles, following the instructions.
`;

    const angleSetId = randomUUID();
    const context = { angleSetId, articleText, sourceMaterial, rejectedQuestions: input.rejectedQuestions };
    const textFormat = { format: { type: "json_schema" as const, name: "story_angles", strict: true, schema: ANGLE_SET_SCHEMA } };

    const response = await openai.responses.create({
      model: MODEL,
      max_output_tokens: MAX_OUTPUT_TOKENS,
      instructions: INSTRUCTIONS,
      input: modelInput,
      text: textFormat,
    });
    let usage = usageOf(response);
    let providerRequestId = response.id;

    let result: AngleSetResult = { kind: "invalid", reason: "Journol did not receive any angles." };
    if (response.output_text?.trim()) {
      try {
        result = buildAngleSet(JSON.parse(response.output_text), context);
      } catch {
        result = { kind: "invalid", reason: "The response was not valid JSON." };
      }
    }

    // One bounded correction when nothing usable came back, and only if the
    // request still has time for it inside the function's duration limit.
    const remainingMs = REQUEST_DEADLINE_MS - (Date.now() - startedAt);
    if (result.kind === "invalid" && remainingMs > MIN_REPAIR_MS) {
      console.warn("Journol angle generation failed its checks; attempting one correction", {
        investigationId: input.investigationId,
        sourceArticleId: input.sourceArticleId,
      });
      const repair = await openai.responses.create({
        model: MODEL,
        max_output_tokens: MAX_OUTPUT_TOKENS,
        instructions: `${INSTRUCTIONS}\n\nCORRECTION PASS\nThe previous answer failed Journol's checks: ${result.reason}\nReturn a complete replacement. Every angle needs a factual basis in the story, no year that the story does not contain, and must not repeat a turned-down angle. If the story cannot support any angle, return outcome "insufficient_evidence".`,
        input: modelInput,
        text: textFormat,
      }, { timeout: remainingMs - 2_000 });
      const repairUsage = usageOf(repair);
      usage = { inputTokens: usage.inputTokens + repairUsage.inputTokens, outputTokens: usage.outputTokens + repairUsage.outputTokens };
      providerRequestId = repair.id;
      if (repair.output_text?.trim()) {
        try {
          result = buildAngleSet(JSON.parse(repair.output_text), context);
        } catch {
          result = { kind: "invalid", reason: "The corrected response was not valid JSON." };
        }
      }
    }

    if (result.kind === "invalid") {
      await operationService.fail(operation, "ANGLES_FAILED_CHECKS");
      console.warn("Journol angle generation could not produce grounded angles", {
        investigationId: input.investigationId,
        sourceArticleId: input.sourceArticleId,
        reason: result.reason.slice(0, 200),
      });
      return errorResponse("Journol could not find angles grounded in this story. Please try again.", 502);
    }

    const contents = result.kind === "angles" ? result.leads : [result.lead];
    const persisted = await repository.createLeadVersions(contents.map((content) => ({
      investigationId: input.investigationId,
      sourceArticleId: input.sourceArticleId,
      status: "proposed" as const,
      content,
      model: MODEL,
      createdByUserId: user.id,
    })));

    await operationService.succeed(operation, usage, providerRequestId);

    return angleSetResponse(persisted);
  } catch (error) {
    await operationService.fail(
      operation,
      error instanceof OpenAI.APIError
        ? `OPENAI_${error.status ?? "UNKNOWN"}`
        : "LEAD_SELECTION_FAILED",
    );

    if (error instanceof OpenAI.APIError) {
      console.error(
        "Journol OpenAI request failed:",
        error.status,
        error.code,
      );

      if (error.status === 429) {
        return errorResponse(
          "Journol's AI service is temporarily unavailable due to a usage or rate limit. Please try again later.",
          429,
        );
      }

      if (error.status === 401 || error.status === 403) {
        return errorResponse(
          "Journol's AI service could not authenticate the request.",
          503,
        );
      }

      return errorResponse(
        "Journol could not finish finding angles. Please try again.",
        502,
      );
    }

    console.error(
      "Journol lead selection failed:",
      error instanceof Error ? error.name : "Unknown error",
    );

    return errorResponse(
      "Journol encountered an unexpected problem finding angles.",
      500,
    );
  } finally {
    quota.release();
  }
}
