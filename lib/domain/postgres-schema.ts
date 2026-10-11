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
      original_url: { type: "text" }, canonical_url: { type: "text", nullable: true }, title: { type: "text", nullable: true },
      publisher: { type: "text", nullable: true }, published_at: { type: "timestamptz", nullable: true }, extracted_text: { type: "text" }, content_hash: { type: "text" },
      retrieval_status: { type: "text" }, retrieved_at: { type: "timestamptz" }, ...auditColumns,
    }, indexes: ["owner_user_id, created_at DESC", "owner_user_id, canonical_url", "owner_user_id, published_at DESC"],
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
    },
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
