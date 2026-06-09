-- Per-turn PDR (Prompt Decomposition Routing) shadow-mode + production decision log.
-- Spec: IP-2 blueprint Section 7.
--
-- One row per classified turn. `source` distinguishes classifier output from
-- heuristic_fallback (v0 default until the trained head ships) and from
-- explicit user overrides. `pdr_mode` carries 'mode_a' today; 'mode_b' lands
-- in Cycle 5+ alongside the orchestrator-fills recomposer.
--
-- NOTE: this file is checked in for review only; apply via Supabase MCP
-- `apply_migration` after founder approval.

CREATE TABLE IF NOT EXISTS decomposer_decisions (
    id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    created_at      timestamptz NOT NULL DEFAULT now(),
    user_id         uuid REFERENCES auth.users(id) ON DELETE SET NULL,
    api_key_id      uuid,
    request_id      text NOT NULL,
    turn_index      int  NOT NULL DEFAULT 0,
    sub_task        text NOT NULL,
    confidence      float8 NOT NULL,
    tier_assigned   text NOT NULL,
    model_assigned  text NOT NULL,
    source          text NOT NULL,
    latency_ms      int,
    pdr_mode        text NOT NULL DEFAULT 'mode_a',
    metadata        jsonb
);

CREATE INDEX IF NOT EXISTS decomposer_decisions_user_idx
    ON decomposer_decisions (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS decomposer_decisions_request_idx
    ON decomposer_decisions (request_id);
