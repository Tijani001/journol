-- Explicit bookmarks for versioned Deep Research reports. Reports themselves
-- remain automatically persisted for workflow recovery; this relationship is
-- the journalist's deliberate Saved Research library choice.
CREATE TABLE saved_deep_research_reports (
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  deep_research_report_id UUID NOT NULL REFERENCES deep_research_reports(id) ON DELETE CASCADE,
  saved_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, deep_research_report_id)
);

CREATE INDEX saved_deep_research_reports_user_saved_at_idx
  ON saved_deep_research_reports (user_id, saved_at DESC);
