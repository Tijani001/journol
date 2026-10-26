-- Public records: an audit trail of each lookup made for an investigation,
-- and a locally indexed copy of federal procurement awards from the Bureau of
-- Public Procurement's open contracting data (NOCOPO, published as OCDS).

CREATE EXTENSION IF NOT EXISTS pg_trgm;

CREATE TABLE public_record_lookups (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  investigation_id uuid NOT NULL REFERENCES investigations(id) ON DELETE CASCADE,
  query text NOT NULL CHECK (char_length(btrim(query)) BETWEEN 1 AND 300),
  record_types jsonb NOT NULL CHECK (jsonb_typeof(record_types) = 'array'),
  results jsonb NOT NULL CHECK (jsonb_typeof(results) = 'array'),
  -- Per-collection status (searched, no results, not configured, unavailable).
  outcomes jsonb NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(outcomes) = 'array'),
  created_by_user_id uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX public_record_lookups_investigation_created_idx
  ON public_record_lookups (investigation_id, created_at DESC);

-- One row per award in a contracting process. This is public data shared by
-- every account; it holds no journalist information.
CREATE TABLE procurement_awards (
  ocid text NOT NULL CHECK (char_length(ocid) BETWEEN 1 AND 200),
  award_id text NOT NULL CHECK (char_length(award_id) BETWEEN 1 AND 200),
  publication text NOT NULL DEFAULT 'nigeria_bpp',
  buyer_name text NULL,
  title text NULL,
  description text NULL,
  supplier_names text[] NOT NULL DEFAULT '{}',
  amount numeric NULL,
  currency text NULL,
  award_date timestamptz NULL,
  award_status text NULL,
  procurement_method text NULL,
  contract_amount numeric NULL,
  contract_currency text NULL,
  release_date timestamptz NULL,
  -- Lower-cased buyer, supplier and title text used for fuzzy search.
  search_text text NOT NULL,
  ingested_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (ocid, award_id)
);
CREATE INDEX procurement_awards_search_trgm_idx
  ON procurement_awards USING gin (search_text gin_trgm_ops);
CREATE INDEX procurement_awards_award_date_idx ON procurement_awards (award_date DESC);

CREATE TABLE procurement_ingestion_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  publication text NOT NULL,
  source_file text NOT NULL,
  status text NOT NULL CHECK (status IN ('running', 'succeeded', 'failed')),
  processes_read integer NOT NULL DEFAULT 0 CHECK (processes_read >= 0),
  awards_upserted integer NOT NULL DEFAULT 0 CHECK (awards_upserted >= 0),
  error text NULL,
  started_at timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz NULL
);
CREATE INDEX procurement_ingestion_runs_publication_finished_idx
  ON procurement_ingestion_runs (publication, finished_at DESC);
