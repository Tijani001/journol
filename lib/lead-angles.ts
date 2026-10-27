import { validateLead } from "@/lib/lead-validation";

/**
 * Journol reads a published story for what it leaves unanswered (its gaps),
 * then proposes several distinct angles built on those gaps. This module
 * holds the model's output schema and the server-side checks that keep each
 * angle grounded in the story. It has no I/O, so it is shared and testable.
 */

export const ANGLE_ENGINE_VERSION = "angles-1";
export const MAX_ANGLES = 4;
export const MAX_GAPS = 6;
export const MAX_REJECTED_QUESTIONS = 12;

export const ANGLE_TYPES = [
  "follow_the_money",
  "who_benefits",
  "promise_vs_delivery",
  "pattern_or_precedent",
  "missing_voices",
  "numbers_check",
  "accountability",
  "human_impact",
] as const;
export type AngleType = (typeof ANGLE_TYPES)[number];

export const ANGLE_TYPE_LABELS: Record<AngleType, string> = {
  follow_the_money: "Follow the money",
  who_benefits: "Who benefits",
  promise_vs_delivery: "Promise vs delivery",
  pattern_or_precedent: "Has this happened before?",
  missing_voices: "Missing voices",
  numbers_check: "Check the numbers",
  accountability: "Who is responsible",
  human_impact: "Human impact",
};

export const GAP_KINDS = [
  "unsupported_claim",
  "unsourced_figure",
  "unexplained_actor",
  "missing_voice",
  "promise_or_deadline",
  "unanswered_question",
  "contradiction",
] as const;
export type GapKind = (typeof GAP_KINDS)[number];

export const GAP_KIND_LABELS: Record<GapKind, string> = {
  unsupported_claim: "Claim without evidence",
  unsourced_figure: "Figure without a source",
  unexplained_actor: "Name left unexplained",
  missing_voice: "Voice not heard",
  promise_or_deadline: "Promise or deadline",
  unanswered_question: "Question not asked",
  contradiction: "Doesn't add up",
};

export type StoryGap = { kind: GapKind; observation: string; excerpt: string };

const VALIDATION_SCHEMA = {
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
  required: ["factualBasis", "target", "scope", "evidencePath", "practicalFirstAction", "answerability", "explanation"],
  additionalProperties: false,
} as const;

export const ANGLE_SET_SCHEMA = {
  type: "object",
  properties: {
    storyGaps: {
      type: "array",
      items: {
        type: "object",
        properties: {
          kind: { type: "string", enum: [...GAP_KINDS] },
          observation: { type: "string" },
          excerpt: { type: "string" },
        },
        required: ["kind", "observation", "excerpt"],
        additionalProperties: false,
      },
    },
    event: {
      type: "object",
      properties: {
        name: { type: "string" },
        date: { type: "string" },
        eventStatus: { type: "string", enum: ["completed", "upcoming", "unclear"] },
        basis: { type: "string" },
      },
      required: ["name", "date", "eventStatus", "basis"],
      additionalProperties: false,
    },
    outcome: { type: "string", enum: ["angles", "insufficient_evidence"] },
    insufficientExplanation: { type: "string" },
    angles: {
      type: "array",
      items: {
        type: "object",
        properties: {
          angleType: { type: "string", enum: [...ANGLE_TYPES] },
          headline: { type: "string" },
          primaryLead: { type: "string" },
          leadRationale: { type: "string" },
          builtOnGaps: { type: "array", items: { type: "integer" } },
          evidencePath: { type: "array", items: { type: "string" } },
          firstAction: { type: "string" },
          scope: { type: "string" },
          missingInformation: { type: "array", items: { type: "string" } },
          validation: VALIDATION_SCHEMA,
          confidence: { type: "string", enum: ["low", "medium", "high"] },
        },
        required: ["angleType", "headline", "primaryLead", "leadRationale", "builtOnGaps", "evidencePath", "firstAction", "scope", "missingInformation", "validation", "confidence"],
        additionalProperties: false,
      },
    },
  },
  required: ["storyGaps", "event", "outcome", "insufficientExplanation", "angles"],
  additionalProperties: false,
} as const;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function text(value: unknown, maxLength: number) {
  return typeof value === "string" ? value.replace(/\s+/g, " ").trim().slice(0, maxLength) : "";
}

