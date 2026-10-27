import { ANGLE_TYPES, GAP_KINDS, type RelatedReport, type StoryGap, type StoryInput } from "@/lib/engine/types";

/** JSON schemas (OpenAI strict structured output) and the instructions for each model step. */

export const PLAN_SCHEMA = {
  type: "object",
  properties: {
    key_names: { type: "array", items: { type: "string" } },
    search_queries: { type: "array", items: { type: "string" } },
  },
  required: ["key_names", "search_queries"],
  additionalProperties: false,
} as const;

export type PlanOutput = { key_names: string[]; search_queries: string[] };

const ANGLE_ITEM = {
  type: "object",
  properties: {
    type: { type: "string", enum: [...ANGLE_TYPES] },
    headline: { type: "string" },
    question: { type: "string" },
    why: { type: "string" },
    gap_numbers: { type: "array", items: { type: "integer" } },
    related_ids: { type: "array", items: { type: "string" } },
    coverage: { type: "string", enum: ["not_yet_reported", "partly_covered"] },
    coverage_note: { type: "string" },
    coverage_ids: { type: "array", items: { type: "string" } },
    story_excerpts: { type: "array", items: { type: "string" } },
    where_to_look: {
      type: "array",
      items: {
        type: "object",
        properties: { name: { type: "string" }, what: { type: "string" } },
        required: ["name", "what"],
        additionalProperties: false,
      },
    },
    who_to_ask: {
      type: "array",
      items: {
        type: "object",
        properties: { who: { type: "string" }, what: { type: "string" } },
        required: ["who", "what"],
        additionalProperties: false,
      },
    },
    steps: {
      type: "array",
      items: {
        type: "object",
        properties: { title: { type: "string" }, detail: { type: "string" } },
        required: ["title", "detail"],
        additionalProperties: false,
      },
    },
  },
  required: [
    "type", "headline", "question", "why", "gap_numbers", "related_ids", "coverage",
    "coverage_note", "coverage_ids", "story_excerpts", "where_to_look", "who_to_ask", "steps",
  ],
  additionalProperties: false,
} as const;

export const ANALYSIS_SCHEMA = {
  type: "object",
  properties: {
    story_summary: { type: "string" },
    findings_summary: { type: "string" },
    gaps: {
      type: "array",
      items: {
        type: "object",
        properties: {
          kind: { type: "string", enum: [...GAP_KINDS] },
          question: { type: "string" },
          excerpt: { type: ["string", "null"] },
          related_id: { type: ["string", "null"] },
        },
        required: ["kind", "question", "excerpt", "related_id"],
        additionalProperties: false,
      },
    },
    related_notes: {
      type: "array",
      items: {
        type: "object",
        properties: { id: { type: "string" }, note: { type: "string" } },
        required: ["id", "note"],
        additionalProperties: false,
      },
    },
    angles: { type: "array", items: ANGLE_ITEM },
  },
  required: ["story_summary", "findings_summary", "gaps", "related_notes", "angles"],
  additionalProperties: false,
} as const;

export const MORE_ANGLES_SCHEMA = {
  type: "object",
  properties: { angles: { type: "array", items: ANGLE_ITEM } },
  required: ["angles"],
  additionalProperties: false,
} as const;

export type RawAngle = {
  type: string;
  headline: string;
  question: string;
  why: string;
  gap_numbers: number[];
  related_ids: string[];
  coverage: "not_yet_reported" | "partly_covered";
  coverage_note: string;
  coverage_ids: string[];
  story_excerpts: string[];
  where_to_look: Array<{ name: string; what: string }>;
  who_to_ask: Array<{ who: string; what: string }>;
  steps: Array<{ title: string; detail: string }>;
};

export type RawAnalysis = {
  story_summary: string;
  findings_summary: string;
  gaps: Array<{ kind: string; question: string; excerpt: string | null; related_id: string | null }>;
  related_notes: Array<{ id: string; note: string }>;
  angles: RawAngle[];
};

const MAX_STORY_CHARACTERS = 24_000;

function isoDay(date: Date) {
  return date.toISOString().slice(0, 10);
}

export function storyBlock(story: StoryInput): string {
  let used = 0;
  const lines: string[] = [];
  for (const paragraph of story.paragraphs) {
    if (used + paragraph.length > MAX_STORY_CHARACTERS) break;
    used += paragraph.length;
    lines.push(paragraph);
  }
  return [
    `Headline: ${story.title}`,
    `Outlet: ${story.publisher}`,
    `Published: ${story.publishedAt ? isoDay(new Date(story.publishedAt)) : "unknown"}`,
    "",
    lines.join("\n\n"),
  ].join("\n");
}

