-- Enhanced admin token management system
-- Drop existing token table to recreate with better structure
DROP TABLE IF EXISTS user_tokens CASCADE;

-- Ensure billing_plans table exists (in case it wasn't created yet)
CREATE TABLE IF NOT EXISTS billing_plans (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  description TEXT,
  plan_type VARCHAR(50) NOT NULL CHECK (plan_type IN ('subscription', 'pay_as_you_go', 'buy_credit')),
  price_per_month DECIMAL(10, 2), -- For subscription plans
  price_per_request DECIMAL(10, 6), -- For pay-as-you-go
  credit_amount DECIMAL(10, 2), -- For buy credit plans
  credit_price DECIMAL(10, 2), -- Price for the credit amount
  is_active BOOLEAN DEFAULT true,
  features JSONB DEFAULT '{}',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Ensure user_subscriptions table exists
CREATE TABLE IF NOT EXISTS user_subscriptions (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  plan_id UUID REFERENCES billing_plans(id),
  stripe_customer_id VARCHAR(255),
  stripe_subscription_id VARCHAR(255),
  stripe_payment_method_id VARCHAR(255),
  status VARCHAR(50) NOT NULL DEFAULT 'inactive' CHECK (status IN ('active', 'inactive', 'cancelled', 'past_due', 'trialing')),
  current_period_start TIMESTAMP WITH TIME ZONE,
  current_period_end TIMESTAMP WITH TIME ZONE,
  cancel_at_period_end BOOLEAN DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(user_id)
);

-- Ensure user_credits table exists
CREATE TABLE IF NOT EXISTS user_credits (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  balance DECIMAL(10, 2) DEFAULT 0.00,
  auto_charge_enabled BOOLEAN DEFAULT false,
  auto_charge_threshold DECIMAL(10, 2) DEFAULT 10.00,
  auto_charge_amount DECIMAL(10, 2) DEFAULT 20.00,
  upper_limit DECIMAL(10, 2), -- For pay-as-you-go upper bound
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(user_id)
);

-- Ensure credit_transactions table exists
CREATE TABLE IF NOT EXISTS credit_transactions (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  transaction_type VARCHAR(50) NOT NULL CHECK (transaction_type IN ('purchase', 'usage', 'refund', 'auto_charge', 'token_grant')),
  amount DECIMAL(10, 2) NOT NULL,
  balance_after DECIMAL(10, 2) NOT NULL,
  description TEXT,
  stripe_payment_intent_id VARCHAR(255),
  api_key_id UUID, -- Remove FK reference for now
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create admin_tokens table for token generation and management
CREATE TABLE IF NOT EXISTS admin_tokens (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  token_code VARCHAR(255) NOT NULL UNIQUE,
  token_type VARCHAR(50) NOT NULL CHECK (token_type IN ('time_limited', 'credit_token')),
  
  -- Token configuration
  name VARCHAR(255) NOT NULL, -- Human readable name for admin
  description TEXT,
  
  -- For time-limited tokens
  days_valid INTEGER,
  
  -- For credit tokens  
  credit_amount DECIMAL(10, 2),
  
  -- Usage tracking
  max_uses INTEGER DEFAULT 1, -- How many times this token can be redeemed
  current_uses INTEGER DEFAULT 0,
  
  -- Status
  is_active BOOLEAN DEFAULT true,
  created_by UUID REFERENCES auth.users(id), -- Admin who created it
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  expires_at TIMESTAMP WITH TIME ZONE, -- When token becomes invalid
  
  -- Add constraint to ensure proper token data
  CONSTRAINT check_admin_token_data CHECK (
    (token_type = 'time_limited' AND days_valid IS NOT NULL AND credit_amount IS NULL) OR
    (token_type = 'credit_token' AND credit_amount IS NOT NULL AND days_valid IS NULL)
  )
);

-- Create user_token_redemptions table to track who used what tokens
CREATE TABLE IF NOT EXISTS user_token_redemptions (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  admin_token_id UUID NOT NULL REFERENCES admin_tokens(id) ON DELETE CASCADE,
  token_code VARCHAR(255) NOT NULL,
  
  -- Redemption details
  redeemed_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  expires_at TIMESTAMP WITH TIME ZONE, -- When this user's token expires
  
  -- What was granted
  days_granted INTEGER,
  credits_granted DECIMAL(10, 2),
  
  -- Status tracking
  is_active BOOLEAN DEFAULT true,
  is_expired BOOLEAN DEFAULT false,
  
  UNIQUE(user_id, admin_token_id) -- User can only redeem same token once
);

-- Create comprehensive purchase_logs table
CREATE TABLE IF NOT EXISTS purchase_logs (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  
  -- Purchase details
  purchase_type VARCHAR(50) NOT NULL CHECK (purchase_type IN ('subscription', 'credits', 'plan_change', 'token_redemption')),
  item_name VARCHAR(255) NOT NULL,
  item_description TEXT,
  
  -- Financial details
  amount DECIMAL(10, 4) NOT NULL,
  currency VARCHAR(3) DEFAULT 'USD',
  
  -- Stripe/Payment details  
  stripe_payment_intent_id VARCHAR(255),
  stripe_customer_id VARCHAR(255),
  stripe_subscription_id VARCHAR(255),
  payment_method_id VARCHAR(255),
  
  -- Plan/Credit specific
  plan_id UUID REFERENCES billing_plans(id),
  credits_purchased DECIMAL(10, 2),
  subscription_period_start TIMESTAMP WITH TIME ZONE,
  subscription_period_end TIMESTAMP WITH TIME ZONE,
  
  -- Token redemption specific
  admin_token_id UUID REFERENCES admin_tokens(id),
  token_code VARCHAR(255),
  
  -- Status and metadata
  status VARCHAR(50) NOT NULL DEFAULT 'completed' CHECK (status IN ('pending', 'completed', 'failed', 'refunded', 'cancelled')),
  payment_status VARCHAR(50) CHECK (payment_status IN ('paid', 'unpaid', 'failed', 'refunded')),
  
  -- Timestamps
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  completed_at TIMESTAMP WITH TIME ZONE,
  
  -- Additional metadata
  metadata JSONB DEFAULT '{}',
  notes TEXT
);

-- Enhanced user_integrations table for user-specific API keys
CREATE TABLE IF NOT EXISTS user_integrations (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  
  -- Integration details
  integration_type VARCHAR(100) NOT NULL, -- 'openai', 'anthropic', 'google', etc.
  provider_name VARCHAR(100) NOT NULL,
  display_name VARCHAR(255), -- User's custom name for this integration
  
  -- API Key storage (encrypted)
  api_key_hash TEXT, -- Encrypted API key
  api_key_preview VARCHAR(20), -- Last 4 chars for display: "sk-...xyz"
  
  -- Configuration
  is_active BOOLEAN DEFAULT true,
  is_default BOOLEAN DEFAULT false, -- Default integration for this provider type
  
  -- Usage limits and settings
  daily_limit INTEGER,
  monthly_limit INTEGER,
  rate_limit_rpm INTEGER, -- Requests per minute
  
  -- Model access
  allowed_models TEXT[], -- Array of model names this key can access
  blocked_models TEXT[], -- Models to explicitly block
  
  -- Usage tracking
  requests_today INTEGER DEFAULT 0,
  requests_this_month INTEGER DEFAULT 0,
  last_used_at TIMESTAMP WITH TIME ZONE,
  
  -- Cost tracking
  cost_today DECIMAL(10, 4) DEFAULT 0,
  cost_this_month DECIMAL(10, 4) DEFAULT 0,
  
  -- Metadata
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  
  -- Health check
  last_health_check TIMESTAMP WITH TIME ZONE,
  health_status VARCHAR(50) DEFAULT 'unknown' CHECK (health_status IN ('healthy', 'unhealthy', 'unknown', 'rate_limited')),
  
  UNIQUE(user_id, integration_type, api_key_hash) -- Prevent duplicate keys
);

-- Enhanced user_subscriptions table with better tracking
ALTER TABLE user_subscriptions ADD COLUMN IF NOT EXISTS trial_ends_at TIMESTAMP WITH TIME ZONE;
ALTER TABLE user_subscriptions ADD COLUMN IF NOT EXISTS discount_percent DECIMAL(5, 2) DEFAULT 0;
ALTER TABLE user_subscriptions ADD COLUMN IF NOT EXISTS discount_amount DECIMAL(10, 2) DEFAULT 0;
ALTER TABLE user_subscriptions ADD COLUMN IF NOT EXISTS next_billing_amount DECIMAL(10, 2);
ALTER TABLE user_subscriptions ADD COLUMN IF NOT EXISTS billing_cycle_anchor TIMESTAMP WITH TIME ZONE;
ALTER TABLE user_subscriptions ADD COLUMN IF NOT EXISTS metadata JSONB DEFAULT '{}';

-- Create subscription_changes table for audit trail
CREATE TABLE IF NOT EXISTS subscription_changes (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  subscription_id UUID NOT NULL REFERENCES user_subscriptions(id) ON DELETE CASCADE,
  
  change_type VARCHAR(50) NOT NULL CHECK (change_type IN ('created', 'upgraded', 'downgraded', 'cancelled', 'renewed', 'failed', 'refunded')),
  
  -- Previous and new values
  old_plan_id UUID REFERENCES billing_plans(id),
  new_plan_id UUID REFERENCES billing_plans(id),
  old_status VARCHAR(50),
  new_status VARCHAR(50),
  
  -- Financial impact
  proration_amount DECIMAL(10, 2) DEFAULT 0,
  
  -- Timestamps
  effective_date TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  
  -- Context
  reason TEXT,
  triggered_by VARCHAR(50) DEFAULT 'user' CHECK (triggered_by IN ('user', 'admin', 'system', 'payment_failed', 'stripe_webhook')),
  
  metadata JSONB DEFAULT '{}'
);

-- Create integration_usage_logs for detailed tracking
CREATE TABLE IF NOT EXISTS integration_usage_logs (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  integration_id UUID NOT NULL REFERENCES user_integrations(id) ON DELETE CASCADE,
  api_key_id UUID REFERENCES api_keys(id), -- Which API key was used
  
  -- Request details
  request_id VARCHAR(255),
  model_used VARCHAR(255),
  provider VARCHAR(100),
  
  -- Usage metrics
  tokens_input INTEGER DEFAULT 0,
  tokens_output INTEGER DEFAULT 0,
  tokens_total INTEGER DEFAULT 0,
  
  -- Cost calculation
  cost_input DECIMAL(10, 6) DEFAULT 0,
  cost_output DECIMAL(10, 6) DEFAULT 0,
  cost_total DECIMAL(10, 6) DEFAULT 0,
  
  -- Performance metrics
  response_time_ms INTEGER,
  status_code INTEGER,
  
  -- Request metadata
  request_timestamp TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  created_date DATE DEFAULT CURRENT_DATE,
  
  -- Error tracking
  error_message TEXT,
  error_code VARCHAR(50),
  
  UNIQUE(user_id, integration_id, request_id) -- Prevent duplicate logs
);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_admin_tokens_code ON admin_tokens(token_code);
CREATE INDEX IF NOT EXISTS idx_admin_tokens_type_active ON admin_tokens(token_type, is_active);
CREATE INDEX IF NOT EXISTS idx_admin_tokens_expires ON admin_tokens(expires_at);

CREATE INDEX IF NOT EXISTS idx_user_token_redemptions_user ON user_token_redemptions(user_id);
CREATE INDEX IF NOT EXISTS idx_user_token_redemptions_active ON user_token_redemptions(user_id, is_active, is_expired);
CREATE INDEX IF NOT EXISTS idx_user_token_redemptions_expires ON user_token_redemptions(expires_at);

CREATE INDEX IF NOT EXISTS idx_purchase_logs_user_date ON purchase_logs(user_id, created_at);
CREATE INDEX IF NOT EXISTS idx_purchase_logs_type_status ON purchase_logs(purchase_type, status);
CREATE INDEX IF NOT EXISTS idx_purchase_logs_stripe_payment ON purchase_logs(stripe_payment_intent_id);

CREATE INDEX IF NOT EXISTS idx_user_integrations_user_active ON user_integrations(user_id, is_active);
CREATE INDEX IF NOT EXISTS idx_user_integrations_type ON user_integrations(integration_type);
CREATE INDEX IF NOT EXISTS idx_user_integrations_health ON user_integrations(health_status, last_health_check);

CREATE INDEX IF NOT EXISTS idx_subscription_changes_user ON subscription_changes(user_id, created_at);
CREATE INDEX IF NOT EXISTS idx_subscription_changes_subscription ON subscription_changes(subscription_id);

CREATE INDEX IF NOT EXISTS idx_integration_usage_user_date ON integration_usage_logs(user_id, created_date);
CREATE INDEX IF NOT EXISTS idx_integration_usage_integration ON integration_usage_logs(integration_id, created_date);
CREATE INDEX IF NOT EXISTS idx_integration_usage_model ON integration_usage_logs(model_used, created_date);

-- Enable RLS for core billing tables
ALTER TABLE billing_plans ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_credits ENABLE ROW LEVEL SECURITY;
ALTER TABLE credit_transactions ENABLE ROW LEVEL SECURITY;

-- Billing plans are readable by all authenticated users
CREATE POLICY "Billing plans are viewable by authenticated users" ON billing_plans
  FOR SELECT USING (auth.role() = 'authenticated');

-- Users can only see their own subscription data
CREATE POLICY "Users can view own subscription" ON user_subscriptions
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can update own subscription" ON user_subscriptions
  FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own subscription" ON user_subscriptions
  FOR INSERT WITH CHECK (auth.uid() = user_id);

-- Users can only see their own credit data
CREATE POLICY "Users can view own credits" ON user_credits
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can update own credits" ON user_credits
  FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own credits" ON user_credits
  FOR INSERT WITH CHECK (auth.uid() = user_id);

-- Users can only see their own transactions
CREATE POLICY "Users can view own transactions" ON credit_transactions
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "System can insert transactions" ON credit_transactions
  FOR INSERT WITH CHECK (true);

-- RLS Policies for new tables
ALTER TABLE admin_tokens ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_token_redemptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE purchase_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_integrations ENABLE ROW LEVEL SECURITY;
ALTER TABLE subscription_changes ENABLE ROW LEVEL SECURITY;
ALTER TABLE integration_usage_logs ENABLE ROW LEVEL SECURITY;

-- Admin tokens - only admins can manage
CREATE POLICY "Admins can manage admin tokens" ON admin_tokens
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM profiles 
      WHERE profiles.user_id = auth.uid() 
      AND profiles.role = 'admin'
    )
  );

-- Users can view active admin tokens (for redemption)
CREATE POLICY "Users can view active admin tokens" ON admin_tokens
  FOR SELECT USING (is_active = true AND (expires_at IS NULL OR expires_at > NOW()));

-- Token redemptions - users can only see their own
CREATE POLICY "Users can view own token redemptions" ON user_token_redemptions
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own token redemptions" ON user_token_redemptions
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "System can update token redemptions" ON user_token_redemptions
  FOR UPDATE USING (true);

-- Purchase logs - users can only see their own
CREATE POLICY "Users can view own purchase logs" ON purchase_logs
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "System can insert purchase logs" ON purchase_logs
  FOR INSERT WITH CHECK (true);

CREATE POLICY "Admins can view all purchase logs" ON purchase_logs
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM profiles 
      WHERE profiles.user_id = auth.uid() 
      AND profiles.role = 'admin'
    )
  );

