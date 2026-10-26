import "server-only";

import { randomUUID } from "node:crypto";
import type { Pool, QueryResultRow } from "pg";
import { getDatabasePool } from "@/lib/server/database";
import type {
  AiOperation, AiOperationStage, AiOperationStatus, ClaimEvidence, ClaimVerdictEvent, ClaimWithEvidence,
  DeepResearchReport, EvidenceAssessment, ExtractionMethod, Id, Investigation, InvestigationAction, InvestigationClaim,
  InvestigationPlan, InvestigativeLead, ProcurementAward, PublicRecordLookup, SavedStory, SourceArticle, UsageRecord, User,
} from "@/lib/domain/types";
import {
  sourceSummary,
  type CreateActionInput, type CreateAiOperationInput, type CreateClaimEvidenceInput, type CreateClaimInput,
  type CreateDeepResearchReportInput, type CreateEvidenceAssessmentInput, type CreateInvestigationPlanInput,
  type CreateInvestigationInput, type CreateLeadInput, type CreatePlanWithActionsInput, type CreatePublicRecordLookupInput,
  type CreateSourceArticleInput, type CreateUserInput, type JournolRepository, type RecordUsageInput, type SaveStoryInput,
  type SetClaimVerdictInput, type SourceUsage,
} from "@/lib/server/repository";

type Row = QueryResultRow & Record<string, unknown>;

function date(value: unknown): Date { return value instanceof Date ? value : new Date(String(value)); }
function object(value: unknown): Record<string, unknown> { return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {}; }
function nullableString(value: unknown): string | null { return typeof value === "string" ? value : null; }

