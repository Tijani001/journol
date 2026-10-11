import { NextResponse } from "next/server";
import OpenAI from "openai";
import { apiError, isRecord as isApiRecord, readJsonBody } from "@/lib/api";
import { limitRequest, requireProtectedAccess } from "@/lib/access";

const MODEL = "gpt-4.1-mini";
const MAX_INPUT_CHARACTERS = 40_000;

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
  if (!isRecord(value.materialReviewed) || typeof value.materialReviewed.articleTextAvailable !== "boolean" || !nonEmptyString(value.materialReviewed.articleTextLimitations)) return false;
  if (!Array.isArray(value.reportedClaims) || !Array.isArray(value.establishedInformation) || !Array.isArray(value.unknowns) || !Array.isArray(value.evidenceGaps) || !Array.isArray(value.alternativeExplanations)) return false;
  if (!isRecord(value.startingEvidenceAssessment) || !["low", "medium", "high"].includes(String(value.startingEvidenceAssessment.level))) return false;
  return nonEmptyString(value.assessmentSummary);
}

export async function POST(request: Request) {
  // The browser uses the investigation-scoped endpoint. Keeping this older
  // stateless route reachable in production would allow token holders to
  // bypass ownership and Journol usage attribution.
  if (process.env.NODE_ENV === "production") {
    return apiError("SERVICE_UNAVAILABLE", "This legacy endpoint is unavailable.", 410);
  }
  const access = requireProtectedAccess(request);
  if ("error" in access) return access.error;
  const quota = await limitRequest("ai", access.subject, { limit: 20, windowSeconds: 600, concurrency: 2 });
  if (!quota.allowed) return apiError("RATE_LIMITED", "Too many AI requests. Please try again later.", 429, { "Retry-After": String(quota.retryAfterSeconds) });
  try {
    const parsed = await readJsonBody(request);
    if ("error" in parsed) return parsed.error;
    const body = parsed.value;

    if (!isApiRecord(body)) {
      return NextResponse.json(
        { error: "A valid investigation request is required." },
        { status: 400 },
      );
    }

    const {
      title,
      description,
      source,
      url,
      articleText,
      approvedLead,
      leadContext,
      evidenceAssessment,
    } = body;

    if (!nonEmptyString(approvedLead)) {
      return NextResponse.json(
        { error: "An approved investigative lead is required." },
        { status: 400 },
      );
    }

    const optionalStringFields = [
      ["title", title],
      ["description", description],
      ["source", source],
      ["url", url],
      ["articleText", articleText],
    ] as const;

    for (const [field, value] of optionalStringFields) {
      if (value !== undefined && typeof value !== "string") {
        return NextResponse.json(
          { error: `The ${field} field must be a string.` },
          { status: 400 },
        );
      }
    }

    if (
      leadContext !== undefined &&
      !isRecord(leadContext)
    ) {
      return NextResponse.json(
        { error: "The lead context must be a JSON object." },
        { status: 400 },
      );
    }

    if (!validEvidenceAssessment(evidenceAssessment, approvedLead)) {
      return NextResponse.json(
        {
          error:
            "A valid evidence assessment matching the approved lead is required.",
        },
        { status: 400 },
      );
    }

    const suppliedMaterial = {
      title: title || "Not supplied",
      description: description || "Not supplied",
      source: source || "Not supplied",
      url: url || "Not supplied",
      articleText: articleText || "No retrieved article text supplied.",
      leadContext: leadContext || {},
      evidenceAssessment,
    };

    const inputText = JSON.stringify(suppliedMaterial);

    if (
      inputText.length + approvedLead.length >
      MAX_INPUT_CHARACTERS
    ) {
      return NextResponse.json(
        {
          error:
            "The supplied material is too large to build an investigation plan.",
        },
        { status: 413 },
      );
    }

    if (!process.env.OPENAI_API_KEY) {
      return NextResponse.json(
        { error: "The AI service is not configured." },
        { status: 503 },
      );
    }

    const openai = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY,
      timeout: 60_000,
      maxRetries: 1,
    });

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

    const response = await openai.responses.create({
      model: MODEL,
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

    if (!response.output_text) {
      return NextResponse.json(
        { error: "The AI service returned no investigation plan." },
        { status: 502 },
      );
    }

    let investigation: unknown;

    try {
      investigation = JSON.parse(response.output_text);
    } catch {
      return NextResponse.json(
        { error: "The AI service returned an unreadable investigation plan." },
        { status: 502 },
      );
    }
    const validationError = validateInvestigation(
      investigation,
      approvedLead,
    );

    if (validationError) {
      return NextResponse.json(
        { error: validationError },
        { status: 502 },
      );
    }

    return NextResponse.json(investigation);
  } catch (error) {
    const status = getErrorStatus(error);

    if (status === 429) {
      return NextResponse.json(
        {
          error:
            "The AI service rate limit or available quota was reached. No investigation plan was produced.",
        },
        { status },
      );
    }

    console.error(
      "Journol investigation builder failed.",
      error instanceof Error ? error.name : "Unknown error",
    );

    return NextResponse.json(
      {
        error:
          status === 504
            ? "Building the investigation plan timed out. Please try again later."
            : "Journol could not build the investigation plan.",
      },
      { status },
    );
  } finally { quota.release(); }
}
