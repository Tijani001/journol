import { describe, expect, it } from "vitest";
import {
  alignMinorFirstActionDifference,
  firstActionConsistencyError,
} from "@/lib/investigation-plan-consistency";

describe("investigation plan first-action consistency", () => {
  it("accepts an exactly matching canonical first verification action", () => {
    expect(firstActionConsistencyError({
      firstAction: "Request the contract register.",
      verificationPlan: [{ action: "Request the contract register." }],
    })).toBeNull();
  });

  it("aligns only presentation-level wording differences to the verification step", () => {
    const plan = {
      firstAction: "  Request the contract register! ",
      verificationPlan: [{ action: "Request the contract register." }],
    };
    expect(alignMinorFirstActionDifference(plan)).toBe(true);
    expect(plan.firstAction).toBe(plan.verificationPlan[0].action);
    expect(firstActionConsistencyError(plan)).toBeNull();
  });

  it("keeps a substantively different action invalid for one bounded repair", () => {
    const plan = {
      firstAction: "Interview the minister.",
      verificationPlan: [{ action: "Request the contract register." }],
    };
    expect(alignMinorFirstActionDifference(plan)).toBe(false);
    expect(firstActionConsistencyError(plan)).toContain("must match");
  });
});
