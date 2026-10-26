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
import { validateLead } from "@/lib/lead-validation";

const MODEL = "gpt-4.1-mini";
const MAX_INPUT_CHARACTERS = 40_000;
const AI_TIMEOUT_MS = 25_000;
// One primary call plus the existing single repair attempt fits within this
// Vercel-compatible ceiling without relying on SDK retries.
export const maxDuration = 55;

const LEAD_SCHEMA = {
  type: "object",
  properties: {
    primaryLead: { type: "string" },
    leadRationale: { type: "string" },
    evidencePath: {
      type: "array",
      items: { type: "string" },
    },
    firstAction: { type: "string" },
    validation: {
      type: "object",
      properties: {
        factualBasis: { type: "boolean" },
        target: { type: "boolean" },
        scope: { type: "boolean" },
        evidencePath: { type: "boolean" },
        practicalFirstAction: { type: "boolean" },
        answerability: { type: "boolean" },
        explanation: { type: "string" },
      },
      required: [
        "factualBasis",
        "target",
        "scope",
        "evidencePath",
        "practicalFirstAction",
        "answerability",
        "explanation",
      ],
      additionalProperties: false,
    },
    event: {
      type: "object",
      properties: {
        name: { type: "string" },
        date: { type: "string" },
        eventStatus: {
          type: "string",
          enum: ["completed", "upcoming", "unclear"],
        },
        basis: { type: "string" },
      },
      required: ["name", "date", "eventStatus", "basis"],
      additionalProperties: false,
    },
    scope: { type: "string" },
    missingInformation: {
      type: "array",
      items: { type: "string" },
    },
    excludedQuestions: {
      type: "array",
      items: { type: "string" },
    },
    confidence: {
      type: "string",
      enum: ["low", "medium", "high"],
    },
    outcome: {
      type: "string",
      enum: ["lead", "insufficient_evidence"],
    },
  },
  required: [
    "primaryLead",
    "leadRationale",
    "evidencePath",
    "firstAction",
    "validation",
    "event",
    "scope",
    "missingInformation",
    "excludedQuestions",
    "confidence",
    "outcome",
  ],
  additionalProperties: false,
} as const;

