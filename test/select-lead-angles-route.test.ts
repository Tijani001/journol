import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { InMemoryJournolRepository } from "@/lib/server/repository";
import type { User } from "@/lib/domain/types";
import { ARTICLE, angle, angleSet } from "./fixtures/angles";

const create = vi.fn();
const state: { repository: InMemoryJournolRepository; user: User } = {} as never;

vi.mock("openai", () => ({
  default: class OpenAI {
    static APIError = class APIError extends Error { status?: number; code?: string };
    responses = { create };
  },
}));
vi.mock("@/lib/server/clerk-config", () => ({ isClerkConfigured: () => true }));
vi.mock("@/lib/server/database", () => ({ isDatabaseConfigured: () => true, DatabaseConfigurationError: class DatabaseConfigurationError extends Error {} }));
vi.mock("@/lib/access", () => ({ limitRequest: vi.fn(async () => ({ allowed: true, retryAfterSeconds: 0, release: async () => {} })) }));
vi.mock("@/lib/server/auth", () => ({ getOrCreateCurrentUser: vi.fn(async () => state.user) }));
vi.mock("@/lib/server/authorization", () => ({
  AuthorizationError: class AuthorizationError extends Error {},
  requireInvestigationAccess: vi.fn(async (repository: InMemoryJournolRepository, _user: User, investigationId: string) => repository.getInvestigation(investigationId)),
}));
vi.mock("@/lib/server/postgres-repository", () => ({ getPostgresRepository: () => state.repository }));

async function setUp() {
  state.repository = new InMemoryJournolRepository();
  state.user = await state.repository.createUser({ authIssuer: "issuer", authSubject: "subject", email: null });
  const investigation = await state.repository.createInvestigation({ ownerUserId: state.user.id, title: "Clinics" });
  const article = await state.repository.createSourceArticle({ ownerUserId: state.user.id, originalUrl: "https://example.ng/clinics", canonicalUrl: null, title: "FG to build 12 clinics in Zamfara mining communities", publisher: "Premium Times", extractedText: ARTICLE, contentHash: "a", retrievalStatus: "retrieved", retrievedAt: new Date() });
  await state.repository.attachSourceToInvestigation({ investigationId: investigation.id, sourceArticleId: article.id, addedByUserId: state.user.id });
  return { investigationId: investigation.id, sourceArticleId: article.id };
}

async function selectAngles(ids: { investigationId: string; sourceArticleId: string }, extra: Record<string, unknown> = {}) {
  const { POST } = await import("@/app/api/select-lead/route");
  const response = await POST(new Request("http://test/api/select-lead", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...ids, ...extra }) }));
  return { status: response.status, body: await response.json() };
}

const modelReply = (value: unknown) => ({ id: "resp-1", output_text: JSON.stringify(value), usage: { input_tokens: 100, output_tokens: 200 } });

