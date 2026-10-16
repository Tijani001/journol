import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const create = vi.fn();
const getSourceArticle = vi.fn();
const investigationHasSource = vi.fn();
const getExistingReport = vi.fn();
const createReport = vi.fn();
const begin = vi.fn();
const succeed = vi.fn();
const fail = vi.fn();
const release = vi.fn();

vi.mock("openai", () => ({
  default: class OpenAI {
    static APIError = class APIError extends Error { status?: number };
    static APIConnectionTimeoutError = class APIConnectionTimeoutError extends Error {};
    static APIConnectionError = class APIConnectionError extends Error {};
    responses = { create };
  },
}));
vi.mock("@/lib/access", () => ({ limitRequest: vi.fn(async () => ({ allowed: true, release })) }));
vi.mock("@/lib/server/auth", () => ({ getOrCreateCurrentUser: vi.fn(async () => ({ id: "user-1" })) }));
vi.mock("@/lib/server/authorization", () => ({ requireInvestigationAccess: vi.fn(async () => undefined) }));
vi.mock("@/lib/server/postgres-repository", () => ({
  getPostgresRepository: vi.fn(() => ({
    getSourceArticle,
    investigationHasSource,
    getDeepResearchReportForSnapshot: getExistingReport,
    createDeepResearchReport: createReport,
  })),
}));
vi.mock("@/lib/server/ai-operations", () => ({
  AiOperationService: class AiOperationService {
    begin = begin;
    succeed = succeed;
    fail = fail;
  },
}));
vi.mock("@/lib/server/workflow", () => ({ snapshotHash: vi.fn(() => "snapshot") }));
vi.mock("@/lib/server/deep-research-search", () => {
  class DeepResearchInsufficientSourcesError extends Error {}
  class DeepResearchSearchConfigurationError extends Error {}
  class DeepResearchSearchError extends Error {}
  class DeepResearchSearchUnavailableError extends DeepResearchSearchError {}
  return {
    DEEP_RESEARCH_ENGINE_VERSION: "2.2.2",
    DeepResearchInsufficientSourcesError,
    DeepResearchSearchConfigurationError,
    DeepResearchSearchError,
    DeepResearchSearchUnavailableError,
    buildResearchPlan: vi.fn(() => ({ queries: ["query"], limitations: [] })),
    searchExternalResearch: vi.fn(async () => Object.assign([{
      id: "source-1", title: "Official response", url: "https://records.example/response", publisher: "records.example", publishedAt: null,
      snippet: "The ministry said the allocation was approved after a public review.", sourceType: "official", evidenceMode: "search_snippet", limitations: [], likelyRepeatedSourceIds: [],
    }], { warnings: [] })),
  };
});

const report = {
  executiveSummary: { text: "The ministry said the allocation was approved after a public review.", sourceIds: ["source-1"] },
  keyFindings: [{ claim: "The ministry said the allocation was approved after a public review.", evidenceStatus: "Attributed", alignmentStatus: "attributed_statement", sourceIds: ["source-1"], evidenceExplanation: "The source excerpt attributes this statement to the ministry." }],
  historicalTimeline: [], relatedIncidents: [], patternsAndTrends: [], institutionalResponses: [], contradictionsAndGaps: [], numericalAnalysis: [], actionableInvestigativeLeads: [], suggestedReportingQuestions: [], limitations: [],
};

describe("Deep Research structured-output recovery", () => {
  beforeEach(() => {
    process.env.OPENAI_API_KEY = "test-key";
    process.env.TAVILY_API_KEY = "test-key";
    getSourceArticle.mockResolvedValue({ id: "source-article-1", ownerUserId: "user-1", title: "Ministry review", publisher: "Example", contentHash: "hash", extractedText: "The ministry said the allocation was approved after a public review." });
    investigationHasSource.mockResolvedValue(true);
    getExistingReport.mockResolvedValue(null);
    createReport.mockResolvedValue({ id: "report-1" });
    begin.mockResolvedValue({ operation: { id: "operation-1" }, reused: false });
  });

  afterEach(() => {
    vi.clearAllMocks();
    delete process.env.OPENAI_API_KEY;
    delete process.env.TAVILY_API_KEY;
  });

  it("uses the single bounded recovery call when the primary provider response is incomplete", async () => {
    create
      .mockResolvedValueOnce({ output_text: "", status: "incomplete", incomplete_details: { reason: "max_output_tokens" }, usage: {} })
      .mockResolvedValueOnce({ output_text: JSON.stringify(report), status: "completed", usage: {} });
    const { POST } = await import("@/app/api/investigations/[investigationId]/deep-research/route");

    const response = await POST(new Request("http://test/api/investigations/investigation-1/deep-research", {
      method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ sourceArticleId: "source-article-1" }),
    }), { params: Promise.resolve({ investigationId: "investigation-1" }) });

    expect(response.status).toBe(200);
    expect(create).toHaveBeenCalledTimes(2);
    expect(createReport).toHaveBeenCalledOnce();
    expect(succeed).toHaveBeenCalledOnce();
    expect(fail).not.toHaveBeenCalled();
    expect(release).toHaveBeenCalledOnce();
  });
});
