-- Per-request decision log for IP-1 verifier-gated cascade routing.
-- Every dispatch_with_verifier call writes one row when cascade is enabled
-- and the verifier ran. Shadow-mode rows have escalated=false even when
-- verifier_accepted=false; active-mode rows reflect the actual dispatch.
--
-- Blueprint: competitor-profiles/blueprints/ip-1-verifier-gated-cascade.md
-- DO NOT apply via mcp__supabase__apply_migration without founder approval
-- per the workstream policy. Hold for Phase 1 cutover (IP-1 W5-6).

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
