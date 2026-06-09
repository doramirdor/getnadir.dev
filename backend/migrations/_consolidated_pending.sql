-- Consolidated pending migrations for Nadir IP rollout.
-- Apply via Supabase Dashboard SQL editor:
-- https://supabase.com/dashboard/project/cxqmqnlouozrhsprtdcb/sql
--
-- All four migrations are additive + reversible. Safe to apply in one shot.
-- Order matters only for the cascade_decisions FK note at the bottom.

-- =========================================================================
-- 1. routing_arms (bandit posterior state, from WS-3)
-- =========================================================================
CREATE TABLE IF NOT EXISTS routing_arms (
    id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    api_key_id      uuid NOT NULL,
    cluster_id      text NOT NULL,
    arm_model       text NOT NULL,
    mu              float8[] NOT NULL,
    lambda_matrix   float8[][] NOT NULL,
    alpha           float8 NOT NULL DEFAULT 2.0,
    beta            float8 NOT NULL DEFAULT 1.0,
    n_obs           integer NOT NULL DEFAULT 0,
    last_updated    timestamptz NOT NULL DEFAULT now(),
    created_at      timestamptz NOT NULL DEFAULT now(),
    UNIQUE (api_key_id, cluster_id, arm_model)
);
CREATE INDEX IF NOT EXISTS routing_arms_lookup_idx ON routing_arms (api_key_id, cluster_id);
CREATE INDEX IF NOT EXISTS routing_arms_updated_idx ON routing_arms (last_updated);

-- Concurrent-write pattern (optimistic upsert) — for reference:
-- INSERT INTO routing_arms (...) VALUES (...)
-- ON CONFLICT (api_key_id, cluster_id, arm_model)
-- DO UPDATE SET mu=EXCLUDED.mu, lambda_matrix=EXCLUDED.lambda_matrix, ...,
--   n_obs = routing_arms.n_obs + 1, last_updated = now()
-- WHERE routing_arms.n_obs = EXCLUDED.n_obs - 1;

-- =========================================================================
-- 2. bandit_reward_log (dedup, from WS-3)
-- =========================================================================
CREATE TABLE IF NOT EXISTS bandit_reward_log (
    id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    request_id      text NOT NULL,
    update_source   text NOT NULL,  -- 'immediate' or 'delayed_override'
    rewarded_at     timestamptz NOT NULL DEFAULT now(),
    UNIQUE (request_id, update_source)
);
CREATE INDEX IF NOT EXISTS bandit_reward_log_request_idx ON bandit_reward_log (request_id);

-- =========================================================================
-- 3. cascade_decisions (verifier-gated cascade analytics, from IP-1)
-- =========================================================================
CREATE TABLE IF NOT EXISTS cascade_decisions (
    id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    request_id           uuid NOT NULL,
    user_id              uuid NOT NULL,
    cheap_model          text NOT NULL,
    escalation_model     text NOT NULL,
    verifier_score       float4,
    acceptance_threshold float4 NOT NULL,
    verifier_accepted    boolean NOT NULL,
    escalated            boolean NOT NULL,
    shadow_mode          boolean NOT NULL DEFAULT false,
    verifier_latency_ms  float4,
    created_at           timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS cd_user_created_idx ON cascade_decisions (user_id, created_at);
CREATE INDEX IF NOT EXISTS cd_escalated_idx    ON cascade_decisions (escalated, created_at);

-- =========================================================================
-- 4. decomposer_decisions (PDR Mode A analytics, from IP-2)
-- =========================================================================
CREATE TABLE IF NOT EXISTS decomposer_decisions (
    id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    created_at      timestamptz NOT NULL DEFAULT now(),
    user_id         uuid,
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
CREATE INDEX IF NOT EXISTS decomposer_decisions_user_idx ON decomposer_decisions (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS decomposer_decisions_request_idx ON decomposer_decisions (request_id);

-- All four applied. Backend code already references these tables behind
-- feature flags (cascade.enabled, pdr.enabled, bandit.enabled — all default
-- false). Applying the migrations does not change routing behavior until a
-- user opts in via `profiles.model_parameters`.
