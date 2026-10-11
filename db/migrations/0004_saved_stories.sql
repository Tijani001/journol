-- Account-backed bookmarks are deliberately separate from source extraction
-- and investigations: saving a feed item must not trigger article retrieval.
CREATE TABLE saved_stories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  canonical_url text NOT NULL,
  original_url text NOT NULL,
  title text NOT NULL CHECK (char_length(title) BETWEEN 1 AND 500),
  publisher text NULL CHECK (publisher IS NULL OR char_length(publisher) <= 240),
  published_at timestamptz NULL,
  description text NULL CHECK (description IS NULL OR char_length(description) <= 4000),
  saved_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT saved_stories_user_canonical_url_unique UNIQUE (user_id, canonical_url)
);

CREATE INDEX saved_stories_user_saved_idx ON saved_stories (user_id, saved_at DESC);
CREATE TRIGGER saved_stories_set_updated_at BEFORE UPDATE ON saved_stories FOR EACH ROW EXECUTE FUNCTION journol_set_updated_at();
