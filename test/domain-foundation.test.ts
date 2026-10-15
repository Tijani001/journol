import { describe, expect, it, vi } from "vitest";
import { InMemoryJournolRepository } from "@/lib/server/repository";
import { requireInvestigationAccess } from "@/lib/server/authorization";
import { AiOperationService } from "@/lib/server/ai-operations";
import { getOrCreateCurrentUser, setIdentityResolverForTesting } from "@/lib/server/auth";
import { resolveEvidenceAssessmentContext, resolveInvestigationPlanContext, snapshotHash } from "@/lib/server/workflow";

describe("multi-user domain foundation", () => {
  it("maps a verified server identity to an internal user without client input", async () => {
    const repository = new InMemoryJournolRepository();
    setIdentityResolverForTesting(async () => ({ issuer: "https://identity.test", subject: "verified-subject", email: "journalist@example.test" }));
    try {
      const created = await getOrCreateCurrentUser(repository);
      const repeated = await getOrCreateCurrentUser(repository);
      expect(created?.id).toBe(repeated?.id);
      expect(created?.authSubject).toBe("verified-subject");
    } finally {
      setIdentityResolverForTesting(null);
    }
  });

  it("keeps investigations and source articles owned by their creator", async () => {
    const repository = new InMemoryJournolRepository();
    const owner = await repository.createUser({ authIssuer: "test", authSubject: "owner", email: null });
    const outsider = await repository.createUser({ authIssuer: "test", authSubject: "outsider", email: null });
    const investigation = await repository.createInvestigation({ ownerUserId: owner.id, title: "Records review" });
    const article = await repository.createSourceArticle({ ownerUserId: owner.id, originalUrl: "https://example.test/a", canonicalUrl: null, title: null, publisher: null, extractedText: "Reported material", contentHash: "hash", retrievalStatus: "retrieved", retrievedAt: new Date() });
    await repository.attachSourceToInvestigation({ investigationId: investigation.id, sourceArticleId: article.id, addedByUserId: owner.id });

    await expect(requireInvestigationAccess(repository, owner, investigation.id, "editor")).resolves.toEqual(investigation);
    await expect(requireInvestigationAccess(repository, outsider, investigation.id)).rejects.toThrow("INVESTIGATION_ACCESS_DENIED");
  });

  it("hands off only approved lead and matching assessment records", async () => {
    const repository = new InMemoryJournolRepository();
    const user = await repository.createUser({ authIssuer: "test", authSubject: "journalist", email: null });
    const investigation = await repository.createInvestigation({ ownerUserId: user.id, title: "Review" });
    const article = await repository.createSourceArticle({ ownerUserId: user.id, originalUrl: "https://example.test/a", canonicalUrl: null, title: null, publisher: null, extractedText: "Article text", contentHash: "article", retrievalStatus: "retrieved", retrievedAt: new Date() });
    await repository.attachSourceToInvestigation({ investigationId: investigation.id, sourceArticleId: article.id, addedByUserId: user.id });
    const lead = await repository.createLeadVersion({ investigationId: investigation.id, sourceArticleId: article.id, status: "proposed", content: { primaryLead: "Question?" }, model: "test", createdByUserId: user.id });
    await expect(resolveEvidenceAssessmentContext(repository, user, investigation.id, lead.id)).rejects.toThrow("APPROVED_LEAD_NOT_FOUND");
    const approvedLead = await repository.approveLead(lead.id, user.id);
    expect(approvedLead).toMatchObject({
      id: lead.id,
      status: "approved",
      approvedByUserId: user.id,
    });
    expect((await repository.getInvestigation(investigation.id))?.currentLeadId).toBe(lead.id);
    const assessment = await repository.createEvidenceAssessment({ investigationId: investigation.id, leadId: lead.id, content: { approvedLead: "Question?" }, inputSnapshotHash: snapshotHash({ lead: lead.id }), model: "test", createdByUserId: user.id });
    const context = await resolveInvestigationPlanContext(repository, user, investigation.id, assessment.id);
    expect(context.articleText).toBe("Article text");
    expect(context.leadId).toBe(lead.id);
  });

  it("deduplicates AI operations and records outcome usage", async () => {
    const repository = new InMemoryJournolRepository();
    const user = await repository.createUser({ authIssuer: "test", authSubject: "journalist", email: null });
    const investigation = await repository.createInvestigation({ ownerUserId: user.id, title: "Review" });
    const service = new AiOperationService(repository);
    const input = { user, investigationId: investigation.id, stage: "lead_selection" as const, idempotencyKey: "request-1", model: "gpt-test" };
    const first = await service.begin(input);
    const repeated = await service.begin(input);
    expect(first.reused).toBe(false);
    expect(repeated.reused).toBe(true);
    const usage = await service.succeed(first.operation, { inputTokens: 11, outputTokens: 7, estimatedCostMicros: 2 });
    expect(usage.status).toBe("succeeded");
    expect(usage.inputTokens).toBe(11);
  });

  it("allows a failed AI operation to be retried without creating a competing operation", async () => {
    const repository = new InMemoryJournolRepository();
    const user = await repository.createUser({ authIssuer: "test", authSubject: "retry-journalist", email: null });
    const investigation = await repository.createInvestigation({ ownerUserId: user.id, title: "Retry" });
    const service = new AiOperationService(repository);
    const input = { user, investigationId: investigation.id, stage: "evidence_assessment" as const, idempotencyKey: "evidence-retry", model: "gpt-test" };
    const first = await service.begin(input);
    await service.fail(first.operation, "AI_TIMEOUT");
    const retry = await service.begin(input);
    expect(retry).toMatchObject({ reused: false, operation: { id: first.operation.id, status: "pending" } });
    await service.succeed(retry.operation, { inputTokens: 5, outputTokens: 3 });
    const completed = await service.begin(input);
    expect(completed).toMatchObject({ reused: true, operation: { id: first.operation.id, status: "succeeded" } });
  });

  it("reclaims an abandoned pending Deep Research operation after its lease expires", async () => {
    vi.useFakeTimers();
    try {
      const repository = new InMemoryJournolRepository();
      const user = await repository.createUser({ authIssuer: "test", authSubject: "stale-research", email: null });
      const investigation = await repository.createInvestigation({ ownerUserId: user.id, title: "Stale research" });
      const service = new AiOperationService(repository);
      const input = { user, investigationId: investigation.id, stage: "deep_research" as const, idempotencyKey: "deep-research:stale", model: "gpt-test" };
      const first = await service.begin(input);
      await vi.advanceTimersByTimeAsync(121_000);
      const recovered = await service.begin(input);
      expect(recovered).toMatchObject({ reused: false, operation: { id: first.operation.id, status: "pending" } });
    } finally { vi.useRealTimers(); }
  });

  it("allows only one concurrent retry to reclaim a failed operation", async () => {
    const repository = new InMemoryJournolRepository();
    const user = await repository.createUser({ authIssuer: "test", authSubject: "concurrent-retry", email: null });
    const investigation = await repository.createInvestigation({ ownerUserId: user.id, title: "Concurrent retry" });
    const service = new AiOperationService(repository);
    const input = { user, investigationId: investigation.id, stage: "investigation_plan" as const, idempotencyKey: "plan-retry", model: "gpt-test" };
    const first = await service.begin(input);
    await service.fail(first.operation, "AI_PROVIDER_FAILURE");

    const [winner, follower] = await Promise.all([service.begin(input), service.begin(input)]);
    expect(winner.operation.id).toBe(first.operation.id);
    expect(follower.operation.id).toBe(first.operation.id);
    expect([winner, follower].filter((attempt) => !attempt.reused)).toHaveLength(1);
    expect([winner, follower].filter((attempt) => attempt.reused)[0]?.operation.status).toBe("pending");
  });

  it("keeps workflow persistence separate from an explicit saved-library entry", async () => {
    const repository = new InMemoryJournolRepository();
    const owner = await repository.createUser({ authIssuer: "test", authSubject: "owner", email: null });
    const other = await repository.createUser({ authIssuer: "test", authSubject: "other", email: null });
    const investigation = await repository.createInvestigation({ ownerUserId: owner.id, title: "Saved work" });
    expect(await repository.listSavedInvestigationsForUser(owner.id)).toEqual([]);
    await repository.saveInvestigationForUser(owner.id, investigation.id);
    await repository.saveInvestigationForUser(owner.id, investigation.id);
    expect(await repository.listSavedInvestigationsForUser(owner.id)).toHaveLength(1);
    await expect(repository.isInvestigationSavedForUser(owner.id, investigation.id)).resolves.toBe(true);
    expect(await repository.listSavedInvestigationsForUser(other.id)).toEqual([]);
    await repository.unsaveInvestigationForUser(owner.id, investigation.id);
    await expect(repository.isInvestigationSavedForUser(owner.id, investigation.id)).resolves.toBe(false);
    expect(await repository.getInvestigation(investigation.id)).toMatchObject({ id: investigation.id });
  });

  it("keeps persisted plan actions ordered for a reopened investigation", async () => {
    const repository = new InMemoryJournolRepository();
    const user = await repository.createUser({ authIssuer: "test", authSubject: "journalist", email: null });
    const investigation = await repository.createInvestigation({ ownerUserId: user.id, title: "Review" });
    const article = await repository.createSourceArticle({ ownerUserId: user.id, originalUrl: "https://example.test/a", canonicalUrl: null, title: null, publisher: null, extractedText: "Article", contentHash: "hash", retrievalStatus: "retrieved", retrievedAt: new Date() });
    await repository.attachSourceToInvestigation({ investigationId: investigation.id, sourceArticleId: article.id, addedByUserId: user.id });
    const lead = await repository.createLeadVersion({ investigationId: investigation.id, sourceArticleId: article.id, status: "proposed", content: { primaryLead: "Question?" }, model: null, createdByUserId: user.id });
    await repository.approveLead(lead.id, user.id);
    const assessment = await repository.createEvidenceAssessment({ investigationId: investigation.id, leadId: lead.id, content: { approvedLead: "Question?" }, inputSnapshotHash: "assessment", model: null, createdByUserId: user.id });
    const plan = await repository.createInvestigationPlan({ investigationId: investigation.id, leadId: lead.id, evidenceAssessmentId: assessment.id, content: { approvedLead: "Question?" }, model: null, createdByUserId: user.id });
    await repository.createInvestigationAction({ investigationPlanId: plan.id, position: 2, status: "not_started", questionOrClaim: "Second", evidenceSought: "Record", possibleSource: "Source", verificationMethod: "Check", limitations: "None", createdByUserId: user.id });
    await repository.createInvestigationAction({ investigationPlanId: plan.id, position: 1, status: "not_started", questionOrClaim: "First", evidenceSought: "Record", possibleSource: "Source", verificationMethod: "Check", limitations: "None", createdByUserId: user.id });

    const reopened = await repository.getInvestigation(investigation.id);
    expect(reopened?.currentLeadId).toBe(lead.id);
    expect(reopened?.currentEvidenceAssessmentId).toBe(assessment.id);
    expect(reopened?.currentPlanId).toBe(plan.id);
    await expect(repository.listInvestigationActions(plan.id)).resolves.toMatchObject([{ position: 1 }, { position: 2 }]);
    // Background workflow persistence never creates a library relationship.
    await expect(repository.listSavedInvestigationsForUser(user.id)).resolves.toEqual([]);
  });

  it("persists a plan and its verification actions through the atomic repository contract", async () => {
    const repository = new InMemoryJournolRepository();
    const user = await repository.createUser({ authIssuer: "test", authSubject: "atomic-plan", email: null });
    const investigation = await repository.createInvestigation({ ownerUserId: user.id, title: "Atomic plan" });
    const article = await repository.createSourceArticle({ ownerUserId: user.id, originalUrl: "https://example.test/atomic", canonicalUrl: null, title: null, publisher: null, extractedText: "Article", contentHash: "atomic", retrievalStatus: "retrieved", retrievedAt: new Date() });
    await repository.attachSourceToInvestigation({ investigationId: investigation.id, sourceArticleId: article.id, addedByUserId: user.id });
    const lead = await repository.createLeadVersion({ investigationId: investigation.id, sourceArticleId: article.id, status: "proposed", content: { primaryLead: "Question?" }, model: null, createdByUserId: user.id });
    await repository.approveLead(lead.id, user.id);
    const assessment = await repository.createEvidenceAssessment({ investigationId: investigation.id, leadId: lead.id, content: { approvedLead: "Question?" }, inputSnapshotHash: "atomic-assessment", model: null, createdByUserId: user.id });

    const result = await repository.createInvestigationPlanWithActions({
      plan: { investigationId: investigation.id, leadId: lead.id, evidenceAssessmentId: assessment.id, content: { approvedLead: "Question?" }, model: null, createdByUserId: user.id },
      actions: [{ position: 1, status: "not_started", questionOrClaim: "Question", evidenceSought: "Register", possibleSource: "Agency", verificationMethod: "Inspect", limitations: "Incomplete records", createdByUserId: user.id }],
    });

    expect(result.actions).toHaveLength(1);
    expect((await repository.getInvestigation(investigation.id))?.currentPlanId).toBe(result.plan.id);
    await expect(repository.listInvestigationActions(result.plan.id)).resolves.toHaveLength(1);
  });

  it("persists Deep Research separately from plans and reuses its input snapshot", async () => {
    const repository = new InMemoryJournolRepository();
    const user = await repository.createUser({ authIssuer: "test", authSubject: "deep-research", email: null });
    const investigation = await repository.createInvestigation({ ownerUserId: user.id, title: "Research" });
    const article = await repository.createSourceArticle({ ownerUserId: user.id, originalUrl: "https://example.test/research", canonicalUrl: null, title: "Report", publisher: "Example", extractedText: "Stored source", contentHash: "research", retrievalStatus: "retrieved", retrievedAt: new Date() });
    await repository.attachSourceToInvestigation({ investigationId: investigation.id, sourceArticleId: article.id, addedByUserId: user.id });
    const report = await repository.createDeepResearchReport({ investigationId: investigation.id, sourceArticleId: article.id, instructions: "Find earlier cases", inputSnapshotHash: "snapshot", researchPlan: { queries: ["Report previous incidents"] }, report: { executiveSummary: { text: "Context", sourceIds: ["source-1"] } }, sources: [{ id: "source-1", title: "Record", url: "https://records.example/a" }], model: "gpt-test", createdByUserId: user.id });

    expect((await repository.getLatestDeepResearchReport(investigation.id))?.id).toBe(report.id);
    expect((await repository.getDeepResearchReportForSnapshot(investigation.id, article.id, "snapshot"))?.id).toBe(report.id);
    expect(await repository.listSavedInvestigationsForUser(user.id)).toEqual([]);
  });

  it("keeps versioned research persisted but out of Saved Research until explicitly bookmarked", async () => {
    const repository = new InMemoryJournolRepository();
    const owner = await repository.createUser({ authIssuer: "test", authSubject: "research-owner", email: null });
    const other = await repository.createUser({ authIssuer: "test", authSubject: "research-other", email: null });
    const investigation = await repository.createInvestigation({ ownerUserId: owner.id, title: "Research library" });
    const article = await repository.createSourceArticle({ ownerUserId: owner.id, originalUrl: "https://example.test/report", canonicalUrl: null, title: "Report", publisher: null, extractedText: "Source", contentHash: "report", retrievalStatus: "retrieved", retrievedAt: new Date() });
    const first = await repository.createDeepResearchReport({ investigationId: investigation.id, sourceArticleId: article.id, instructions: null, inputSnapshotHash: "v1", researchPlan: {}, report: {}, sources: [], model: "test", createdByUserId: owner.id });
    const second = await repository.createDeepResearchReport({ investigationId: investigation.id, sourceArticleId: article.id, instructions: "Update", inputSnapshotHash: "v2", researchPlan: {}, report: {}, sources: [], model: "test", createdByUserId: owner.id });

    expect(await repository.listSavedDeepResearchReportsForUser(owner.id)).toEqual([]);
    await repository.saveDeepResearchReportForUser(owner.id, first.id);
    await repository.saveDeepResearchReportForUser(owner.id, first.id);
    expect(await repository.listSavedDeepResearchReportsForUser(owner.id)).toMatchObject([{ report: { id: first.id, version: 1 } }]);
    expect(await repository.getDeepResearchReport(second.id)).toMatchObject({ id: second.id, version: 2 });
    expect(await repository.listSavedDeepResearchReportsForUser(other.id)).toEqual([]);
    await repository.unsaveDeepResearchReportForUser(owner.id, first.id);
    expect(await repository.getDeepResearchReport(first.id)).toMatchObject({ id: first.id });
    expect(await repository.listSavedDeepResearchReportsForUser(owner.id)).toEqual([]);
  });
});
