import "server-only";

import { NextResponse } from "next/server";
import OpenAI from "openai";
import { isRecord as isApiRecord, readJsonBody } from "@/lib/api";
import { limitRequest } from "@/lib/access";
import { isClerkConfigured } from "@/lib/server/clerk-config";
import { isDatabaseConfigured } from "@/lib/server/database";
import { getOrCreateCurrentUser } from "@/lib/server/auth";
import { requireInvestigationAccess } from "@/lib/server/authorization";
import { getPostgresRepository } from "@/lib/server/postgres-repository";
import { AiOperationService } from "@/lib/server/ai-operations";
import { snapshotHash } from "@/lib/server/workflow";
import type { CreatePlanWithActionsInput } from "@/lib/server/repository";
import {
  alignMinorFirstActionDifference,
  FIRST_ACTION_MISMATCH,
} from "@/lib/investigation-plan-consistency";

const MODEL = "gpt-4.1-mini";
const MAX_INPUT_CHARACTERS = 40_000;
const AI_TIMEOUT_MS = 25_000;
export const maxDuration = 55;

const INVESTIGATION_SCHEMA = {
  type: "object",
  properties: {
    approvedLead: { type: "string" },
    investigativeObjective: { type: "string" },

    knownInformation: {
      type: "array",
      items: {
        type: "object",
        properties: {
          claim: { type: "string" },
          status: { type: "string" },
        },
        required: ["claim", "status"],
        additionalProperties: false,
      },
    },

    keyQuestions: {
      type: "array",
      items: { type: "string" },
    },

    evidenceRequirements: {
      type: "array",
      items: {
        type: "object",
        properties: {
          evidence: { type: "string" },
          purpose: { type: "string" },
          possibleSource: { type: "string" },
        },
        required: ["evidence", "purpose", "possibleSource"],
        additionalProperties: false,
      },
    },

    verificationPlan: {
      type: "array",
      items: {
        type: "object",
        properties: {
          step: { type: "integer" },
          action: { type: "string" },
          evidenceSought: { type: "string" },
          source: { type: "string" },
          claimTested: { type: "string" },
          method: { type: "string" },
          possibleFindings: { type: "string" },
          nextStep: { type: "string" },
        },
        required: [
          "step",
          "action",
          "evidenceSought",
          "source",
          "claimTested",
          "method",
          "possibleFindings",
          "nextStep",
        ],
        additionalProperties: false,
      },
    },

    alternativeExplanations: {
      type: "array",
      items: { type: "string" },
    },

    limitations: {
      type: "array",
      items: {
        type: "object",
        properties: {
          issue: { type: "string" },
          whyItMatters: { type: "string" },
          howToResolve: { type: "string" },
          ifUnresolved: { type: "string" },
        },
        required: [
          "issue",
          "whyItMatters",
          "howToResolve",
          "ifUnresolved",
        ],
        additionalProperties: false,
      },
    },

    editorialSafeguards: {
      type: "array",
      items: { type: "string" },
    },

    firstAction: { type: "string" },

    confidence: {
      type: "object",
      properties: {
        investigability: {
          type: "string",
          enum: ["low", "medium", "high"],
        },
        startingEvidence: {
          type: "string",
          enum: ["low", "medium", "high"],
        },
        explanation: { type: "string" },
      },
      required: [
        "investigability",
        "startingEvidence",
        "explanation",
      ],
      additionalProperties: false,
    },
  },

  required: [
    "approvedLead",
    "investigativeObjective",
    "knownInformation",
    "keyQuestions",
    "evidenceRequirements",
    "verificationPlan",
    "alternativeExplanations",
    "limitations",
    "editorialSafeguards",
    "firstAction",
    "confidence",
  ],

  additionalProperties: false,
} as const;

function isRecord(
  value: unknown,
): value is Record<string, unknown> {
  return (
    typeof value === "object" &&
    value !== null &&
    !Array.isArray(value)
  );
}

function nonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function stringArray(value: unknown): value is string[] {
  return (
    Array.isArray(value) &&
    value.every((item) => nonEmptyString(item))
  );
}

