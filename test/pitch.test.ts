import { describe, expect, it } from "vitest";
import { buildGaps, checkAngle } from "@/lib/engine/grounding";
import { checkPitch, pitchInput, PitchError, wordCount, writePitch, type PitchContext } from "@/lib/engine/pitch";
import { RAW_ANALYSIS, REPORTS, STORY, fakeModel, rawAngle, rawPitch } from "@/test/fixtures";

const today = new Date("2026-10-29T00:00:00Z");

function context(): PitchContext {
  const { gaps, renumber } = buildGaps(RAW_ANALYSIS.gaps, STORY, REPORTS);
  const result = checkAngle(rawAngle({ related_ids: ["R2"] }), { story: STORY, gaps, related: REPORTS, searchStatus: "searched", renumber, today });
  if (!("angle" in result)) throw new Error("expected an angle");
  return { story: STORY, angle: result.angle, gaps, related: REPORTS, pitchingTo: "Amaka Obi, Premium Times", aboutMe: "" };
}

describe("pitch", () => {
  it("gives the model the story, the angle, the cited reports and who it's for", () => {
    const input = pitchInput(context());
    expect(input).toContain("Question: Who owns Acme Construction Ltd");
    expect(input).toContain("Acme's unfinished clinics in Sokoto (ledger.example, March 2024)");
    expect(input).not.toContain("Lead poisoning: Anka families wait for help");
    expect(input).toContain("Pitching to: Amaka Obi, Premium Times");
    expect(input).toContain("About the journalist: (not given; use the placeholder)");
  });

  it("accepts a pitch of about 250 words and strips report ids", () => {
    const result = checkPitch(rawPitch(), context(), today);
    expect("pitch" in result).toBe(true);
    if ("pitch" in result) {
      expect(result.pitch.body).not.toMatch(/\bR2\b/);
      expect(wordCount(result.pitch.body)).toBeGreaterThanOrEqual(240);
    }
  });

  it("rejects pitches far from 250 words", () => {
    expect(checkPitch(rawPitch({ words: 120 }), context(), today)).toMatchObject({ problem: expect.stringMatching(/was 12\d words/) });
    expect(checkPitch(rawPitch({ words: 400 }), context(), today)).toHaveProperty("problem");
  });

  it("rejects a year nothing supports, but allows years from cited reports", () => {
    expect(checkPitch(rawPitch({ extra: "Acme was banned in 2015." }), context(), today)).toMatchObject({ problem: expect.stringContaining("2015") });
    expect("pitch" in checkPitch(rawPitch({ extra: "Ledger reported this in 2024." }), context(), today)).toBe(true);
  });

  it("retries once with the reason, then gives up", async () => {
    const good = fakeModel({ story_pitch: [rawPitch({ words: 90 }), rawPitch()] });
    await expect(writePitch(context(), { model: good.model, today })).resolves.toHaveProperty("title");
    expect(good.calls[1].instructions).toMatch(/was 9\d words/);

    const bad = fakeModel({ story_pitch: [rawPitch({ words: 90 }), rawPitch({ words: 95 })] });
    await expect(writePitch(context(), { model: bad.model, today })).rejects.toBeInstanceOf(PitchError);
  });
});
