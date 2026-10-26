import { randomUUID } from "node:crypto";
import type {
  AiOperation, AiOperationStage, AiOperationStatus, ClaimEvidence, ClaimVerdict, ClaimVerdictEvent, ClaimWithEvidence,
  EvidenceAssessment, DeepResearchReport, Id, Investigation, InvestigationAction, InvestigationClaim, InvestigationPlan,
  InvestigationSourceSummary, InvestigativeLead, ProcurementAward, PublicRecordLookup, SavedStory, SourceArticle,
  UsageRecord, UsageStatus, User,
} from "@/lib/domain/types";

export type CreateUserInput = Pick<User, "authIssuer" | "authSubject" | "email"> & Partial<Pick<User, "role">>;
export type CreateInvestigationInput = Pick<Investigation, "ownerUserId" | "title">;
type SourceDocumentFields = "sourceKind" | "fileName" | "mimeType" | "byteSize" | "pageCount" | "extractionMethod" | "extractionNotes" | "textTruncated";
/** Document metadata is optional so web-article callers keep their existing shape. */
export type CreateSourceArticleInput = Omit<SourceArticle, "id" | "createdAt" | "updatedAt" | "publishedAt" | SourceDocumentFields>
  & Partial<Pick<SourceArticle, SourceDocumentFields>>
  & { publishedAt?: Date | null };
export type SaveStoryInput = Pick<SavedStory, "userId" | "canonicalUrl" | "originalUrl" | "title" | "publisher" | "publishedAt" | "description">;
export type CreateLeadInput = Omit<InvestigativeLead, "id" | "version" | "createdAt" | "updatedAt" | "approvedByUserId" | "approvedAt">;
export type CreateEvidenceAssessmentInput = Omit<EvidenceAssessment, "id" | "version" | "createdAt" | "updatedAt">;
export type CreateInvestigationPlanInput = Omit<InvestigationPlan, "id" | "version" | "createdAt" | "updatedAt">;
export type CreateDeepResearchReportInput = Omit<DeepResearchReport, "id" | "version" | "createdAt" | "updatedAt">;
export type CreateActionInput = Omit<InvestigationAction, "id" | "createdAt" | "updatedAt">;
export type CreatePlanWithActionsInput = {
  plan: CreateInvestigationPlanInput;
  actions: Array<Omit<CreateActionInput, "investigationPlanId">>;
};
export type CreateAiOperationInput = Omit<AiOperation, "id" | "status" | "providerRequestId" | "errorCode" | "createdAt" | "updatedAt">;
export type RecordUsageInput = Omit<UsageRecord, "id" | "createdAt" | "updatedAt">;
export type CreateClaimInput = Pick<InvestigationClaim, "investigationId" | "statement" | "origin" | "originKey" | "createdByUserId">;
export type SetClaimVerdictInput = { claimId: Id; verdict: ClaimVerdict; rationale: string | null; setByUserId: Id };
export type CreateClaimEvidenceInput = Omit<ClaimEvidence, "id" | "createdAt" | "updatedAt">;
export type CreatePublicRecordLookupInput = Omit<PublicRecordLookup, "id" | "createdAt">;
/** Where a source is relied on; a source in use cannot be detached. */
export type SourceUsage = { lead: boolean; deepResearch: boolean; claimEvidence: boolean };
export type ProcurementIngestionSummary = { finishedAt: Date; awardsUpserted: number; sourceFile: string };

/**
 * The only persistence contract used by authorization and future route code.
 * PostgreSQL/Drizzle will implement this interface; no route depends on a
 * database client directly.
 */
