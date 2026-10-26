import { describe, expect, it } from "vitest";
import {
  claimFingerprint,
  claimsFromPlan,
  cleanClaimText,
  cleanEvidenceUrl,
  evidenceRemovalBlocker,
  excerptAppearsInSource,
  verdictBlocker,
} from "@/lib/claims";
import type { ClaimEvidence } from "@/lib/domain/types";

function evidence(id: string, stance: ClaimEvidence["stance"]): ClaimEvidence {
  const now = new Date();
  return { id, claimId: "claim-1", evidenceKind: "note", stance, sourceArticleId: null, url: null, title: null, recordType: null, excerpt: null, note: "Call with ministry spokesperson", excerptFoundInSource: null, addedByUserId: "user-1", createdAt: now, updatedAt: now };
}

describe("verdict rules", () => {
  it("allows resetting to not yet checked at any time", () => {
    expect(verdictBlocker("unverified", null, [])).toBeNull();
  });

  it("requires a rationale for every other verdict", () => {
    expect(verdictBlocker("unproven", " ", [])).toMatch(/Explain/);
    expect(verdictBlocker("unproven", "Records were requested but not released.", [])).toBeNull();
  });

  it("requires evidence of the matching stance", () => {
    expect(verdictBlocker("confirmed", "Paid per treasury report.", [evidence("e1", "context")])).toMatch(/supports/);
    expect(verdictBlocker("confirmed", "Paid per treasury report.", [evidence("e1", "supports")])).toBeNull();
    expect(verdictBlocker("contradicted", "The contract was cancelled.", [evidence("e1", "supports")])).toMatch(/contradicts/);
    expect(verdictBlocker("contradicted", "The contract was cancelled.", [evidence("e1", "contradicts")])).toBeNull();
    expect(verdictBlocker("partly_confirmed", "Amount differs.", [evidence("e1", "contradicts")])).toMatch(/part of the claim/);
  });

  it("protects the evidence a recorded verdict depends on", () => {
    const items = [evidence("e1", "supports"), evidence("e2", "context")];
    expect(evidenceRemovalBlocker("confirmed", "Shown in record.", items, "e1")).toMatch(/Change the verdict/);
    expect(evidenceRemovalBlocker("confirmed", "Shown in record.", items, "e2")).toBeNull();
    expect(evidenceRemovalBlocker("unverified", null, items, "e1")).toBeNull();
  });
});

describe("excerpt checking", () => {
  const source = "[Page 4]\nThe Ministry paid ₦4,500,000,000 to “Acme Construction Ltd” on 14 March 2024 — without a signed contract.";

  it("matches across spacing, case, curly quotes, dashes and page markers", () => {
    expect(excerptAppearsInSource('"Acme Construction Ltd" on 14 march 2024 - without a signed contract', source)).toBe(true);
    expect(excerptAppearsInSource("the ministry  paid ₦4,500,000,000", source)).toBe(true);
  });

  it("does not match altered figures or trivially short passages", () => {
    expect(excerptAppearsInSource("The Ministry paid ₦5,500,000,000", source)).toBe(false);
    expect(excerptAppearsInSource("paid", source)).toBe(false);
  });
});

describe("importing claims from a plan", () => {
  const plan = {
    knownInformation: [
      { claim: "The ministry announced the clinic project in 2023.", status: "reported" },
      { claim: "The ministry announced the clinic project in 2023. ", status: "reported" },
      { claim: "short", status: "reported" },
    ],
    verificationPlan: [
      { action: "Request award records", claimTested: "Acme Construction Ltd received the clinic contract." },
      { action: "Visit site", claimTested: "" },
    ],
    keyQuestions: ["Who approved the payment?"],
  };

  it("takes known information and tested claims, de-duplicated, and skips questions", () => {
    const claims = claimsFromPlan(plan);
    expect(claims.map((claim) => claim.statement)).toEqual([
      "The ministry announced the clinic project in 2023.",
      "Acme Construction Ltd received the clinic contract.",
    ]);
    expect(claims.map((claim) => claim.origin)).toEqual(["plan_known_information", "plan_verification"]);
  });

  it("gives the same statement the same key, so re-importing adds nothing", () => {
    expect(claimsFromPlan(plan)[0].originKey).toBe(claimsFromPlan(plan)[0].originKey);
    expect(claimFingerprint("Acme  Construction Ltd.")).toBe(claimFingerprint("acme construction ltd"));
    expect(claimFingerprint("Acme Construction Ltd")).not.toBe(claimFingerprint("Beta Construction Ltd"));
  });

  it("tolerates plans without these sections", () => {
    expect(claimsFromPlan({})).toEqual([]);
    expect(claimsFromPlan({ knownInformation: "not a list", verificationPlan: [null, 4] })).toEqual([]);
  });
});

describe("input cleaning", () => {
  it("rejects empty or over-long text and strips control characters", () => {
    expect(cleanClaimText("  The   ministry\u0007 paid.  ", 100)).toBe("The ministry paid.");
    expect(cleanClaimText("   ", 100)).toBeNull();
    expect(cleanClaimText("x".repeat(101), 100)).toBeNull();
    expect(cleanClaimText(42, 100)).toBeNull();
  });

  it("accepts only plain http(s) evidence links", () => {
    expect(cleanEvidenceUrl("https://oaugf.ng/report.pdf")).toBe("https://oaugf.ng/report.pdf");
    expect(cleanEvidenceUrl("javascript:alert(1)")).toBeNull();
    expect(cleanEvidenceUrl("https://user:pass@example.com")).toBeNull();
    expect(cleanEvidenceUrl("not a url")).toBeNull();
  });
});
