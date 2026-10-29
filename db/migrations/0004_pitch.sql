-- A story pitch written from an angle: a working title and a ~250-word body.
ALTER TABLE angles ADD COLUMN pitch jsonb;

-- Writing a pitch counts toward the daily allowance like other AI runs.
ALTER TABLE usage_events DROP CONSTRAINT usage_events_kind_check;
ALTER TABLE usage_events ADD CONSTRAINT usage_events_kind_check CHECK (kind IN ('analysis', 'angles', 'pitch'));
