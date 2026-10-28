-- Launch additions: stories pasted as text, feedback on angles, and a record
-- of failures so the owner can see what's going wrong.

-- A story the journalist pasted (because its link couldn't be read).
ALTER TABLE articles ADD COLUMN pasted boolean NOT NULL DEFAULT false;

CREATE TABLE angle_feedback (
  angle_id uuid NOT NULL REFERENCES angles(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  verdict text NOT NULL CHECK (verdict IN ('useful', 'not_useful')),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (angle_id, user_id)
);
CREATE INDEX angle_feedback_updated ON angle_feedback (updated_at DESC);

-- Only the kind of failure, the website's name and a short code are kept;
-- never the story text.
CREATE TABLE failures (
  id bigserial PRIMARY KEY,
  user_id uuid REFERENCES users(id) ON DELETE SET NULL,
  kind text NOT NULL,
  code text NOT NULL,
  host text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX failures_created ON failures (created_at DESC);
CREATE INDEX usage_events_created ON usage_events (created_at DESC);