function validateInvestigation(
  investigation: unknown,
  approvedLead: string,
): string | null {
  if (!isRecord(investigation)) {
    return "The investigation plan is not a valid object.";
  }

  if (investigation.approvedLead !== approvedLead) {
    return "The investigation plan did not preserve the approved lead.";
  }

  if (!nonEmptyString(investigation.investigativeObjective)) {
    return "The investigative objective is missing.";
  }

  if (
    !Array.isArray(investigation.knownInformation) ||
    !investigation.knownInformation.every(
      (item) =>
        isRecord(item) &&
        nonEmptyString(item.claim) &&
        nonEmptyString(item.status),
    )
  ) {
    return "The known-information section is invalid.";
  }

  if (!stringArray(investigation.keyQuestions)) {
    return "The key-questions section is invalid.";
  }

  if (investigation.keyQuestions.length === 0) {
    return "The investigation must contain at least one key question.";
  }

  if (
    !Array.isArray(investigation.evidenceRequirements) ||
    !investigation.evidenceRequirements.every(
      (item) =>
        isRecord(item) &&
        nonEmptyString(item.evidence) &&
        nonEmptyString(item.purpose) &&
        typeof item.possibleSource === "string",
    )
  ) {
    return "The evidence-requirements section is invalid.";
  }

  if (investigation.evidenceRequirements.length === 0) {
    return "The investigation must identify at least one evidence requirement.";
  }

  if (
    !Array.isArray(investigation.verificationPlan) ||
    investigation.verificationPlan.length === 0
  ) {
    return "The investigation must contain at least one verification step.";
  }

  const stepFields = [
    "action",
    "evidenceSought",
    "source",
    "claimTested",
    "method",
    "possibleFindings",
    "nextStep",
  ];

  for (const [index, step] of investigation.verificationPlan.entries()) {
    if (!isRecord(step)) {
      return `Verification step ${index + 1} is invalid.`;
    }

    if (step.step !== index + 1) {
      return `Verification step ${index + 1} has an incorrect step number.`;
    }

    for (const field of stepFields) {
      if (!nonEmptyString(step[field])) {
        return `Verification step ${index + 1} is missing ${field}.`;
      }
    }
  }

  if (
    !stringArray(investigation.alternativeExplanations)
  ) {
    return "The alternative-explanations section is invalid.";
  }

  if (
    !Array.isArray(investigation.limitations) ||
    !investigation.limitations.every(
      (item) =>
        isRecord(item) &&
        nonEmptyString(item.issue) &&
        nonEmptyString(item.whyItMatters) &&
        nonEmptyString(item.howToResolve) &&
        nonEmptyString(item.ifUnresolved),
    )
  ) {
    return "The limitations section is invalid.";
  }

  if (!stringArray(investigation.editorialSafeguards)) {
    return "The editorial-safeguards section is invalid.";
  }

  if (!nonEmptyString(investigation.firstAction)) {
    return "The first action is missing.";
  }

  const firstStep = investigation.verificationPlan[0];

  if (
    !isRecord(firstStep) ||
    investigation.firstAction.trim() !==
      String(firstStep.action).trim()
  ) {
    return "The first action must match the first verification step exactly.";
  }

  if (!isRecord(investigation.confidence)) {
    return "The confidence assessment is invalid.";
  }

  if (
    !["low", "medium", "high"].includes(
      String(investigation.confidence.investigability),
    ) ||
    !["low", "medium", "high"].includes(
      String(investigation.confidence.startingEvidence),
    ) ||
    !nonEmptyString(investigation.confidence.explanation)
  ) {
    return "The confidence assessment is incomplete.";
  }

  return null;
}

function getErrorStatus(error: unknown): number {
  if (!isRecord(error)) {
    return 500;
  }

  if (error.status === 429) return 429;
  if (error.status === 401 || error.status === 403) return 502;
  if (error.name === "APIConnectionTimeoutError") return 504;
  if (error.name === "APIConnectionError") return 502;

  return 502;
}

function validEvidenceAssessment(value: unknown, approvedLead: string): boolean {
  if (!isRecord(value) || value.approvedLead !== approvedLead) return false;
  if (
    !isRecord(value.materialReviewed) ||
    typeof value.materialReviewed.articleTextAvailable !== "boolean" ||
    !nonEmptyString(value.materialReviewed.articleTextLimitations)
  ) return false;
  if (
    !Array.isArray(value.reportedClaims) ||
    !Array.isArray(value.establishedInformation) ||
    !Array.isArray(value.unknowns) ||
    !Array.isArray(value.evidenceGaps) ||
    !Array.isArray(value.alternativeExplanations)
  ) return false;
  if (
    !isRecord(value.startingEvidenceAssessment) ||
    !["low", "medium", "high"].includes(
      String(value.startingEvidenceAssessment.level),
    )
  ) return false;
  return nonEmptyString(value.assessmentSummary);
}

