-- Explicit library membership is separate from workflow persistence.
CREATE TABLE saved_investigations (
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  investigation_id uuid NOT NULL REFERENCES investigations(id) ON DELETE CASCADE,
  saved_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, investigation_id)
);
CREATE INDEX saved_investigations_user_saved_idx ON saved_investigations (user_id, saved_at DESC);
