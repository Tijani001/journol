/**
 * Server-side domain types. These mirror the PostgreSQL model without
 * committing the application to a database client or authentication provider.
 */

export type Id = string;
export type Timestamp = Date;

export type UserRole = "journalist" | "administrator";
export type InvestigationStatus = "active" | "archived" | "closed";
export type LeadStatus = "proposed" | "approved" | "rejected" | "superseded";
export type AiOperationStage = "lead_selection" | "evidence_assessment" | "investigation_plan";
export type AiOperationStatus = "pending" | "succeeded" | "failed" | "cancelled";
export type UsageStatus = "reserved" | "succeeded" | "failed" | "rejected";
export type ActionStatus = "not_started" | "in_progress" | "completed" | "blocked";

export interface User {
  id: Id;
  /** The authentication provider issuer, for example its OIDC issuer URL. */
  authIssuer: string;
  /** Provider subject; never supplied by a browser as an ownership assertion. */
  authSubject: string;
  email: string | null;
  role: UserRole;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

export interface Investigation {
  id: Id;
  ownerUserId: Id;
  title: string;
  status: InvestigationStatus;
  currentLeadId: Id | null;
  currentEvidenceAssessmentId: Id | null;
  currentPlanId: Id | null;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

export interface SourceArticle {
  id: Id;
  ownerUserId: Id;
  originalUrl: string;
  canonicalUrl: string | null;
  title: string | null;
  publisher: string | null;
  /** Publication time extracted by the server from source metadata, if present. */
  publishedAt: Timestamp | null;
  extractedText: string;
  contentHash: string;
  retrievalStatus: "retrieved" | "failed";
  retrievedAt: Timestamp;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

/** A journalist's bookmark of discovery metadata; no article fetch is implied. */
export interface SavedStory {
  id: Id;
  userId: Id;
  canonicalUrl: string;
  originalUrl: string;
  title: string;
  publisher: string | null;
  publishedAt: Timestamp | null;
  description: string | null;
  savedAt: Timestamp;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

export interface InvestigationSourceArticle {
  investigationId: Id;
  sourceArticleId: Id;
  addedByUserId: Id;
  createdAt: Timestamp;
}

export interface InvestigativeLead {
  id: Id;
  investigationId: Id;
  sourceArticleId: Id;
  version: number;
  status: LeadStatus;
  /** Validated model output, retained as an immutable snapshot. */
  content: Record<string, unknown>;
  model: string | null;
  createdByUserId: Id;
  approvedByUserId: Id | null;
  approvedAt: Timestamp | null;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

export interface EvidenceAssessment {
  id: Id;
  investigationId: Id;
  leadId: Id;
  version: number;
  /** Validated model output tied to the lead and source snapshot used. */
  content: Record<string, unknown>;
  inputSnapshotHash: string;
  model: string | null;
  createdByUserId: Id;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

export interface InvestigationPlan {
  id: Id;
  investigationId: Id;
  leadId: Id;
  evidenceAssessmentId: Id;
  version: number;
  content: Record<string, unknown>;
  model: string | null;
  createdByUserId: Id;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

export interface InvestigationAction {
  id: Id;
  investigationPlanId: Id;
  position: number;
  status: ActionStatus;
  questionOrClaim: string;
  evidenceSought: string;
  possibleSource: string;
  verificationMethod: string;
  limitations: string;
  createdByUserId: Id;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

export interface AiOperation {
  id: Id;
  userId: Id;
  investigationId: Id;
  stage: AiOperationStage;
  idempotencyKey: string;
  model: string;
  status: AiOperationStatus;
  providerRequestId: string | null;
  errorCode: string | null;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

export interface UsageRecord {
  id: Id;
  userId: Id;
  operationId: Id;
  stage: AiOperationStage;
  model: string;
  status: UsageStatus;
  inputTokens: number | null;
  outputTokens: number | null;
  estimatedCostMicros: number | null;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}
