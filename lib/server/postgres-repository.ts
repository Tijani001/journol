import "server-only";

import { randomUUID } from "node:crypto";
import type { Pool, QueryResultRow } from "pg";
import { getDatabasePool } from "@/lib/server/database";
import type {
  AiOperation, AiOperationStage, AiOperationStatus, DeepResearchReport, EvidenceAssessment, Id,
  Investigation, InvestigationAction, InvestigationPlan, InvestigativeLead,
  SavedStory, SourceArticle, UsageRecord, User,
} from "@/lib/domain/types";
import type {
  CreateActionInput, CreateAiOperationInput, CreateDeepResearchReportInput, CreateEvidenceAssessmentInput,
  CreateInvestigationPlanInput, CreateInvestigationInput, CreateLeadInput, CreatePlanWithActionsInput,
  CreateSourceArticleInput, CreateUserInput, JournolRepository, RecordUsageInput, SaveStoryInput,
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
function articleFromRow(row: Row): SourceArticle {
  return { id: String(row.id), ownerUserId: String(row.owner_user_id), originalUrl: String(row.original_url), canonicalUrl: nullableString(row.canonical_url), title: nullableString(row.title), publisher: nullableString(row.publisher), publishedAt: row.published_at ? date(row.published_at) : null, extractedText: String(row.extracted_text), contentHash: String(row.content_hash), retrievalStatus: row.retrieval_status === "failed" ? "failed" : "retrieved", retrievedAt: date(row.retrieved_at), createdAt: date(row.created_at), updatedAt: date(row.updated_at) };
}
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
  async createSourceArticle(input: CreateSourceArticleInput) { const result = await this.pool.query("INSERT INTO source_articles (id, owner_user_id, original_url, canonical_url, title, publisher, published_at, extracted_text, content_hash, retrieval_status, retrieved_at) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING *", [randomUUID(), input.ownerUserId, input.originalUrl, input.canonicalUrl, input.title, input.publisher, input.publishedAt ?? null, input.extractedText, input.contentHash, input.retrievalStatus, input.retrievedAt]); return articleFromRow(result.rows[0]); }
  async attachSourceToInvestigation(input: { investigationId: Id; sourceArticleId: Id; addedByUserId: Id }) { await this.pool.query("INSERT INTO investigation_source_articles (investigation_id, source_article_id, added_by_user_id) VALUES ($1, $2, $3) ON CONFLICT DO NOTHING", [input.investigationId, input.sourceArticleId, input.addedByUserId]); }
  async investigationHasSource(investigationId: Id, sourceArticleId: Id) { const result = await this.pool.query("SELECT 1 FROM investigation_source_articles WHERE investigation_id = $1 AND source_article_id = $2", [investigationId, sourceArticleId]); return result.rowCount === 1; }
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
  async createLeadVersions(inputs: CreateLeadInput[]) {
    if (!inputs.length) return [];
    const investigationId = inputs[0].investigationId;
    if (inputs.some((input) => input.investigationId !== investigationId)) throw new Error("LEAD_SET_SPANS_INVESTIGATIONS");
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      await client.query("SELECT pg_advisory_xact_lock(hashtextextended($1, 0))", [investigationId]);
      const result = await client.query("SELECT COALESCE(MAX(version), 0) AS max_version FROM investigative_leads WHERE investigation_id = $1", [investigationId]);
      let version = Number(result.rows[0].max_version);
      const leads: InvestigativeLead[] = [];
      for (const input of inputs) {
        version += 1;
        const inserted = await client.query(
          "INSERT INTO investigative_leads (id, investigation_id, source_article_id, version, status, content, model, created_by_user_id) VALUES ($1,$2,$3,$4,$5,$6::jsonb,$7,$8) RETURNING *",
          [randomUUID(), input.investigationId, input.sourceArticleId, version, input.status, JSON.stringify(input.content), input.model, input.createdByUserId],
        );
        leads.push(leadFromRow(inserted.rows[0]));
      }
      await client.query("COMMIT");
      return leads;
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }
  async listLeadsForInvestigation(investigationId: Id) { const result = await this.pool.query("SELECT * FROM investigative_leads WHERE investigation_id = $1 ORDER BY version ASC", [investigationId]); return result.rows.map(leadFromRow); }
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
  async recordUsage(input: RecordUsageInput) { const result = await this.pool.query("INSERT INTO usage_records (id, user_id, operation_id, stage, model, status, input_tokens, output_tokens, estimated_cost_micros) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *", [randomUUID(), input.userId, input.operationId, input.stage, input.model, input.status, input.inputTokens, input.outputTokens, input.estimatedCostMicros]); return usageFromRow(result.rows[0]); }
}

export function getPostgresRepository(): PostgresJournolRepository { return new PostgresJournolRepository(); }
