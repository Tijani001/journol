import { describe, expect, it } from "vitest";
import { buildAngleSet, excerptInArticle, rejectedQuestionsFromBody } from "@/lib/lead-angles";
import { ARTICLE, SOURCE, angle, angleSet, validation } from "./fixtures/angles";

const context = { angleSetId: "set-1", articleText: ARTICLE, sourceMaterial: SOURCE, rejectedQuestions: [] as string[] };

describe("angle sets", () => {
  it("keeps grounded angles, records the gaps, and cross-references the others", () => {
    const result = buildAngleSet(angleSet(), context);
    if (result.kind !== "angles") throw new Error(`expected angles, got ${result.kind}`);
    expect(result.leads).toHaveLength(3);
    expect(result.storyGaps).toHaveLength(3);
    expect(result.leads[0]).toMatchObject({ angleSetId: "set-1", anglePosition: 0, outcome: "lead", angleType: "follow_the_money" });
    expect(result.leads[0].excludedQuestions).toEqual([result.leads[1].primaryLead, result.leads[2].primaryLead]);
    expect(result.leads[2].builtOnGaps).toEqual([1]);
  });

  it("drops a quoted excerpt that is not in the story, but keeps the gap", () => {
    const result = buildAngleSet(angleSet(), context);
    if (result.kind !== "angles") throw new Error("expected angles");
    expect(result.storyGaps[0].excerpt).toBe("the contract had been awarded to Acme Construction Ltd");
    expect(result.storyGaps[2]).toMatchObject({ kind: "unsourced_figure", excerpt: "" });
  });

  it("drops an angle with an invented year, no factual basis, or a repeat of a rejected angle", () => {
    const raw = angleSet({ angles: [
      angle({ primaryLead: "Did Acme deliver similar clinics in 2019?" }),
      angle({ primaryLead: "Is the minister hiding something?", validation: { ...validation, factualBasis: false } }),
      angle({ primaryLead: "How was Acme Construction Ltd selected for the ₦4.5 billion clinics contract?" }),
      angle({ angleType: "missing_voices", primaryLead: "What do Anka residents say about the clinics?" }),
    ] });
    const result = buildAngleSet(raw, { ...context, rejectedQuestions: ["how was ACME Construction Ltd selected for the ₦4.5 billion clinics contract"] });
    if (result.kind !== "angles") throw new Error("expected angles");
    expect(result.leads.map((lead) => lead.primaryLead)).toEqual(["What do Anka residents say about the clinics?"]);
    expect(result.dropped.map((entry) => entry.reason)).toEqual(["UNSUPPORTED_DATE", "no factual basis in the story", "repeats a rejected angle"]);
  });

  it("drops duplicate questions and caps the set at four", () => {
    const many = Array.from({ length: 6 }, (_, index) => angle({ primaryLead: `Question number ${index} about the Anka clinics contract?` }));
    many.push(angle({ primaryLead: "Question number 0 about the Anka clinics contract?" }));
    const result = buildAngleSet(angleSet({ angles: many }), context);
    if (result.kind !== "angles") throw new Error("expected angles");
    expect(result.leads).toHaveLength(4);
  });

  it("reports failure when no angle survives", () => {
    const result = buildAngleSet(angleSet({ angles: [angle({ validation: { ...validation, factualBasis: false } })] }), context);
    expect(result.kind).toBe("invalid");
    expect(buildAngleSet({ nonsense: true }, context).kind).toBe("invalid");
  });

  it("turns a too-thin story into one honest insufficient-evidence record", () => {
    const result = buildAngleSet(angleSet({ outcome: "insufficient_evidence", insufficientExplanation: "Only a headline was available.", angles: [] }), context);
    if (result.kind !== "insufficient_evidence") throw new Error("expected insufficient evidence");
    expect(result.lead).toMatchObject({ outcome: "insufficient_evidence", leadRationale: "Only a headline was available." });
    expect((result.lead.validation as Record<string, unknown>).factualBasis).toBe(false);
  });
});

describe("excerpt matching", () => {
  it("ignores case, spacing, curly quotes and trailing punctuation", () => {
    expect(excerptInArticle("“Residents of  ANKA were not consulted.”", ARTICLE)).toBe(true);
    expect(excerptInArticle("Residents of Gusau were not consulted", ARTICLE)).toBe(false);
    expect(excerptInArticle("the", ARTICLE)).toBe(false);
  });
});

describe("rejected questions in requests", () => {
  it("accepts the new list, the old single field, or both, de-duplicated", () => {
    expect(rejectedQuestionsFromBody({})).toEqual([]);
    expect(rejectedQuestionsFromBody({ rejectedLead: "  Q1?  " })).toEqual(["Q1?"]);
    expect(rejectedQuestionsFromBody({ rejectedLeads: ["Q1?", "Q2?", "Q1?"], rejectedLead: "" })).toEqual(["Q1?", "Q2?"]);
    expect(rejectedQuestionsFromBody({ rejectedLeads: Array.from({ length: 20 }, (_, index) => `Q${index}?`) })).toHaveLength(12);
  });

  it("rejects malformed input", () => {
    expect(rejectedQuestionsFromBody({ rejectedLeads: "Q1?" })).toBeNull();
    expect(rejectedQuestionsFromBody({ rejectedLeads: [42] })).toBeNull();
    expect(rejectedQuestionsFromBody({ rejectedLead: 7 })).toBeNull();
    expect(rejectedQuestionsFromBody({ rejectedLeads: ["x".repeat(1_001)] })).toBeNull();
  });
});
