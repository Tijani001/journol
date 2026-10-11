import OpenAI from "openai";
import { NextResponse } from "next/server";
import { readJsonBody } from "@/lib/api";
import { getOrCreateCurrentUser } from "@/lib/server/auth";
import { requireInvestigationAccess } from "@/lib/server/authorization";
import { getPostgresRepository } from "@/lib/server/postgres-repository";
import { isClerkConfigured } from "@/lib/server/clerk-config";
import { isDatabaseConfigured } from "@/lib/server/database";
import { AiOperationService } from "@/lib/server/ai-operations";
import { snapshotHash } from "@/lib/server/workflow";
import { limitRequest } from "@/lib/access";

const MODEL = "gpt-4.1-mini";
const MAX_INPUT_CHARACTERS = 40_000;
const AI_TIMEOUT_MS = 25_000;
export const maxDuration = 55;

type RouteContext = {
  params: Promise<{ investigationId: string }>;
};

function getErrorStatus(error: unknown): number {
  if (!isRecord(error)) return 500;
  if (error.status === 429) return 429;
  if (error.status === 401 || error.status === 403) return 502;
  if (error.name === "APIConnectionTimeoutError") return 504;
  if (error.name === "APIConnectionError") return 502;
  return 502;
}

const EVIDENCE_ASSESSMENT_SCHEMA = {
  type: "object",
  properties: {
    approvedLead: { type: "string" },

    materialReviewed: {
      type: "object",
      properties: {
        articleTextAvailable: { type: "boolean" },
        articleTextLimitations: { type: "string" },
      },
      required: [
        "articleTextAvailable",
        "articleTextLimitations",
      ],
      additionalProperties: false,
    },

    reportedClaims: {
      type: "array",
      items: {
        type: "object",
        properties: {
          claim: { type: "string" },
          attribution: { type: "string" },
          supportingMaterial: { type: "string" },
          verificationStatus: {
            type: "string",
            enum: [
              "reported",
              "partially supported",
              "not established",
            ],
          },
          limitations: { type: "string" },
        },
        required: [
          "claim",
          "attribution",
          "supportingMaterial",
          "verificationStatus",
          "limitations",
        ],
        additionalProperties: false,
      },
    },

    establishedInformation: {
      type: "array",
      items: {
        type: "object",
        properties: {
          information: { type: "string" },
          supportingEvidence: { type: "string" },
          evidenceType: { type: "string" },
          limitations: { type: "string" },
        },
        required: [
          "information",
          "supportingEvidence",
          "evidenceType",
          "limitations",
        ],
        additionalProperties: false,
      },
    },

    unknowns: {
      type: "array",
      items: {
        type: "object",
        properties: {
          question: { type: "string" },
          whyItMatters: { type: "string" },
          evidenceNeeded: { type: "string" },
          conclusionIfUnresolved: { type: "string" },
        },
        required: [
          "question",
          "whyItMatters",
          "evidenceNeeded",
          "conclusionIfUnresolved",
        ],
        additionalProperties: false,
      },
    },

    evidenceGaps: {
      type: "array",
      items: {
        type: "object",
        properties: {
          missingEvidence: { type: "string" },
          whyItMatters: { type: "string" },
          possibleSource: { type: "string" },
        },
        required: [
          "missingEvidence",
          "whyItMatters",
          "possibleSource",
        ],
        additionalProperties: false,
      },
    },

    alternativeExplanations: {
      type: "array",
      items: {
        type: "object",
        properties: {
          explanation: { type: "string" },
          evidenceThatCouldSupportIt: { type: "string" },
          evidenceThatCouldWeakenIt: { type: "string" },
        },
        required: [
          "explanation",
          "evidenceThatCouldSupportIt",
          "evidenceThatCouldWeakenIt",
        ],
        additionalProperties: false,
      },
    },

    startingEvidenceAssessment: {
      type: "object",
      properties: {
        level: {
          type: "string",
          enum: ["low", "medium", "high"],
        },
        explanation: { type: "string" },
        mostImportantLimitation: { type: "string" },
      },
      required: [
        "level",
        "explanation",
        "mostImportantLimitation",
      ],
      additionalProperties: false,
    },

    assessmentSummary: { type: "string" },
  },

  required: [
    "approvedLead",
    "materialReviewed",
    "reportedClaims",
    "establishedInformation",
    "unknowns",
    "evidenceGaps",
    "alternativeExplanations",
    "startingEvidenceAssessment",
    "assessmentSummary",
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

function validateAssessment(
  assessment: unknown,
  approvedLead: string,
  articleTextAvailable: boolean,
): string | null {
  if (!isRecord(assessment)) {
    return "The evidence assessment is not a valid object.";
  }

  if (assessment.approvedLead !== approvedLead) {
    return "The evidence assessment did not preserve the approved lead.";
  }

  if (!isRecord(assessment.materialReviewed)) {
    return "The material-reviewed section is invalid.";
  }

  if (
    assessment.materialReviewed.articleTextAvailable !==
    articleTextAvailable
  ) {
    return "The article-text availability status is inconsistent.";
  }

  if (
    !nonEmptyString(
      assessment.materialReviewed.articleTextLimitations,
    )
  ) {
    return "The article-text limitations are missing.";
  }

  if (
    !Array.isArray(assessment.reportedClaims) ||
    !assessment.reportedClaims.every(
      (item) =>
        isRecord(item) &&
        nonEmptyString(item.claim) &&
        typeof item.attribution === "string" &&
        typeof item.supportingMaterial === "string" &&
        [
          "reported",
          "partially supported",
          "not established",
        ].includes(String(item.verificationStatus)) &&
        nonEmptyString(item.limitations),
    )
  ) {
    return "The reported-claims section is invalid.";
  }

  if (
    !Array.isArray(assessment.establishedInformation) ||
    !assessment.establishedInformation.every(
      (item) =>
        isRecord(item) &&
        nonEmptyString(item.information) &&
        nonEmptyString(item.supportingEvidence) &&
        nonEmptyString(item.evidenceType) &&
        nonEmptyString(item.limitations),
    )
  ) {
    return "The established-information section is invalid.";
  }

  if (
    !Array.isArray(assessment.unknowns) ||
    !assessment.unknowns.every(
      (item) =>
        isRecord(item) &&
        nonEmptyString(item.question) &&
        nonEmptyString(item.whyItMatters) &&
        nonEmptyString(item.evidenceNeeded) &&
        nonEmptyString(item.conclusionIfUnresolved),
    )
  ) {
    return "The unknowns section is invalid.";
  }

  if (
    !Array.isArray(assessment.evidenceGaps) ||
    !assessment.evidenceGaps.every(
      (item) =>
        isRecord(item) &&
        nonEmptyString(item.missingEvidence) &&
        nonEmptyString(item.whyItMatters) &&
        typeof item.possibleSource === "string",
    )
  ) {
    return "The evidence-gaps section is invalid.";
  }

  if (
    !Array.isArray(assessment.alternativeExplanations) ||
    !assessment.alternativeExplanations.every(
      (item) =>
        isRecord(item) &&
        nonEmptyString(item.explanation) &&
        nonEmptyString(item.evidenceThatCouldSupportIt) &&
        nonEmptyString(item.evidenceThatCouldWeakenIt),
    )
  ) {
    return "The alternative-explanations section is invalid.";
  }

  if (!isRecord(assessment.startingEvidenceAssessment)) {
    return "The starting-evidence assessment is invalid.";
  }

  if (
    !["low", "medium", "high"].includes(
      String(assessment.startingEvidenceAssessment.level),
    ) ||
    !nonEmptyString(
      assessment.startingEvidenceAssessment.explanation,
    ) ||
    !nonEmptyString(
      assessment.startingEvidenceAssessment.mostImportantLimitation,
    )
  ) {
    return "The starting-evidence rating is incomplete.";
  }

  if (!nonEmptyString(assessment.assessmentSummary)) {
    return "The assessment summary is missing.";
  }

  return null;
}



export async function POST(request: Request, { params }: RouteContext) {
  let quota: Awaited<ReturnType<typeof limitRequest>> | null = null;
  let operationService: AiOperationService | null = null;
  let operation: Awaited<ReturnType<AiOperationService["begin"]>>["operation"] | null = null;
  let providerUsage = { inputTokens: 0, outputTokens: 0 };
  try {
    if (!isClerkConfigured() || !isDatabaseConfigured()) {
      return NextResponse.json(
        { error: "Persistence is not configured." },
        { status: 503 },
      );
    }

    const { investigationId } = await params;
    const repository = getPostgresRepository();
    const user = await getOrCreateCurrentUser(repository);

    if (!user) {
      return NextResponse.json(
        { error: "Authentication required." },
        { status: 401 },
      );
    }

    await requireInvestigationAccess(
      repository,
      user,
      investigationId,
      "editor",
    );

    const parsed = await readJsonBody(request);
    if ("error" in parsed) return parsed.error;
    const body = parsed.value;

    if (!isRecord(body)) {
      return NextResponse.json(
        { error: "A valid evidence-assessment request is required." },
        { status: 400 },
      );
    }

    const leadId =
      typeof body.leadId === "string" ? body.leadId.trim() : "";

    if (!leadId) {
      return NextResponse.json(
        { error: "An approved lead is required." },
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
        article.id,
      ))
    ) {
      return NextResponse.json(
        { error: "The source article could not be found." },
        { status: 404 },
      );
    }

    const leadContent = isRecord(lead.content) ? lead.content : {};
    const approvedLead =
      typeof leadContent.primaryLead === "string"
        ? leadContent.primaryLead.trim()
        : "";

    if (!approvedLead) {
      return NextResponse.json(
        { error: "The approved lead does not contain an investigative question." },
        { status: 422 },
      );
    }

    const suppliedArticleText = article.extractedText.trim();
    const articleTextAvailable = suppliedArticleText.length > 0;

    if (!articleTextAvailable) {
      return NextResponse.json(
        {
          code: "INSUFFICIENT_EVIDENCE",
          error:
            "The available reporting does not provide enough source material for a reliable evidence assessment.",
        },
        { status: 422 },
      );
    }

    const input = {
      title: article.title || "Not supplied",
      source: article.publisher || "Not supplied",
      url: article.canonicalUrl || article.originalUrl || "Not supplied",
      description: "Retrieved source article stored by Journol.",
      articleText: suppliedArticleText || null,
      articleTextAvailable,
      leadContext: leadContent,
    };

    const inputText = JSON.stringify(input);

    if (
      inputText.length + approvedLead.length >
      MAX_INPUT_CHARACTERS
    ) {
      return NextResponse.json(
        {
          error:
            "The stored source material is too large to assess. Please use a shorter source article.",
        },
        { status: 413 },
      );
    }

    const inputSnapshotHash = snapshotHash({
      investigationId,
      leadId,
      sourceArticleId: article.id,
      approvedLead,
      input,
    });

    const idempotencyKey =
      `evidence:${investigationId}:${leadId}:${inputSnapshotHash}`;

    // Reuse a durable, matching assessment before reserving AI capacity. This
    // also recovers safely if a prior request persisted the result but the
    // client lost its response.
    const currentInvestigation = await repository.getInvestigation(investigationId);
    if (currentInvestigation?.currentEvidenceAssessmentId) {
      const existingAssessment = await repository.getEvidenceAssessment(currentInvestigation.currentEvidenceAssessmentId);
      if (existingAssessment && existingAssessment.leadId === leadId && existingAssessment.inputSnapshotHash === inputSnapshotHash) {
        return NextResponse.json({ success: true, assessmentId: existingAssessment.id, assessment: existingAssessment.content, reused: true });
      }
    }

    quota = await limitRequest("ai", user.id, {
      limit: 20,
      windowSeconds: 600,
      concurrency: 2,
    });

    if (!quota.allowed) {
      return NextResponse.json(
        { error: "Too many AI requests. Please try again later." },
        {
          status: 429,
          headers: {
            "Retry-After": String(quota.retryAfterSeconds),
          },
        },
      );
    }

    operationService = new AiOperationService(repository);

    const begun = await operationService.begin({
      user,
      investigationId,
      stage: "evidence_assessment",
      idempotencyKey,
      model: MODEL,
    });
    operation = begun.operation;
    const { reused } = begun;

    if (reused && operation.status === "succeeded") {
      const investigation = await repository.getInvestigation(investigationId);
      const existingAssessmentId =
        investigation?.currentEvidenceAssessmentId;

      if (existingAssessmentId) {
        const existingAssessment =
          await repository.getEvidenceAssessment(existingAssessmentId);

        if (
          existingAssessment &&
          existingAssessment.leadId === leadId &&
          existingAssessment.inputSnapshotHash === inputSnapshotHash
        ) {
          return NextResponse.json({
            success: true,
            assessmentId: existingAssessment.id,
            assessment: existingAssessment.content,
            reused: true,
          });
        }
      }

      return NextResponse.json(
        { error: "The previous evidence assessment completed but could not be recovered." },
        { status: 500 },
      );
    }

    if (reused && operation.status === "pending") {
      return NextResponse.json(
        {
          error:
            "An evidence assessment for this lead is already in progress.",
        },
        { status: 409 },
      );
    }

    if (!process.env.OPENAI_API_KEY) {
      await operationService.fail(operation, "AI_NOT_CONFIGURED");
      return NextResponse.json(
        { error: "The AI service is not configured." },
        { status: 503 },
      );
    }

    const openai = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY,
      timeout: AI_TIMEOUT_MS,
      maxRetries: 0,
    });

    const instructions = `
You are Journol's Evidence Assessment Engine.

Assess the supplied material for the journalist's approved investigative lead.
Do not write an investigation plan and do not independently research or verify
the underlying claims.

SOURCE DISCIPLINE
Use only the supplied material. Do not claim to have searched the web,
consulted external records, contacted people, or independently verified facts.
An article's publication does not establish the truth of its claims.
Distinguish reported statements, evidence directly included in the material,
inferences, unknowns, and missing evidence.

APPROVED LEAD
Repeat approvedLead exactly as supplied. Do not rewrite or change its scope.
Approval of the lead does not establish the truth of its premise.
Identify unsupported premises that materially affect the investigation.

ARTICLE TEXT
Set materialReviewed.articleTextAvailable to the supplied articleTextAvailable
boolean. A headline or description is not retrieved article text.
Do not claim the text is complete unless the supplied material establishes
completeness. Explain relevant limitations in articleTextLimitations.

REPORTED CLAIMS
For each material claim relevant to the approved lead, identify the claim,
its attribution where known, the supplied supporting material, its verification
status, and the limitations.
Use "reported" when the material reports a claim without establishing it.
Use "partially supported" only when specific supplied evidence supports part
of the claim but not the whole claim.
Use "not established" when the supplied material does not establish the claim.

ESTABLISHED INFORMATION
Include only facts directly supported by the supplied material. Identify the
supporting evidence, its type, and its limits. A fact about what an organisation
publicly announced may be established without establishing that the announcement
is accurate.

UNKNOWNS AND EVIDENCE GAPS
Unknowns describe questions that remain unanswered, why they matter, what
evidence is needed, and what cannot be concluded if unresolved.
Evidence gaps describe specific evidence missing from the supplied material,
why it matters, and a possible source if identifiable.
Do not duplicate entries unnecessarily. Do not imply that a possible source
or record has been located, examined, or confirmed to exist.

ALTERNATIVE EXPLANATIONS
Include only relevant alternatives consistent with the supplied material.
Identify evidence that could support or weaken each alternative.
Do not invent motives or circumstances. Missing information alone does not
establish wrongdoing, concealment, negligence, non-compliance, or failure.

STARTING EVIDENCE
Rate the starting evidence as low, medium, or high based on:
1. Material completeness.
2. Specificity and directness of support for the approved lead.
3. Independent corroboration actually included in the supplied material.
Explain the rating and its most important limitation. Do not confuse evidence
strength with the importance of the story or the practicality of investigating it.

SUMMARY
Summarise what the material reports, what it directly establishes, the most
important unknowns and evidence gaps, and the main limitations the Investigation
Builder must preserve.

Do not write interview questions, sequence reporting actions, or create an
investigation plan. Do not invent facts to fill required fields. Use empty arrays
where there are no material entries. Use meaningful limitations where necessary.
Return only JSON matching the required schema.
`;

    let response = await openai.responses.create({
      model: MODEL,
      max_output_tokens: 3_000,
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
          name: "journol_evidence_assessment",
          strict: true,
          schema: EVIDENCE_ASSESSMENT_SCHEMA,
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
        { error: "The AI service returned no evidence assessment." },
        { status: 502 },
      );
    }

    let assessment: unknown;

    try {
      assessment = JSON.parse(response.output_text);
    } catch {
      await operationService.fail(operation, "INVALID_AI_JSON", {
        inputTokens: primaryUsage?.input_tokens,
        outputTokens: primaryUsage?.output_tokens,
      });
      return NextResponse.json(
        { error: "The AI service returned an unreadable assessment." },
        { status: 502 },
      );
    }

    let validationError = validateAssessment(
      assessment,
      approvedLead,
      articleTextAvailable,
    );

    if (validationError) {
      // One bounded correction pass handles a model response that satisfies
      // JSON Schema but conflicts with a persisted workflow prerequisite.
      // It never rewrites output server-side or relaxes grounding checks.
      const repair = await openai.responses.create({
        model: MODEL,
        max_output_tokens: 3_000,
        instructions: `${instructions}\n\nREPAIR MODE\nThe prior assessment failed this server validation: ${validationError}\nReturn a complete replacement JSON object. Preserve the approved lead exactly, use only the supplied material, and remove unsupported assertions rather than guessing.`,
        input: `APPROVED INVESTIGATIVE LEAD:\n${approvedLead}\n\nSUPPLIED MATERIAL:\n${inputText}\n\nPRIOR INVALID ASSESSMENT:\n${JSON.stringify(assessment)}`,
        text: { format: { type: "json_schema", name: "journol_evidence_assessment_repair", strict: true, schema: EVIDENCE_ASSESSMENT_SCHEMA } },
      });
      repairUsage = repair.usage;
      providerUsage = addUsage(providerUsage, repairUsage);

      if (!repair.output_text) {
        await operationService.fail(operation, "INVALID_AI_ASSESSMENT", {
          inputTokens: (primaryUsage?.input_tokens ?? 0) + (repairUsage?.input_tokens ?? 0),
          outputTokens: (primaryUsage?.output_tokens ?? 0) + (repairUsage?.output_tokens ?? 0),
        });
        return NextResponse.json({ code: "INVALID_STRUCTURED_RESPONSE", error: "Journol received an invalid structured evidence assessment." }, { status: 502 });
      }

      try {
        assessment = JSON.parse(repair.output_text);
      } catch {
        await operationService.fail(operation, "INVALID_AI_ASSESSMENT", {
          inputTokens: (primaryUsage?.input_tokens ?? 0) + (repairUsage?.input_tokens ?? 0),
          outputTokens: (primaryUsage?.output_tokens ?? 0) + (repairUsage?.output_tokens ?? 0),
        });
        return NextResponse.json({ code: "INVALID_STRUCTURED_RESPONSE", error: "Journol received an unreadable repaired evidence assessment." }, { status: 502 });
      }

      validationError = validateAssessment(assessment, approvedLead, articleTextAvailable);
      if (validationError) {
        await operationService.fail(operation, "INVALID_AI_ASSESSMENT", {
          inputTokens: (primaryUsage?.input_tokens ?? 0) + (repairUsage?.input_tokens ?? 0),
          outputTokens: (primaryUsage?.output_tokens ?? 0) + (repairUsage?.output_tokens ?? 0),
        });
        console.warn("Journol evidence assessment repair failed", { investigationId, leadId, validationError });
        return NextResponse.json({ code: "EVIDENCE_GROUNDING_FAILURE", error: "Journol could not produce a source-grounded evidence assessment." }, { status: 502 });
      }

      response = repair;
    }

    if (!isRecord(assessment)) {
      await operationService.fail(operation, "INVALID_AI_ASSESSMENT", {
        inputTokens: (primaryUsage?.input_tokens ?? 0) + (repairUsage?.input_tokens ?? 0),
        outputTokens: (primaryUsage?.output_tokens ?? 0) + (repairUsage?.output_tokens ?? 0),
      });
      return NextResponse.json(
        { error: "The AI service returned an invalid assessment." },
        { status: 502 },
      );
    }

    const persistedAssessment =
      await repository.createEvidenceAssessment({
        investigationId,
        leadId,
        content: assessment,
        inputSnapshotHash,
        model: MODEL,
        createdByUserId: user.id,
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
      assessmentId: persistedAssessment.id,
      assessment: persistedAssessment.content,
      reused: false,
    });
  } catch (error) {
    const status = getErrorStatus(error);

    if (operationService && operation) {
      await operationService.fail(
        operation,
        status === 504 ? "AI_TIMEOUT" : status === 429 ? "AI_RATE_LIMITED" : "AI_PROVIDER_FAILURE",
        knownUsage(providerUsage),
      );
    }

    console.error(
      "Journol evidence assessment failed.",
      error instanceof Error ? error.name : "Unknown error",
    );

    return NextResponse.json(
      {
        code:
          status === 504
            ? "PROVIDER_TIMEOUT"
            : status === 429
              ? "PROVIDER_RATE_LIMITED"
              : "PROVIDER_UNAVAILABLE",
        error:
          status === 504
            ? "Journol couldn’t complete the evidence assessment in time. Please try again."
            : status === 429
              ? "The AI service rate limit or available quota was reached. No assessment was produced."
              : "Journol could not complete the evidence assessment.",
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