function userFromRow(row: Row): User {
  return { id: String(row.id), authIssuer: String(row.auth_issuer), authSubject: String(row.auth_subject), email: nullableString(row.email), role: row.role === "administrator" ? "administrator" : "journalist", createdAt: date(row.created_at), updatedAt: date(row.updated_at) };
}
function investigationFromRow(row: Row): Investigation {
  return { id: String(row.id), ownerUserId: String(row.owner_user_id), title: String(row.title), status: row.status === "archived" || row.status === "closed" ? row.status : "active", currentLeadId: nullableString(row.current_lead_id), currentEvidenceAssessmentId: nullableString(row.current_evidence_assessment_id), currentPlanId: nullableString(row.current_plan_id), createdAt: date(row.created_at), updatedAt: date(row.updated_at) };
}
const EXTRACTION_METHODS: readonly ExtractionMethod[] = ["readability", "pdf_text", "docx_text", "plain_text"];
function nullableNumber(value: unknown): number | null { if (value === null || value === undefined) return null; const parsed = Number(value); return Number.isFinite(parsed) ? parsed : null; }
function stringList(value: unknown): string[] { return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : []; }
function articleFromRow(row: Row): SourceArticle {
  return {
    id: String(row.id), ownerUserId: String(row.owner_user_id), originalUrl: nullableString(row.original_url), canonicalUrl: nullableString(row.canonical_url),
    title: nullableString(row.title), publisher: nullableString(row.publisher), publishedAt: row.published_at ? date(row.published_at) : null,
    extractedText: String(row.extracted_text), contentHash: String(row.content_hash), retrievalStatus: row.retrieval_status === "failed" ? "failed" : "retrieved",
    retrievedAt: date(row.retrieved_at), sourceKind: row.source_kind === "document" ? "document" : "web_article", fileName: nullableString(row.file_name),
    mimeType: nullableString(row.mime_type), byteSize: nullableNumber(row.byte_size), pageCount: nullableNumber(row.page_count),
    extractionMethod: EXTRACTION_METHODS.includes(row.extraction_method as ExtractionMethod) ? row.extraction_method as ExtractionMethod : null,
    extractionNotes: stringList(row.extraction_notes), textTruncated: row.text_truncated === true, createdAt: date(row.created_at), updatedAt: date(row.updated_at),
  };
}
function claimFromRow(row: Row): InvestigationClaim {
  return { id: String(row.id), investigationId: String(row.investigation_id), statement: String(row.statement), origin: row.origin as InvestigationClaim["origin"], originKey: nullableString(row.origin_key), verdict: row.verdict as InvestigationClaim["verdict"], verdictRationale: nullableString(row.verdict_rationale), verdictSetByUserId: nullableString(row.verdict_set_by_user_id), verdictSetAt: row.verdict_set_at ? date(row.verdict_set_at) : null, createdByUserId: String(row.created_by_user_id), createdAt: date(row.created_at), updatedAt: date(row.updated_at) };
}
function claimEvidenceFromRow(row: Row): ClaimEvidence {
  return { id: String(row.id), claimId: String(row.claim_id), evidenceKind: row.evidence_kind as ClaimEvidence["evidenceKind"], stance: row.stance as ClaimEvidence["stance"], sourceArticleId: nullableString(row.source_article_id), url: nullableString(row.url), title: nullableString(row.title), recordType: nullableString(row.record_type), excerpt: nullableString(row.excerpt), note: nullableString(row.note), excerptFoundInSource: typeof row.excerpt_found_in_source === "boolean" ? row.excerpt_found_in_source : null, addedByUserId: String(row.added_by_user_id), createdAt: date(row.created_at), updatedAt: date(row.updated_at) };
}
function verdictEventFromRow(row: Row): ClaimVerdictEvent {
  return { id: String(row.id), claimId: String(row.claim_id), verdict: row.verdict as ClaimVerdictEvent["verdict"], rationale: nullableString(row.rationale), setByUserId: String(row.set_by_user_id), createdAt: date(row.created_at) };
}
function lookupFromRow(row: Row): PublicRecordLookup {
  return { id: String(row.id), investigationId: String(row.investigation_id), query: String(row.query), recordTypes: stringList(row.record_types), results: Array.isArray(row.results) ? row.results.filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === "object" && !Array.isArray(item)) : [], outcomes: Array.isArray(row.outcomes) ? row.outcomes.filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === "object" && !Array.isArray(item)) : [], createdByUserId: String(row.created_by_user_id), createdAt: date(row.created_at) };
}
function awardFromRow(row: Row): ProcurementAward {
  return { ocid: String(row.ocid), awardId: String(row.award_id), publication: String(row.publication), buyerName: nullableString(row.buyer_name), title: nullableString(row.title), description: nullableString(row.description), supplierNames: stringList(row.supplier_names), amount: nullableNumber(row.amount), currency: nullableString(row.currency), awardDate: row.award_date ? date(row.award_date) : null, awardStatus: nullableString(row.award_status), procurementMethod: nullableString(row.procurement_method), contractAmount: nullableNumber(row.contract_amount), contractCurrency: nullableString(row.contract_currency), releaseDate: row.release_date ? date(row.release_date) : null };
}
/** Escapes LIKE wildcards so a journalist's query is matched literally. */
function likePattern(value: string) { return `%${value.replace(/[\\%_]/g, (match) => `\\${match}`)}%`; }
function savedStoryFromRow(row: Row): SavedStory {
  return { id: String(row.id), userId: String(row.user_id), canonicalUrl: String(row.canonical_url), originalUrl: String(row.original_url), title: String(row.title), publisher: nullableString(row.publisher), publishedAt: row.published_at ? date(row.published_at) : null, description: nullableString(row.description), savedAt: date(row.saved_at), createdAt: date(row.created_at), updatedAt: date(row.updated_at) };
}
function leadFromRow(row: Row): InvestigativeLead {
  return { id: String(row.id), investigationId: String(row.investigation_id), sourceArticleId: String(row.source_article_id), version: Number(row.version), status: row.status as InvestigativeLead["status"], content: object(row.content), model: nullableString(row.model), createdByUserId: String(row.created_by_user_id), approvedByUserId: nullableString(row.approved_by_user_id), approvedAt: row.approved_at ? date(row.approved_at) : null, createdAt: date(row.created_at), updatedAt: date(row.updated_at) };
}
function assessmentFromRow(row: Row): EvidenceAssessment {
  return { id: String(row.id), investigationId: String(row.investigation_id), leadId: String(row.lead_id), version: Number(row.version), content: object(row.content), inputSnapshotHash: String(row.input_snapshot_hash), model: nullableString(row.model), createdByUserId: String(row.created_by_user_id), createdAt: date(row.created_at), updatedAt: date(row.updated_at) };
}
function planFromRow(row: Row): InvestigationPlan {
  return { id: String(row.id), investigationId: String(row.investigation_id), leadId: String(row.lead_id), evidenceAssessmentId: String(row.evidence_assessment_id), version: Number(row.version), content: object(row.content), model: nullableString(row.model), createdByUserId: String(row.created_by_user_id), createdAt: date(row.created_at), updatedAt: date(row.updated_at) };
}
function deepResearchFromRow(row: Row): DeepResearchReport {
  return { id: String(row.id), investigationId: String(row.investigation_id), sourceArticleId: String(row.source_article_id), version: Number(row.version), instructions: nullableString(row.instructions), inputSnapshotHash: String(row.input_snapshot_hash), researchPlan: object(row.research_plan), report: object(row.report), sources: Array.isArray(row.sources) ? row.sources.filter((source): source is Record<string, unknown> => Boolean(source) && typeof source === "object" && !Array.isArray(source)) : [], model: nullableString(row.model), createdByUserId: String(row.created_by_user_id), createdAt: date(row.created_at), updatedAt: date(row.updated_at) };
}
function operationFromRow(row: Row): AiOperation {
  return { id: String(row.id), userId: String(row.user_id), investigationId: String(row.investigation_id), stage: row.stage as AiOperationStage, idempotencyKey: String(row.idempotency_key), model: String(row.model), status: row.status as AiOperationStatus, providerRequestId: nullableString(row.provider_request_id), errorCode: nullableString(row.error_code), createdAt: date(row.created_at), updatedAt: date(row.updated_at) };
}
function actionFromRow(row: Row): InvestigationAction {
  return { id: String(row.id), investigationPlanId: String(row.investigation_plan_id), position: Number(row.position), status: row.status as InvestigationAction["status"], questionOrClaim: String(row.question_or_claim), evidenceSought: String(row.evidence_sought), possibleSource: String(row.possible_source), verificationMethod: String(row.verification_method), limitations: String(row.limitations), createdByUserId: String(row.created_by_user_id), createdAt: date(row.created_at), updatedAt: date(row.updated_at) };
}
function usageFromRow(row: Row): UsageRecord {
  return { id: String(row.id), userId: String(row.user_id), operationId: String(row.operation_id), stage: row.stage as AiOperationStage, model: String(row.model), status: row.status as UsageRecord["status"], inputTokens: typeof row.input_tokens === "number" ? row.input_tokens : null, outputTokens: typeof row.output_tokens === "number" ? row.output_tokens : null, estimatedCostMicros: row.estimated_cost_micros === null ? null : Number(row.estimated_cost_micros), createdAt: date(row.created_at), updatedAt: date(row.updated_at) };
}

