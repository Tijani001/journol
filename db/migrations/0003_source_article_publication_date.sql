ALTER TABLE source_articles
  ADD COLUMN IF NOT EXISTS published_at timestamptz NULL;

CREATE INDEX IF NOT EXISTS source_articles_owner_published_idx
  ON source_articles (owner_user_id, published_at DESC)
  WHERE published_at IS NOT NULL;