export interface JournolRepository {
  getUserByIdentity(issuer: string, subject: string): Promise<User | null>;
  createUser(input: CreateUserInput): Promise<User>;
  getInvestigation(id: Id): Promise<Investigation | null>;
  listInvestigationsForOwner(ownerUserId: Id): Promise<Investigation[]>;
  createInvestigation(input: CreateInvestigationInput): Promise<Investigation>;
  saveInvestigationForUser(userId: Id, investigationId: Id): Promise<Date>;
  unsaveInvestigationForUser(userId: Id, investigationId: Id): Promise<boolean>;
  listSavedInvestigationsForUser(userId: Id): Promise<Array<{ investigation: Investigation; savedAt: Date }>>;
  isInvestigationSavedForUser(userId: Id, investigationId: Id): Promise<boolean>;
  saveStoryForUser(input: SaveStoryInput): Promise<SavedStory>;
  unsaveStoryForUser(userId: Id, savedStoryId: Id): Promise<boolean>;
  listSavedStoriesForUser(userId: Id): Promise<SavedStory[]>;
  getSourceArticle(id: Id): Promise<SourceArticle | null>;
  createSourceArticle(input: CreateSourceArticleInput): Promise<SourceArticle>;
  attachSourceToInvestigation(input: { investigationId: Id; sourceArticleId: Id; addedByUserId: Id }): Promise<void>;
  investigationHasSource(investigationId: Id, sourceArticleId: Id): Promise<boolean>;
  listInvestigationSources(investigationId: Id): Promise<InvestigationSourceSummary[]>;
  /** Finds a source this account already stored with identical text, to avoid duplicates. */
  findOwnedSourceByContentHash(ownerUserId: Id, contentHash: string, sourceKind: SourceArticle["sourceKind"]): Promise<SourceArticle | null>;
  getSourceUsage(investigationId: Id, sourceArticleId: Id): Promise<SourceUsage>;
  detachSourceFromInvestigation(investigationId: Id, sourceArticleId: Id): Promise<boolean>;
  createLeadVersion(input: CreateLeadInput): Promise<InvestigativeLead>;
  getLatestLeadForSource(investigationId: Id, sourceArticleId: Id): Promise<InvestigativeLead | null>;
  getLatestLeadForInvestigation(investigationId: Id): Promise<InvestigativeLead | null>;
  getLead(id: Id): Promise<InvestigativeLead | null>;
  approveLead(id: Id, approvedByUserId: Id): Promise<InvestigativeLead | null>;
  rejectLead(id: Id): Promise<InvestigativeLead | null>;
  createEvidenceAssessment(input: CreateEvidenceAssessmentInput): Promise<EvidenceAssessment>;
  getEvidenceAssessment(id: Id): Promise<EvidenceAssessment | null>;
  createInvestigationPlan(input: CreateInvestigationPlanInput): Promise<InvestigationPlan>;
  /** Persists a valid plan and its ordered actions atomically in production. */
  createInvestigationPlanWithActions(input: CreatePlanWithActionsInput): Promise<{ plan: InvestigationPlan; actions: InvestigationAction[] }>;
  getInvestigationPlan(id: Id): Promise<InvestigationPlan | null>;
  createDeepResearchReport(input: CreateDeepResearchReportInput): Promise<DeepResearchReport>;
  getDeepResearchReport(id: Id): Promise<DeepResearchReport | null>;
  getLatestDeepResearchReport(investigationId: Id): Promise<DeepResearchReport | null>;
  listDeepResearchReportsForInvestigation(investigationId: Id): Promise<DeepResearchReport[]>;
  getDeepResearchReportForSnapshot(investigationId: Id, sourceArticleId: Id, inputSnapshotHash: string): Promise<DeepResearchReport | null>;
  saveDeepResearchReportForUser(userId: Id, reportId: Id): Promise<Date>;
  unsaveDeepResearchReportForUser(userId: Id, reportId: Id): Promise<boolean>;
  isDeepResearchReportSavedForUser(userId: Id, reportId: Id): Promise<boolean>;
  listSavedDeepResearchReportsForUser(userId: Id): Promise<Array<{ report: DeepResearchReport; savedAt: Date }>>;
  createInvestigationAction(input: CreateActionInput): Promise<InvestigationAction>;
  listInvestigationActions(investigationPlanId: Id): Promise<InvestigationAction[]>;
  findAiOperation(userId: Id, idempotencyKey: string): Promise<AiOperation | null>;
  createAiOperation(input: CreateAiOperationInput): Promise<AiOperation>;
  /** Atomically claims a previously failed operation for one retry attempt. */
  restartFailedAiOperation(operationId: Id): Promise<AiOperation | null>;
  /** Atomically reclaims an abandoned pending operation after its deadline. */
  restartStalePendingAiOperation(operationId: Id, staleBefore: Date): Promise<AiOperation | null>;
  finishAiOperation(input: { operationId: Id; status: Exclude<AiOperationStatus, "pending">; providerRequestId?: string; errorCode?: string }): Promise<AiOperation | null>;
  recordUsage(input: RecordUsageInput): Promise<UsageRecord>;
  listClaimsWithEvidence(investigationId: Id): Promise<ClaimWithEvidence[]>;
  getClaim(id: Id): Promise<InvestigationClaim | null>;
  createClaim(input: CreateClaimInput): Promise<InvestigationClaim>;
  /** Adds claims whose originKey is not yet on the investigation's board; returns only those added. */
  createClaimsIfAbsent(inputs: CreateClaimInput[]): Promise<InvestigationClaim[]>;
  updateClaimStatement(id: Id, statement: string): Promise<InvestigationClaim | null>;
  /** Records the verdict and appends it to the claim's history atomically. */
  setClaimVerdict(input: SetClaimVerdictInput): Promise<InvestigationClaim | null>;
  deleteClaim(id: Id): Promise<boolean>;
  listClaimEvidence(claimId: Id): Promise<ClaimEvidence[]>;
  getClaimEvidence(id: Id): Promise<ClaimEvidence | null>;
  addClaimEvidence(input: CreateClaimEvidenceInput): Promise<ClaimEvidence>;
  deleteClaimEvidence(id: Id): Promise<boolean>;
  createPublicRecordLookup(input: CreatePublicRecordLookupInput): Promise<PublicRecordLookup>;
  listPublicRecordLookups(investigationId: Id, limit: number): Promise<PublicRecordLookup[]>;
  searchProcurementAwards(query: string, limit: number): Promise<ProcurementAward[]>;
  getLatestProcurementIngestion(publication: string): Promise<ProcurementIngestionSummary | null>;
}

