import type { AiOperationStage, AiOperationStatus, UsageStatus } from "@/lib/domain/types";

/**
 * Typed PostgreSQL schema contract. A later Drizzle/SQL implementation should
 * preserve these names, foreign keys, uniqueness constraints and indexes.
 * It contains no database connection and performs no schema changes.
 */
export type PostgresColumn = {
  type: string;
  nullable?: boolean;
  references?: string;
};

export type PostgresTable = {
  primaryKey: readonly string[];
  columns: Record<string, PostgresColumn>;
  unique?: readonly string[];
  indexes?: readonly string[];
};

const auditColumns = {
  created_at: { type: "timestamptz" },
  updated_at: { type: "timestamptz" },
} as const;

export const JOURNOL_POSTGRES_SCHEMA = {
  users: {
    primaryKey: ["id"],
    columns: {
      id: { type: "uuid" }, auth_issuer: { type: "text" }, auth_subject: { type: "text" },
      email: { type: "text", nullable: true }, role: { type: "text" }, ...auditColumns,
    },
    unique: ["auth_issuer, auth_subject"],
  },
  investigations: {
    primaryKey: ["id"],
    columns: {
      id: { type: "uuid" }, owner_user_id: { type: "uuid", references: "users.id" },
      title: { type: "text" }, status: { type: "text" }, current_lead_id: { type: "uuid", nullable: true },
      current_evidence_assessment_id: { type: "uuid", nullable: true }, current_plan_id: { type: "uuid", nullable: true }, ...auditColumns,
    }, indexes: ["owner_user_id, updated_at DESC"],
  },
  source_articles: {
    primaryKey: ["id"], columns: {
      id: { type: "uuid" }, owner_user_id: { type: "uuid", references: "users.id" },
      original_url: { type: "text", nullable: true }, canonical_url: { type: "text", nullable: true }, title: { type: "text", nullable: true },
      publisher: { type: "text", nullable: true }, published_at: { type: "timestamptz", nullable: true }, extracted_text: { type: "text" }, content_hash: { type: "text" },
      retrieval_status: { type: "text" }, retrieved_at: { type: "timestamptz" }, source_kind: { type: "text" }, file_name: { type: "text", nullable: true },
      mime_type: { type: "text", nullable: true }, byte_size: { type: "integer", nullable: true }, page_count: { type: "integer", nullable: true },
      extraction_method: { type: "text", nullable: true }, extraction_notes: { type: "jsonb" }, text_truncated: { type: "boolean" }, ...auditColumns,
    }, indexes: ["owner_user_id, created_at DESC", "owner_user_id, canonical_url", "owner_user_id, published_at DESC", "owner_user_id, content_hash"],
  },
  saved_stories: {
    primaryKey: ["id"], columns: {
      id: { type: "uuid" }, user_id: { type: "uuid", references: "users.id" }, canonical_url: { type: "text" },
      original_url: { type: "text" }, title: { type: "text" }, publisher: { type: "text", nullable: true },
      published_at: { type: "timestamptz", nullable: true }, description: { type: "text", nullable: true }, saved_at: { type: "timestamptz" }, ...auditColumns,
    }, unique: ["user_id, canonical_url"], indexes: ["user_id, saved_at DESC"],
  },
  saved_investigations: {
    primaryKey: ["user_id", "investigation_id"], columns: {
      user_id: { type: "uuid", references: "users.id" }, investigation_id: { type: "uuid", references: "investigations.id" },
      saved_at: { type: "timestamptz" },
    }, indexes: ["user_id, saved_at DESC"],
  },
  investigation_source_articles: {
    primaryKey: ["investigation_id", "source_article_id"], columns: {
      investigation_id: { type: "uuid", references: "investigations.id" }, source_article_id: { type: "uuid", references: "source_articles.id" },
      added_by_user_id: { type: "uuid", references: "users.id" }, created_at: { type: "timestamptz" },
    }, indexes: ["investigation_id, created_at"],
  },
  investigation_claims: {
    primaryKey: ["id"], columns: {
      id: { type: "uuid" }, investigation_id: { type: "uuid", references: "investigations.id" }, statement: { type: "text" }, origin: { type: "text" },
      origin_key: { type: "text", nullable: true }, verdict: { type: "text" }, verdict_rationale: { type: "text", nullable: true },
      verdict_set_by_user_id: { type: "uuid", references: "users.id", nullable: true }, verdict_set_at: { type: "timestamptz", nullable: true },
      created_by_user_id: { type: "uuid", references: "users.id" }, ...auditColumns,
    }, unique: ["investigation_id, origin_key"], indexes: ["investigation_id, created_at"],
  },
  claim_evidence: {
    primaryKey: ["id"], columns: {
      id: { type: "uuid" }, claim_id: { type: "uuid", references: "investigation_claims.id" }, evidence_kind: { type: "text" }, stance: { type: "text" },
      source_article_id: { type: "uuid", references: "source_articles.id", nullable: true }, url: { type: "text", nullable: true }, title: { type: "text", nullable: true },
      record_type: { type: "text", nullable: true }, excerpt: { type: "text", nullable: true }, note: { type: "text", nullable: true },
      excerpt_found_in_source: { type: "boolean", nullable: true }, added_by_user_id: { type: "uuid", references: "users.id" }, ...auditColumns,
    }, indexes: ["claim_id, created_at", "source_article_id"],
  },
  claim_verdict_events: {
    primaryKey: ["id"], columns: {
      id: { type: "uuid" }, claim_id: { type: "uuid", references: "investigation_claims.id" }, verdict: { type: "text" }, rationale: { type: "text", nullable: true },
      set_by_user_id: { type: "uuid", references: "users.id" }, created_at: { type: "timestamptz" },
    }, indexes: ["claim_id, created_at"],
  },
  public_record_lookups: {
    primaryKey: ["id"], columns: {
      id: { type: "uuid" }, investigation_id: { type: "uuid", references: "investigations.id" }, query: { type: "text" }, record_types: { type: "jsonb" },
      results: { type: "jsonb" }, outcomes: { type: "jsonb" }, created_by_user_id: { type: "uuid", references: "users.id" }, created_at: { type: "timestamptz" },
    }, indexes: ["investigation_id, created_at DESC"],
  },
  procurement_awards: {
    primaryKey: ["ocid", "award_id"], columns: {
      ocid: { type: "text" }, award_id: { type: "text" }, publication: { type: "text" }, buyer_name: { type: "text", nullable: true }, title: { type: "text", nullable: true },
      description: { type: "text", nullable: true }, supplier_names: { type: "text[]" }, amount: { type: "numeric", nullable: true }, currency: { type: "text", nullable: true },
      award_date: { type: "timestamptz", nullable: true }, award_status: { type: "text", nullable: true }, procurement_method: { type: "text", nullable: true },
      contract_amount: { type: "numeric", nullable: true }, contract_currency: { type: "text", nullable: true }, release_date: { type: "timestamptz", nullable: true },
      search_text: { type: "text" }, ingested_at: { type: "timestamptz" },
    }, indexes: ["search_text (gin_trgm_ops)", "award_date DESC"],
  },
  procurement_ingestion_runs: {
    primaryKey: ["id"], columns: {
      id: { type: "uuid" }, publication: { type: "text" }, source_file: { type: "text" }, status: { type: "text" }, processes_read: { type: "integer" },
      awards_upserted: { type: "integer" }, error: { type: "text", nullable: true }, started_at: { type: "timestamptz" }, finished_at: { type: "timestamptz", nullable: true },
    }, indexes: ["publication, finished_at DESC"],
  },
  investigative_leads: {
    primaryKey: ["id"], columns: {
      id: { type: "uuid" }, investigation_id: { type: "uuid", references: "investigations.id" }, source_article_id: { type: "uuid", references: "source_articles.id" },
      version: { type: "integer" }, status: { type: "text" }, content: { type: "jsonb" }, model: { type: "text", nullable: true },
      created_by_user_id: { type: "uuid", references: "users.id" }, approved_by_user_id: { type: "uuid", references: "users.id", nullable: true },
      approved_at: { type: "timestamptz", nullable: true }, ...auditColumns,
    }, unique: ["investigation_id, version"], indexes: ["investigation_id, status"],
  },
  evidence_assessments: {
    primaryKey: ["id"], columns: {
      id: { type: "uuid" }, investigation_id: { type: "uuid", references: "investigations.id" }, lead_id: { type: "uuid", references: "investigative_leads.id" },
      version: { type: "integer" }, content: { type: "jsonb" }, input_snapshot_hash: { type: "text" }, model: { type: "text", nullable: true },
      created_by_user_id: { type: "uuid", references: "users.id" }, ...auditColumns,
    }, unique: ["lead_id, version"], indexes: ["investigation_id, created_at DESC"],
  },
  investigation_plans: {
    primaryKey: ["id"], columns: {
      id: { type: "uuid" }, investigation_id: { type: "uuid", references: "investigations.id" }, lead_id: { type: "uuid", references: "investigative_leads.id" },
      evidence_assessment_id: { type: "uuid", references: "evidence_assessments.id" }, version: { type: "integer" }, content: { type: "jsonb" },
      model: { type: "text", nullable: true }, created_by_user_id: { type: "uuid", references: "users.id" }, ...auditColumns,
    }, unique: ["investigation_id, version"], indexes: ["investigation_id, created_at DESC"],
  },
  investigation_actions: {
    primaryKey: ["id"], columns: {
      id: { type: "uuid" }, investigation_plan_id: { type: "uuid", references: "investigation_plans.id" }, position: { type: "integer" }, status: { type: "text" },
      question_or_claim: { type: "text" }, evidence_sought: { type: "text" }, possible_source: { type: "text" }, verification_method: { type: "text" }, limitations: { type: "text" },
      created_by_user_id: { type: "uuid", references: "users.id" }, ...auditColumns,
    }, unique: ["investigation_plan_id, position"],
  },
  deep_research_reports: {
    primaryKey: ["id"], columns: {
      id: { type: "uuid" }, investigation_id: { type: "uuid", references: "investigations.id" }, source_article_id: { type: "uuid", references: "source_articles.id" },
      version: { type: "integer" }, instructions: { type: "text", nullable: true }, input_snapshot_hash: { type: "text" }, research_plan: { type: "jsonb" }, report: { type: "jsonb" }, sources: { type: "jsonb" },
      model: { type: "text", nullable: true }, created_by_user_id: { type: "uuid", references: "users.id" }, ...auditColumns,
    }, unique: ["investigation_id, version"], indexes: ["investigation_id, created_at DESC", "investigation_id, source_article_id, input_snapshot_hash"],
  },
  ai_operations: {
    primaryKey: ["id"], columns: {
      id: { type: "uuid" }, user_id: { type: "uuid", references: "users.id" }, investigation_id: { type: "uuid", references: "investigations.id" },
      stage: { type: "text" }, idempotency_key: { type: "text" }, model: { type: "text" }, status: { type: "text" },
      provider_request_id: { type: "text", nullable: true }, error_code: { type: "text", nullable: true }, ...auditColumns,
    }, unique: ["user_id, idempotency_key"], indexes: ["investigation_id, created_at DESC"],
  },
  usage_records: {
    primaryKey: ["id"], columns: {
      id: { type: "uuid" }, user_id: { type: "uuid", references: "users.id" }, operation_id: { type: "uuid", references: "ai_operations.id" },
      stage: { type: "text" }, model: { type: "text" }, status: { type: "text" }, input_tokens: { type: "integer", nullable: true },
      output_tokens: { type: "integer", nullable: true }, estimated_cost_micros: { type: "bigint", nullable: true }, ...auditColumns,
    }, indexes: ["user_id, created_at DESC", "user_id, stage, created_at DESC"],
  },
} as const satisfies Record<string, PostgresTable>;

// Retaining these unions here makes planned SQL adapters reject invalid stages.
export type PersistedOperationStage = AiOperationStage;
export type PersistedOperationStatus = AiOperationStatus;
export type PersistedUsageStatus = UsageStatus;
