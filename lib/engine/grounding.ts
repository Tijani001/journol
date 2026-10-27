import { locateInParagraphs, normalizeForMatch } from "@/lib/text-match";
import type { RawAnalysis, RawAngle } from "@/lib/engine/prompts";
import {
  ANGLE_TYPES,
  GAP_KINDS,
  type Angle,
  type AngleType,
  type GapKind,
  type RelatedReport,
  type SearchStatus,
  type StoryGap,
  type StoryInput,
  type StorySummary,
} from "@/lib/engine/types";

/**
 * Server-side checks that keep every gap and angle tied to something real:
 * quotations must be in the story, cited reports must be ones the search
 * found, and no year may appear that neither the story nor a cited report
 * contains. Anything that fails is dropped, not shown.
 */

export const MAX_GAPS = 6;
export const ANGLES_PER_ROUND = 3;

const YEAR = /\b(?:19|20)\d{2}\b/g;

function clean(value: unknown, max: number): string {
  return typeof value === "string" ? value.replace(/\s+/g, " ").trim().slice(0, max) : "";
}

export type GapResult = {
  gaps: StoryGap[];
  /** Model's 1-based gap index → the gap number shown to the journalist. */
  renumber: Map<number, number>;
};

export function buildGaps(raw: RawAnalysis["gaps"], story: StoryInput, related: RelatedReport[]): GapResult {
  const relatedIds = new Set(related.map((report) => report.id));
  const renumber = new Map<number, number>();
  const gaps: StoryGap[] = [];
  const seen = new Set<string>();

  raw.forEach((entry, index) => {
    if (gaps.length >= MAX_GAPS) return;
    const question = clean(entry.question, 300);
    if (!question || !GAP_KINDS.includes(entry.kind as GapKind)) return;
    const key = normalizeForMatch(question);
    if (seen.has(key)) return;
    const located = entry.excerpt ? locateInParagraphs(story.paragraphs, entry.excerpt) : null;
    const relatedId = entry.related_id && relatedIds.has(entry.related_id) ? entry.related_id : null;
    // A gap must point at the story's own words or at a report the search found.
    if (!located && !relatedId) return;
    seen.add(key);
    const number = gaps.length + 1;
    renumber.set(index + 1, number);
    gaps.push({
      number,
      kind: relatedId && !located ? "missing_context" : (entry.kind as GapKind),
      question,
      excerpt: located ? located.text : null,
      relatedId: located ? null : relatedId,
    });
  });

  return { gaps, renumber };
}

/**
 * Cleans the two summary paragraphs. Report ids like "[R2]" are removed, and a
 * paragraph that brings in a year found in neither the story nor any related
 * report is left out rather than shown.
 */
export function buildSummary(raw: Pick<RawAnalysis, "story_summary" | "findings_summary">, story: StoryInput, related: RelatedReport[], today: Date): StorySummary | null {
  const allowed = new Set<string>([
    String(today.getUTCFullYear()),
    ...yearsIn(story.title),
    ...story.paragraphs.flatMap(yearsIn),
    ...(story.publishedAt ? [String(new Date(story.publishedAt).getUTCFullYear())] : []),
    ...related.flatMap((report) => [
      ...yearsIn(`${report.title} ${report.snippet}`),
      ...(report.publishedAt ? [String(new Date(report.publishedAt).getUTCFullYear())] : []),
    ]),
  ]);
  const tidy = (value: string) => {
    const text = clean(value.replace(/\s*\[?\bR\d+\b\]?/g, ""), 900);
    return yearsIn(text).every((year) => allowed.has(year)) ? text : "";
  };
  const summary = { story: tidy(raw.story_summary), findings: tidy(raw.findings_summary) };
  return summary.story || summary.findings ? summary : null;
}

export function applyRelatedNotes(related: RelatedReport[], notes: RawAnalysis["related_notes"]): RelatedReport[] {
  const byId = new Map(notes.map((note) => [note.id, clean(note.note, 160)]));
  return related.map((report) => ({ ...report, note: byId.get(report.id) || report.note }));
}

function yearsIn(value: string): string[] {
  return value.match(YEAR) ?? [];
}

function sameQuestion(left: string, right: string): boolean {
  const strip = (value: string) => normalizeForMatch(value).replace(/[^\p{L}\p{N} ]/gu, "").replace(/\s+/g, " ").trim();
  return strip(left) === strip(right);
}

export type AngleContext = {
  story: StoryInput;
  gaps: StoryGap[];
  related: RelatedReport[];
  searchStatus: SearchStatus;
  /** Model gap index → shown gap number. Identity when gaps were already numbered. */
  renumber?: Map<number, number>;
  /** Questions already shown to the journalist; new angles must differ. */
  previousQuestions?: string[];
  today: Date;
};