/**
 * Non-production adapter for unit tests and local architecture exercises.
 * It is deliberately not exported as an application singleton and is not a
 * replacement for PostgreSQL persistence.
 */
export class InMemoryJournolRepository implements JournolRepository {
  private readonly users = new Map<Id, User>();
  private readonly investigations = new Map<Id, Investigation>();
  private readonly savedInvestigations = new Map<string, Date>();
  private readonly savedStories = new Map<Id, SavedStory>();
  private readonly articles = new Map<Id, SourceArticle>();
  private readonly attachments = new Map<string, { addedByUserId: Id; createdAt: Date }>();
  private readonly leads = new Map<Id, InvestigativeLead>();
  private readonly assessments = new Map<Id, EvidenceAssessment>();
  private readonly plans = new Map<Id, InvestigationPlan>();
  private readonly researchReports = new Map<Id, DeepResearchReport>();
  private readonly savedResearchReports = new Map<string, Date>();
  private readonly actions = new Map<Id, InvestigationAction>();
  private readonly operations = new Map<Id, AiOperation>();
  private readonly usage = new Map<Id, UsageRecord>();
  private readonly claims = new Map<Id, InvestigationClaim>();
  private readonly claimEvidence = new Map<Id, ClaimEvidence>();
  private readonly verdictEvents = new Map<Id, ClaimVerdictEvent>();
  private readonly recordLookups = new Map<Id, PublicRecordLookup>();
  /** Test seam: procurement awards are loaded by an ingestion job in production. */
  readonly procurementAwards: ProcurementAward[] = [];

  async getUserByIdentity(issuer: string, subject: string) {
    return [...this.users.values()].find((user) => user.authIssuer === issuer && user.authSubject === subject) ?? null;
  }

  async createUser(input: CreateUserInput) {
    const now = new Date();
    const user: User = { id: randomUUID(), role: "journalist", ...input, createdAt: now, updatedAt: now };
    this.users.set(user.id, user);
    return user;
  }

  async getInvestigation(id: Id) { return this.investigations.get(id) ?? null; }

