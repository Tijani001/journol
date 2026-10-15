import { randomUUID } from "node:crypto";
import type {
  AiOperation, AiOperationStage, AiOperationStatus, EvidenceAssessment,
  DeepResearchReport, Id, Investigation, InvestigationAction, InvestigationPlan, InvestigativeLead,
  SavedStory, SourceArticle, UsageRecord, UsageStatus, User,
} from "@/lib/domain/types";

export type CreateUserInput = Pick<User, "authIssuer" | "authSubject" | "email"> & Partial<Pick<User, "role">>;
export type CreateInvestigationInput = Pick<Investigation, "ownerUserId" | "title">;
export type CreateSourceArticleInput = Omit<SourceArticle, "id" | "createdAt" | "updatedAt" | "publishedAt"> & { publishedAt?: Date | null };
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
  private readonly attachments = new Set<string>();
  private readonly leads = new Map<Id, InvestigativeLead>();
  private readonly assessments = new Map<Id, EvidenceAssessment>();
  private readonly plans = new Map<Id, InvestigationPlan>();
  private readonly researchReports = new Map<Id, DeepResearchReport>();
  private readonly savedResearchReports = new Map<string, Date>();
  private readonly actions = new Map<Id, InvestigationAction>();
  private readonly operations = new Map<Id, AiOperation>();
  private readonly usage = new Map<Id, UsageRecord>();

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
    const article: SourceArticle = { id: randomUUID(), ...input, publishedAt: input.publishedAt ?? null, createdAt: now, updatedAt: now };
    this.articles.set(article.id, article);
    return article;
  }

  async attachSourceToInvestigation({ investigationId, sourceArticleId, addedByUserId }: { investigationId: Id; sourceArticleId: Id; addedByUserId: Id }) {
    // Preserve author metadata in the production contract even though this
    // development adapter only needs the relationship key.
    void addedByUserId;
    this.attachments.add(`${investigationId}:${sourceArticleId}`);
  }

  async investigationHasSource(investigationId: Id, sourceArticleId: Id) {
    return this.attachments.has(`${investigationId}:${sourceArticleId}`);
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
}

export type { AiOperationStage, AiOperationStatus, UsageStatus };