export type AngleCheck = { angle: Angle } | { dropped: string };

export function checkAngle(raw: RawAngle, context: AngleContext): AngleCheck {
  if (!ANGLE_TYPES.includes(raw.type as AngleType)) return { dropped: "unknown type" };
  const headline = clean(raw.headline, 90);
  const question = clean(raw.question, 320);
  const why = clean(raw.why, 700);
  if (!headline || !question || !why) return { dropped: "missing text" };

  const relatedById = new Map(context.related.map((report) => [report.id, report]));
  const gapNumbers = new Set(context.gaps.map((gap) => gap.number));
  const mappedGaps = [...new Set(raw.gap_numbers
    .map((number) => (context.renumber ? context.renumber.get(number) : number))
    .filter((number): number is number => typeof number === "number" && gapNumbers.has(number)))];
  const relatedIds = [...new Set(raw.related_ids.filter((id) => relatedById.has(id)))];
  if (!mappedGaps.length && !relatedIds.length) return { dropped: "not tied to a gap or a related report" };

  const storyExcerpts = raw.story_excerpts
    .map((excerpt) => locateInParagraphs(context.story.paragraphs, excerpt)?.text)
    .filter((text): text is string => Boolean(text))
    .slice(0, 2);

  const steps = raw.steps
    .map((step) => ({ title: clean(step.title, 120), detail: clean(step.detail, 300) }))
    .filter((step) => step.title)
    .slice(0, 3);
  if (!steps.length) return { dropped: "no steps" };
  const whereToLook = raw.where_to_look
    .map((item) => ({ name: clean(item.name, 120), what: clean(item.what, 240) }))
    .filter((item) => item.name)
    .slice(0, 4);
  const whoToAsk = raw.who_to_ask
    .map((item) => ({ who: clean(item.who, 120), what: clean(item.what, 240) }))
    .filter((item) => item.who)
    .slice(0, 3);

  let coverageIds = [...new Set(raw.coverage_ids.filter((id) => relatedById.has(id)))];
  let coverageNote = clean(raw.coverage_note, 320);
  let coverage: Angle["coverage"];
  if (context.searchStatus === "unavailable") {
    // Without a search, Journol cannot say whether anyone has reported it.
    coverage = "unchecked";
    coverageIds = [];
    coverageNote = "";
  } else if (raw.coverage === "partly_covered") {
    // Saying another outlet already covers it needs a report to point to.
    coverage = coverageIds.length ? "partly_covered" : "unchecked";
  } else {
    coverage = "not_yet_reported";
  }

  // Years must come from the story, a report this angle cites, or today.
  const allowedYears = new Set<string>([
    String(context.today.getUTCFullYear()),
    ...yearsIn(context.story.title),
    ...context.story.paragraphs.flatMap(yearsIn),
    ...(context.story.publishedAt ? [String(new Date(context.story.publishedAt).getUTCFullYear())] : []),
  ]);
  for (const id of new Set([...relatedIds, ...coverageIds])) {
    const report = relatedById.get(id);
    if (!report) continue;
    for (const year of yearsIn(`${report.title} ${report.snippet}`)) allowedYears.add(year);
    if (report.publishedAt) allowedYears.add(String(new Date(report.publishedAt).getUTCFullYear()));
  }
  const angleText = [
    headline, question, why, coverageNote,
    ...steps.flatMap((step) => [step.title, step.detail]),
    ...whereToLook.flatMap((item) => [item.name, item.what]),
    ...whoToAsk.flatMap((item) => [item.who, item.what]),
  ].join(" ");
  if (yearsIn(angleText).some((year) => !allowedYears.has(year))) return { dropped: "unsupported year" };

  if (context.previousQuestions?.some((previous) => sameQuestion(previous, question))) return { dropped: "already shown" };

  return {
    angle: {
      type: raw.type as AngleType,
      headline,
      question,
      why,
      gapNumbers: mappedGaps.sort((left, right) => left - right),
      relatedIds,
      coverage,
      coverageNote,
      coverageIds,
      storyExcerpts,
      whereToLook,
      whoToAsk,
      steps,
    },
  };
}

export function buildAngles(raw: RawAngle[], context: AngleContext): { angles: Angle[]; dropped: string[] } {
  const angles: Angle[] = [];
  const dropped: string[] = [];
  const previousQuestions = [...(context.previousQuestions ?? [])];
  for (const entry of raw) {
    if (angles.length >= ANGLES_PER_ROUND) break;
    const result = checkAngle(entry, { ...context, previousQuestions });
    if ("dropped" in result) {
      dropped.push(result.dropped);
      continue;
    }
    angles.push(result.angle);
    previousQuestions.push(result.angle.question);
  }
  return { angles, dropped };
}
