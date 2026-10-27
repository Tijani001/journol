-- Journol: published stories, the angles found in them, and what each
-- journalist saves. Stories are shared; analyses and angles belong to a user.

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  auth_issuer text NOT NULL,
  auth_subject text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (auth_issuer, auth_subject)
);

CREATE TABLE articles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  url text NOT NULL UNIQUE,
  title text NOT NULL,
  publisher text NOT NULL,
  published_at timestamptz,
  body text NOT NULL,
  fetched_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE analyses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  article_id uuid NOT NULL REFERENCES articles(id) ON DELETE CASCADE,
  gaps jsonb NOT NULL DEFAULT '[]'::jsonb,
  related jsonb NOT NULL DEFAULT '[]'::jsonb,
  repeated_count integer NOT NULL DEFAULT 0,
  search_status text NOT NULL CHECK (search_status IN ('searched', 'no_results', 'unavailable')),
  engine_version text NOT NULL,
  model text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX analyses_user_created ON analyses (user_id, created_at DESC);
CREATE INDEX analyses_user_article ON analyses (user_id, article_id, created_at DESC);

CREATE TABLE angles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  analysis_id uuid NOT NULL REFERENCES analyses(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  round integer NOT NULL CHECK (round >= 1),
  position integer NOT NULL CHECK (position >= 0),
  content jsonb NOT NULL,
  saved_at timestamptz,
  status text NOT NULL DEFAULT 'new' CHECK (status IN ('new', 'reporting', 'published')),
  steps_done boolean[] NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (analysis_id, round, position)
);
CREATE INDEX angles_user_saved ON angles (user_id, saved_at DESC) WHERE saved_at IS NOT NULL;

-- Each AI run (a new story or a fresh round of angles) counts toward a
-- journalist's daily allowance.
CREATE TABLE usage_events (
  id bigserial PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  kind text NOT NULL CHECK (kind IN ('analysis', 'angles')),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX usage_events_user_created ON usage_events (user_id, created_at DESC);
