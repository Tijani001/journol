import { describe, expect, it } from "vitest";
import { angleSetFromSelectionResponse, angleSetFromWorkflow, deepResearchFocusFor } from "@/lib/client/angle-set";

const gaps = [{ kind: "missing_voice", observation: "Residents were not heard.", excerpt: "Residents of Anka were not consulted" }, { kind: "bogus", observation: "x", excerpt: "" }];
const angle = (leadId: string, extra: Record<string, unknown> = {}) => ({ leadId, status: "proposed", angleType: "missing_voices", headline: "What residents say", primaryLead: `Question ${leadId}?`, leadRationale: "Why.", builtOnGaps: [0], evidencePath: ["Councillor"], firstAction: "Call the councillor.", scope: "Anka only.", missingInformation: [], confidence: "medium", outcome: "lead", storyGaps: gaps, ...extra });

describe("angle sets in the browser", () => {
  it("parses a selection response and ignores unusable entries", () => {
    const set = angleSetFromSelectionResponse({ outcome: "angles", storyGaps: gaps, angles: [angle("a"), { leadId: "b" }, angle("c", { angleType: "made_up" })] });
    expect(set.angles.map((entry) => entry.leadId)).toEqual(["a", "c"]);
    expect(set.angles[1].angleType).toBeNull();
    expect(set.storyGaps).toEqual([gaps[0]]);
  });

  it("throws when nothing usable came back", () => {
    expect(() => angleSetFromSelectionResponse({ angles: [] })).toThrow(/usable angles/);
  });

  it("restores the set and the chosen angle when an investigation is reopened", () => {
    const restored = angleSetFromWorkflow({
      lead: { id: "b", status: "approved", content: {} },
      leadOptions: [angle("a"), angle("b", { status: "approved" })],
    });
    expect(restored?.set.angles).toHaveLength(2);
    expect(restored?.set.storyGaps).toHaveLength(1);
    expect(restored?.chosen?.leadId).toBe("b");
  });

  it("treats a lead from before angle sets as a set of one, not yet chosen", () => {
    const restored = angleSetFromWorkflow({ lead: { id: "old", status: "proposed", content: { primaryLead: "Old question?", leadRationale: "Why." } } });
    expect(restored?.set.angles.map((entry) => entry.primaryLead)).toEqual(["Old question?"]);
    expect(restored?.set.storyGaps).toEqual([]);
    expect(restored?.chosen).toBeNull();
    expect(angleSetFromWorkflow({ lead: null })).toBeNull();
  });

  it("phrases Deep Research's focus from the chosen angle", () => {
    expect(deepResearchFocusFor({ primaryLead: "Who chose Acme?" })).toBe("Focus on this angle: Who chose Acme?");
  });
});