/** PostgreSQL adapter. It is constructed lazily and never connects in unit tests. */
export class PostgresJournolRepository implements JournolRepository {
  constructor(private readonly pool: Pool = getDatabasePool()) {}

  async getUserByIdentity(issuer: string, subject: string) { const result = await this.pool.query("SELECT * FROM users WHERE auth_issuer = $1 AND auth_subject = $2", [issuer, subject]); return result.rows[0] ? userFromRow(result.rows[0]) : null; }
  async createUser(input: CreateUserInput) { const result = await this.pool.query("INSERT INTO users (id, auth_issuer, auth_subject, email, role) VALUES ($1, $2, $3, $4, $5) ON CONFLICT (auth_issuer, auth_subject) DO UPDATE SET updated_at = users.updated_at RETURNING *", [randomUUID(), input.authIssuer, input.authSubject, input.email, input.role ?? "journalist"]); return userFromRow(result.rows[0]); }
  async getInvestigation(id: Id) { const result = await this.pool.query("SELECT * FROM investigations WHERE id = $1", [id]); return result.rows[0] ? investigationFromRow(result.rows[0]) : null; }
  async listInvestigationsForOwner(ownerUserId: Id) { const result = await this.pool.query("SELECT * FROM investigations WHERE owner_user_id = $1 ORDER BY updated_at DESC", [ownerUserId]); return result.rows.map(investigationFromRow); }
  async createInvestigation(input: CreateInvestigationInput) { const result = await this.pool.query("INSERT INTO investigations (id, owner_user_id, title) VALUES ($1, $2, $3) RETURNING *", [randomUUID(), input.ownerUserId, input.title]); return investigationFromRow(result.rows[0]); }
  async saveInvestigationForUser(userId: Id, investigationId: Id) { const result = await this.pool.query("INSERT INTO saved_investigations (user_id, investigation_id) VALUES ($1, $2) ON CONFLICT (user_id, investigation_id) DO UPDATE SET saved_at = saved_investigations.saved_at RETURNING saved_at", [userId, investigationId]); return date(result.rows[0].saved_at); }
  async unsaveInvestigationForUser(userId: Id, investigationId: Id) { const result = await this.pool.query("DELETE FROM saved_investigations WHERE user_id = $1 AND investigation_id = $2", [userId, investigationId]); return result.rowCount === 1; }
  async listSavedInvestigationsForUser(userId: Id) { const result = await this.pool.query("SELECT i.*, s.saved_at FROM saved_investigations s JOIN investigations i ON i.id = s.investigation_id WHERE s.user_id = $1 AND i.owner_user_id = $1 ORDER BY s.saved_at DESC", [userId]); return result.rows.map((row) => ({ investigation: investigationFromRow(row), savedAt: date(row.saved_at) })); }
  async isInvestigationSavedForUser(userId: Id, investigationId: Id) { const result = await this.pool.query("SELECT 1 FROM saved_investigations WHERE user_id = $1 AND investigation_id = $2", [userId, investigationId]); return result.rowCount === 1; }
  async saveStoryForUser(input: SaveStoryInput) { const result = await this.pool.query("INSERT INTO saved_stories (id, user_id, canonical_url, original_url, title, publisher, published_at, description) VALUES ($1,$2,$3,$4,$5,$6,$7,$8) ON CONFLICT (user_id, canonical_url) DO UPDATE SET updated_at = saved_stories.updated_at RETURNING *", [randomUUID(), input.userId, input.canonicalUrl, input.originalUrl, input.title, input.publisher, input.publishedAt, input.description]); return savedStoryFromRow(result.rows[0]); }
  async unsaveStoryForUser(userId: Id, savedStoryId: Id) { const result = await this.pool.query("DELETE FROM saved_stories WHERE id = $1 AND user_id = $2", [savedStoryId, userId]); return result.rowCount === 1; }
  async listSavedStoriesForUser(userId: Id) { const result = await this.pool.query("SELECT * FROM saved_stories WHERE user_id = $1 ORDER BY saved_at DESC", [userId]); return result.rows.map(savedStoryFromRow); }
  async getSourceArticle(id: Id) { const result = await this.pool.query("SELECT * FROM source_articles WHERE id = $1", [id]); return result.rows[0] ? articleFromRow(result.rows[0]) : null; }
  async createSourceArticle(input: CreateSourceArticleInput) {
    const result = await this.pool.query(
      "INSERT INTO source_articles (id, owner_user_id, original_url, canonical_url, title, publisher, published_at, extracted_text, content_hash, retrieval_status, retrieved_at, source_kind, file_name, mime_type, byte_size, page_count, extraction_method, extraction_notes, text_truncated) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18::jsonb,$19) RETURNING *",
      [randomUUID(), input.ownerUserId, input.originalUrl, input.canonicalUrl, input.title, input.publisher, input.publishedAt ?? null, input.extractedText, input.contentHash, input.retrievalStatus, input.retrievedAt, input.sourceKind ?? "web_article", input.fileName ?? null, input.mimeType ?? null, input.byteSize ?? null, input.pageCount ?? null, input.extractionMethod ?? null, JSON.stringify(input.extractionNotes ?? []), input.textTruncated ?? false],
    );
    return articleFromRow(result.rows[0]);
  }
  async attachSourceToInvestigation(input: { investigationId: Id; sourceArticleId: Id; addedByUserId: Id }) { await this.pool.query("INSERT INTO investigation_source_articles (investigation_id, source_article_id, added_by_user_id) VALUES ($1, $2, $3) ON CONFLICT DO NOTHING", [input.investigationId, input.sourceArticleId, input.addedByUserId]); }
  async investigationHasSource(investigationId: Id, sourceArticleId: Id) { const result = await this.pool.query("SELECT 1 FROM investigation_source_articles WHERE investigation_id = $1 AND source_article_id = $2", [investigationId, sourceArticleId]); return result.rowCount === 1; }
  async listInvestigationSources(investigationId: Id) {
    const result = await this.pool.query("SELECT s.*, l.added_by_user_id AS attachment_added_by_user_id, l.created_at AS attachment_created_at FROM investigation_source_articles l JOIN source_articles s ON s.id = l.source_article_id WHERE l.investigation_id = $1 ORDER BY l.created_at ASC", [investigationId]);
    return result.rows.map((row) => sourceSummary(articleFromRow(row), String(row.attachment_added_by_user_id), date(row.attachment_created_at)));
  }
  async findOwnedSourceByContentHash(ownerUserId: Id, contentHash: string, sourceKind: SourceArticle["sourceKind"]) { const result = await this.pool.query("SELECT * FROM source_articles WHERE owner_user_id = $1 AND content_hash = $2 AND source_kind = $3 ORDER BY created_at ASC LIMIT 1", [ownerUserId, contentHash, sourceKind]); return result.rows[0] ? articleFromRow(result.rows[0]) : null; }
  async getSourceUsage(investigationId: Id, sourceArticleId: Id): Promise<SourceUsage> {
    const result = await this.pool.query(
      "SELECT EXISTS (SELECT 1 FROM investigative_leads WHERE investigation_id = $1 AND source_article_id = $2) AS lead, EXISTS (SELECT 1 FROM deep_research_reports WHERE investigation_id = $1 AND source_article_id = $2) AS deep_research, EXISTS (SELECT 1 FROM claim_evidence e JOIN investigation_claims c ON c.id = e.claim_id WHERE c.investigation_id = $1 AND e.source_article_id = $2) AS claim_evidence",
      [investigationId, sourceArticleId],
    );
    const row = result.rows[0] ?? {};
    return { lead: row.lead === true, deepResearch: row.deep_research === true, claimEvidence: row.claim_evidence === true };
  }
  async detachSourceFromInvestigation(investigationId: Id, sourceArticleId: Id) { const result = await this.pool.query("DELETE FROM investigation_source_articles WHERE investigation_id = $1 AND source_article_id = $2", [investigationId, sourceArticleId]); return result.rowCount === 1; }
  async createLeadVersion(input: CreateLeadInput) {
    const client = await this.pool.connect();

    try {
      await client.query("BEGIN");

      await client.query(
        "SELECT pg_advisory_xact_lock(hashtextextended($1, 0))",
        [input.investigationId],
      );

      const result = await client.query(
        "SELECT COALESCE(MAX(version), 0) + 1 AS next_version FROM investigative_leads WHERE investigation_id = $1",
        [input.investigationId],
      );

      const nextVersion = Number(result.rows[0].next_version);

      const inserted = await client.query(
        "INSERT INTO investigative_leads (id, investigation_id, source_article_id, version, status, content, model, created_by_user_id) VALUES ($1,$2,$3,$4,$5,$6::jsonb,$7,$8) RETURNING *",
        [
          randomUUID(),
          input.investigationId,
          input.sourceArticleId,
          nextVersion,
          input.status,
          JSON.stringify(input.content),
          input.model,
          input.createdByUserId,
        ],
      );

      await client.query("COMMIT");

      return leadFromRow(inserted.rows[0]);
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }
  async getLatestLeadForSource(investigationId: Id, sourceArticleId: Id) {
    const result = await this.pool.query(
      "SELECT * FROM investigative_leads WHERE investigation_id = $1 AND source_article_id = $2 ORDER BY version DESC LIMIT 1",
      [investigationId, sourceArticleId],
    );
    return result.rows[0] ? leadFromRow(result.rows[0]) : null;
  }
  async getLatestLeadForInvestigation(investigationId: Id) { const result = await this.pool.query("SELECT * FROM investigative_leads WHERE investigation_id = $1 ORDER BY version DESC LIMIT 1", [investigationId]); return result.rows[0] ? leadFromRow(result.rows[0]) : null; }

  async getLead(id: Id) { const result = await this.pool.query("SELECT * FROM investigative_leads WHERE id = $1", [id]); return result.rows[0] ? leadFromRow(result.rows[0]) : null; }
  async approveLead(id: Id, approvedByUserId: Id) {
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      const result = await client.query("UPDATE investigative_leads SET status = 'approved', approved_by_user_id = $2, approved_at = now() WHERE id = $1 AND status = 'proposed' RETURNING *", [id, approvedByUserId]);
      const row = result.rows[0];
      if (!row) { await client.query("ROLLBACK"); return null; }
      await client.query("UPDATE investigations SET current_lead_id = $1 WHERE id = $2", [id, row.investigation_id]);
      await client.query("COMMIT");
      return leadFromRow(row);
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally { client.release(); }
  }
  async rejectLead(id: Id) { const result = await this.pool.query("UPDATE investigative_leads SET status = 'rejected' WHERE id = $1 RETURNING *", [id]); return result.rows[0] ? leadFromRow(result.rows[0]) : null; }
  async createEvidenceAssessment(input: CreateEvidenceAssessmentInput) {
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      await client.query("SELECT pg_advisory_xact_lock(hashtextextended($1, 0))", [input.leadId]);
      const version = await client.query("SELECT COALESCE(MAX(version), 0) + 1 AS next_version FROM evidence_assessments WHERE lead_id = $1", [input.leadId]);
      const result = await client.query("INSERT INTO evidence_assessments (id, investigation_id, lead_id, version, content, input_snapshot_hash, model, created_by_user_id) VALUES ($1,$2,$3,$4,$5::jsonb,$6,$7,$8) RETURNING *", [randomUUID(), input.investigationId, input.leadId, Number(version.rows[0].next_version), JSON.stringify(input.content), input.inputSnapshotHash, input.model, input.createdByUserId]);
      const row = result.rows[0];
      await client.query("UPDATE investigations SET current_evidence_assessment_id = $1 WHERE id = $2", [row.id, input.investigationId]);
      await client.query("COMMIT");
      return assessmentFromRow(row);
    } catch (error) { await client.query("ROLLBACK"); throw error; } finally { client.release(); }
  }
  async getEvidenceAssessment(id: Id) { const result = await this.pool.query("SELECT * FROM evidence_assessments WHERE id = $1", [id]); return result.rows[0] ? assessmentFromRow(result.rows[0]) : null; }
  async createInvestigationPlan(input: CreateInvestigationPlanInput) {
    const result = await this.createInvestigationPlanWithActions({ plan: input, actions: [] });
    return result.plan;
  }
  async createInvestigationPlanWithActions(input: CreatePlanWithActionsInput) {
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      await client.query("SELECT pg_advisory_xact_lock(hashtextextended($1, 0))", [input.plan.investigationId]);
      const version = await client.query("SELECT COALESCE(MAX(version), 0) + 1 AS next_version FROM investigation_plans WHERE investigation_id = $1", [input.plan.investigationId]);
      const result = await client.query("INSERT INTO investigation_plans (id, investigation_id, lead_id, evidence_assessment_id, version, content, model, created_by_user_id) VALUES ($1,$2,$3,$4,$5,$6::jsonb,$7,$8) RETURNING *", [randomUUID(), input.plan.investigationId, input.plan.leadId, input.plan.evidenceAssessmentId, Number(version.rows[0].next_version), JSON.stringify(input.plan.content), input.plan.model, input.plan.createdByUserId]);
      const row = result.rows[0];
      const actions = [];
      for (const action of input.actions) {
        const inserted = await client.query("INSERT INTO investigation_actions (id, investigation_plan_id, position, status, question_or_claim, evidence_sought, possible_source, verification_method, limitations, created_by_user_id) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING *", [randomUUID(), row.id, action.position, action.status, action.questionOrClaim, action.evidenceSought, action.possibleSource, action.verificationMethod, action.limitations, action.createdByUserId]);
        actions.push(actionFromRow(inserted.rows[0]));
      }
      await client.query("UPDATE investigations SET current_plan_id = $1 WHERE id = $2", [row.id, input.plan.investigationId]);
      await client.query("COMMIT");
      return { plan: planFromRow(row), actions };
    } catch (error) { await client.query("ROLLBACK"); throw error; } finally { client.release(); }
  }
  async getInvestigationPlan(id: Id) { const result = await this.pool.query("SELECT * FROM investigation_plans WHERE id = $1", [id]); return result.rows[0] ? planFromRow(result.rows[0]) : null; }
  async createDeepResearchReport(input: CreateDeepResearchReportInput) {
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      await client.query("SELECT pg_advisory_xact_lock(hashtextextended($1, 0))", [input.investigationId]);
      const version = await client.query("SELECT COALESCE(MAX(version), 0) + 1 AS next_version FROM deep_research_reports WHERE investigation_id = $1", [input.investigationId]);
      const result = await client.query("INSERT INTO deep_research_reports (id, investigation_id, source_article_id, version, instructions, input_snapshot_hash, research_plan, report, sources, model, created_by_user_id) VALUES ($1,$2,$3,$4,$5,$6,$7::jsonb,$8::jsonb,$9::jsonb,$10,$11) RETURNING *", [randomUUID(), input.investigationId, input.sourceArticleId, Number(version.rows[0].next_version), input.instructions, input.inputSnapshotHash, JSON.stringify(input.researchPlan), JSON.stringify(input.report), JSON.stringify(input.sources), input.model, input.createdByUserId]);
      await client.query("COMMIT");
      return deepResearchFromRow(result.rows[0]);
    } catch (error) { await client.query("ROLLBACK"); throw error; } finally { client.release(); }
  }
  async getLatestDeepResearchReport(investigationId: Id) { const result = await this.pool.query("SELECT * FROM deep_research_reports WHERE investigation_id = $1 ORDER BY version DESC LIMIT 1", [investigationId]); return result.rows[0] ? deepResearchFromRow(result.rows[0]) : null; }
  async getDeepResearchReport(id: Id) { const result = await this.pool.query("SELECT * FROM deep_research_reports WHERE id = $1", [id]); return result.rows[0] ? deepResearchFromRow(result.rows[0]) : null; }
  async listDeepResearchReportsForInvestigation(investigationId: Id) { const result = await this.pool.query("SELECT * FROM deep_research_reports WHERE investigation_id = $1 ORDER BY version DESC", [investigationId]); return result.rows.map(deepResearchFromRow); }
  async getDeepResearchReportForSnapshot(investigationId: Id, sourceArticleId: Id, inputSnapshotHash: string) { const result = await this.pool.query("SELECT * FROM deep_research_reports WHERE investigation_id = $1 AND source_article_id = $2 AND input_snapshot_hash = $3 ORDER BY version DESC LIMIT 1", [investigationId, sourceArticleId, inputSnapshotHash]); return result.rows[0] ? deepResearchFromRow(result.rows[0]) : null; }
  async saveDeepResearchReportForUser(userId: Id, reportId: Id) { const result = await this.pool.query("INSERT INTO saved_deep_research_reports (user_id, deep_research_report_id) VALUES ($1, $2) ON CONFLICT (user_id, deep_research_report_id) DO UPDATE SET saved_at = saved_deep_research_reports.saved_at RETURNING saved_at", [userId, reportId]); return date(result.rows[0].saved_at); }
  async unsaveDeepResearchReportForUser(userId: Id, reportId: Id) { const result = await this.pool.query("DELETE FROM saved_deep_research_reports WHERE user_id = $1 AND deep_research_report_id = $2", [userId, reportId]); return result.rowCount === 1; }
  async isDeepResearchReportSavedForUser(userId: Id, reportId: Id) { const result = await this.pool.query("SELECT 1 FROM saved_deep_research_reports WHERE user_id = $1 AND deep_research_report_id = $2", [userId, reportId]); return result.rowCount === 1; }
  async listSavedDeepResearchReportsForUser(userId: Id) { const result = await this.pool.query("SELECT r.*, s.saved_at FROM saved_deep_research_reports s JOIN deep_research_reports r ON r.id = s.deep_research_report_id JOIN investigations i ON i.id = r.investigation_id WHERE s.user_id = $1 AND r.created_by_user_id = $1 AND i.owner_user_id = $1 ORDER BY s.saved_at DESC", [userId]); return result.rows.map((row) => ({ report: deepResearchFromRow(row), savedAt: date(row.saved_at) })); }
  async createInvestigationAction(input: CreateActionInput) { const result = await this.pool.query("INSERT INTO investigation_actions (id, investigation_plan_id, position, status, question_or_claim, evidence_sought, possible_source, verification_method, limitations, created_by_user_id) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING *", [randomUUID(), input.investigationPlanId, input.position, input.status, input.questionOrClaim, input.evidenceSought, input.possibleSource, input.verificationMethod, input.limitations, input.createdByUserId]); return actionFromRow(result.rows[0]); }
  async listInvestigationActions(investigationPlanId: Id) { const result = await this.pool.query("SELECT * FROM investigation_actions WHERE investigation_plan_id = $1 ORDER BY position ASC", [investigationPlanId]); return result.rows.map(actionFromRow); }
  async findAiOperation(userId: Id, idempotencyKey: string) { const result = await this.pool.query("SELECT * FROM ai_operations WHERE user_id = $1 AND idempotency_key = $2", [userId, idempotencyKey]); return result.rows[0] ? operationFromRow(result.rows[0]) : null; }
  async createAiOperation(input: CreateAiOperationInput) { const result = await this.pool.query("INSERT INTO ai_operations (id, user_id, investigation_id, stage, idempotency_key, model, status) VALUES ($1,$2,$3,$4,$5,$6,'pending') RETURNING *", [randomUUID(), input.userId, input.investigationId, input.stage, input.idempotencyKey, input.model]); return operationFromRow(result.rows[0]); }
  async restartFailedAiOperation(operationId: Id) { const result = await this.pool.query("UPDATE ai_operations SET status = 'pending', provider_request_id = NULL, error_code = NULL WHERE id = $1 AND status = 'failed' RETURNING *", [operationId]); return result.rows[0] ? operationFromRow(result.rows[0]) : null; }
  async restartStalePendingAiOperation(operationId: Id, staleBefore: Date) { const result = await this.pool.query("UPDATE ai_operations SET provider_request_id = NULL, error_code = NULL WHERE id = $1 AND status = 'pending' AND updated_at < $2 RETURNING *", [operationId, staleBefore]); return result.rows[0] ? operationFromRow(result.rows[0]) : null; }
  async finishAiOperation(input: { operationId: Id; status: Exclude<AiOperationStatus, "pending">; providerRequestId?: string; errorCode?: string }) { const result = await this.pool.query("UPDATE ai_operations SET status = $2, provider_request_id = COALESCE($3, provider_request_id), error_code = COALESCE($4, error_code) WHERE id = $1 RETURNING *", [input.operationId, input.status, input.providerRequestId ?? null, input.errorCode ?? null]); return result.rows[0] ? operationFromRow(result.rows[0]) : null; }
  async listClaimsWithEvidence(investigationId: Id): Promise<ClaimWithEvidence[]> {
    const claims = await this.pool.query("SELECT * FROM investigation_claims WHERE investigation_id = $1 ORDER BY created_at ASC, id ASC", [investigationId]);
    if (!claims.rows.length) return [];
    const ids = claims.rows.map((row) => String(row.id));
    const [evidence, history] = await Promise.all([
      this.pool.query("SELECT * FROM claim_evidence WHERE claim_id = ANY($1::uuid[]) ORDER BY created_at ASC, id ASC", [ids]),
      this.pool.query("SELECT * FROM claim_verdict_events WHERE claim_id = ANY($1::uuid[]) ORDER BY created_at ASC, id ASC", [ids]),
    ]);
    return claims.rows.map((row) => {
      const claim = claimFromRow(row);
      return {
        ...claim,
        evidence: evidence.rows.filter((item) => String(item.claim_id) === claim.id).map(claimEvidenceFromRow),
        history: history.rows.filter((item) => String(item.claim_id) === claim.id).map(verdictEventFromRow),
      };
    });
  }
  async getClaim(id: Id) { const result = await this.pool.query("SELECT * FROM investigation_claims WHERE id = $1", [id]); return result.rows[0] ? claimFromRow(result.rows[0]) : null; }
  async createClaim(input: CreateClaimInput) { const result = await this.pool.query("INSERT INTO investigation_claims (id, investigation_id, statement, origin, origin_key, created_by_user_id) VALUES ($1,$2,$3,$4,$5,$6) RETURNING *", [randomUUID(), input.investigationId, input.statement, input.origin, input.originKey, input.createdByUserId]); return claimFromRow(result.rows[0]); }
  async createClaimsIfAbsent(inputs: CreateClaimInput[]) {
    if (!inputs.length) return [];
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      const created: InvestigationClaim[] = [];
      for (const input of inputs) {
        const result = await client.query("INSERT INTO investigation_claims (id, investigation_id, statement, origin, origin_key, created_by_user_id) VALUES ($1,$2,$3,$4,$5,$6) ON CONFLICT (investigation_id, origin_key) WHERE origin_key IS NOT NULL DO NOTHING RETURNING *", [randomUUID(), input.investigationId, input.statement, input.origin, input.originKey, input.createdByUserId]);
        if (result.rows[0]) created.push(claimFromRow(result.rows[0]));
      }
      await client.query("COMMIT");
      return created;
    } catch (error) { await client.query("ROLLBACK"); throw error; } finally { client.release(); }
  }
  async updateClaimStatement(id: Id, statement: string) { const result = await this.pool.query("UPDATE investigation_claims SET statement = $2 WHERE id = $1 RETURNING *", [id, statement]); return result.rows[0] ? claimFromRow(result.rows[0]) : null; }
  async setClaimVerdict(input: SetClaimVerdictInput) {
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      const result = await client.query("UPDATE investigation_claims SET verdict = $2, verdict_rationale = $3, verdict_set_by_user_id = $4, verdict_set_at = now() WHERE id = $1 RETURNING *", [input.claimId, input.verdict, input.rationale, input.setByUserId]);
      if (!result.rows[0]) { await client.query("ROLLBACK"); return null; }
      await client.query("INSERT INTO claim_verdict_events (id, claim_id, verdict, rationale, set_by_user_id) VALUES ($1,$2,$3,$4,$5)", [randomUUID(), input.claimId, input.verdict, input.rationale, input.setByUserId]);
      await client.query("COMMIT");
      return claimFromRow(result.rows[0]);
    } catch (error) { await client.query("ROLLBACK"); throw error; } finally { client.release(); }
  }
  async deleteClaim(id: Id) { const result = await this.pool.query("DELETE FROM investigation_claims WHERE id = $1", [id]); return result.rowCount === 1; }
  async listClaimEvidence(claimId: Id) { const result = await this.pool.query("SELECT * FROM claim_evidence WHERE claim_id = $1 ORDER BY created_at ASC, id ASC", [claimId]); return result.rows.map(claimEvidenceFromRow); }
  async getClaimEvidence(id: Id) { const result = await this.pool.query("SELECT * FROM claim_evidence WHERE id = $1", [id]); return result.rows[0] ? claimEvidenceFromRow(result.rows[0]) : null; }
  async addClaimEvidence(input: CreateClaimEvidenceInput) { const result = await this.pool.query("INSERT INTO claim_evidence (id, claim_id, evidence_kind, stance, source_article_id, url, title, record_type, excerpt, note, excerpt_found_in_source, added_by_user_id) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) RETURNING *", [randomUUID(), input.claimId, input.evidenceKind, input.stance, input.sourceArticleId, input.url, input.title, input.recordType, input.excerpt, input.note, input.excerptFoundInSource, input.addedByUserId]); return claimEvidenceFromRow(result.rows[0]); }
  async deleteClaimEvidence(id: Id) { const result = await this.pool.query("DELETE FROM claim_evidence WHERE id = $1", [id]); return result.rowCount === 1; }
  async createPublicRecordLookup(input: CreatePublicRecordLookupInput) { const result = await this.pool.query("INSERT INTO public_record_lookups (id, investigation_id, query, record_types, results, outcomes, created_by_user_id) VALUES ($1,$2,$3,$4::jsonb,$5::jsonb,$6::jsonb,$7) RETURNING *", [randomUUID(), input.investigationId, input.query, JSON.stringify(input.recordTypes), JSON.stringify(input.results), JSON.stringify(input.outcomes), input.createdByUserId]); return lookupFromRow(result.rows[0]); }
  async listPublicRecordLookups(investigationId: Id, limit: number) { const result = await this.pool.query("SELECT * FROM public_record_lookups WHERE investigation_id = $1 ORDER BY created_at DESC LIMIT $2", [investigationId, limit]); return result.rows.map(lookupFromRow); }
  async searchProcurementAwards(query: string, limit: number) {
    const normalized = query.trim().toLowerCase();
    const result = await this.pool.query(
      // Exact substring matches first, then fuzzy matches on the best-matching
      // part of the text (word similarity), which tolerates "Ltd"/"Limited" and
      // small spelling differences in contractor names. Both use the trigram index.
      "SELECT * FROM procurement_awards WHERE search_text ILIKE $1 OR $2 <% search_text ORDER BY (search_text ILIKE $1) DESC, word_similarity($2, search_text) DESC, award_date DESC NULLS LAST LIMIT $3",
      [likePattern(normalized), normalized, limit],
    );
    return result.rows.map(awardFromRow);
  }
  async getLatestProcurementIngestion(publication: string) { const result = await this.pool.query("SELECT finished_at, awards_upserted, source_file FROM procurement_ingestion_runs WHERE publication = $1 AND status = 'succeeded' ORDER BY finished_at DESC LIMIT 1", [publication]); const row = result.rows[0]; return row ? { finishedAt: date(row.finished_at), awardsUpserted: Number(row.awards_upserted), sourceFile: String(row.source_file) } : null; }
  async recordUsage(input: RecordUsageInput) { const result = await this.pool.query("INSERT INTO usage_records (id, user_id, operation_id, stage, model, status, input_tokens, output_tokens, estimated_cost_micros) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *", [randomUUID(), input.userId, input.operationId, input.stage, input.model, input.status, input.inputTokens, input.outputTokens, input.estimatedCostMicros]); return usageFromRow(result.rows[0]); }
}

export function getPostgresRepository(): PostgresJournolRepository { return new PostgresJournolRepository(); }
