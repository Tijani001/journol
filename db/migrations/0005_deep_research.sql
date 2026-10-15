-- Optional, source-attributed Deep Research reports. This migration is append-only.
CREATE TABLE deep_research_reports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  investigation_id uuid NOT NULL REFERENCES investigations(id) ON DELETE CASCADE,
  source_article_id uuid NOT NULL REFERENCES source_articles(id) ON DELETE RESTRICT,
  version integer NOT NULL CHECK (version > 0),
  instructions text NULL CHECK (instructions IS NULL OR char_length(instructions) <= 2000),
  input_snapshot_hash text NOT NULL,
  research_plan jsonb NOT NULL,
  report jsonb NOT NULL,
  sources jsonb NOT NULL,
  model text NULL,
  created_by_user_id uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT deep_research_reports_investigation_version_unique UNIQUE (investigation_id, version)
);
CREATE INDEX deep_research_reports_investigation_created_idx ON deep_research_reports (investigation_id, created_at DESC);
CREATE INDEX deep_research_reports_snapshot_idx ON deep_research_reports (investigation_id, source_article_id, input_snapshot_hash);
CREATE TRIGGER deep_research_reports_set_updated_at BEFORE UPDATE ON deep_research_reports FOR EACH ROW EXECUTE FUNCTION journol_set_updated_at();

-- The original foundation predates Deep Research. Extend its checked values
-- without changing any existing rows or loosening other constraints.
ALTER TABLE ai_operations DROP CONSTRAINT IF EXISTS ai_operations_stage_check;
ALTER TABLE ai_operations ADD CONSTRAINT ai_operations_stage_check CHECK (stage IN ('lead_selection', 'evidence_assessment', 'investigation_plan', 'deep_research'));
ALTER TABLE usage_records DROP CONSTRAINT IF EXISTS usage_records_stage_check;
ALTER TABLE usage_records ADD CONSTRAINT usage_records_stage_check CHECK (stage IN ('lead_selection', 'evidence_assessment', 'investigation_plan', 'deep_research'));