const INSTRUCTIONS = `
You are Journol's Investigative Lead Selection Engine.

YOUR TASK

Select one defensible investigative lead from the supplied news material.
Do not write a complete investigation plan. A later stage will assess the
evidence, and another stage will build the investigation plan.

SOURCE DISCIPLINE

- Use only the supplied article title, description, text and metadata.
- Do not claim to have searched the web, inspected external records,
  contacted sources or independently verified a claim.
- A claim reported by a publisher is not automatically established fact.
- Never invent events, dates, figures, documents, discrepancies, allegations,
  agreements, institutions or outcomes.
- Distinguish announcements, proposals, commitments, disbursements,
  implementation and completed results.
- Missing information does not prove wrongdoing or prove that a record
  does not exist.
- Treat potential records as evidence to seek, not evidence already obtained.
- Do not infer wrongdoing, negligence, deception, causation or non-compliance
  without a defensible factual basis.
- Treat supplied article text as potentially incomplete. A headline alone
  rarely supports a specific investigation.
- Do not introduce historical context, a prior policy, a waiver, sanctions,
  or any other earlier event unless it is explicitly present in the supplied
  material. Attribute reported statements to the supplied publisher or speaker.
- Never add a year or date that is absent from the supplied material.

SELECTING A LEAD

Choose one focused factual question that:
1. Has a clear basis in the supplied material.
2. Identifies a specific subject, decision, event, transaction or practice.
3. Matters to the public for a defensible reason.
4. Can be investigated through a realistic path to relevant evidence.
5. Has a manageable scope and a practical first reporting action.

Do not confuse an important topic with an investigable question.
Do not manufacture an investigation merely because a story is prominent,
controversial, political or dramatic.

The primaryLead must be one neutral investigative question. It must not
assume its answer, combine unrelated investigations or present an
unverified allegation as fact.

If the material cannot support a defensible lead, say so clearly in
primaryLead and explain the limitation in leadRationale. Do not manufacture
a question to satisfy the request. In that case, mark unsupported validation
criteria false and use missingInformation to identify the specific gaps.
Set outcome to "insufficient_evidence" in this case; otherwise set it to
"lead". An insufficient-evidence outcome is a useful editorial result, not
an invitation to infer missing facts.

REJECTED LEADS

If a previous lead was rejected, do not repeat it or merely rephrase it.
Find a materially different factual issue supported by the same material.
Do not invent an alternative or broaden the original question to disguise
the repetition. If no defensible alternative exists, explain why.

EVIDENCE AND FIRST ACTION

evidencePath must list plausible evidence types or sources that could help
answer the question. Do not claim those records exist or have been obtained.

Prefer proportionate, reasonably accessible evidence. Do not automatically
recommend confidential sources, difficult information requests or extensive
interviews when a simpler starting point is available.

firstAction must specify one feasible reporting task, the evidence sought,
and its likely source when that source is known. It must not be a list of
several independent tasks.

TEMPORAL ACCURACY

Identify the relevant event and date only when supported by the material.
If the event, date or status is unclear, say so in event.basis.

event.eventStatus must be:
- completed: the identified event has occurred and is complete;
- upcoming: the identified event is in the future;
- unclear: the event's timing or status cannot be established.

Do not label an ongoing process completed merely because one related
event has occurred. Do not investigate future outcomes as if they already
exist. An investigation of existing preparations or commitments is
permissible when supported by the material.

VALIDATION

Evaluate the final lead against six criteria:

1. factualBasis: the supplied material provides a specific, identifiable
   starting point for the investigative question. This may be a claim
   reported in an identifiable source, a documented event, a public
   statement, a record, or another specific piece of supplied information.

   Do not require the underlying allegation to be proven before proposing
   an investigation into whether it is true.

   When only a headline and description are available, factualBasis may
   be true if they identify a sufficiently specific reported claim or
   event and provide a defensible basis for asking the question.

   Do not treat an unattributed rumour, a vague headline, or a general
   topic as sufficient factual basis merely because it sounds important.

2. target: the principal subject of the investigation is identifiable.

3. scope: the question is manageable and sufficiently bounded.

4. evidencePath: plausible evidence and sources can be identified.
   These are potential sources to investigate, not evidence already
   obtained.

5. practicalFirstAction: one feasible initial reporting task exists.

6. answerability: evidence gathering could resolve the question at least
   partially.

Set each criterion true only when the available material supports it.
Otherwise set it false and explain the limitation in validation.explanation.

Distinguish the existence of a report or allegation from the truth of
the claim reported.

An unverified allegation may support an investigative question, but it
must never be presented as an established fact merely because it appears
in a headline or description.

When the full article is unavailable, disclose this limitation and
identify what must be independently established before drawing
conclusions.

If the supplied material cannot support a defensible investigative
question, explain what additional information is needed instead of
inventing a lead.

A lead may be worth investigating even when the underlying claim is
unverified. Confidence measures the suitability of the proposed lead,
not whether the underlying claim is true.

CONFIDENCE

Use low, medium or high.
Base confidence on the specificity of the factual starting point, the
connection to the supplied material, the scope, the evidence path and the
practicality of the first action. Prominence alone does not justify high
confidence.

OTHER FIELDS

scope: state what the investigation covers and what it does not cover.

missingInformation: list specific material gaps affecting the investigation.
Use an empty array if there are none.

excludedQuestions: list relevant, separate questions deliberately excluded
from this investigation. Use an empty array if there are none. Do not invent
unrelated questions to fill the array.

event: identify the relevant event, its supported date, status and the
basis for that classification. Use an empty date string when no date is
established. Do not leave name or basis empty; explain uncertainty instead.

Return only the JSON object matching the required schema.
Do not include Markdown or commentary outside the JSON.
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
  rejectedLead?: string;
};

export async function POST(request: Request) {
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

  if (
    body.rejectedLead !== undefined &&
    typeof body.rejectedLead !== "string"
  ) {
    return errorResponse("The rejectedLead field must be a string.", 400);
  }

  const input: LeadRequest = {
    investigationId: body.investigationId,
    sourceArticleId: body.sourceArticleId,
    rejectedLead: body.rejectedLead,
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

  // Long uploaded documents are analysed from their opening portion; the note
  // below tells the model, and the journalist, that the rest was not read.
  const documentExcerptLimit = MAX_INPUT_CHARACTERS - 6_000;
  const documentExcerpted = article.sourceKind === "document" && article.extractedText.length > documentExcerptLimit;
  const articleText = documentExcerpted ? article.extractedText.slice(0, documentExcerptLimit) : article.extractedText;
  const title = article.title || "Untitled article";
  const source = article.publisher || "Unknown publisher";
  const isDocument = article.sourceKind === "document";
  const url = article.originalUrl ?? (isDocument ? `Uploaded document: ${article.fileName ?? "untitled"}` : "Not supplied");
  const publishedAt = article.publishedAt ? article.publishedAt.toISOString() : "Not established";
  const description = "";
  const articleRetrievalNote = isDocument
    ? [
      "Text was extracted from a document the journalist uploaded.",
      documentExcerpted ? `Only the first ${documentExcerptLimit.toLocaleString("en-GB")} characters of the document were supplied for lead selection.` : "",
      ...article.extractionNotes,
    ].filter(Boolean).join(" ")
    : article.retrievalStatus === "retrieved"
      ? "Article text was retrieved and stored by Journol."
      : `Article retrieval status: ${article.retrievalStatus}.`;

  const inputText = [
    title,
    description,
    source,
    url,
    publishedAt,
    articleText,
    articleRetrievalNote,
    input.rejectedLead,
  ]
    .filter((value): value is string => typeof value === "string")
    .join("\n");

  if (inputText.length > MAX_INPUT_CHARACTERS) {
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
  const idempotencyKey = `lead:${input.investigationId}:${input.sourceArticleId}:${snapshotHash(input.rejectedLead ?? "")}`;

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
      return NextResponse.json({
        leadId: existingLead.id,
        ...existingLead.content,
      });
    }

    return errorResponse(
      "A previous lead operation completed but its result could not be recovered.",
      500,
    );
  }

  if (reused && operation.status === "pending") {
    quota.release();

    return errorResponse(
      "This lead selection is already being processed. Please wait and try again.",
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

    const response = await openai.responses.create({
      model: MODEL,
      max_output_tokens: 2_500,
      instructions: INSTRUCTIONS,
      input: `