export function relatedBlock(reports: RelatedReport[]): string {
  if (!reports.length) return "(No related reports were found.)";
  return reports
    .map((report) => [
      `[${report.id}] ${report.title}`,
      `Outlet: ${report.publisher}${report.publishedAt ? ` · ${isoDay(new Date(report.publishedAt))}` : ""}`,
      `Excerpt: ${report.snippet}`,
    ].join("\n"))
    .join("\n\n");
}

export const PLAN_INSTRUCTIONS = `You help a journalist find follow-up angles in a news story that is already published.
Read the story and plan a short web search for other reporting that could reveal what this story leaves out.

Return:
- key_names: up to 6 people, companies, agencies, projects or places that matter most in the story, exactly as the story names them.
- search_queries: 3 or 4 web search queries, each under 12 words. Cover:
  1. Other outlets' reporting on this same event.
  2. Earlier reporting on the main company, person or project named (past contracts, past promises, past controversies).
  3. How earlier promises or programmes of the same kind turned out, in the same place.
  4. (Optional) Official records or figures the story relies on.
Use names from the story. Do not invent names, dates or facts.`;

const ANGLE_RULES = `What makes a good angle:
- It is a follow-up story a reporter could actually report: a specific question with a real answer that can be found through records, documents or people.
- It grows out of something specific: a gap in this story, or something another outlet reported that this story does not mention.
- Angles in one set are of different types and do not overlap.

For each angle:
- type: the kind of angle.
- headline: a short question of at most 8 words, in plain words (e.g. "Who is behind Acme?").
- question: the full question in one sentence, naming who and what.
- why: two or three plain sentences on why it matters and why it is answerable. No jargon.
- gap_numbers: the numbers of the gaps it grows from (may be empty if it grows only from related coverage).
- related_ids: ids of related reports it builds on, e.g. "R3" (may be empty).
- coverage: "partly_covered" if any related report already asks or answers this question, otherwise "not_yet_reported".
- coverage_note: one sentence saying what the related reports do and don't cover on this question.
- coverage_ids: ids of related reports that mention this subject, whether or not they ask the question. Required when coverage is "partly_covered".
- story_excerpts: up to 2 short passages (5 to 25 words) copied exactly, word for word, from the story, that the angle rests on. Copy within one paragraph only.
- where_to_look: 2 or 3 specific records, databases, documents or archives where the answer could be found, each with what to look for. Prefer real, named public sources relevant to the country of the story.
- who_to_ask: 1 to 3 people or offices to contact, each with what to ask them.
- steps: exactly 3 first steps, in order, each a short imperative title and one sentence of detail.

Ground rules:
- Use only facts from the story and the related reports. Never invent names, figures, dates, quotes or events.
- Do not mention a year unless it appears in the story, in a related report you cite, or is the current year.
- Write for working journalists, in plain, everyday English.`;

export function analysisInstructions(today: Date) {
  return `You help a journalist find new angles in a news story that is already published. Today is ${isoDay(today)}.
You are given the story and a numbered list of related reports from other outlets, found by a web search.

First, summarise:
- story_summary: 2 or 3 plain sentences on what the story reports: who, what, where, when, how much. Only facts the story states.
- findings_summary: 2 or 3 plain sentences on what you found: the most important things the story leaves open, and what other outlets' reporting adds that the story doesn't mention. Name outlets by name, never by id. If no related reports were found, say so in a few words.

Then list the story's gaps: up to 6 things it leaves open. Each gap is:
- kind: what sort of gap it is.
- question: the open question in one plain sentence (e.g. "Who owns Acme Construction Ltd?").
- excerpt: a short passage (5 to 25 words) copied exactly, word for word, from the story, that shows the gap. Copy within one paragraph only.
- related_id: null, unless the gap is something important that related reports cover but this story leaves out entirely. Then set related_id to that report's id, set kind to "missing_context", and set excerpt to null.
Order the gaps as they appear in the story, with gaps from related reports last. Most gaps should come from the story itself.

Then write related_notes: for each related report, one short line (at most 14 words) on what it adds about this story's subject.

Then propose exactly 3 angles. At least one should build on a related report when a related report reveals something the story misses (for example an earlier record of the same company or a similar promise that was not kept).

${ANGLE_RULES}`;
}

export function moreAnglesInstructions(today: Date) {
  return `You help a journalist find new angles in a news story that is already published. Today is ${isoDay(today)}.
You are given the story, the gaps already found in it (numbered), related reports from other outlets, and angles the journalist has already seen.

Propose exactly 3 new angles that are clearly different from the ones already seen: different questions, and where possible different types.

${ANGLE_RULES}`;
}

export function gapsBlock(gaps: StoryGap[]): string {
  if (!gaps.length) return "(No gaps were found.)";
  return gaps
    .map((gap) => `${gap.number}. ${gap.question}${gap.excerpt ? ` — story says: "${gap.excerpt}"` : ""}${gap.relatedId ? ` — from ${gap.relatedId}` : ""}`)
    .join("\n");
}
