import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const create = vi.fn();
vi.mock("openai", () => ({ default: class OpenAI { static APIError = class APIError extends Error {}; responses = { create }; } }));

const originalRequireAuth = process.env.JOURNOL_REQUIRE_AUTH;
const originalToken = process.env.JOURNOL_ACCESS_TOKEN;
process.env.JOURNOL_REQUIRE_AUTH = "false";
delete process.env.JOURNOL_ACCESS_TOKEN;

beforeEach(() => {
  process.env.JOURNOL_REQUIRE_AUTH = "false";
  delete process.env.JOURNOL_ACCESS_TOKEN;
});

afterEach(() => {
  create.mockReset();
  process.env.JOURNOL_REQUIRE_AUTH = originalRequireAuth;
  if (originalToken === undefined) delete process.env.JOURNOL_ACCESS_TOKEN;
  else process.env.JOURNOL_ACCESS_TOKEN = originalToken;
});

describe("AI route input guards", () => {
  it("rejects malformed lead-selection JSON without calling OpenAI", async () => {
    const { POST } = await import("@/app/api/select-lead/route");
    const response = await POST(new Request("http://test/api/select-lead", { method: "POST", body: "{" }));
    if (!response) throw new Error("Route returned no response");
    expect(response.status).toBe(400);
    expect(create).not.toHaveBeenCalled();
  });

  it("rejects malformed evidence and planning requests without calling OpenAI", async () => {
    const assessment = await import("@/app/api/assess-evidence/route");
    const builder = await import("@/app/api/build-investigation/route");
    const assessmentResponse = await assessment.POST(new Request("http://test", { method: "POST", body: "{" }));
    const builderResponse = await builder.POST(new Request("http://test", { method: "POST", body: "{" }));
    if (!assessmentResponse || !builderResponse) throw new Error("Route returned no response");
    expect(assessmentResponse.status).toBe(400);
    expect(builderResponse.status).toBe(400);
    expect(create).not.toHaveBeenCalled();
  });

  it("rejects an inconsistent evidence assessment before calling OpenAI", async () => {
    const { POST } = await import("@/app/api/build-investigation/route");
    const response = await POST(new Request("http://test", {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ approvedLead: "Question?", evidenceAssessment: { approvedLead: "Question?" } }),
    }));
    if (!response) throw new Error("Route returned no response");
    expect(response.status).toBe(400);
    expect(create).not.toHaveBeenCalled();
  });

  it("rejects a model plan whose first action conflicts with its first step", async () => {
    const priorApiKey = process.env.OPENAI_API_KEY;
    process.env.OPENAI_API_KEY = "test-key";
    const { POST } = await import("@/app/api/build-investigation/route");
    create.mockResolvedValueOnce({ output_text: JSON.stringify({
      approvedLead: "Question?", investigativeObjective: "Establish the answer.",
      knownInformation: [], keyQuestions: ["What happened?"],
      evidenceRequirements: [{ evidence: "Record", purpose: "Test the claim", possibleSource: "Agency" }],
      verificationPlan: [{ step: 1, action: "Request the record", evidenceSought: "Record", source: "Agency", claimTested: "Question?", method: "Review", possibleFindings: "Support or contradict", nextStep: "Assess response" }],
      alternativeExplanations: [], limitations: [], editorialSafeguards: [],
      firstAction: "Call a source", confidence: { investigability: "medium", startingEvidence: "low", explanation: "Needs records." },
    }) });
    const assessment = {
      approvedLead: "Question?", materialReviewed: { articleTextAvailable: false, articleTextLimitations: "No article text." },
      reportedClaims: [], establishedInformation: [], unknowns: [], evidenceGaps: [], alternativeExplanations: [],
      startingEvidenceAssessment: { level: "low", explanation: "Limited material.", mostImportantLimitation: "No text." }, assessmentSummary: "Limited material.",
    };
    try {
      const response = await POST(new Request("http://test", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ approvedLead: "Question?", evidenceAssessment: assessment }) }));
      if (!response) throw new Error("Route returned no response");
      expect(response.status).toBe(502);
    } finally {
      if (priorApiKey === undefined) delete process.env.OPENAI_API_KEY;
      else process.env.OPENAI_API_KEY = priorApiKey;
    }
  });
});


describe("article route validation", () => {
  it("rejects malformed and oversized requests before retrieval", async () => {
    const { POST } = await import("@/app/api/article/route");
    const malformed = await POST(new Request("http://test", { method: "POST", body: "{" }));
    const oversized = await POST(new Request("http://test", { method: "POST", body: JSON.stringify({ url: "x".repeat(17_000) }) }));
    if (!malformed || !oversized) throw new Error("Route returned no response");
    expect(malformed.status).toBe(400);
    expect(oversized.status).toBe(413);
  });
});