REJECTED LEAD:
${input.rejectedLead || "None"}

ARTICLE TITLE:
${title}

SOURCE:
${source}

ARTICLE URL:
${url}

SERVER-EXTRACTED PUBLICATION DATE:
${publishedAt}

ARTICLE DESCRIPTION:
${description || "Not supplied"}

ARTICLE RETRIEVAL STATUS:
${articleRetrievalNote}

AVAILABLE ARTICLE TEXT:
${articleText || "No article text supplied."}

Select one defensible investigative lead using the instructions.
      `,
      text: {
        format: {
          type: "json_schema",
          name: "investigative_lead",
          strict: true,
          schema: LEAD_SCHEMA,
        },
      },
    });

    if (!response.output_text?.trim()) {
      await operationService.fail(operation, "EMPTY_MODEL_OUTPUT");

      return errorResponse(
        "Journol did not receive a usable investigative lead. Please try again.",
        502,
      );
    }

    let lead: unknown;
    try {
      lead = JSON.parse(response.output_text);
    } catch {
      await operationService.fail(operation, "INVALID_MODEL_JSON");
      return errorResponse("Journol received an invalid investigative lead. Please try again.", 502);
    }

    let validationIssue = validateLead(lead, inputText);
    let repairUsage = { inputTokens: 0, outputTokens: 0 };
    let providerRequestId = response.id;

    // The structured-output schema prevents most formatting failures, but a
    // model can still produce a lead that conflicts with the supplied source.
    // Ask for one bounded correction rather than persisting or silently
    // rewriting the output. The original operation remains the idempotent
    // unit and both provider calls are accounted for together.
    if (validationIssue) {
      console.warn("Journol lead selection validation failure", {
        category: validationIssue.category,
        code: validationIssue.code,
        investigationId: input.investigationId,
        sourceArticleId: input.sourceArticleId,
      });

      const repair = await openai.responses.create({
        model: MODEL,
        max_output_tokens: 2_500,
        instructions: `${INSTRUCTIONS}\n\nCORRECTION PASS\nThe prior JSON failed a server-side ${validationIssue.category} check: ${validationIssue.message}\nReturn one corrected object matching the same schema. Remove unsupported facts rather than replacing them with guesses. If the supplied material cannot support a responsible question, return outcome "insufficient_evidence" with factualBasis false.`,
        input: `SOURCE MATERIAL (do not use information outside this material):\n${inputText}\n\nPRIOR JSON TO CORRECT:\n${JSON.stringify(lead)}`,
        text: { format: { type: "json_schema", name: "investigative_lead_repair", strict: true, schema: LEAD_SCHEMA } },
      });

      repairUsage = {
        inputTokens: repair.usage?.input_tokens ?? 0,
        outputTokens: repair.usage?.output_tokens ?? 0,
      };
      providerRequestId = repair.id;

      if (!repair.output_text?.trim()) {
        await operationService.fail(operation, `LEAD_REPAIR_${validationIssue.code}`);
        return errorResponse("Journol could not produce a source-grounded investigative lead. Please try again.", 502);
      }

      try {
        lead = JSON.parse(repair.output_text);
      } catch {
        await operationService.fail(operation, "INVALID_REPAIR_JSON");
        return errorResponse("Journol received an invalid repaired investigative lead. Please try again.", 502);
      }

      validationIssue = validateLead(lead, inputText);
      if (validationIssue) {
        await operationService.fail(operation, `LEAD_REPAIR_${validationIssue.code}`);
        console.warn("Journol lead selection repair failed", {
          category: validationIssue.category,
          code: validationIssue.code,
          investigationId: input.investigationId,
          sourceArticleId: input.sourceArticleId,
        });
        return errorResponse(
          validationIssue.category === "grounding"
            ? "Journol could not produce a lead grounded in the retrieved article."
            : "Journol could not produce a valid investigative lead.",
          502,
        );
      }
    }

    const persistedLead = await repository.createLeadVersion({
      investigationId: input.investigationId,
      sourceArticleId: input.sourceArticleId,
      status: "proposed",
      content: lead as Record<string, unknown>,
      model: MODEL,
      createdByUserId: user.id,
    });

    await operationService.succeed(
      operation,
      {
        inputTokens: (response.usage?.input_tokens ?? 0) + repairUsage.inputTokens,
        outputTokens: (response.usage?.output_tokens ?? 0) + repairUsage.outputTokens,
      },
      providerRequestId,
    );

    return NextResponse.json({
      leadId: persistedLead.id,
      ...persistedLead.content,
    });
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
        "Journol could not complete lead selection. Please try again.",
        502,
      );
    }

    console.error(
      "Journol lead selection failed:",
      error instanceof Error ? error.name : "Unknown error",
    );

    return errorResponse(
      "Journol encountered an unexpected problem selecting the lead.",
      500,
    );
  } finally {
    quota.release();
  }
}