-- User integrations - users can only manage their own
CREATE POLICY "Users can manage own integrations" ON user_integrations
  FOR ALL USING (auth.uid() = user_id);

-- Subscription changes - users can view their own, admins can view all
CREATE POLICY "Users can view own subscription changes" ON subscription_changes
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "System can insert subscription changes" ON subscription_changes
  FOR INSERT WITH CHECK (true);

-- Integration usage logs - users can view their own
CREATE POLICY "Users can view own integration usage" ON integration_usage_logs
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "System can insert integration usage" ON integration_usage_logs
  FOR INSERT WITH CHECK (true);

-- Functions for token management
CREATE OR REPLACE FUNCTION check_user_active_tokens(p_user_id UUID)
RETURNS TABLE(
  token_type VARCHAR(50),
  expires_at TIMESTAMP WITH TIME ZONE,
  credits_remaining DECIMAL(10, 2),
  days_remaining INTEGER
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    utr.token_code as token_type,
    utr.expires_at,
    utr.credits_granted,
    CASE 
      WHEN utr.expires_at IS NOT NULL THEN 
        GREATEST(0, EXTRACT(DAY FROM (utr.expires_at - NOW()))::INTEGER)
      ELSE NULL 
    END as days_remaining
  FROM user_token_redemptions utr
  WHERE utr.user_id = p_user_id 
    AND utr.is_active = true 
    AND utr.is_expired = false
    AND (utr.expires_at IS NULL OR utr.expires_at > NOW());
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to redeem a token
CREATE OR REPLACE FUNCTION redeem_token(
  p_user_id UUID,
  p_token_code VARCHAR(255)
) RETURNS JSONB AS $$
DECLARE
  token_record admin_tokens%ROWTYPE;
  redemption_id UUID;
  result JSONB;
BEGIN
  -- Check if token exists and is valid
  SELECT * INTO token_record 
  FROM admin_tokens 
  WHERE token_code = p_token_code 
    AND is_active = true 
    AND current_uses < max_uses
    AND (expires_at IS NULL OR expires_at > NOW());
  
  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Invalid or expired token'
    );
  END IF;
  
  -- Check if user already redeemed this token
  IF EXISTS (
    SELECT 1 FROM user_token_redemptions 
    WHERE user_id = p_user_id AND admin_token_id = token_record.id
  ) THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Token already redeemed'
    );
  END IF;
  
  -- Create redemption record
  INSERT INTO user_token_redemptions (
    user_id, admin_token_id, token_code,
    days_granted, credits_granted,
    expires_at
  ) VALUES (
    p_user_id, token_record.id, p_token_code,
    token_record.days_valid, token_record.credit_amount,
    CASE 
      WHEN token_record.token_type = 'time_limited' AND token_record.days_valid IS NOT NULL 
      THEN NOW() + (token_record.days_valid || ' days')::INTERVAL
      WHEN token_record.token_type = 'credit_token' 
      THEN NOW() + INTERVAL '30 days'
      ELSE NULL
    END
  ) RETURNING id INTO redemption_id;
  
  -- Update token usage count
  UPDATE admin_tokens 
  SET current_uses = current_uses + 1,
      is_active = CASE WHEN current_uses + 1 >= max_uses THEN false ELSE is_active END
  WHERE id = token_record.id;
  
  -- If credit token, add credits to user balance
  IF token_record.token_type = 'credit_token' THEN
    PERFORM update_user_credits(
      p_user_id, 
      token_record.credit_amount, 
      'token_grant',
      'Credits from token: ' || p_token_code,
      NULL
    );
  END IF;
  
  -- Log the redemption as a purchase
  INSERT INTO purchase_logs (
    user_id, purchase_type, item_name, item_description,
    amount, credits_purchased, admin_token_id, token_code,
    status, completed_at
  ) VALUES (
    p_user_id, 'token_redemption', 
    'Token: ' || token_record.name,
    'Redeemed token: ' || token_record.description,
    COALESCE(token_record.credit_amount, 0),
    token_record.credit_amount,
    token_record.id, p_token_code,
    'completed', NOW()
  );
  
  RETURN jsonb_build_object(
    'success', true,
    'redemption_id', redemption_id,
    'token_type', token_record.token_type,
    'days_granted', token_record.days_valid,
    'credits_granted', token_record.credit_amount
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to log purchases
CREATE OR REPLACE FUNCTION log_purchase(
  p_user_id UUID,
  p_purchase_type VARCHAR(50),
  p_item_name VARCHAR(255),
  p_amount DECIMAL(10, 4),
  p_stripe_payment_intent_id VARCHAR(255) DEFAULT NULL,
  p_plan_id UUID DEFAULT NULL,
  p_credits_purchased DECIMAL(10, 2) DEFAULT NULL,
  p_metadata JSONB DEFAULT '{}'
) RETURNS UUID AS $$
DECLARE
  purchase_id UUID;
BEGIN
  INSERT INTO purchase_logs (
    user_id, purchase_type, item_name, amount,
    stripe_payment_intent_id, plan_id, credits_purchased,
    status, payment_status, completed_at, metadata
  ) VALUES (
    p_user_id, p_purchase_type, p_item_name, p_amount,
    p_stripe_payment_intent_id, p_plan_id, p_credits_purchased,
    'completed', 'paid', NOW(), p_metadata
  ) RETURNING id INTO purchase_id;
  
  RETURN purchase_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to log integration usage
CREATE OR REPLACE FUNCTION log_integration_usage(
  p_user_id UUID,
  p_integration_id UUID,
  p_api_key_id UUID,
  p_model_used VARCHAR(255),
  p_tokens_input INTEGER,
  p_tokens_output INTEGER,
  p_cost_total DECIMAL(10, 6),
  p_request_id VARCHAR(255) DEFAULT NULL
) RETURNS UUID AS $$
DECLARE
  log_id UUID;
BEGIN
  INSERT INTO integration_usage_logs (
    user_id, integration_id, api_key_id, model_used,
    tokens_input, tokens_output, tokens_total,
    cost_total, request_id
  ) VALUES (
    p_user_id, p_integration_id, p_api_key_id, p_model_used,
    p_tokens_input, p_tokens_output, p_tokens_input + p_tokens_output,
    p_cost_total, p_request_id
  ) RETURNING id INTO log_id;
  
  -- Update integration usage counters
  UPDATE user_integrations SET
    requests_today = requests_today + 1,
    requests_this_month = requests_this_month + 1,
    cost_today = cost_today + p_cost_total,
    cost_this_month = cost_this_month + p_cost_total,
    last_used_at = NOW()
  WHERE id = p_integration_id;
  
  RETURN log_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Ensure the update_user_credits function exists (from previous migration)
CREATE OR REPLACE FUNCTION update_user_credits(
  p_user_id UUID,
  p_amount DECIMAL(10, 2),
  p_transaction_type VARCHAR(50),
  p_description TEXT DEFAULT NULL,
  p_stripe_payment_intent_id VARCHAR(255) DEFAULT NULL
) RETURNS DECIMAL(10, 2) AS $$
DECLARE
  current_balance DECIMAL(10, 2);
  new_balance DECIMAL(10, 2);
BEGIN
  -- Get current balance
  SELECT balance INTO current_balance 
  FROM user_credits 
  WHERE user_id = p_user_id;
  
  -- If user doesn't have a credits record, create one
  IF NOT FOUND THEN
    INSERT INTO user_credits (user_id, balance) VALUES (p_user_id, 0.00);
    current_balance := 0.00;
  END IF;
  
  -- Calculate new balance
  new_balance := current_balance + p_amount;
  
  -- Update balance
  UPDATE user_credits 
  SET balance = new_balance, updated_at = NOW()
  WHERE user_id = p_user_id;
  
  -- Insert transaction record
  INSERT INTO credit_transactions (
    user_id, transaction_type, amount, balance_after, 
    description, stripe_payment_intent_id
  ) VALUES (
    p_user_id, p_transaction_type, p_amount, new_balance,
    p_description, p_stripe_payment_intent_id
  );
  
  RETURN new_balance;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Insert default billing plans if they don't exist
DO $$
BEGIN
  -- Insert subscription plans
  IF NOT EXISTS (SELECT 1 FROM billing_plans WHERE name = 'Free Tier') THEN
    INSERT INTO billing_plans (name, description, plan_type, price_per_month, features) VALUES
    ('Free Tier', 'Basic access with limited requests', 'subscription', 0.00, '{"max_requests": 1000, "models": ["gpt-3.5-turbo"], "support": "community"}');
  END IF;
  
  IF NOT EXISTS (SELECT 1 FROM billing_plans WHERE name = 'Pro Plan') THEN
    INSERT INTO billing_plans (name, description, plan_type, price_per_month, features) VALUES
    ('Pro Plan', 'Advanced features for professionals', 'subscription', 29.99, '{"max_requests": 50000, "models": ["gpt-4", "claude-3"], "support": "email", "analytics": true}');
  END IF;
  
  IF NOT EXISTS (SELECT 1 FROM billing_plans WHERE name = 'Enterprise') THEN
    INSERT INTO billing_plans (name, description, plan_type, price_per_month, features) VALUES
    ('Enterprise', 'Unlimited access for teams', 'subscription', NULL, '{"max_requests": -1, "models": ["all"], "support": "priority", "analytics": true, "custom_models": true, "contact_sales": true}');
  END IF;
  
  IF NOT EXISTS (SELECT 1 FROM billing_plans WHERE name = 'Pay-As-You-Go') THEN
    INSERT INTO billing_plans (name, description, plan_type, features) VALUES
    ('Pay-As-You-Go', 'Pay per request', 'pay_as_you_go', '{"price_per_request": 0.002, "models": ["all"]}');
  END IF;
  
  -- Insert buy credit plans
  IF NOT EXISTS (SELECT 1 FROM billing_plans WHERE name = 'Buy Credits - $10') THEN
    INSERT INTO billing_plans (name, description, plan_type, credit_amount, credit_price, features) VALUES
    ('Buy Credits - $10', 'Purchase $10 in credits', 'buy_credit', 10.00, 10.00, '{}');
  END IF;
  
  IF NOT EXISTS (SELECT 1 FROM billing_plans WHERE name = 'Buy Credits - $25') THEN
    INSERT INTO billing_plans (name, description, plan_type, credit_amount, credit_price, features) VALUES
    ('Buy Credits - $25', 'Purchase $25 in credits', 'buy_credit', 25.00, 25.00, '{}');
  END IF;
  
  IF NOT EXISTS (SELECT 1 FROM billing_plans WHERE name = 'Buy Credits - $50') THEN
    INSERT INTO billing_plans (name, description, plan_type, credit_amount, credit_price, features) VALUES
    ('Buy Credits - $50', 'Purchase $50 in credits', 'buy_credit', 50.00, 50.00, '{}');
  END IF;
  
  IF NOT EXISTS (SELECT 1 FROM billing_plans WHERE name = 'Buy Credits - $100') THEN
    INSERT INTO billing_plans (name, description, plan_type, credit_amount, credit_price, features) VALUES
    ('Buy Credits - $100', 'Purchase $100 in credits', 'buy_credit', 100.00, 100.00, '{}');
  END IF;
END $$;

-- Insert sample admin tokens for testing
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM admin_tokens WHERE token_code = 'WELCOME30') THEN
    INSERT INTO admin_tokens (token_code, token_type, name, description, days_valid, max_uses) VALUES
    ('WELCOME30', 'time_limited', 'Welcome Token - 30 Days', 'New user welcome token for 30 days unlimited access', 30, 100);
  END IF;
  
  IF NOT EXISTS (SELECT 1 FROM admin_tokens WHERE token_code = 'BETA7') THEN
    INSERT INTO admin_tokens (token_code, token_type, name, description, days_valid, max_uses) VALUES
    ('BETA7', 'time_limited', 'Beta Tester - 7 Days', 'Beta testing token for 7 days access', 7, 50);
  END IF;
  
  IF NOT EXISTS (SELECT 1 FROM admin_tokens WHERE token_code = 'CREDIT25') THEN
    INSERT INTO admin_tokens (token_code, token_type, name, description, credit_amount, max_uses) VALUES
    ('CREDIT25', 'credit_token', 'Credit Token - $25', 'Promotional credit token worth $25', 25.00, 100);
  END IF;
  
  IF NOT EXISTS (SELECT 1 FROM admin_tokens WHERE token_code = 'FRIEND10') THEN
    INSERT INTO admin_tokens (token_code, token_type, name, description, credit_amount, max_uses) VALUES
    ('FRIEND10', 'credit_token', 'Friend Referral - $10', 'Friend referral bonus credits', 10.00, 200);
  END IF;
END $$;