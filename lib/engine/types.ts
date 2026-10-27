/** Shared shapes for the angle engine. No I/O; safe to import in the browser. */

export const ENGINE_VERSION = "journol-2.0";

/** Rounds of angles per story: the first set plus up to two "Show different angles". */
export const MAX_ROUNDS = 3;

export const GAP_KINDS = [
  "unsupported_claim",
  "unsourced_figure",
  "unexplained_actor",
  "missing_voice",
  "promise_or_deadline",
  "unanswered_question",
  "contradiction",
  "missing_context",
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
  missing_context: "Missing from this story",
};

export const ANGLE_TYPES = [
  "follow_the_money",
  "who_benefits",
  "promise_vs_delivery",
  "has_it_happened_before",
  "missing_voices",
  "check_the_numbers",
  "who_is_responsible",
  "human_impact",
] as const;
export type AngleType = (typeof ANGLE_TYPES)[number];

export const ANGLE_TYPE_LABELS: Record<AngleType, string> = {
  follow_the_money: "Follow the money",
  who_benefits: "Who benefits",
  promise_vs_delivery: "Promise vs delivery",
  has_it_happened_before: "Has this happened before?",
  missing_voices: "Missing voices",
  check_the_numbers: "Check the numbers",
  who_is_responsible: "Who is responsible",
  human_impact: "Human impact",
};

/** Something the story leaves open. Numbered from 1 in the order shown. */
export type StoryGap = {
  number: number;
  kind: GapKind;
  /** Plain-language question the story leaves unanswered. */
  question: string;
  /** The story's own words this gap rests on, or null for a gap found in related coverage. */
  excerpt: string | null;
  /** The related report this gap comes from, when it isn't in the story itself. */
  relatedId: string | null;
};

/** A distinct report from another outlet, found by the web search. */
export type RelatedReport = {
  id: string;
  title: string;
  url: string;
  publisher: string;
  publishedAt: string | null;
  snippet: string;
  /** One short line on what this report adds, written by the model. */
  note: string;
  /** Other copies of the same report (syndicated or the same press release), counted once. */
  copies: Array<{ title: string; url: string; publisher: string }>;
};

/**
 * - searched: the web search ran and found related reports.
 * - no_results: the search ran but found nothing related.
 * - unavailable: the search could not run, so coverage is unknown.
 */
export type SearchStatus = "searched" | "no_results" | "unavailable";

/**
 * "not_yet_reported" is only allowed when the search ran and none of the
 * related reports ask the question. "unchecked" shows nothing.
 */
export type Coverage = "not_yet_reported" | "partly_covered" | "unchecked";

export type Angle = {
  type: AngleType;
  headline: string;
  question: string;
  why: string;
  gapNumbers: number[];
  relatedIds: string[];
  coverage: Coverage;
  coverageNote: string;
  coverageIds: string[];
  storyExcerpts: string[];
  whereToLook: Array<{ name: string; what: string }>;
  whoToAsk: Array<{ who: string; what: string }>;
  steps: Array<{ title: string; detail: string }>;
};

/** A short "in brief" at the top of a story: what it says, and what Journol found. */
export type StorySummary = { story: string; findings: string };

export type StoryInput = {
  url: string;
  title: string;
  publisher: string;
  publishedAt: string | null;
  paragraphs: string[];
};
