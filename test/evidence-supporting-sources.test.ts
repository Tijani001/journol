import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { InMemoryJournolRepository } from "@/lib/server/repository";
import type { User } from "@/lib/domain/types";

const create = vi.fn();
const state: { repository: InMemoryJournolRepository; user: User } = {} as never;

vi.mock("openai", () => ({
  default: class OpenAI {
    static APIError = class APIError extends Error { status?: number };
    static APIConnectionTimeoutError = class APIConnectionTimeoutError extends Error {};
    static APIConnectionError = class APIConnectionError extends Error {};
    responses = { create };
  },
}));
vi.mock("@/lib/server/clerk-config", () => ({ isClerkConfigured: () => true }));
vi.mock("@/lib/server/database", () => ({ isDatabaseConfigured: () => true }));
vi.mock("@/lib/access", () => ({ limitRequest: vi.fn(async () => ({ allowed: true, retryAfterSeconds: 0, release: async () => {} })) }));
vi.mock("@/lib/server/auth", () => ({ getOrCreateCurrentUser: vi.fn(async () => state.user) }));
vi.mock("@/lib/server/authorization", () => ({ requireInvestigationAccess: vi.fn(async () => undefined) }));
vi.mock("@/lib/server/postgres-repository", () => ({ getPostgresRepository: () => state.repository }));
vi.mock("@/lib/server/ai-operations", () => ({
  AiOperationService: class AiOperationService {
    begin = vi.fn(async () => ({ operation: { id: "operation-1", status: "pending" }, reused: false }));
    succeed = vi.fn();
    fail = vi.fn();
  },
}));

const ARTICLE = "The ministry said twelve clinics would be built in Zamfara State by December, funded from the 2024 capital budget. ".repeat(4);
const AUDIT = "Audit query 14: the ministry paid ₦4.5bn to Acme Construction Ltd without a signed contract. ".repeat(4);

async function setUp(withDocument: boolean) {
  state.repository = new InMemoryJournolRepository();
  state.user = await state.repository.createUser({ authIssuer: "issuer", authSubject: "subject", email: null });
  const investigation = await state.repository.createInvestigation({ ownerUserId: state.user.id, title: "Clinics" });
  const article = await state.repository.createSourceArticle({ ownerUserId: state.user.id, originalUrl: "https://example.ng/clinics", canonicalUrl: null, title: "Clinics announced", publisher: "Example", extractedText: ARTICLE, contentHash: "a", retrievalStatus: "retrieved", retrievedAt: new Date() });
  await state.repository.attachSourceToInvestigation({ investigationId: investigation.id, sourceArticleId: article.id, addedByUserId: state.user.id });
  if (withDocument) {
    const document = await state.repository.createSourceArticle({ ownerUserId: state.user.id, originalUrl: null, canonicalUrl: null, title: "Audit query 14", publisher: "OAuGF", extractedText: AUDIT, contentHash: "d", retrievalStatus: "retrieved", retrievedAt: new Date(), sourceKind: "document", fileName: "query-14.pdf" });
    await state.repository.attachSourceToInvestigation({ investigationId: investigation.id, sourceArticleId: document.id, addedByUserId: state.user.id });
  }
  const lead = await state.repository.createLeadVersion({ investigationId: investigation.id, sourceArticleId: article.id, status: "proposed", content: { primaryLead: "Were the clinics paid for and built?" }, model: null, createdByUserId: state.user.id });
  await state.repository.approveLead(lead.id, state.user.id);
  return { investigationId: investigation.id, leadId: lead.id };
}

async function assess(ids: { investigationId: string; leadId: string }) {
  const { POST } = await import("@/app/api/investigations/[investigationId]/evidence/route");
  await POST(new Request("http://test", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ leadId: ids.leadId }) }), { params: Promise.resolve({ investigationId: ids.investigationId }) });
  return create.mock.calls[0]?.[0] as { input: string; instructions: string } | undefined;
}

describe("evidence assessment with attached sources", () => {
  beforeEach(() => {
    process.env.OPENAI_API_KEY = "test-key";
    create.mockImplementation(async () => { throw new Error("stop after capturing the request"); });
  });
  afterEach(() => {
    create.mockReset();
    delete process.env.OPENAI_API_KEY;
  });

  it("supplies the journalist's other sources and tells the model how to treat them", async () => {
    const request = await assess(await setUp(true));
    expect(request?.input).toContain("supportingSources");
    expect(request?.input).toContain("Audit query 14");
    expect(request?.input).toContain("File: query-14.pdf");
    expect(request?.instructions).toContain("SUPPORTING SOURCES");
  });

  it("leaves a single-source assessment exactly as before", async () => {
    const request = await assess(await setUp(false));
    expect(request?.input).not.toContain("supportingSources");
    expect(request?.input).not.toContain("articleTextNote");
    expect(request?.instructions).not.toContain("SUPPORTING SOURCES");
  });
});
