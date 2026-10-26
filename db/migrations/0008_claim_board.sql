-- The claim board: each claim an investigation must test, the evidence the
-- journalist attaches to it, and a verdict with its rationale and history.

CREATE TABLE investigation_claims (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  investigation_id uuid NOT NULL REFERENCES investigations(id) ON DELETE CASCADE,
  statement text NOT NULL CHECK (char_length(btrim(statement)) BETWEEN 1 AND 1000),
  origin text NOT NULL DEFAULT 'manual'
    CHECK (origin IN ('manual', 'plan_known_information', 'plan_verification')),
  -- Stable key for claims imported from a plan, so a repeat import adds
  -- only the claims that are not on the board yet.
  origin_key text NULL CHECK (origin_key IS NULL OR char_length(origin_key) <= 200),
  verdict text NOT NULL DEFAULT 'unverified'
    CHECK (verdict IN ('unverified', 'confirmed', 'partly_confirmed', 'contradicted', 'unproven')),
  verdict_rationale text NULL CHECK (verdict_rationale IS NULL OR char_length(verdict_rationale) <= 4000),
  verdict_set_by_user_id uuid NULL REFERENCES users(id) ON DELETE RESTRICT,
  verdict_set_at timestamptz NULL,
  created_by_user_id uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  -- A verdict other than "unverified" must say why.
  CONSTRAINT investigation_claims_rationale_required_check
    CHECK (verdict = 'unverified' OR char_length(btrim(coalesce(verdict_rationale, ''))) > 0)
);
CREATE INDEX investigation_claims_investigation_created_idx
  ON investigation_claims (investigation_id, created_at);
CREATE UNIQUE INDEX investigation_claims_origin_key_unique
  ON investigation_claims (investigation_id, origin_key) WHERE origin_key IS NOT NULL;
CREATE TRIGGER investigation_claims_set_updated_at
  BEFORE UPDATE ON investigation_claims FOR EACH ROW EXECUTE FUNCTION journol_set_updated_at();

CREATE TABLE claim_evidence (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  claim_id uuid NOT NULL REFERENCES investigation_claims(id) ON DELETE CASCADE,
  evidence_kind text NOT NULL CHECK (evidence_kind IN ('source', 'public_record', 'web', 'note')),
  stance text NOT NULL CHECK (stance IN ('supports', 'contradicts', 'context')),
  source_article_id uuid NULL REFERENCES source_articles(id) ON DELETE RESTRICT,
  url text NULL CHECK (url IS NULL OR (char_length(url) <= 2000 AND url ~* '^https?://')),
  title text NULL CHECK (title IS NULL OR char_length(title) <= 500),
  record_type text NULL CHECK (record_type IS NULL OR char_length(record_type) <= 100),
  excerpt text NULL CHECK (excerpt IS NULL OR char_length(excerpt) <= 4000),
  note text NULL CHECK (note IS NULL OR char_length(note) <= 4000),
  -- For a quoted excerpt from a stored source: whether Journol found that
  -- passage in the source's extracted text. NULL when there is nothing to check.
  excerpt_found_in_source boolean NULL,
  added_by_user_id uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT claim_evidence_source_reference_check
    CHECK (evidence_kind <> 'source' OR source_article_id IS NOT NULL),
  CONSTRAINT claim_evidence_url_reference_check
    CHECK (evidence_kind NOT IN ('public_record', 'web') OR url IS NOT NULL),
  CONSTRAINT claim_evidence_note_required_check
    CHECK (evidence_kind <> 'note' OR char_length(btrim(coalesce(note, ''))) > 0)
);
CREATE INDEX claim_evidence_claim_created_idx ON claim_evidence (claim_id, created_at);
CREATE INDEX claim_evidence_source_article_idx ON claim_evidence (source_article_id) WHERE source_article_id IS NOT NULL;
CREATE TRIGGER claim_evidence_set_updated_at
  BEFORE UPDATE ON claim_evidence FOR EACH ROW EXECUTE FUNCTION journol_set_updated_at();

-- Append-only history of verdict changes, for editorial accountability.
CREATE TABLE claim_verdict_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  claim_id uuid NOT NULL REFERENCES investigation_claims(id) ON DELETE CASCADE,
  verdict text NOT NULL
    CHECK (verdict IN ('unverified', 'confirmed', 'partly_confirmed', 'contradicted', 'unproven')),
  rationale text NULL CHECK (rationale IS NULL OR char_length(rationale) <= 4000),
  set_by_user_id uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX claim_verdict_events_claim_created_idx ON claim_verdict_events (claim_id, created_at);
