import { describe, expect, it } from "vitest";
import { buildAngles, buildGaps, checkAngle, type AngleContext } from "@/lib/engine/grounding";
import { RAW_ANALYSIS, REPORTS, STORY, rawAngle } from "@/test/fixtures";

const today = new Date("2026-10-27T00:00:00Z");

function context(overrides: Partial<AngleContext> = {}): AngleContext {
  const { gaps, renumber } = buildGaps(RAW_ANALYSIS.gaps, STORY, REPORTS);
  return { story: STORY, gaps, related: REPORTS, searchStatus: "searched", renumber, today, ...overrides };
}

describe("gaps", () => {
  it("keeps gaps quoted from the story or found in related coverage, and renumbers them", () => {
    const { gaps, renumber } = buildGaps(RAW_ANALYSIS.gaps, STORY, REPORTS);
    expect(gaps.map((gap) => gap.number)).toEqual([1, 2, 3, 4]);
    expect(gaps.map((gap) => gap.question)).not.toContain("This excerpt is invented and must be dropped");
    expect(gaps[3]).toMatchObject({ kind: "missing_context", excerpt: null, relatedId: "R3" });
    expect(renumber.get(5)).toBe(4);
    expect(renumber.has(4)).toBe(false);
  });

  it("drops a gap that cites a report the search never found", () => {
    const { gaps } = buildGaps([{ kind: "missing_context", question: "Q?", excerpt: null, related_id: "R99" }], STORY, REPORTS);
    expect(gaps).toEqual([]);
  });
});

describe("angles", () => {
  it("accepts a grounded angle and replaces quotations with the story's wording", () => {
    const result = checkAngle(rawAngle({ story_excerpts: ["THE CONTRACT had been awarded to Acme Construction Ltd", "words that are not in the story at all"] }), context());
    expect("angle" in result && result.angle.storyExcerpts).toEqual(["the contract had been awarded to Acme Construction Ltd"]);
  });

  it("drops an angle tied to neither a gap nor a related report", () => {
    expect(checkAngle(rawAngle({ gap_numbers: [42], related_ids: ["R77"] }), context())).toEqual({ dropped: "not tied to a gap or a related report" });
  });

  it("drops an angle that brings in a year from nowhere", () => {
    expect(checkAngle(rawAngle({ why: "Acme was blacklisted in 2019." }), context())).toEqual({ dropped: "unsupported year" });
  });

  it("allows a year from a report the angle cites", () => {
    const result = checkAngle(rawAngle({ why: "Acme left clinics unfinished in 2024.", related_ids: ["R2"] }), context());
    expect("angle" in result).toBe(true);
  });

  it("allows the current year and years in the story", () => {
    expect("angle" in checkAngle(rawAngle({ why: "Deaths since 2010; check the 2026 budget." }), context())).toBe(true);
  });

  it("only says 'Not yet reported' when the search actually ran", () => {
    const searched = checkAngle(rawAngle({ coverage_ids: [] }), context());
    expect("angle" in searched && searched.angle.coverage).toBe("not_yet_reported");
    const unavailable = checkAngle(rawAngle(), context({ searchStatus: "unavailable" }));
    expect("angle" in unavailable && unavailable.angle).toMatchObject({ coverage: "unchecked", coverageIds: [], coverageNote: "" });
  });

  it("needs a real report to call something partly covered", () => {
    const noProof = checkAngle(rawAngle({ coverage: "partly_covered", coverage_ids: ["R55"] }), context());
    expect("angle" in noProof && noProof.angle.coverage).toBe("unchecked");
    const proved = checkAngle(rawAngle({ coverage: "partly_covered", coverage_ids: ["R1"] }), context());
    expect("angle" in proved && proved.angle.coverage).toBe("partly_covered");
  });

  it("maps the model's gap numbers onto the shown numbers", () => {
    const result = checkAngle(rawAngle({ gap_numbers: [5, 4] }), context());
    expect("angle" in result && result.angle.gapNumbers).toEqual([4]);
  });

  it("keeps three angles at most, and none the journalist has already seen", () => {
    const many = [rawAngle(), rawAngle(), rawAngle({ question: "Q two?" }), rawAngle({ question: "Q three?" }), rawAngle({ question: "Q four?" })];
    const { angles, dropped } = buildAngles(many, context({ previousQuestions: ["Q TWO"] }));
    expect(angles.map((angle) => angle.question)).toEqual([rawAngle().question, "Q three?", "Q four?"]);
    expect(dropped).toEqual(["already shown", "already shown"]);
  });

  it("requires at least one step and trims to three", () => {
    expect(checkAngle(rawAngle({ steps: [] }), context())).toEqual({ dropped: "no steps" });
    const four = rawAngle({ steps: [1, 2, 3, 4].map((n) => ({ title: `Step ${n}`, detail: "" })) });
    const result = checkAngle(four, context());
    expect("angle" in result && result.angle.steps).toHaveLength(3);
  });
});
