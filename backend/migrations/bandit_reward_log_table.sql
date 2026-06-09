-- Dedup table for bandit reward updates.
-- Per WS-3 reviewer must-fix #5: override-detected requests must not get
-- double-counted when both the immediate path and the delayed override path
-- attempt to update the posterior.
--
-- Insert with ON CONFLICT DO NOTHING from each update site; the unique
-- constraint on (request_id, update_source) blocks duplicate updates from
-- the same source, and the application layer is responsible for skipping
-- the immediate update if a delayed_override row already exists for the
-- same request_id.

CREATE TABLE IF NOT EXISTS bandit_reward_log (
    id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    request_id      text NOT NULL,
    update_source   text NOT NULL,  -- 'immediate' or 'delayed_override'
    rewarded_at     timestamptz NOT NULL DEFAULT now(),
    UNIQUE (request_id, update_source)
);

CREATE INDEX IF NOT EXISTS bandit_reward_log_request_idx ON bandit_reward_log (request_id);
