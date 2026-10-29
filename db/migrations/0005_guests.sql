-- Guest mode: people can use Journol without an account. A guest is a user
-- row tied to one browser by a signed cookie; their work moves to their
-- account if they sign up, and unclaimed guests are deleted after 30 days.
ALTER TABLE users ADD COLUMN is_guest boolean NOT NULL DEFAULT false;
CREATE INDEX users_guests_created ON users (created_at) WHERE is_guest;

-- A one-way hash of the connection's IP address, kept only on guest runs,
-- so clearing cookies doesn't buy more free stories.
ALTER TABLE usage_events ADD COLUMN ip_hash text;
ALTER TABLE usage_events ADD COLUMN guest boolean NOT NULL DEFAULT false;
CREATE INDEX usage_events_ip ON usage_events (ip_hash, created_at DESC) WHERE ip_hash IS NOT NULL;
