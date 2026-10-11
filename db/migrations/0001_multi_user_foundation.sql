-- Journol PostgreSQL foundation. Applied only by `npm run db:migrate`.
-- This migration is append-only: never edit it after applying it to any shared DB.

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  auth_issuer text NOT NULL,
  auth_subject text NOT NULL,
  email text NULL,
  role text NOT NULL DEFAULT 'journalist' CHECK (role IN ('journalist', 'administrator')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT users_auth_identity_unique UNIQUE (auth_issuer, auth_subject)
);

CREATE TABLE investigations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_user_id uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  title text NOT NULL CHECK (char_length(title) BETWEEN 1 AND 240),
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'archived', 'closed')),
  current_lead_id uuid NULL,
  current_evidence_assessment_id uuid NULL,
  current_plan_id uuid NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX investigations_owner_updated_idx ON investigations (owner_user_id, updated_at DESC);

CREATE TABLE source_articles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_user_id uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  original_url text NOT NULL,
  canonical_url text NULL,
  title text NULL,
  publisher text NULL,
  extracted_text text NOT NULL,
  content_hash text NOT NULL,
  retrieval_status text NOT NULL CHECK (retrieval_status IN ('retrieved', 'failed')),
  retrieved_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX source_articles_owner_created_idx ON source_articles (owner_user_id, created_at DESC);
CREATE INDEX source_articles_owner_canonical_url_idx ON source_articles (owner_user_id, canonical_url) WHERE canonical_url IS NOT NULL;

CREATE TABLE investigation_source_articles (
  investigation_id uuid NOT NULL REFERENCES investigations(id) ON DELETE CASCADE,
  source_article_id uuid NOT NULL REFERENCES source_articles(id) ON DELETE RESTRICT,
  added_by_user_id uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (investigation_id, source_article_id)
);

CREATE TABLE investigative_leads (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  investigation_id uuid NOT NULL REFERENCES investigations(id) ON DELETE CASCADE,
  source_article_id uuid NOT NULL REFERENCES source_articles(id) ON DELETE RESTRICT,
  version integer NOT NULL CHECK (version > 0),
  status text NOT NULL CHECK (status IN ('proposed', 'approved', 'rejected', 'superseded')),
  content jsonb NOT NULL,
  model text NULL,
  created_by_user_id uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  approved_by_user_id uuid NULL REFERENCES users(id) ON DELETE RESTRICT,
  approved_at timestamptz NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT investigative_leads_investigation_version_unique UNIQUE (investigation_id, version)
);
CREATE INDEX investigative_leads_investigation_status_idx ON investigative_leads (investigation_id, status);

CREATE TABLE evidence_assessments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  investigation_id uuid NOT NULL REFERENCES investigations(id) ON DELETE CASCADE,
  lead_id uuid NOT NULL REFERENCES investigative_leads(id) ON DELETE RESTRICT,
  version integer NOT NULL CHECK (version > 0),
  content jsonb NOT NULL,
  input_snapshot_hash text NOT NULL,
  model text NULL,
  created_by_user_id uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT evidence_assessments_lead_version_unique UNIQUE (lead_id, version)
);
CREATE INDEX evidence_assessments_investigation_created_idx ON evidence_assessments (investigation_id, created_at DESC);

CREATE TABLE investigation_plans (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  investigation_id uuid NOT NULL REFERENCES investigations(id) ON DELETE CASCADE,
  lead_id uuid NOT NULL REFERENCES investigative_leads(id) ON DELETE RESTRICT,
  evidence_assessment_id uuid NOT NULL REFERENCES evidence_assessments(id) ON DELETE RESTRICT,
  version integer NOT NULL CHECK (version > 0),
  content jsonb NOT NULL,
  model text NULL,
  created_by_user_id uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT investigation_plans_investigation_version_unique UNIQUE (investigation_id, version)
);
CREATE INDEX investigation_plans_investigation_created_idx ON investigation_plans (investigation_id, created_at DESC);

