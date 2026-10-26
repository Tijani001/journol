import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Investigation, User } from "@/lib/domain/types";
import { InMemoryJournolRepository } from "@/lib/server/repository";

const state: { repository: InMemoryJournolRepository; user: User; investigation: Investigation } = {} as never;

vi.mock("@/lib/access", () => ({ limitRequest: vi.fn(async () => ({ allowed: true, retryAfterSeconds: 0, release: async () => {} })) }));
vi.mock("@/lib/server/investigation-request", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/server/investigation-request")>();
  return {
    ...actual,
    openInvestigationRequest: vi.fn(async (investigationId: string) => {
      const investigation = await state.repository.getInvestigation(investigationId);
      if (!investigation || investigation.ownerUserId !== state.user.id) {
        return { response: Response.json({ success: false, error: "Investigation unavailable.", code: "INVESTIGATION_UNAVAILABLE" }, { status: 404 }) };
      }
      return { repository: state.repository, user: state.user, investigation };
    }),
  };
});

const EVIDENCE_TEXT = "The Ministry paid ₦4.5bn to Acme Construction Ltd in March 2024 for twelve clinics, but auditors found no signed contract on file. The Accounting Officer did not answer the audit query within the statutory period.";

function params<T extends Record<string, string>>(value: T) {
  return { params: Promise.resolve(value) };
}