type RouteContext = {
  params: Promise<{ investigationId: string }>;
};


export async function POST(
  request: Request,
  context: RouteContext,
) {
  let operationService: AiOperationService | null = null;
  let operation: Awaited<ReturnType<AiOperationService["begin"]>>["operation"] | null = null;
  let providerUsage = { inputTokens: 0, outputTokens: 0 };
  if (!isClerkConfigured()) {
    return NextResponse.json(
      { error: "Authentication is not configured." },
      { status: 503 },
    );
  }

  if (!isDatabaseConfigured()) {
    return NextResponse.json(
      { error: "Database persistence is not configured." },
      { status: 503 },
    );
  }

  const repository = getPostgresRepository();
  const user = await getOrCreateCurrentUser(repository);

  if (!user) {
    return NextResponse.json(
      { error: "Authentication is required." },
      { status: 401 },
    );
  }

  const { investigationId } = await context.params;

  try {
    await requireInvestigationAccess(
      repository,
      user,
      investigationId,
      "editor",
    );
  } catch {
    return NextResponse.json(
      { error: "Investigation not found." },
      { status: 404 },
    );
  }

  const parsed = await readJsonBody(request);
  if ("error" in parsed) return parsed.error;

  const body = parsed.value;

  if (!isApiRecord(body)) {
    return NextResponse.json(
      { error: "A valid investigation plan request is required." },
      { status: 400 },
    );
  }

  const { leadId, evidenceAssessmentId } = body;

  if (!nonEmptyString(leadId) || !nonEmptyString(evidenceAssessmentId)) {
    return NextResponse.json(
      {
        error:
          "Both leadId and evidenceAssessmentId are required.",
      },
      { status: 400 },
    );
  }

  const lead = await repository.getLead(leadId);

  if (
    !lead ||
    lead.investigationId !== investigationId ||
    lead.status !== "approved"
  ) {
    return NextResponse.json(
      { error: "The approved investigative lead could not be found." },
      { status: 404 },
    );
  }

  const article = await repository.getSourceArticle(lead.sourceArticleId);

  if (
    !article ||
    article.ownerUserId !== user.id ||
    !(await repository.investigationHasSource(
      investigationId,
      lead.sourceArticleId,
    ))
  ) {
    return NextResponse.json(
      { error: "The source material could not be found." },
      { status: 404 },
    );
  }

  const evidenceAssessment =
    await repository.getEvidenceAssessment(evidenceAssessmentId);

  if (
    !evidenceAssessment ||
    evidenceAssessment.investigationId !== investigationId ||
    evidenceAssessment.leadId !== lead.id
  ) {
    return NextResponse.json(
      {
        error:
          "The evidence assessment does not belong to this investigation or lead.",
      },
      { status: 404 },
    );
  }

  const approvedLead = lead.content.primaryLead;

  if (!nonEmptyString(approvedLead)) {
    return NextResponse.json(
      { error: "The approved lead is incomplete." },
      { status: 422 },
    );
  }

  if (!validEvidenceAssessment(evidenceAssessment.content, approvedLead)) {
    return NextResponse.json(
      { error: "The stored evidence assessment is invalid." },
      { status: 422 },
    );
  }

  const suppliedMaterial = {
    title: article.title || "Not supplied",
    description: article.publisher || "Not supplied",
    source: article.publisher || "Not supplied",
    url: article.canonicalUrl || article.originalUrl || "Not supplied",
    articleText:
      article.extractedText || "No retrieved article text supplied.",
    leadContext: lead.content,
    evidenceAssessment: evidenceAssessment.content,
  };

  const inputText = JSON.stringify(suppliedMaterial);

  if (inputText.length + approvedLead.length > MAX_INPUT_CHARACTERS) {
    return NextResponse.json(
      {
        error:
          "The supplied material is too large to build an investigation plan.",
      },
      { status: 413 },
    );
  }

  const inputSnapshotHash = snapshotHash({
    investigationId,
    leadId,
    evidenceAssessmentId,
    sourceArticleId: article.id,
    approvedLead,
    evidenceAssessment: evidenceAssessment.content,
  });

  const idempotencyKey =
    `plan:${investigationId}:${leadId}:${evidenceAssessmentId}:${inputSnapshotHash}`;

  // A persisted plan is authoritative. Reuse it before allocating another AI
  // operation so page retries cannot regenerate a valid plan.
  const currentInvestigation = await repository.getInvestigation(investigationId);
  if (currentInvestigation?.currentPlanId) {
    const existingPlan = await repository.getInvestigationPlan(currentInvestigation.currentPlanId);
    if (existingPlan && existingPlan.leadId === lead.id && existingPlan.evidenceAssessmentId === evidenceAssessment.id) {
      const actions = await repository.listInvestigationActions(existingPlan.id);
      return NextResponse.json({ success: true, planId: existingPlan.id, plan: existingPlan.content, actions, reused: true });
    }
  }

  const quota = await limitRequest("ai", user.id, {
    limit: 20,
    windowSeconds: 600,
    concurrency: 2,
  });

  if (!quota.allowed) {
    return NextResponse.json(
      {
        error: "Too many AI requests. Please try again later.",
      },
      {
        status: 429,
        headers: {
          "Retry-After": String(quota.retryAfterSeconds),
        },
      },
    );
  }

  operationService = new AiOperationService(repository);

  try {
    const begun = await operationService.begin({
      user,
      investigationId,
      stage: "investigation_plan",
      idempotencyKey,
      model: MODEL,
    });
    operation = begun.operation;
    const { reused } = begun;

    if (reused) {
      if (operation.status === "succeeded") {
        const investigation = await repository.getInvestigation(
          investigationId,
        );

        if (investigation?.currentPlanId) {
          const plan = await repository.getInvestigationPlan(
            investigation.currentPlanId,
          );

          if (!plan) {
            return NextResponse.json(
              {
                error:
                  "The previous investigation-plan operation succeeded but its plan could not be recovered.",
              },
              { status: 500 },
            );
          }

          const actions = await repository.listInvestigationActions(plan.id);

          return NextResponse.json({
            success: true,
            planId: plan.id,
            plan: plan.content,
            actions,
            reused: true,
          });
        }

        return NextResponse.json(
          {
            error:
              "The previous investigation-plan operation succeeded but its plan could not be recovered.",
          },
          { status: 500 },
        );
      }

      if (operation.status === "pending") {
        return NextResponse.json(
          {
            error:
              "An investigation plan is already being generated for this request.",
          },
          { status: 409 },
        );
      }

      // Failed operations can be retried with the same idempotency key. The
      // operation record is retained for auditability and is transitioned on
      // the subsequent successful or failed provider attempt.
    }

    if (!process.env.OPENAI_API_KEY) {
      await operationService.fail(
        operation,
        "AI_NOT_CONFIGURED",
      );
      return NextResponse.json(
        { error: "The AI service is not configured." },
        { status: 503 },
      );
    }

        const instructions = `
You are Journol's Investigation Builder.

Create a practical, evidence-led investigation plan for the journalist's
approved investigative lead. The supplied evidence assessment is the starting
assessment, not independent verification of the underlying claims.

APPROVED LEAD
Repeat approvedLead exactly. Do not paraphrase, broaden, narrow, or replace it.
Every question, evidence requirement, reporting action, and possible finding
must contribute directly to answering that lead.

SOURCE DISCIPLINE
Use only the supplied material. Do not claim to have searched externally,
examined records, contacted people, or independently verified claims.
Distinguish reported information from facts directly established by the
supplied material. Never invent names, dates, figures, documents, rules,
approvals, events, or outcomes.

EVIDENCE ASSESSMENT
Preserve the distinction between reported claims, established information,
unknowns, and evidence gaps. Address material unknowns and gaps in the plan.
Do not describe potential sources or records as already obtained or examined.
Do not silently discard material limitations. Do not expand the approved
lead because the assessment mentions a related issue.

INVESTIGATION SEQUENCE
Design verification steps in logical dependency order:
1. Establish essential facts and the relevant date or reporting period.
2. Identify an applicable standard only if the approved lead depends on one.
3. Identify and examine relevant evidence that could establish the facts.
4. Define the precise claim or requirement being tested.
5. Compare the evidence and identify what remains unresolved.
6. Pursue additional records, interviews, requests, or field reporting only
   when earlier findings establish why they are needed.

Adapt this sequence to the subject. Do not apply legal, corporate, financial,
or regulatory procedures to unrelated investigations.

TEMPORAL ACCURACY
Do not assume that an event is recent, ongoing, delayed, or upcoming unless
the supplied material establishes its date or status. For past events,
prioritise contemporaneous records, archives, and feasible retrospective
reporting. Never recommend attending an event that has already occurred.
If the date is unknown, make establishing it an early step.

EVIDENCE AND CONCLUSIONS
For every step, specify the action, evidence sought, source, claim tested,
method, possible findings, and next step. Explain what different findings
could support and what would remain unknown.
Do not treat an unsuccessful search or missing public record as proof that
a record does not exist, an approval was not granted, or wrongdoing occurred.
Test relevant alternative explanations without inventing motives.
Recommend lawful, ethical, proportionate reporting methods.

FIRST ACTION
Identify one discrete reporting task that can realistically begin now.
It must address an important unresolved prerequisite and identify the evidence
sought and likely source where possible. It must not combine independent tasks.
The firstAction field must exactly match the action field of verificationPlan's
first step.

CONFIDENCE
Investigability measures whether a realistic evidence path exists.
Starting evidence measures the strength of the supplied material.
Neither rating represents confidence that the underlying claim is true.

OUTPUT
Return every field in the required schema. Use empty arrays when appropriate.
Do not invent entries to fill arrays. Keep knownInformation limited to specific
facts supported by the supplied material, with a clear status. Include material
limitations and editorial safeguards. Return JSON only.
`;

    const openai = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY,
      timeout: AI_TIMEOUT_MS,
      maxRetries: 0,
    });

    let response = await openai.responses.create({
      model: MODEL,
      max_output_tokens: 3_500,
      instructions,
      input: `
APPROVED INVESTIGATIVE LEAD:
${approvedLead}

SUPPLIED MATERIAL:
${inputText}
`,
      text: {
        format: {
          type: "json_schema",
          name: "journol_investigation_plan",
          strict: true,
          schema: INVESTIGATION_SCHEMA,
        },
      },
    });
    const primaryUsage = response.usage;
    providerUsage = addUsage(providerUsage, primaryUsage);
    let repairUsage: typeof response.usage | undefined;

    if (!response.output_text) {
      await operationService.fail(operation, "EMPTY_AI_RESPONSE", {
        inputTokens: primaryUsage?.input_tokens,
        outputTokens: primaryUsage?.output_tokens,
      });
      return NextResponse.json(
        { error: "The AI service returned no investigation plan." },
        { status: 502 },
      );
    }

    let investigation: unknown;

    try {
      investigation = JSON.parse(response.output_text);
    } catch {
      await operationService.fail(operation, "INVALID_AI_JSON", {
        inputTokens: primaryUsage?.input_tokens,
        outputTokens: primaryUsage?.output_tokens,
      });
      return NextResponse.json(
        {
          error:
            "The AI service returned an unreadable investigation plan.",
        },
        { status: 502 },
      );
    }

    let validationError = validateInvestigation(investigation, approvedLead);

    if (validationError === FIRST_ACTION_MISMATCH && alignMinorFirstActionDifference(investigation)) {
      validationError = validateInvestigation(investigation, approvedLead);
    }

    if (validationError) {
      // One bounded repair attempt handles semantic validation that remains
      // possible even with strict JSON Schema (for example, a missing
      // verification field or a substantive first-action mismatch). It never
      // edits a material model instruction server-side or loops indefinitely.
      const repair = await openai.responses.create({
        model: MODEL,
        max_output_tokens: 3_500,
        instructions: `${instructions}\n\nREPAIR MODE\nThe previous JSON plan failed this server validation: ${validationError}\nReturn a complete replacement JSON plan. Preserve the approved lead exactly. If correcting firstAction, set it to the exact action string from verificationPlan[0]. Do not invent material, facts, sources, dates, or reporting results.`,
        input: `APPROVED INVESTIGATIVE LEAD:\n${approvedLead}\n\nSUPPLIED MATERIAL:\n${inputText}\n\nPREVIOUS INVALID PLAN:\n${JSON.stringify(investigation)}`,
        text: { format: { type: "json_schema", name: "journol_investigation_plan_repair", strict: true, schema: INVESTIGATION_SCHEMA } },
      });
      repairUsage = repair.usage;
      providerUsage = addUsage(providerUsage, repairUsage);

      if (repair.output_text) {
        try {
          investigation = JSON.parse(repair.output_text);
          response = repair;
          validationError = validateInvestigation(investigation, approvedLead);
          if (validationError === FIRST_ACTION_MISMATCH && alignMinorFirstActionDifference(investigation)) {
            validationError = validateInvestigation(investigation, approvedLead);
          }
        } catch {
          validationError = "The AI service returned an unreadable repaired investigation plan.";
        }
      } else {
        validationError = "The AI service returned no corrected investigation plan.";
      }
    }

    if (validationError) {
      await operationService.fail(
        operation,
        "INVALID_AI_PLAN",
        {
          inputTokens: (primaryUsage?.input_tokens ?? 0) + (repairUsage?.input_tokens ?? 0),
          outputTokens: (primaryUsage?.output_tokens ?? 0) + (repairUsage?.output_tokens ?? 0),
        },
      );

      return NextResponse.json(
        { code: "INVALID_STRUCTURED_RESPONSE", error: validationError },
        { status: 502 },
      );
    }

    const planRecord = investigation as Record<string, unknown>;
    const verificationPlan = Array.isArray(planRecord.verificationPlan)
      ? planRecord.verificationPlan
      : [];

    const actionInputs: CreatePlanWithActionsInput["actions"] = verificationPlan.flatMap((rawStep, index) => {
      if (!isRecord(rawStep)) return [];
      return [{
        position: index + 1,
        status: "not_started",
        questionOrClaim: String(rawStep.claimTested),
        evidenceSought: String(rawStep.evidenceSought),
        possibleSource: String(rawStep.source),
        verificationMethod: String(rawStep.method),
        limitations: String(rawStep.possibleFindings),
        createdByUserId: user.id,
      }];
    });

    // The plan pointer is not made current until every ordered action is
    // stored. PostgreSQL performs this as one transaction, avoiding a plan
    // that appears reusable with a partial verification sequence.
    const { plan, actions } = await repository.createInvestigationPlanWithActions({
      plan: {
        investigationId,
        leadId: lead.id,
        evidenceAssessmentId: evidenceAssessment.id,
        content: planRecord,
        model: MODEL,
        createdByUserId: user.id,
      },
      actions: actionInputs,
    });

    await operationService.succeed(
      operation,
      {
        inputTokens: (primaryUsage?.input_tokens ?? 0) + (repairUsage?.input_tokens ?? 0),
        outputTokens: (primaryUsage?.output_tokens ?? 0) + (repairUsage?.output_tokens ?? 0),
      },
      response.id,
    );

    return NextResponse.json({
      success: true,
      planId: plan.id,
      plan: plan.content,
      actions,
      reused: false,
    });
  } catch (error) {
    console.error(
      "Journol investigation-plan builder failed.",
      error instanceof Error ? error.name : "Unknown error",
    );

    const status = getErrorStatus(error);

    if (operationService && operation) {
      await operationService.fail(
        operation,
        status === 504 ? "AI_TIMEOUT" : status === 429 ? "AI_RATE_LIMITED" : "AI_PROVIDER_FAILURE",
        knownUsage(providerUsage),
      );
    }

    return NextResponse.json(
      {
        code: status === 504 ? "PROVIDER_TIMEOUT" : status === 429 ? "PROVIDER_RATE_LIMITED" : "PROVIDER_UNAVAILABLE",
        error:
          status === 504
            ? "Building the investigation plan timed out. Please try again later."
            : "Journol could not build the investigation plan.",
      },
      { status },
    );
  } finally {
    quota?.release();
  }
}

function addUsage(
  total: { inputTokens: number; outputTokens: number },
  usage: { input_tokens?: number | null; output_tokens?: number | null } | undefined,
) {
  return {
    inputTokens: total.inputTokens + (usage?.input_tokens ?? 0),
    outputTokens: total.outputTokens + (usage?.output_tokens ?? 0),
  };
}

function knownUsage(usage: { inputTokens: number; outputTokens: number }) {
  return usage.inputTokens > 0 || usage.outputTokens > 0 ? usage : {};
}
