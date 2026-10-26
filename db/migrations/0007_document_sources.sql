-- Journalist-uploaded documents become sources alongside retrieved web
-- articles, so one investigation can hold several pieces of source material.
-- Forward-only: existing rows are web articles and keep their URLs.

ALTER TABLE source_articles
  ADD COLUMN IF NOT EXISTS source_kind text NOT NULL DEFAULT 'web_article',
  ADD COLUMN IF NOT EXISTS file_name text NULL,
  ADD COLUMN IF NOT EXISTS mime_type text NULL,
  ADD COLUMN IF NOT EXISTS byte_size integer NULL,
  ADD COLUMN IF NOT EXISTS page_count integer NULL,
  ADD COLUMN IF NOT EXISTS extraction_method text NULL,
  ADD COLUMN IF NOT EXISTS extraction_notes jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS text_truncated boolean NOT NULL DEFAULT false;

-- An uploaded document has no URL; a web article must keep one.
ALTER TABLE source_articles ALTER COLUMN original_url DROP NOT NULL;

ALTER TABLE source_articles
  ADD CONSTRAINT source_articles_source_kind_check
    CHECK (source_kind IN ('web_article', 'document')),
  ADD CONSTRAINT source_articles_url_required_check
    CHECK (source_kind = 'document' OR original_url IS NOT NULL),
  ADD CONSTRAINT source_articles_document_file_check
    CHECK (source_kind <> 'document' OR (file_name IS NOT NULL AND char_length(file_name) BETWEEN 1 AND 255)),
  ADD CONSTRAINT source_articles_byte_size_check
    CHECK (byte_size IS NULL OR byte_size >= 0),
  ADD CONSTRAINT source_articles_page_count_check
    CHECK (page_count IS NULL OR page_count >= 0),
  ADD CONSTRAINT source_articles_extraction_method_check
    CHECK (extraction_method IS NULL OR extraction_method IN ('readability', 'pdf_text', 'docx_text', 'plain_text')),
  ADD CONSTRAINT source_articles_extraction_notes_array_check
    CHECK (jsonb_typeof(extraction_notes) = 'array');

-- Lets Journol recognise a document the journalist has already uploaded.
CREATE INDEX IF NOT EXISTS source_articles_owner_content_hash_idx
  ON source_articles (owner_user_id, content_hash);

-- Lists an investigation's sources in the order they were added.
CREATE INDEX IF NOT EXISTS investigation_source_articles_investigation_created_idx
  ON investigation_source_articles (investigation_id, created_at);