function json(body: unknown, method = "POST") {
  return new Request("http://test", { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
}

async function upload(name: string, content: string | Uint8Array, investigationId = state.investigation.id) {
  const { POST } = await import("@/app/api/investigations/[investigationId]/documents/route");
  const form = new FormData();
  form.set("file", new File([content], name));
  form.set("publisher", "Office of the Auditor-General");
  return POST(new Request("http://test", { method: "POST", body: form }), params({ investigationId }));
}

async function addClaim(statement: string) {
  const { POST } = await import("@/app/api/investigations/[investigationId]/claims/route");
  const response = await POST(json({ statement }), params({ investigationId: state.investigation.id }));
  return (await response.json()).claim as { id: string };
}

beforeEach(async () => {
  state.repository = new InMemoryJournolRepository();
  state.user = await state.repository.createUser({ authIssuer: "issuer", authSubject: "subject", email: null });
  state.investigation = await state.repository.createInvestigation({ ownerUserId: state.user.id, title: "Clinic payments" });
});

describe("document uploads", () => {
  it("stores an uploaded document as a source and lists it", async () => {
    const response = await upload("audit-query.txt", EVIDENCE_TEXT);
    expect(response.status).toBe(201);
    const body = await response.json();
    expect(body.source).toMatchObject({ sourceKind: "document", fileName: "audit-query.txt", publisher: "Office of the Auditor-General", extractionMethod: "plain_text" });
    expect(body.text).toContain("Acme Construction Ltd");

    const { GET } = await import("@/app/api/investigations/[investigationId]/sources/route");
    const listed = await (await GET(new Request("http://test"), params({ investigationId: state.investigation.id }))).json();
    expect(listed.sources).toHaveLength(1);
    expect(listed.sources[0]).not.toHaveProperty("extractedText");
  });

  it("reuses an identical document instead of storing it twice", async () => {
    await upload("a.txt", EVIDENCE_TEXT);
    const second = await upload("copy.txt", EVIDENCE_TEXT);
    expect(second.status).toBe(200);
    expect((await second.json()).reused).toBe(true);
  });

  it("explains unsupported and unreadable files", async () => {
    const unsupported = await upload("photo.png", new Uint8Array([0x89, 0x50, 0x4e, 0x47]));
    expect(unsupported.status).toBe(415);
    expect((await unsupported.json()).error).toMatch(/PDF, Word/);
    const tooShort = await upload("note.txt", "Too short.");
    expect(tooShort.status).toBe(422);
  });

  it("does not reveal another account's investigation", async () => {
    const other = await state.repository.createInvestigation({ ownerUserId: "someone-else", title: "Private" });
    const response = await upload("a.txt", EVIDENCE_TEXT, other.id);
    expect(response.status).toBe(404);
  });
});

describe("claim board", () => {
  it("records a verdict only once supporting evidence is attached, and protects that evidence", async () => {
    const uploaded = await (await upload("audit-query.txt", EVIDENCE_TEXT)).json();
    const claim = await addClaim("The Ministry paid ₦4.5bn to Acme Construction Ltd.");
    const claimRoute = await import("@/app/api/investigations/[investigationId]/claims/[claimId]/route");
    const evidenceRoute = await import("@/app/api/investigations/[investigationId]/claims/[claimId]/evidence/route");
    const ids = { investigationId: state.investigation.id, claimId: claim.id };

    const premature = await claimRoute.PATCH(json({ verdict: "confirmed", rationale: "Audit report says so." }, "PATCH"), params(ids));
    expect(premature.status).toBe(409);

    const attached = await evidenceRoute.POST(json({ kind: "source", stance: "supports", sourceArticleId: uploaded.sourceArticle.id, excerpt: "paid ₦4.5bn to Acme Construction Ltd in March 2024" }), params(ids));
    expect(attached.status).toBe(201);
    const evidence = (await attached.json()).evidence;
    expect(evidence.excerptFoundInSource).toBe(true);

    const misquoted = await evidenceRoute.POST(json({ kind: "source", stance: "context", sourceArticleId: uploaded.sourceArticle.id, excerpt: "paid ₦9bn to Acme" }), params(ids));
    expect((await misquoted.json()).evidence.excerptFoundInSource).toBe(false);

    const confirmed = await claimRoute.PATCH(json({ verdict: "confirmed", rationale: "The audit query records the payment." }, "PATCH"), params(ids));
    expect(confirmed.status).toBe(200);
    expect((await confirmed.json()).claim.verdict).toBe("confirmed");

    const removeRoute = await import("@/app/api/investigations/[investigationId]/claims/[claimId]/evidence/[evidenceId]/route");
    const blockedRemoval = await removeRoute.DELETE(new Request("http://test", { method: "DELETE" }), params({ ...ids, evidenceId: evidence.id }));
    expect(blockedRemoval.status).toBe(409);

    const reword = await claimRoute.PATCH(json({ statement: "Something else" }, "PATCH"), params(ids));
    expect(reword.status).toBe(409);

    const { DELETE: detach } = await import("@/app/api/investigations/[investigationId]/sources/[sourceArticleId]/route");
    const detachCited = await detach(new Request("http://test", { method: "DELETE" }), params({ investigationId: state.investigation.id, sourceArticleId: uploaded.sourceArticle.id }));
    expect(detachCited.status).toBe(409);

    const board = await state.repository.listClaimsWithEvidence(state.investigation.id);
    expect(board[0].history.map((event) => event.verdict)).toEqual(["confirmed"]);
  });

  it("validates evidence of each kind", async () => {
    const claim = await addClaim("Acme Construction Ltd is registered with CAC.");
    const { POST } = await import("@/app/api/investigations/[investigationId]/claims/[claimId]/evidence/route");
    const ids = params({ investigationId: state.investigation.id, claimId: claim.id });
    expect((await POST(json({ kind: "web", stance: "supports", url: "javascript:alert(1)" }), ids)).status).toBe(400);
    expect((await POST(json({ kind: "note", stance: "supports" }), ids)).status).toBe(400);
    expect((await POST(json({ kind: "source", stance: "supports", sourceArticleId: "not-attached" }), ids)).status).toBe(400);
    expect((await POST(json({ kind: "public_record", stance: "supports", url: "https://search.cac.gov.ng", title: "ACME CONSTRUCTION LIMITED", recordType: "CAC registration" }), ids)).status).toBe(201);
    expect((await POST(json({ kind: "note", stance: "context", note: "Company secretary confirmed by phone on 20 October." }), ids)).status).toBe(201);
  });

  it("imports the plan's claims once and exports a fact-check", async () => {
    const article = await state.repository.createSourceArticle({ ownerUserId: state.user.id, originalUrl: "https://example.ng/story", canonicalUrl: null, title: "Story", publisher: "Example", extractedText: EVIDENCE_TEXT, contentHash: "h", retrievalStatus: "retrieved", retrievedAt: new Date() });
    await state.repository.attachSourceToInvestigation({ investigationId: state.investigation.id, sourceArticleId: article.id, addedByUserId: state.user.id });
    const lead = await state.repository.createLeadVersion({ investigationId: state.investigation.id, sourceArticleId: article.id, status: "approved", content: { primaryLead: "Q?" }, model: null, createdByUserId: state.user.id });
    const assessment = await state.repository.createEvidenceAssessment({ investigationId: state.investigation.id, leadId: lead.id, content: {}, inputSnapshotHash: "s", model: null, createdByUserId: state.user.id });
    await state.repository.createInvestigationPlan({ investigationId: state.investigation.id, leadId: lead.id, evidenceAssessmentId: assessment.id, model: null, createdByUserId: state.user.id, content: {
      knownInformation: [{ claim: "The ministry announced twelve clinics.", status: "reported" }],
      verificationPlan: [{ claimTested: "Acme Construction Ltd received the contract." }],
    } });

    const { POST } = await import("@/app/api/investigations/[investigationId]/claims/import/route");
    const first = await (await POST(new Request("http://test", { method: "POST" }), params({ investigationId: state.investigation.id }))).json();
    expect(first.added).toBe(2);
    const second = await (await POST(new Request("http://test", { method: "POST" }), params({ investigationId: state.investigation.id }))).json();
    expect(second.added).toBe(0);
    expect(second.claims).toHaveLength(2);

    const { GET } = await import("@/app/api/investigations/[investigationId]/claims/export/route");
    const exported = await GET(new Request("http://test"), params({ investigationId: state.investigation.id }));
    expect(exported.headers.get("Content-Type")).toContain("text/markdown");
    expect(exported.headers.get("Content-Disposition")).toContain("fact-check-clinic-payments-");
    const markdown = await exported.text();
    expect(markdown).toContain("The ministry announced twelve clinics.");
    expect(markdown).toContain("| Not yet checked | 2 |");
  });

  it("refuses to import before a plan exists", async () => {
    const { POST } = await import("@/app/api/investigations/[investigationId]/claims/import/route");
    expect((await POST(new Request("http://test", { method: "POST" }), params({ investigationId: state.investigation.id }))).status).toBe(409);
  });
});

describe("public records route", () => {
  it("validates the query and collections, and keeps each lookup", async () => {
    const { GET, POST } = await import("@/app/api/investigations/[investigationId]/records/route");
    const ids = params({ investigationId: state.investigation.id });
    expect((await POST(json({ query: "a", recordTypes: ["procurement"] }), ids)).status).toBe(400);
    expect((await POST(json({ query: "Acme", recordTypes: ["procurement", "bank_accounts"] }), ids)).status).toBe(400);
    const created = await POST(json({ query: "Acme", recordTypes: ["procurement", "company_registry"] }), ids);
    expect(created.status).toBe(201);
    const lookup = (await created.json()).lookup;
    expect(lookup.outcomes.map((outcome: { status: string }) => outcome.status)).toEqual(["not_configured", "needs_registration_number"]);
    const listed = await (await GET(new Request("http://test"), params({ investigationId: state.investigation.id }))).json();
    expect(listed.lookups).toHaveLength(1);
    expect(listed.recordTypes.length).toBeGreaterThan(0);
  });
});
