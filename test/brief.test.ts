import { describe, expect, it } from "vitest";
import { reportingBrief } from "@/lib/brief";
import { checkAngle, buildGaps } from "@/lib/engine/grounding";
import { RAW_ANALYSIS, REPORTS, STORY, rawAngle } from "@/test/fixtures";

describe("reporting brief", () => {
  it("includes the question, quotations, steps and linked coverage", () => {
    const { gaps, renumber } = buildGaps(RAW_ANALYSIS.gaps, STORY, REPORTS);
    const result = checkAngle(rawAngle(), { story: STORY, gaps, related: REPORTS, searchStatus: "searched", renumber, today: new Date("2026-10-27") });
    if (!("angle" in result)) throw new Error("expected an angle");
    const brief = reportingBrief({ angle: result.angle, story: STORY, related: REPORTS });
    expect(brief).toContain("ANGLE: Who is behind Acme?");
    expect(brief).toContain("“the contract had been awarded to Acme Construction Ltd”");
    expect(brief).toContain("  1. Look up Acme on the CAC register — Note its directors.");
    expect(brief).toContain("Zamfara clinic contract signed (ledger.example, October 2026) https://ledger.example/zamfara-clinic-contract");
    expect(brief).toContain(STORY.url);
  });
});