CREATE TABLE investigation_actions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  investigation_plan_id uuid NOT NULL REFERENCES investigation_plans(id) ON DELETE CASCADE,
  position integer NOT NULL CHECK (position > 0),
  status text NOT NULL DEFAULT 'not_started' CHECK (status IN ('not_started', 'in_progress', 'completed', 'blocked')),
  question_or_claim text NOT NULL,
  evidence_sought text NOT NULL,
  possible_source text NOT NULL,
  verification_method text NOT NULL,
  limitations text NOT NULL,
  created_by_user_id uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT investigation_actions_plan_position_unique UNIQUE (investigation_plan_id, position)
);

CREATE TABLE ai_operations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  investigation_id uuid NOT NULL REFERENCES investigations(id) ON DELETE CASCADE,
  stage text NOT NULL CHECK (stage IN ('lead_selection', 'evidence_assessment', 'investigation_plan')),
  idempotency_key text NOT NULL,
  model text NOT NULL,
  status text NOT NULL CHECK (status IN ('pending', 'succeeded', 'failed', 'cancelled')),
  provider_request_id text NULL,
  error_code text NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT ai_operations_user_idempotency_key_unique UNIQUE (user_id, idempotency_key)
);
CREATE INDEX ai_operations_investigation_created_idx ON ai_operations (investigation_id, created_at DESC);

CREATE TABLE usage_records (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  operation_id uuid NOT NULL REFERENCES ai_operations(id) ON DELETE RESTRICT,
  stage text NOT NULL CHECK (stage IN ('lead_selection', 'evidence_assessment', 'investigation_plan')),
  model text NOT NULL,
  status text NOT NULL CHECK (status IN ('reserved', 'succeeded', 'failed', 'rejected')),
  input_tokens integer NULL CHECK (input_tokens >= 0),
  output_tokens integer NULL CHECK (output_tokens >= 0),
  estimated_cost_micros bigint NULL CHECK (estimated_cost_micros >= 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX usage_records_user_created_idx ON usage_records (user_id, created_at DESC);
CREATE INDEX usage_records_user_stage_created_idx ON usage_records (user_id, stage, created_at DESC);

ALTER TABLE investigations
  ADD CONSTRAINT investigations_current_lead_fk FOREIGN KEY (current_lead_id) REFERENCES investigative_leads(id) ON DELETE SET NULL,
  ADD CONSTRAINT investigations_current_assessment_fk FOREIGN KEY (current_evidence_assessment_id) REFERENCES evidence_assessments(id) ON DELETE SET NULL,
  ADD CONSTRAINT investigations_current_plan_fk FOREIGN KEY (current_plan_id) REFERENCES investigation_plans(id) ON DELETE SET NULL;

CREATE FUNCTION journol_set_updated_at() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER users_set_updated_at BEFORE UPDATE ON users FOR EACH ROW EXECUTE FUNCTION journol_set_updated_at();
CREATE TRIGGER investigations_set_updated_at BEFORE UPDATE ON investigations FOR EACH ROW EXECUTE FUNCTION journol_set_updated_at();
CREATE TRIGGER source_articles_set_updated_at BEFORE UPDATE ON source_articles FOR EACH ROW EXECUTE FUNCTION journol_set_updated_at();
CREATE TRIGGER investigative_leads_set_updated_at BEFORE UPDATE ON investigative_leads FOR EACH ROW EXECUTE FUNCTION journol_set_updated_at();
CREATE TRIGGER evidence_assessments_set_updated_at BEFORE UPDATE ON evidence_assessments FOR EACH ROW EXECUTE FUNCTION journol_set_updated_at();
CREATE TRIGGER investigation_plans_set_updated_at BEFORE UPDATE ON investigation_plans FOR EACH ROW EXECUTE FUNCTION journol_set_updated_at();
CREATE TRIGGER investigation_actions_set_updated_at BEFORE UPDATE ON investigation_actions FOR EACH ROW EXECUTE FUNCTION journol_set_updated_at();
CREATE TRIGGER ai_operations_set_updated_at BEFORE UPDATE ON ai_operations FOR EACH ROW EXECUTE FUNCTION journol_set_updated_at();
CREATE TRIGGER usage_records_set_updated_at BEFORE UPDATE ON usage_records FOR EACH ROW EXECUTE FUNCTION journol_set_updated_at();