describe("lead selection as angle sets", () => {
  beforeEach(() => { process.env.OPENAI_API_KEY = "test-key"; });
  afterEach(() => { create.mockReset(); delete process.env.OPENAI_API_KEY; });

  it("stores each angle as a proposed lead and returns the gaps with the set", async () => {
    const ids = await setUp();
    create.mockResolvedValue(modelReply(angleSet()));
    const { status, body } = await selectAngles(ids);
    expect(status).toBe(200);
    expect(body.outcome).toBe("angles");
    expect(body.storyGaps).toHaveLength(3);
    expect(body.angles).toHaveLength(3);
    expect(new Set(body.angles.map((entry: { angleSetId: string }) => entry.angleSetId)).size).toBe(1);
    const stored = await state.repository.listLeadsForInvestigation(ids.investigationId);
    expect(stored.map((lead) => lead.status)).toEqual(["proposed", "proposed", "proposed"]);
    expect(stored.map((lead) => lead.id)).toEqual(body.angles.map((entry: { leadId: string }) => entry.leadId));
    expect(create.mock.calls[0][0].text.format.name).toBe("story_angles");
  });

  it("returns the same set without calling the model again for a repeat request", async () => {
    const ids = await setUp();
    create.mockResolvedValue(modelReply(angleSet()));
    const first = await selectAngles(ids);
    const second = await selectAngles(ids);
    expect(create.mock.calls).toHaveLength(1);
    expect(second.body.angles.map((entry: { leadId: string }) => entry.leadId)).toEqual(first.body.angles.map((entry: { leadId: string }) => entry.leadId));
  });

  it("tells the model which angles were turned down and asks again", async () => {
    const ids = await setUp();
    create.mockResolvedValue(modelReply(angleSet()));
    await selectAngles(ids);
    create.mockResolvedValue(modelReply(angleSet({ angles: [angle({ angleType: "accountability", primaryLead: "Which official approved the Anka clinic sites?" })] })));
    const { body } = await selectAngles(ids, { rejectedLeads: ["How was Acme Construction Ltd selected for the ₦4.5 billion clinics contract?"] });
    expect(create.mock.calls[1][0].input).toContain("1. How was Acme Construction Ltd selected");
    expect(body.angles.map((entry: { primaryLead: string }) => entry.primaryLead)).toEqual(["Which official approved the Anka clinic sites?"]);
  });

  it("asks for one correction when no angle passes the checks", async () => {
    const ids = await setUp();
    create
      .mockResolvedValueOnce(modelReply(angleSet({ angles: [angle({ primaryLead: "Did this happen in 2017?" })] })))
      .mockResolvedValueOnce(modelReply(angleSet()));
    const { status, body } = await selectAngles(ids);
    expect(status).toBe(200);
    expect(create.mock.calls).toHaveLength(2);
    expect(create.mock.calls[1][0].instructions).toContain("CORRECTION PASS");
    expect(body.angles).toHaveLength(3);
  });

  it("fails clearly, and stores nothing, if the correction also fails", async () => {
    const ids = await setUp();
    create.mockResolvedValue(modelReply(angleSet({ angles: [angle({ primaryLead: "Did this happen in 2017?" })] })));
    const { status, body } = await selectAngles(ids);
    expect(status).toBe(502);
    expect(body.error).toMatch(/could not find angles/);
    expect(await state.repository.listLeadsForInvestigation(ids.investigationId)).toHaveLength(0);
  });

  it("stores a single honest record when the story is too thin", async () => {
    const ids = await setUp();
    create.mockResolvedValue(modelReply(angleSet({ outcome: "insufficient_evidence", insufficientExplanation: "Only a headline.", angles: [] })));
    const { body } = await selectAngles(ids);
    expect(body.outcome).toBe("insufficient_evidence");
    expect(body.angles).toHaveLength(1);
  });

  it("rejects a malformed list of turned-down angles", async () => {
    const ids = await setUp();
    const { status } = await selectAngles(ids, { rejectedLeads: "not a list" });
    expect(status).toBe(400);
    expect(create.mock.calls).toHaveLength(0);
  });

  it("returns the whole set, with the chosen angle, when the investigation is reopened", async () => {
    const ids = await setUp();
    create.mockResolvedValue(modelReply(angleSet()));
    const { body } = await selectAngles(ids);
    await state.repository.approveLead(body.angles[1].leadId, state.user.id);
    const { GET } = await import("@/app/api/investigations/[investigationId]/route");
    const reopened = await (await GET(new Request("http://test"), { params: Promise.resolve({ investigationId: ids.investigationId }) })).json();
    expect(reopened.workflow.lead.id).toBe(body.angles[1].leadId);
    expect(reopened.workflow.leadOptions.map((entry: { leadId: string; status: string }) => [entry.leadId, entry.status])).toEqual([
      [body.angles[0].leadId, "proposed"],
      [body.angles[1].leadId, "approved"],
      [body.angles[2].leadId, "proposed"],
    ]);
  });
});
