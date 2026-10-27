import {
  ANALYSIS_SCHEMA,
  MORE_ANGLES_SCHEMA,
  PLAN_INSTRUCTIONS,
  PLAN_SCHEMA,
  analysisInstructions,
  gapsBlock,
  moreAnglesInstructions,
  relatedBlock,
  storyBlock,
  type PlanOutput,
  type RawAnalysis,
  type RawAngle,
} from "@/lib/engine/prompts";
import { applyRelatedNotes, buildAngles, buildGaps } from "@/lib/engine/grounding";
import type { RelatedCoverage } from "@/lib/engine/related";
import type { Angle, RelatedReport, SearchStatus, StoryGap, StoryInput } from "@/lib/engine/types";

/**
 * The angle engine: plan a search from the story, search the web for related
 * coverage, then ask the model for gaps and angles, keeping only what passes
 * the grounding checks. The model and search are passed in, so the whole flow
 * runs in tests without network access.
 */

export type StructuredRequest = {
  name: string;
  instructions: string;
  input: string;
  schema: Record<string, unknown>;
  maxOutputTokens: number;
};
export type StructuredModel = (request: StructuredRequest) => Promise<unknown>;
export type RelatedSearch = (queries: string[], story: StoryInput) => Promise<RelatedCoverage>;
export type Stage = "searching" | "thinking";

export type EngineDeps = {
  model: StructuredModel;
  search: RelatedSearch;
  today?: Date;
  onStage?: (stage: Stage) => void;
  /** Time left for a second model attempt if the first returns no usable angles. */
  retryBudgetMs?: number;
};

export type AnalysisResult = {
  gaps: StoryGap[];
  related: RelatedReport[];
  repeatedCount: number;
  searchStatus: SearchStatus;
  angles: Angle[];
};

function asArray<T>(value: unknown): T[] {
  return Array.isArray(value) ? (value as T[]) : [];
}

function stringList(value: unknown): string[] {
  return asArray<unknown>(value).filter((item): item is string => typeof item === "string");
}

export function normalizeRawAngles(value: unknown): RawAngle[] {
  return asArray<Record<string, unknown>>(value).flatMap((entry) => {
    if (!entry || typeof entry !== "object") return [];
    return [{
      type: String(entry.type ?? ""),
      headline: String(entry.headline ?? ""),
      question: String(entry.question ?? ""),
      why: String(entry.why ?? ""),
      gap_numbers: asArray<unknown>(entry.gap_numbers).filter((item): item is number => Number.isInteger(item)),
      related_ids: stringList(entry.related_ids),
      coverage: entry.coverage === "partly_covered" ? "partly_covered" : "not_yet_reported",
      coverage_note: String(entry.coverage_note ?? ""),
      coverage_ids: stringList(entry.coverage_ids),
      story_excerpts: stringList(entry.story_excerpts),
      where_to_look: asArray<Record<string, unknown>>(entry.where_to_look).map((item) => ({ name: String(item?.name ?? ""), what: String(item?.what ?? "") })),
      who_to_ask: asArray<Record<string, unknown>>(entry.who_to_ask).map((item) => ({ who: String(item?.who ?? ""), what: String(item?.what ?? "") })),
      steps: asArray<Record<string, unknown>>(entry.steps).map((item) => ({ title: String(item?.title ?? ""), detail: String(item?.detail ?? "") })),
    }];
  });
}

export function normalizeRawAnalysis(value: unknown): RawAnalysis {
  const body = value && typeof value === "object" ? (value as Record<string, unknown>) : {};
  return {
    gaps: asArray<Record<string, unknown>>(body.gaps).map((gap) => ({
      kind: String(gap?.kind ?? ""),
      question: String(gap?.question ?? ""),
      excerpt: typeof gap?.excerpt === "string" ? gap.excerpt : null,
      related_id: typeof gap?.related_id === "string" ? gap.related_id : null,
    })),
    related_notes: asArray<Record<string, unknown>>(body.related_notes).map((note) => ({ id: String(note?.id ?? ""), note: String(note?.note ?? "") })),
    angles: normalizeRawAngles(body.angles),
  };
}

