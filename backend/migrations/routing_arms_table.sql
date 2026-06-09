-- Multi-tenant Thompson Sampling bandit state per (api_key, cluster, model).
-- Stores full NIG posterior (mu vector + full Lambda matrix), not diagonal.
-- Per WS-3 reviewer must-fix #4: diagonal-then-full discards rank-1 outer-product mass.

CREATE TABLE IF NOT EXISTS routing_arms (
    id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    api_key_id      uuid NOT NULL,
    cluster_id      text NOT NULL,
    arm_model       text NOT NULL,
    mu              float8[] NOT NULL,     -- d-dimensional posterior mean
    lambda_matrix   float8[][] NOT NULL,   -- full d x d precision matrix
    alpha           float8 NOT NULL DEFAULT 2.0,
    beta            float8 NOT NULL DEFAULT 1.0,
    n_obs           integer NOT NULL DEFAULT 0,
    last_updated    timestamptz NOT NULL DEFAULT now(),
    created_at      timestamptz NOT NULL DEFAULT now(),
    UNIQUE (api_key_id, cluster_id, arm_model)
);

CREATE INDEX IF NOT EXISTS routing_arms_lookup_idx ON routing_arms (api_key_id, cluster_id);
CREATE INDEX IF NOT EXISTS routing_arms_updated_idx ON routing_arms (last_updated);

-- Concurrent-write pattern (optimistic upsert):
--
-- INSERT INTO routing_arms (api_key_id, cluster_id, arm_model, mu, lambda_matrix, alpha, beta, n_obs, last_updated)
-- VALUES ($1, $2, $3, $4, $5, $6, $7, $8, now())
-- ON CONFLICT (api_key_id, cluster_id, arm_model)
-- DO UPDATE SET
--     mu = EXCLUDED.mu,
--     lambda_matrix = EXCLUDED.lambda_matrix,
--     alpha = EXCLUDED.alpha,
--     beta = EXCLUDED.beta,
--     n_obs = routing_arms.n_obs + 1,
--     last_updated = now()
-- WHERE routing_arms.n_obs = EXCLUDED.n_obs - 1;
--
-- The qualifier `routing_arms.n_obs` references the STORED value, not the incoming one.
-- Without it, the predicate silently evaluates as a tautology and conflict
-- detection never fires.
