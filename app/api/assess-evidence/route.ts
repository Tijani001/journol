import { NextResponse } from "next/server";
import OpenAI from "openai";
import { apiError, isRecord as isApiRecord, readJsonBody } from "@/lib/api";
import { limitRequest, requireProtectedAccess } from "@/lib/access";

const MODEL = "gpt-4.1-mini";
const MAX_INPUT_CHARACTERS = 40_000;

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
        { error: "A valid evidence-assessment request is required." },
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

    const suppliedArticleText =
      typeof articleText === "string" ? articleText.trim() : "";

    const suppliedDescription =
      typeof description === "string" ? description.trim() : "";

    const articleTextAvailable = suppliedArticleText.length > 0;

    const input = {
      title: title || "Not supplied",
      source: source || "Not supplied",
      url: url || "Not supplied",
      description: suppliedDescription || "Not supplied",
      articleText: suppliedArticleText || null,
      articleTextAvailable,
      leadContext: leadContext || {},
    };

    const inputText = JSON.stringify(input);

    if (
      inputText.length + approvedLead.length >
      MAX_INPUT_CHARACTERS
    ) {
      return NextResponse.json(
        {
          error:
            "The supplied material is too large to assess. Please provide a shorter article.",
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
          name: "journol_evidence_assessment",
          strict: true,
          schema: EVIDENCE_ASSESSMENT_SCHEMA,
        },
      },
    });

    if (!response.output_text) {
      return NextResponse.json(
        { error: "The AI service returned no evidence assessment." },
        { status: 502 },
      );
    }

    let assessment: unknown;

    try {
      assessment = JSON.parse(response.output_text);
    } catch {
      return NextResponse.json(
        { error: "The AI service returned an unreadable assessment." },
        { status: 502 },
      );
    }

    const validationError = validateAssessment(
      assessment,
      approvedLead,
      articleTextAvailable,
    );

    if (validationError) {
      return NextResponse.json(
        { error: validationError },
        { status: 502 },
      );
    }

    return NextResponse.json({
      success: true,
      assessment,
    });
  } catch (error) {
    const status = getErrorStatus(error);

    if (status === 429) {
      return NextResponse.json(
        {
          error:
            "The AI service rate limit or available quota was reached. No assessment was produced.",
        },
        { status },
      );
    }

    console.error(
      "Journol evidence assessment failed.",
      error instanceof Error ? error.name : "Unknown error",
    );

    return NextResponse.json(
      {
        error:
          status === 504
            ? "The evidence assessment timed out. Please try again later."
            : "Journol could not complete the evidence assessment.",
      },
      { status },
    );
  } finally { quota.release(); }
}
