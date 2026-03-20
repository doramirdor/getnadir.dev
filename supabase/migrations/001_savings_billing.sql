-- Savings-based billing schema for getnadir.com
-- Pricing: $9/mo base + 25% of first $2K saved + 10% above $2K

-- Per-request savings tracking
CREATE TABLE IF NOT EXISTS savings_tracking (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  request_id UUID NOT NULL,
  api_key_id UUID REFERENCES api_keys(id) ON DELETE SET NULL,
  benchmark_model TEXT NOT NULL,
  benchmark_cost_usd NUMERIC(10,6) NOT NULL DEFAULT 0,
  routed_model TEXT NOT NULL,
  routed_cost_usd NUMERIC(10,6) NOT NULL DEFAULT 0,
  savings_usd NUMERIC(10,6) NOT NULL DEFAULT 0,
  prompt_tokens INT DEFAULT 0,
  completion_tokens INT DEFAULT 0,
  complexity_tier TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_savings_user_date
  ON savings_tracking(user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_savings_user_period
  ON savings_tracking(user_id, created_at)
  WHERE savings_usd > 0;

-- Monthly savings invoices
CREATE TABLE IF NOT EXISTS savings_invoices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  billing_period_start DATE NOT NULL,
  billing_period_end DATE NOT NULL,
  total_savings_usd NUMERIC(10,2) NOT NULL DEFAULT 0,
  base_fee_usd NUMERIC(10,2) NOT NULL DEFAULT 9.00,
  savings_fee_usd NUMERIC(10,2) NOT NULL DEFAULT 0,
  total_invoice_usd NUMERIC(10,2) NOT NULL DEFAULT 0,
  stripe_invoice_id TEXT,
  status TEXT NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft', 'finalized', 'paid', 'failed', 'void')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  paid_at TIMESTAMPTZ,
  UNIQUE(user_id, billing_period_start)
);

-- Stripe webhook event log for idempotency
CREATE TABLE IF NOT EXISTS stripe_events (
  id TEXT PRIMARY KEY,
  event_type TEXT NOT NULL,
  processed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  payload JSONB
);

-- Row Level Security
ALTER TABLE savings_tracking ENABLE ROW LEVEL SECURITY;
ALTER TABLE savings_invoices ENABLE ROW LEVEL SECURITY;

-- Users can only see their own savings
CREATE POLICY savings_tracking_user_policy ON savings_tracking
  FOR ALL USING (auth.uid() = user_id);

CREATE POLICY savings_invoices_user_policy ON savings_invoices
  FOR ALL USING (auth.uid() = user_id);

-- Service role can insert savings (from backend)
CREATE POLICY savings_tracking_service_insert ON savings_tracking
  FOR INSERT WITH CHECK (true);

CREATE POLICY savings_invoices_service_insert ON savings_invoices
  FOR INSERT WITH CHECK (true);

-- Helper function: calculate savings fee
CREATE OR REPLACE FUNCTION calculate_savings_fee(total_savings NUMERIC)
RETURNS NUMERIC AS $$
BEGIN
  RETURN 9.00
    + LEAST(total_savings, 2000) * 0.25
    + GREATEST(total_savings - 2000, 0) * 0.10;
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- View: current month savings per user (for dashboard queries)
CREATE OR REPLACE VIEW current_month_savings AS
SELECT
  user_id,
  COUNT(*) AS requests,
  SUM(benchmark_cost_usd) AS total_benchmark,
  SUM(routed_cost_usd) AS total_spent,
  SUM(savings_usd) AS total_savings,
  calculate_savings_fee(SUM(savings_usd)) AS projected_fee,
  SUM(savings_usd) - calculate_savings_fee(SUM(savings_usd)) AS net_savings
FROM savings_tracking
WHERE created_at >= date_trunc('month', now())
GROUP BY user_id;
