-- Usage logging, RPCs, presets, provider keys, and profile columns
-- Safe to re-run (IF NOT EXISTS / CREATE OR REPLACE everywhere)

-- Usage logs table
CREATE TABLE IF NOT EXISTS usage_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  request_id TEXT NOT NULL,
  model_name TEXT NOT NULL,
  provider TEXT,
  tokens_in INT DEFAULT 0,
  tokens_out INT DEFAULT 0,
  cost NUMERIC(10,6) DEFAULT 0,
  route TEXT,
  prompt TEXT,
  response TEXT,
  latency_ms INT,
  cluster_id TEXT,
  metadata JSONB,
  error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_usage_logs_user_date ON usage_logs(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_usage_logs_user_cost ON usage_logs(user_id, created_at) WHERE cost > 0;
CREATE INDEX IF NOT EXISTS idx_usage_logs_model ON usage_logs(model_name, created_at DESC);

ALTER TABLE usage_logs ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='usage_logs' AND policyname='usage_logs_user_select') THEN
    CREATE POLICY usage_logs_user_select ON usage_logs FOR SELECT USING (auth.uid() = user_id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='usage_logs' AND policyname='usage_logs_service_insert') THEN
    CREATE POLICY usage_logs_service_insert ON usage_logs FOR INSERT WITH CHECK (true);
  END IF;
END $$;

-- View for analytics: daily aggregates per user
CREATE OR REPLACE VIEW usage_stats_daily AS
SELECT
  user_id,
  date_trunc('day', created_at)::date AS day,
  COUNT(*) AS requests,
  SUM(tokens_in) AS total_tokens_in,
  SUM(tokens_out) AS total_tokens_out,
  SUM(cost) AS total_cost,
  AVG(latency_ms) AS avg_latency_ms
FROM usage_logs
GROUP BY user_id, date_trunc('day', created_at)::date;

-- RPC: comprehensive usage logging (called from backend)
CREATE OR REPLACE FUNCTION log_usage_comprehensive(
  p_request_id TEXT, p_user_id UUID, p_model_name TEXT, p_provider TEXT,
  p_tokens_in INT, p_tokens_out INT, p_cost NUMERIC, p_route TEXT,
  p_prompt TEXT DEFAULT NULL, p_response TEXT DEFAULT NULL,
  p_latency_ms INT DEFAULT NULL, p_cluster_id TEXT DEFAULT NULL,
  p_metadata JSONB DEFAULT NULL
) RETURNS UUID AS $$
DECLARE v_id UUID;
BEGIN
  INSERT INTO usage_logs (request_id, user_id, model_name, provider, tokens_in, tokens_out, cost, route, prompt, response, latency_ms, cluster_id, metadata)
  VALUES (p_request_id, p_user_id, p_model_name, p_provider, p_tokens_in, p_tokens_out, p_cost, p_route, p_prompt, p_response, p_latency_ms, p_cluster_id, p_metadata)
  RETURNING id INTO v_id;
  UPDATE profiles SET cost_this_month = COALESCE(cost_this_month, 0) + p_cost WHERE id = p_user_id;
  RETURN v_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- RPC: atomic budget check and reserve
CREATE OR REPLACE FUNCTION check_and_reserve_budget(p_user_id UUID, p_estimated_cost NUMERIC) RETURNS BOOLEAN AS $$
DECLARE v_limit NUMERIC; v_used NUMERIC;
BEGIN
  SELECT budget_limit, COALESCE(cost_this_month, 0) INTO v_limit, v_used FROM profiles WHERE id = p_user_id FOR UPDATE;
  IF v_limit IS NULL THEN RETURN TRUE; END IF;
  IF v_used + p_estimated_cost > v_limit THEN RETURN FALSE; END IF;
  UPDATE profiles SET cost_this_month = v_used + p_estimated_cost WHERE id = p_user_id;
  RETURN TRUE;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Presets table
CREATE TABLE IF NOT EXISTS presets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  selected_models TEXT[] DEFAULT '{}',
  model_parameters JSONB DEFAULT '{}',
  is_default BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_presets_user ON presets(user_id);
ALTER TABLE presets ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='presets' AND policyname='presets_user_policy') THEN
    CREATE POLICY presets_user_policy ON presets FOR ALL USING (auth.uid() = user_id);
  END IF;
END $$;

-- Provider keys table (BYOK)
CREATE TABLE IF NOT EXISTS provider_keys (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  provider TEXT NOT NULL,
  encrypted_key TEXT NOT NULL,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(user_id, provider)
);
ALTER TABLE provider_keys ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='provider_keys' AND policyname='provider_keys_user_policy') THEN
    CREATE POLICY provider_keys_user_policy ON provider_keys FOR ALL USING (auth.uid() = user_id);
  END IF;
END $$;

-- Add missing profile columns
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='profiles' AND column_name='cost_this_month') THEN
    ALTER TABLE profiles ADD COLUMN cost_this_month NUMERIC(10,2) DEFAULT 0;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='profiles' AND column_name='budget_limit') THEN
    ALTER TABLE profiles ADD COLUMN budget_limit NUMERIC(10,2);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='profiles' AND column_name='hosted_budget_usd') THEN
    ALTER TABLE profiles ADD COLUMN hosted_budget_usd NUMERIC(10,2);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='profiles' AND column_name='model_parameters') THEN
    ALTER TABLE profiles ADD COLUMN model_parameters JSONB DEFAULT '{}';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='profiles' AND column_name='provider_budgets') THEN
    ALTER TABLE profiles ADD COLUMN provider_budgets JSONB DEFAULT '{}';
  END IF;
END $$;
