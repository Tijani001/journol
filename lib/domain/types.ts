/**
 * Server-side domain types. These mirror the PostgreSQL model without
 * committing the application to a database client or authentication provider.
 */

export type Id = string;
export type Timestamp = Date;

export type UserRole = "journalist" | "administrator";
export type InvestigationStatus = "active" | "archived" | "closed";
export type LeadStatus = "proposed" | "approved" | "rejected" | "superseded";
export type AiOperationStage = "lead_selection" | "evidence_assessment" | "investigation_plan" | "deep_research";
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

export type SourceKind = "web_article" | "document";
export type ExtractionMethod = "readability" | "pdf_text" | "docx_text" | "plain_text";

export interface SourceArticle {
  id: Id;
  ownerUserId: Id;
  /** Web articles keep the URL they were retrieved from; uploaded documents have none. */
  originalUrl: string | null;
  canonicalUrl: string | null;
  title: string | null;
  publisher: string | null;
  /** Publication time extracted by the server from source metadata, if present. */
  publishedAt: Timestamp | null;
  extractedText: string;
  contentHash: string;
  retrievalStatus: "retrieved" | "failed";
  retrievedAt: Timestamp;
  sourceKind: SourceKind;
  /** Original file name of an uploaded document. */
  fileName: string | null;
  mimeType: string | null;
  byteSize: number | null;
  pageCount: number | null;
  extractionMethod: ExtractionMethod | null;
  /** Plain-language caveats about what extraction did or did not capture. */
  extractionNotes: string[];
  /** True when only the first part of a long document's text was kept. */
  textTruncated: boolean;
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

/** A source-attributed, optional research report beyond the original article. */
export interface DeepResearchReport {
  id: Id;
  investigationId: Id;
  sourceArticleId: Id;
  version: number;
  instructions: string | null;
  inputSnapshotHash: string;
  researchPlan: Record<string, unknown>;
  report: Record<string, unknown>;
  sources: Array<Record<string, unknown>>;
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

/** A source attached to an investigation, without its full text. */
export interface InvestigationSourceSummary {
  sourceArticleId: Id;
  sourceKind: SourceKind;
  title: string | null;
  publisher: string | null;
  originalUrl: string | null;
  canonicalUrl: string | null;
  fileName: string | null;
  mimeType: string | null;
  byteSize: number | null;
  pageCount: number | null;
  extractionMethod: ExtractionMethod | null;
  extractionNotes: string[];
  textTruncated: boolean;
  characterCount: number;
  publishedAt: Timestamp | null;
  addedByUserId: Id;
  addedAt: Timestamp;
}

export type ClaimOrigin = "manual" | "plan_known_information" | "plan_verification";
export type ClaimVerdict = "unverified" | "confirmed" | "partly_confirmed" | "contradicted" | "unproven";
export type ClaimEvidenceKind = "source" | "public_record" | "web" | "note";
export type ClaimEvidenceStance = "supports" | "contradicts" | "context";

export interface InvestigationClaim {
  id: Id;
  investigationId: Id;
  statement: string;
  origin: ClaimOrigin;
  originKey: string | null;
  verdict: ClaimVerdict;
  verdictRationale: string | null;
  verdictSetByUserId: Id | null;
  verdictSetAt: Timestamp | null;
  createdByUserId: Id;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

export interface ClaimEvidence {
  id: Id;
  claimId: Id;
  evidenceKind: ClaimEvidenceKind;
  stance: ClaimEvidenceStance;
  sourceArticleId: Id | null;
  url: string | null;
  title: string | null;
  recordType: string | null;
  excerpt: string | null;
  note: string | null;
  /** Whether a quoted excerpt was found in the cited source's stored text; null when not checkable. */
  excerptFoundInSource: boolean | null;
  addedByUserId: Id;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

export interface ClaimVerdictEvent {
  id: Id;
  claimId: Id;
  verdict: ClaimVerdict;
  rationale: string | null;
  setByUserId: Id;
  createdAt: Timestamp;
}

export interface ClaimWithEvidence extends InvestigationClaim {
  evidence: ClaimEvidence[];
  history: ClaimVerdictEvent[];
}

export interface PublicRecordLookup {
  id: Id;
  investigationId: Id;
  query: string;
  recordTypes: string[];
  results: Array<Record<string, unknown>>;
  outcomes: Array<Record<string, unknown>>;
  createdByUserId: Id;
  createdAt: Timestamp;
}

export interface ProcurementAward {
  ocid: string;
  awardId: string;
  publication: string;
  buyerName: string | null;
  title: string | null;
  description: string | null;
  supplierNames: string[];
  amount: number | null;
  currency: string | null;
  awardDate: Timestamp | null;
  awardStatus: string | null;
  procurementMethod: string | null;
  contractAmount: number | null;
  contractCurrency: string | null;
  releaseDate: Timestamp | null;
}