  async listInvestigationsForOwner(ownerUserId: Id) {
    return [...this.investigations.values()]
      .filter((investigation) => investigation.ownerUserId === ownerUserId)
      .sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime());
  }

  async createInvestigation(input: CreateInvestigationInput) {
    const now = new Date();
    const investigation: Investigation = {
      id: randomUUID(), ...input, status: "active", currentLeadId: null,
      currentEvidenceAssessmentId: null, currentPlanId: null, createdAt: now, updatedAt: now,
    };
    this.investigations.set(investigation.id, investigation);
    return investigation;
  }

  async saveInvestigationForUser(userId: Id, investigationId: Id) { const key = `${userId}:${investigationId}`; const savedAt = this.savedInvestigations.get(key) ?? new Date(); this.savedInvestigations.set(key, savedAt); return savedAt; }
  async unsaveInvestigationForUser(userId: Id, investigationId: Id) { return this.savedInvestigations.delete(`${userId}:${investigationId}`); }
  async listSavedInvestigationsForUser(userId: Id) { return [...this.savedInvestigations.entries()].filter(([key]) => key.startsWith(`${userId}:`)).flatMap(([key, savedAt]) => { const investigation = this.investigations.get(key.slice(userId.length + 1)); return investigation ? [{ investigation, savedAt }] : []; }).sort((a, b) => b.savedAt.getTime() - a.savedAt.getTime()); }
  async isInvestigationSavedForUser(userId: Id, investigationId: Id) { return this.savedInvestigations.has(`${userId}:${investigationId}`); }

  async saveStoryForUser(input: SaveStoryInput) {
    const existing = [...this.savedStories.values()].find((story) => story.userId === input.userId && story.canonicalUrl === input.canonicalUrl);
    if (existing) return existing;
    const now = new Date();
    const story: SavedStory = { id: randomUUID(), ...input, savedAt: now, createdAt: now, updatedAt: now };
    this.savedStories.set(story.id, story);
    return story;
  }
  async unsaveStoryForUser(userId: Id, savedStoryId: Id) {
    const story = this.savedStories.get(savedStoryId);
    if (!story || story.userId !== userId) return false;
    return this.savedStories.delete(savedStoryId);
  }
  async listSavedStoriesForUser(userId: Id) {
    return [...this.savedStories.values()]
      .filter((story) => story.userId === userId)
      .sort((a, b) => b.savedAt.getTime() - a.savedAt.getTime());
  }

  async getSourceArticle(id: Id) { return this.articles.get(id) ?? null; }

  async createSourceArticle(input: CreateSourceArticleInput) {
    const now = new Date();
    const article: SourceArticle = {
      id: randomUUID(), sourceKind: "web_article", fileName: null, mimeType: null, byteSize: null, pageCount: null,
      extractionMethod: null, extractionNotes: [], textTruncated: false,
      ...input, publishedAt: input.publishedAt ?? null, createdAt: now, updatedAt: now,
    };
    this.articles.set(article.id, article);
    return article;
  }

  async attachSourceToInvestigation({ investigationId, sourceArticleId, addedByUserId }: { investigationId: Id; sourceArticleId: Id; addedByUserId: Id }) {
    const key = `${investigationId}:${sourceArticleId}`;
    if (!this.attachments.has(key)) this.attachments.set(key, { addedByUserId, createdAt: new Date() });
  }

  async investigationHasSource(investigationId: Id, sourceArticleId: Id) {
    return this.attachments.has(`${investigationId}:${sourceArticleId}`);
  }

  async listInvestigationSources(investigationId: Id) {
    const summaries: InvestigationSourceSummary[] = [];
    for (const [key, attachment] of this.attachments) {
      if (!key.startsWith(`${investigationId}:`)) continue;
      const article = this.articles.get(key.slice(investigationId.length + 1));
      if (article) summaries.push(sourceSummary(article, attachment.addedByUserId, attachment.createdAt));
    }
    return summaries.sort((a, b) => a.addedAt.getTime() - b.addedAt.getTime());
  }

  async findOwnedSourceByContentHash(ownerUserId: Id, contentHash: string, sourceKind: SourceArticle["sourceKind"]) {
    return [...this.articles.values()].find((article) => article.ownerUserId === ownerUserId && article.contentHash === contentHash && article.sourceKind === sourceKind) ?? null;
  }

  async getSourceUsage(investigationId: Id, sourceArticleId: Id): Promise<SourceUsage> {
    const claimIds = new Set([...this.claims.values()].filter((claim) => claim.investigationId === investigationId).map((claim) => claim.id));
    return {
      lead: [...this.leads.values()].some((lead) => lead.investigationId === investigationId && lead.sourceArticleId === sourceArticleId),
      deepResearch: [...this.researchReports.values()].some((report) => report.investigationId === investigationId && report.sourceArticleId === sourceArticleId),
      claimEvidence: [...this.claimEvidence.values()].some((item) => claimIds.has(item.claimId) && item.sourceArticleId === sourceArticleId),
    };
  }

  async detachSourceFromInvestigation(investigationId: Id, sourceArticleId: Id) {
    return this.attachments.delete(`${investigationId}:${sourceArticleId}`);
  }

  async createLeadVersion(input: CreateLeadInput) {
    const now = new Date();
    const version = [...this.leads.values()].filter((lead) => lead.investigationId === input.investigationId).length + 1;
    const lead: InvestigativeLead = { id: randomUUID(), ...input, version, approvedByUserId: null, approvedAt: null, createdAt: now, updatedAt: now };
    this.leads.set(lead.id, lead);
    return lead;
  }

  async getLatestLeadForSource(investigationId: Id, sourceArticleId: Id) {
    return (
      [...this.leads.values()]
        .filter(
          (lead) =>
            lead.investigationId === investigationId &&
            lead.sourceArticleId === sourceArticleId,
        )
        .sort((a, b) => b.version - a.version)[0] ?? null
    );
  }

  async getLatestLeadForInvestigation(investigationId: Id) {
    return [...this.leads.values()].filter((lead) => lead.investigationId === investigationId).sort((a, b) => b.version - a.version)[0] ?? null;
  }

  async getLead(id: Id) { return this.leads.get(id) ?? null; }

  async approveLead(id: Id, approvedByUserId: Id) {
    const lead = this.leads.get(id);
    if (!lead) return null;
    const now = new Date();
    const updated = { ...lead, status: "approved" as const, approvedByUserId, approvedAt: now, updatedAt: now };
    this.leads.set(id, updated);
    const investigation = this.investigations.get(lead.investigationId);
    if (investigation) this.investigations.set(investigation.id, { ...investigation, currentLeadId: id, updatedAt: now });
    return updated;
  }

  async rejectLead(id: Id) {
    const lead = this.leads.get(id);
    if (!lead) return null;
    const updated = { ...lead, status: "rejected" as const, updatedAt: new Date() };
    this.leads.set(id, updated);
    return updated;
  }

  async createEvidenceAssessment(input: CreateEvidenceAssessmentInput) {
    const now = new Date();
    const version = [...this.assessments.values()].filter((item) => item.leadId === input.leadId).length + 1;
    const assessment: EvidenceAssessment = { id: randomUUID(), ...input, version, createdAt: now, updatedAt: now };
    this.assessments.set(assessment.id, assessment);
    const investigation = this.investigations.get(input.investigationId);
    if (investigation) this.investigations.set(investigation.id, { ...investigation, currentEvidenceAssessmentId: assessment.id, updatedAt: now });
    return assessment;
  }

  async getEvidenceAssessment(id: Id) { return this.assessments.get(id) ?? null; }

  async createInvestigationPlan(input: CreateInvestigationPlanInput) {
    const now = new Date();
    const version = [...this.plans.values()].filter((item) => item.investigationId === input.investigationId).length + 1;
    const plan: InvestigationPlan = { id: randomUUID(), ...input, version, createdAt: now, updatedAt: now };
    this.plans.set(plan.id, plan);
    const investigation = this.investigations.get(input.investigationId);
    if (investigation) this.investigations.set(investigation.id, { ...investigation, currentPlanId: plan.id, updatedAt: now });
    return plan;
  }

  async createInvestigationPlanWithActions(input: CreatePlanWithActionsInput) {
    const plan = await this.createInvestigationPlan(input.plan);
    const actions = await Promise.all(
      input.actions.map((action) => this.createInvestigationAction({ ...action, investigationPlanId: plan.id })),
    );
    return { plan, actions: actions.sort((a, b) => a.position - b.position) };
  }

  async getInvestigationPlan(id: Id) { return this.plans.get(id) ?? null; }

  async createDeepResearchReport(input: CreateDeepResearchReportInput) {
    const now = new Date();
    const version = [...this.researchReports.values()].filter((report) => report.investigationId === input.investigationId).length + 1;
    const report: DeepResearchReport = { id: randomUUID(), ...input, version, createdAt: now, updatedAt: now };
    this.researchReports.set(report.id, report);
    return report;
  }

  async getLatestDeepResearchReport(investigationId: Id) {
    return [...this.researchReports.values()].filter((report) => report.investigationId === investigationId).sort((a, b) => b.version - a.version)[0] ?? null;
  }

  async getDeepResearchReport(id: Id) { return this.researchReports.get(id) ?? null; }

  async listDeepResearchReportsForInvestigation(investigationId: Id) {
    return [...this.researchReports.values()]
      .filter((report) => report.investigationId === investigationId)
      .sort((a, b) => b.version - a.version);
  }

  async getDeepResearchReportForSnapshot(investigationId: Id, sourceArticleId: Id, inputSnapshotHash: string) {
    return [...this.researchReports.values()].find((report) => report.investigationId === investigationId && report.sourceArticleId === sourceArticleId && report.inputSnapshotHash === inputSnapshotHash) ?? null;
  }

  async saveDeepResearchReportForUser(userId: Id, reportId: Id) {
    const key = `${userId}:${reportId}`;
    const savedAt = this.savedResearchReports.get(key) ?? new Date();
    this.savedResearchReports.set(key, savedAt);
    return savedAt;
  }

  async unsaveDeepResearchReportForUser(userId: Id, reportId: Id) {
    return this.savedResearchReports.delete(`${userId}:${reportId}`);
  }

  async isDeepResearchReportSavedForUser(userId: Id, reportId: Id) {
    return this.savedResearchReports.has(`${userId}:${reportId}`);
  }

  async listSavedDeepResearchReportsForUser(userId: Id) {
    return [...this.savedResearchReports.entries()]
      .filter(([key]) => key.startsWith(`${userId}:`))
      .flatMap(([key, savedAt]) => {
        const report = this.researchReports.get(key.slice(userId.length + 1));
        return report ? [{ report, savedAt }] : [];
      })
      .sort((a, b) => b.savedAt.getTime() - a.savedAt.getTime());
  }

  async createInvestigationAction(input: CreateActionInput) {
    const now = new Date();
    const action: InvestigationAction = { id: randomUUID(), ...input, createdAt: now, updatedAt: now };
    this.actions.set(action.id, action);
    return action;
  }

  async listInvestigationActions(investigationPlanId: Id) {
    return [...this.actions.values()]
      .filter((action) => action.investigationPlanId === investigationPlanId)
      .sort((a, b) => a.position - b.position);
  }

  async findAiOperation(userId: Id, idempotencyKey: string) {
    return [...this.operations.values()].find((operation) => operation.userId === userId && operation.idempotencyKey === idempotencyKey) ?? null;
  }

  async createAiOperation(input: CreateAiOperationInput) {
    const now = new Date();
    const operation: AiOperation = { id: randomUUID(), ...input, status: "pending", providerRequestId: null, errorCode: null, createdAt: now, updatedAt: now };
    this.operations.set(operation.id, operation);
    return operation;
  }

  async restartFailedAiOperation(operationId: Id) {
    const operation = this.operations.get(operationId);
    if (!operation || operation.status !== "failed") return null;
    const restarted: AiOperation = {
      ...operation,
      status: "pending",
      errorCode: null,
      providerRequestId: null,
      updatedAt: new Date(),
    };
    this.operations.set(operationId, restarted);
    return restarted;
  }

  async restartStalePendingAiOperation(operationId: Id, staleBefore: Date) {
    const operation = this.operations.get(operationId);
    if (!operation || operation.status !== "pending" || operation.updatedAt >= staleBefore) return null;
    const restarted: AiOperation = {
      ...operation,
      errorCode: null,
      providerRequestId: null,
      updatedAt: new Date(),
    };
    this.operations.set(operationId, restarted);
    return restarted;
  }

  async finishAiOperation({ operationId, status, providerRequestId, errorCode }: { operationId: Id; status: Exclude<AiOperationStatus, "pending">; providerRequestId?: string; errorCode?: string }) {
    const operation = this.operations.get(operationId);
    if (!operation) return null;
    const updated: AiOperation = { ...operation, status, providerRequestId: providerRequestId ?? operation.providerRequestId, errorCode: errorCode ?? operation.errorCode, updatedAt: new Date() };
    this.operations.set(operationId, updated);
    return updated;
  }

  async recordUsage(input: RecordUsageInput) {
    const now = new Date();
    const record: UsageRecord = { id: randomUUID(), ...input, createdAt: now, updatedAt: now };
    this.usage.set(record.id, record);
    return record;
  }

  async listClaimsWithEvidence(investigationId: Id) {
    return [...this.claims.values()]
      .filter((claim) => claim.investigationId === investigationId)
      .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime())
      .map((claim) => ({
        ...claim,
        evidence: [...this.claimEvidence.values()].filter((item) => item.claimId === claim.id).sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime()),
        history: [...this.verdictEvents.values()].filter((event) => event.claimId === claim.id).sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime()),
      }));
  }

  async getClaim(id: Id) { return this.claims.get(id) ?? null; }

  async createClaim(input: CreateClaimInput) {
    if (input.originKey && [...this.claims.values()].some((claim) => claim.investigationId === input.investigationId && claim.originKey === input.originKey)) {
      throw new Error("CLAIM_ORIGIN_KEY_EXISTS");
    }
    const now = new Date();
    const claim: InvestigationClaim = {
      id: randomUUID(), ...input, verdict: "unverified", verdictRationale: null, verdictSetByUserId: null, verdictSetAt: null, createdAt: now, updatedAt: now,
    };
    this.claims.set(claim.id, claim);
    return claim;
  }

  async createClaimsIfAbsent(inputs: CreateClaimInput[]) {
    const created: InvestigationClaim[] = [];
    for (const input of inputs) {
      const exists = input.originKey && [...this.claims.values()].some((claim) => claim.investigationId === input.investigationId && claim.originKey === input.originKey);
      if (!exists) created.push(await this.createClaim(input));
    }
    return created;
  }

  async updateClaimStatement(id: Id, statement: string) {
    const claim = this.claims.get(id);
    if (!claim) return null;
    const updated = { ...claim, statement, updatedAt: new Date() };
    this.claims.set(id, updated);
    return updated;
  }

  async setClaimVerdict(input: SetClaimVerdictInput) {
    const claim = this.claims.get(input.claimId);
    if (!claim) return null;
    const now = new Date();
    const updated: InvestigationClaim = { ...claim, verdict: input.verdict, verdictRationale: input.rationale, verdictSetByUserId: input.setByUserId, verdictSetAt: now, updatedAt: now };
    this.claims.set(claim.id, updated);
    const event: ClaimVerdictEvent = { id: randomUUID(), claimId: claim.id, verdict: input.verdict, rationale: input.rationale, setByUserId: input.setByUserId, createdAt: now };
    this.verdictEvents.set(event.id, event);
    return updated;
  }

  async deleteClaim(id: Id) {
    for (const [evidenceId, item] of this.claimEvidence) if (item.claimId === id) this.claimEvidence.delete(evidenceId);
    for (const [eventId, event] of this.verdictEvents) if (event.claimId === id) this.verdictEvents.delete(eventId);
    return this.claims.delete(id);
  }

  async listClaimEvidence(claimId: Id) {
    return [...this.claimEvidence.values()].filter((item) => item.claimId === claimId).sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
  }

  async getClaimEvidence(id: Id) { return this.claimEvidence.get(id) ?? null; }

  async addClaimEvidence(input: CreateClaimEvidenceInput) {
    const now = new Date();
    const item: ClaimEvidence = { id: randomUUID(), ...input, createdAt: now, updatedAt: now };
    this.claimEvidence.set(item.id, item);
    return item;
  }

  async deleteClaimEvidence(id: Id) { return this.claimEvidence.delete(id); }

  async createPublicRecordLookup(input: CreatePublicRecordLookupInput) {
    const lookup: PublicRecordLookup = { id: randomUUID(), ...input, createdAt: new Date() };
    this.recordLookups.set(lookup.id, lookup);
    return lookup;
  }

  async listPublicRecordLookups(investigationId: Id, limit: number) {
    return [...this.recordLookups.values()]
      .filter((lookup) => lookup.investigationId === investigationId)
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
      .slice(0, limit);
  }

  async searchProcurementAwards(query: string, limit: number) {
    const needle = query.trim().toLowerCase();
    return this.procurementAwards
      .filter((award) => [award.buyerName, award.title, ...award.supplierNames].some((value) => value?.toLowerCase().includes(needle)))
      .slice(0, limit);
  }

  async getLatestProcurementIngestion() { return null; }
}

/** Shapes a stored source for listing without its full extracted text. */
export function sourceSummary(article: SourceArticle, addedByUserId: Id, addedAt: Date): InvestigationSourceSummary {
  return {
    sourceArticleId: article.id,
    sourceKind: article.sourceKind,
    title: article.title,
    publisher: article.publisher,
    originalUrl: article.originalUrl,
    canonicalUrl: article.canonicalUrl,
    fileName: article.fileName,
    mimeType: article.mimeType,
    byteSize: article.byteSize,
    pageCount: article.pageCount,
    extractionMethod: article.extractionMethod,
    extractionNotes: article.extractionNotes,
    textTruncated: article.textTruncated,
    characterCount: article.extractedText.length,
    publishedAt: article.publishedAt,
    addedByUserId,
    addedAt,
  };
}

export type { AiOperationStage, AiOperationStatus, UsageStatus };
