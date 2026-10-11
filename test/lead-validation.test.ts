import { describe, expect, it } from "vitest";
import { validateLead } from "@/lib/lead-validation";

function validLead(overrides: Record<string, unknown> = {}) {
  return {
    primaryLead: "What do the reported procurement records establish about the award?",
    leadRationale: "The supplied report identifies a procurement decision that can be checked against records.",
    evidencePath: ["Procurement records", "Agency response"],
    firstAction: "Request the published procurement notice from the agency.",
    validation: { factualBasis: true, target: true, scope: true, evidencePath: true, practicalFirstAction: true, answerability: true, explanation: "The report identifies a bounded public-records question." },
    event: { name: "Reported procurement award", date: "2024", eventStatus: "completed", basis: "The supplied article says the award was made in 2024." },
    scope: "The reported award and available procurement records, not unreported contracts.",
    missingInformation: ["The underlying notice"],
    excludedQuestions: [],
    confidence: "medium",
    outcome: "lead",
    ...overrides,
  };
}

describe("lead validation", () => {
  const procurementSource = "The article reports that an agency awarded a procurement contract in 2024. The notice is not attached.";
  const publicHealthSource = "The report says a hospital announced a vaccination campaign in Kenya in 2023, but gives no delivery data.";

  it("accepts grounded leads across distinct article types and source-supported dates", () => {
    expect(validateLead(validLead(), procurementSource)).toBeNull();
    expect(validateLead(validLead({
      primaryLead: "What delivery data supports the reported vaccination campaign?",
      event: { name: "Reported vaccination campaign", date: "2023", eventStatus: "completed", basis: "The report dates the campaign to 2023." },
    }), publicHealthSource)).toBeNull();
  });

  it("classifies unsupported historical context as a grounding failure", () => {
    const issue = validateLead(validLead({ leadRationale: "A 2022 sanctions waiver explains the award." }), procurementSource);
    expect(issue).toMatchObject({ category: "grounding", code: "UNSUPPORTED_DATE" });
  });

  it("classifies missing domain fields separately from factual grounding", () => {
    const issue = validateLead(validLead({ firstAction: "" }), procurementSource);
    expect(issue).toMatchObject({ category: "schema", code: "MISSING_REQUIRED_FIELD" });
  });

  it("accepts a clear insufficient-evidence outcome instead of manufacturing a lead", () => {
    const issue = validateLead(validLead({
      primaryLead: "The supplied material does not support a responsible investigative question yet.",
      validation: { factualBasis: false, target: false, scope: false, evidencePath: false, practicalFirstAction: false, answerability: false, explanation: "The article lacks a specific reported event or subject to investigate." },
      outcome: "insufficient_evidence",
      confidence: "low",
    }), procurementSource);
    expect(issue).toBeNull();
  });
});