export async function planSearch(story: StoryInput, model: StructuredModel): Promise<string[]> {
  const fallback = [story.title];
  try {
    const output = (await model({
      name: "search_plan",
      instructions: PLAN_INSTRUCTIONS,
      input: storyBlock(story),
      schema: PLAN_SCHEMA,
      maxOutputTokens: 600,
    })) as Partial<PlanOutput>;
    const queries = stringList(output?.search_queries).map((query) => query.trim()).filter(Boolean);
    return queries.length ? queries.slice(0, 4) : fallback;
  } catch {
    // A failed plan still searches on the headline.
    return fallback;
  }
}

export async function analyzeStory(story: StoryInput, deps: EngineDeps): Promise<AnalysisResult> {
  const today = deps.today ?? new Date();
  const started = Date.now();
  deps.onStage?.("searching");
  const queries = await planSearch(story, deps.model);
  const coverage = await deps.search(queries, story);

  deps.onStage?.("thinking");
  const input = `STORY\n${storyBlock(story)}\n\nRELATED REPORTS\n${relatedBlock(coverage.reports)}`;
  const request: StructuredRequest = {
    name: "story_angles",
    instructions: analysisInstructions(today),
    input,
    schema: ANALYSIS_SCHEMA,
    maxOutputTokens: 6_000,
  };

  let raw = normalizeRawAnalysis(await deps.model(request));
  let { gaps, renumber } = buildGaps(raw.gaps, story, coverage.reports);
  let related = applyRelatedNotes(coverage.reports, raw.related_notes);
  let built = buildAngles(raw.angles, { story, gaps, related, searchStatus: coverage.status, renumber, today });

  const budget = deps.retryBudgetMs ?? 25_000;
  if (built.angles.length === 0 && Date.now() - started < budget) {
    raw = normalizeRawAnalysis(await deps.model({
      ...request,
      instructions: `${request.instructions}\n\nA previous attempt was rejected because its angles failed these checks: ${[...new Set(built.dropped)].join("; ") || "no angles"}. Copy story passages exactly, cite only the listed report ids, and do not add years.`,
    }));
    ({ gaps, renumber } = buildGaps(raw.gaps, story, coverage.reports));
    related = applyRelatedNotes(coverage.reports, raw.related_notes);
    built = buildAngles(raw.angles, { story, gaps, related, searchStatus: coverage.status, renumber, today });
  }

  return { gaps, related, repeatedCount: coverage.repeatedCount, searchStatus: coverage.status, angles: built.angles };
}

export async function findMoreAngles(
  input: { story: StoryInput; gaps: StoryGap[]; related: RelatedReport[]; searchStatus: SearchStatus; previous: Angle[] },
  deps: Pick<EngineDeps, "model" | "today">,
): Promise<Angle[]> {
  const today = deps.today ?? new Date();
  const seen = input.previous.map((angle) => `- ${angle.question}`).join("\n") || "(none)";
  const output = await deps.model({
    name: "more_angles",
    instructions: moreAnglesInstructions(today),
    input: `STORY\n${storyBlock(input.story)}\n\nGAPS\n${gapsBlock(input.gaps)}\n\nRELATED REPORTS\n${relatedBlock(input.related)}\n\nANGLES ALREADY SEEN\n${seen}`,
    schema: MORE_ANGLES_SCHEMA,
    maxOutputTokens: 4_500,
  });
  const raw = normalizeRawAngles(output && typeof output === "object" ? (output as { angles?: unknown }).angles : null);
  return buildAngles(raw, {
    story: input.story,
    gaps: input.gaps,
    related: input.related,
    searchStatus: input.searchStatus,
    previousQuestions: input.previous.map((angle) => angle.question),
    today,
  }).angles;
}