/** Lower-cases and flattens punctuation, quotes and spacing for loose matching. */
export function normalizeForMatch(value: string) {
  return value
    .toLowerCase()
    .replace(/[‘’‛`]/g, "'")
    .replace(/[“”‟]/g, '"')
    .replace(/[–—]/g, "-")
    .replace(/\s+/g, " ")
    .trim();
}

/** True when the excerpt appears in the article, ignoring case, spacing and quote styles. */
export function excerptInArticle(excerpt: string, articleText: string) {
  const needle = normalizeForMatch(excerpt.replace(/^["'“‘]+|["'”’.…]+$/g, ""));
  return needle.length >= 6 && normalizeForMatch(articleText).includes(needle);
}

function sameQuestion(a: string, b: string) {
  const strip = (value: string) => normalizeForMatch(value).replace(/[^\p{L}\p{N} ]/gu, "");
  return strip(a) === strip(b);
}

export type AngleLeadContent = Record<string, unknown> & {
  angleSetId: string;
  anglePosition: number;
  angleType: AngleType;
  headline: string;
  builtOnGaps: number[];
  storyGaps: StoryGap[];
  primaryLead: string;
  outcome: "lead" | "insufficient_evidence";
};

export type AngleSetResult =
  | { kind: "angles"; storyGaps: StoryGap[]; leads: AngleLeadContent[]; dropped: Array<{ reason: string }> }
  | { kind: "insufficient_evidence"; storyGaps: StoryGap[]; lead: AngleLeadContent }
  | { kind: "invalid"; reason: string };

/**
 * Turns the model's angle set into lead records ready to store, applying the
 * checks the prompt asks for but cannot guarantee:
 * - a quoted excerpt must appear in the article, or it is dropped;
 * - an angle must have a factual basis in the story;
 * - an angle may not repeat one the journalist rejected, or another angle;
 * - every angle must pass the existing lead checks, including the rule that
 *   no year may appear that the source material does not contain.
 * Failing angles are dropped individually so one weak angle does not cost
 * the journalist the others.
 */
export function buildAngleSet(
  raw: unknown,
  context: { angleSetId: string; articleText: string; sourceMaterial: string; rejectedQuestions: string[] },
): AngleSetResult {
  if (!isRecord(raw) || !Array.isArray(raw.storyGaps) || !Array.isArray(raw.angles) || !isRecord(raw.event)) {
    return { kind: "invalid", reason: "The response is not a valid angle set." };
  }

  // Gaps: keep valid ones, remember how the model's indices map to kept ones.
  const indexMap = new Map<number, number>();
  const storyGaps: StoryGap[] = [];
  raw.storyGaps.forEach((gap, index) => {
    if (!isRecord(gap) || storyGaps.length >= MAX_GAPS) return;
    const kind = GAP_KINDS.includes(gap.kind as GapKind) ? gap.kind as GapKind : null;
    const observation = text(gap.observation, 400);
    if (!kind || !observation) return;
    const excerpt = text(gap.excerpt, 300);
    indexMap.set(index, storyGaps.length);
    storyGaps.push({ kind, observation, excerpt: excerpt && excerptInArticle(excerpt, context.articleText) ? excerpt : "" });
  });

  const event = raw.event;

  if (raw.outcome === "insufficient_evidence") {
    const explanation = text(raw.insufficientExplanation, 1_200) || "The story does not contain enough specific material to support a defensible new angle.";
    const lead: AngleLeadContent = {
      angleSetId: context.angleSetId,
      anglePosition: 0,
      angleType: "accountability",
      headline: "Not enough to go on",
      builtOnGaps: [],
      storyGaps,
      primaryLead: "This story does not yet support a defensible investigative angle.",
      leadRationale: explanation,
      evidencePath: [],
      firstAction: "Find a fuller version of the story, or a related report with specific names, figures or decisions.",
      scope: "No investigation is proposed from this material.",
      missingInformation: [explanation],
      excludedQuestions: [],
      validation: { factualBasis: false, target: false, scope: false, evidencePath: false, practicalFirstAction: false, answerability: false, explanation },
      event,
      confidence: "low",
      outcome: "insufficient_evidence",
    };
    const issue = validateLead(lead, context.sourceMaterial);
    if (issue) return { kind: "invalid", reason: issue.message };
    return { kind: "insufficient_evidence", storyGaps, lead };
  }

  const dropped: Array<{ reason: string }> = [];
  const kept: AngleLeadContent[] = [];
  for (const angle of raw.angles) {
    if (kept.length >= MAX_ANGLES) break;
    if (!isRecord(angle)) { dropped.push({ reason: "malformed" }); continue; }
    const primaryLead = text(angle.primaryLead, 600);
    if (!primaryLead) { dropped.push({ reason: "missing question" }); continue; }
    if (context.rejectedQuestions.some((rejected) => sameQuestion(rejected, primaryLead))) { dropped.push({ reason: "repeats a rejected angle" }); continue; }
    if (kept.some((other) => sameQuestion(other.primaryLead, primaryLead))) { dropped.push({ reason: "duplicate" }); continue; }
    const validation = angle.validation;
    if (!isRecord(validation) || validation.factualBasis !== true) { dropped.push({ reason: "no factual basis in the story" }); continue; }
    const angleType = ANGLE_TYPES.includes(angle.angleType as AngleType) ? angle.angleType as AngleType : null;
    if (!angleType) { dropped.push({ reason: "unknown angle type" }); continue; }
    const builtOnGaps = [...new Set((Array.isArray(angle.builtOnGaps) ? angle.builtOnGaps : [])
      .map((value) => (typeof value === "number" ? indexMap.get(value) : undefined))
      .filter((value): value is number => value !== undefined))];

    const lead: AngleLeadContent = {
      angleSetId: context.angleSetId,
      anglePosition: kept.length,
      angleType,
      headline: text(angle.headline, 120) || primaryLead.slice(0, 120),
      builtOnGaps,
      storyGaps,
      primaryLead,
      leadRationale: text(angle.leadRationale, 1_200),
      evidencePath: Array.isArray(angle.evidencePath) ? angle.evidencePath.filter((item): item is string => typeof item === "string").map((item) => text(item, 300)).filter(Boolean).slice(0, 5) : [],
      firstAction: text(angle.firstAction, 600),
      scope: text(angle.scope, 600),
      missingInformation: Array.isArray(angle.missingInformation) ? angle.missingInformation.filter((item): item is string => typeof item === "string").map((item) => text(item, 300)).filter(Boolean).slice(0, 5) : [],
      excludedQuestions: [],
      validation,
      event,
      confidence: angle.confidence,
      outcome: "lead",
    };
    const issue = validateLead(lead, context.sourceMaterial);
    if (issue) { dropped.push({ reason: issue.code }); continue; }
    kept.push(lead);
  }

  if (!kept.length) return { kind: "invalid", reason: `No angle passed the grounding checks (${dropped.map((entry) => entry.reason).join(", ") || "none returned"}).` };

  // Each angle records the others as the questions it deliberately leaves out,
  // which the later evidence and planning stages already understand.
  for (const lead of kept) {
    lead.excludedQuestions = kept.filter((other) => other !== lead).map((other) => other.primaryLead);
  }
  return { kind: "angles", storyGaps, leads: kept, dropped };
}

/** Reads the questions a journalist has already turned down from a request body. */
export function rejectedQuestionsFromBody(body: Record<string, unknown>): string[] | null {
  const list: unknown[] = [];
  if (body.rejectedLeads !== undefined) {
    if (!Array.isArray(body.rejectedLeads)) return null;
    list.push(...body.rejectedLeads);
  }
  if (body.rejectedLead !== undefined) {
    if (typeof body.rejectedLead !== "string") return null;
    list.push(body.rejectedLead);
  }
  if (list.some((item) => typeof item !== "string" || item.length > 1_000)) return null;
  return [...new Set((list as string[]).map((item) => item.trim()).filter(Boolean))].slice(-MAX_REJECTED_QUESTIONS);
}
