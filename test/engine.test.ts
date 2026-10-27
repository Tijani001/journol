import { describe, expect, it } from "vitest";
import { analyzeStory, findMoreAngles } from "@/lib/engine/run";
import type { RelatedSearch } from "@/lib/engine/run";
import { PLAN, RAW_ANALYSIS, RAW_MORE_ANGLES, STORY, coverage, fakeModel, rawAngle } from "@/test/fixtures";

const today = new Date("2026-10-27T00:00:00Z");

describe("analyzeStory", () => {
  it("plans a search, uses the related reports, and returns grounded gaps and angles", async () => {
    const { model, calls } = fakeModel({ search_plan: PLAN, story_angles: RAW_ANALYSIS });
    const searched: string[][] = [];
    const search: RelatedSearch = async (queries) => {
      searched.push(queries);
      return coverage();
    };
    const stages: string[] = [];
    const result = await analyzeStory(STORY, { model, search, today, onStage: (stage) => stages.push(stage) });

    expect(searched).toEqual([PLAN.search_queries]);
    expect(stages).toEqual(["searching", "thinking"]);
    expect(calls[1].input).toContain("[R2] Acme's unfinished clinics in Sokoto");
    expect(calls[1].instructions).toContain("Today is 2026-10-27");
    expect(result.gaps).toHaveLength(4);
    expect(result.angles.map((angle) => angle.headline)).toEqual([
      "Who is behind Acme?",
      "What happened to Acme's last clinics?",
      "Will the clinics be ready by December?",
    ]);
    expect(result.angles[1]).toMatchObject({ relatedIds: ["R2"], coverage: "partly_covered" });
    expect(result.related.find((report) => report.id === "R2")?.note).toBe("Acme left four of six Sokoto clinics unfinished.");
    expect(result.repeatedCount).toBe(2);
  });

  it("still searches on the headline when planning fails", async () => {
    const { model } = fakeModel({ story_angles: RAW_ANALYSIS });
    let queries: string[] = [];
    await analyzeStory(STORY, { model, search: async (planned) => { queries = planned; return coverage(); }, today });
    expect(queries).toEqual([STORY.title]);
  });

  it("asks once more when no angle passes the checks", async () => {
    const bad = { ...RAW_ANALYSIS, angles: [rawAngle({ why: "It happened in 1999.", }), rawAngle({ gap_numbers: [], related_ids: [] })] };
    const { model, calls } = fakeModel({ search_plan: PLAN, story_angles: [bad, RAW_ANALYSIS] });
    const result = await analyzeStory(STORY, { model, search: async () => coverage(), today });
    expect(calls.filter((call) => call.name === "story_angles")).toHaveLength(2);
    expect(calls[2].instructions).toContain("unsupported year");
    expect(result.angles).toHaveLength(3);
  });

  it("never claims 'Not yet reported' when the search couldn't run", async () => {
    const { model } = fakeModel({ search_plan: PLAN, story_angles: RAW_ANALYSIS });
    const result = await analyzeStory(STORY, { model, search: async () => coverage({ status: "unavailable", reports: [], repeatedCount: 0 }), today });
    expect(result.angles.every((angle) => angle.coverage === "unchecked")).toBe(true);
    // Angles built only on related reports can't survive without the reports.
    expect(result.angles.map((angle) => angle.headline)).not.toContain("What happened to Acme's last clinics?");
  });
});

describe("findMoreAngles", () => {
  it("returns only angles that differ from those already shown", async () => {
    const first = await analyzeStory(STORY, { model: fakeModel({ search_plan: PLAN, story_angles: RAW_ANALYSIS }).model, search: async () => coverage(), today });
    const { model, calls } = fakeModel({ more_angles: RAW_MORE_ANGLES });
    const more = await findMoreAngles({ story: STORY, gaps: first.gaps, related: first.related, searchStatus: "searched", previous: first.angles }, { model, today });
    expect(more.map((angle) => angle.headline)).toEqual(["Who decides where the clinics go?"]);
    expect(calls[0].input).toContain("ANGLES ALREADY SEEN\n- Who owns Acme Construction Ltd");
    expect(calls[0].input).toContain("1. Who owns Acme Construction Ltd?");
  });
});
