-- ============================================================================
-- COMPREHENSIVE FIX: Create all missing tables, functions, and policies
-- Run this in the Supabase SQL Editor at:
--   https://supabase.com/dashboard/project/plvcwcagjzdyujfkvmnv/sql
-- ============================================================================

-- ============================================================================
-- 1. BILLING SYSTEM (fixes 406 on user_subscriptions)
-- ============================================================================

-- Create billing plans table
CREATE TABLE IF NOT EXISTS public.billing_plans (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  description TEXT,
  plan_type VARCHAR(50) NOT NULL CHECK (plan_type IN ('subscription', 'pay_as_you_go', 'buy_credit')),
  price_per_month DECIMAL(10, 2),
  price_per_request DECIMAL(10, 6),
  credit_amount DECIMAL(10, 2),
  credit_price DECIMAL(10, 2),
  is_active BOOLEAN DEFAULT true,
  features JSONB DEFAULT '{}',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create user subscriptions table
CREATE TABLE IF NOT EXISTS public.user_subscriptions (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  plan_id UUID REFERENCES public.billing_plans(id),
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

-- Create user credits table
CREATE TABLE IF NOT EXISTS public.user_credits (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  balance DECIMAL(10, 2) DEFAULT 0.00,
  auto_charge_enabled BOOLEAN DEFAULT false,
  auto_charge_threshold DECIMAL(10, 2) DEFAULT 10.00,
  auto_charge_amount DECIMAL(10, 2) DEFAULT 20.00,
  upper_limit DECIMAL(10, 2),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(user_id)
);

-- Create credit transactions table
CREATE TABLE IF NOT EXISTS public.credit_transactions (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  transaction_type VARCHAR(50) NOT NULL CHECK (transaction_type IN ('purchase', 'usage', 'refund', 'auto_charge', 'token_grant')),
  amount DECIMAL(10, 2) NOT NULL,
  balance_after DECIMAL(10, 2) NOT NULL,
  description TEXT,
  stripe_payment_intent_id VARCHAR(255),
  api_key_id UUID,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create payment methods table
CREATE TABLE IF NOT EXISTS public.user_payment_methods (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  stripe_payment_method_id VARCHAR(255) NOT NULL,
  card_brand VARCHAR(50),
  card_last_four VARCHAR(4),
  card_exp_month INTEGER,
  card_exp_year INTEGER,
  is_default BOOLEAN DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create usage tracking table
CREATE TABLE IF NOT EXISTS public.usage_tracking (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  api_key_id UUID,
  model_name VARCHAR(255),
  tokens_used INTEGER DEFAULT 0,
  cost DECIMAL(10, 6) DEFAULT 0.000000,
  request_count INTEGER DEFAULT 1,
  created_date DATE DEFAULT CURRENT_DATE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(user_id, api_key_id, model_name, created_date)
);

-- RLS for billing tables
ALTER TABLE public.billing_plans ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_credits ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.credit_transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_payment_methods ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.usage_tracking ENABLE ROW LEVEL SECURITY;

-- Billing plan policies (drop first to avoid conflicts)
DO $$ BEGIN
  DROP POLICY IF EXISTS "Billing plans are viewable by authenticated users" ON public.billing_plans;
  CREATE POLICY "Billing plans are viewable by authenticated users" ON public.billing_plans
    FOR SELECT USING (auth.role() = 'authenticated');
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

-- User subscriptions policies
DO $$ BEGIN
  DROP POLICY IF EXISTS "Users can view own subscription" ON public.user_subscriptions;
  CREATE POLICY "Users can view own subscription" ON public.user_subscriptions
    FOR SELECT USING (auth.uid() = user_id);
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

DO $$ BEGIN
  DROP POLICY IF EXISTS "Users can update own subscription" ON public.user_subscriptions;
  CREATE POLICY "Users can update own subscription" ON public.user_subscriptions
    FOR UPDATE USING (auth.uid() = user_id);
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

DO $$ BEGIN
  DROP POLICY IF EXISTS "Users can insert own subscription" ON public.user_subscriptions;
  CREATE POLICY "Users can insert own subscription" ON public.user_subscriptions
    FOR INSERT WITH CHECK (auth.uid() = user_id);
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

-- User credits policies
DO $$ BEGIN
  DROP POLICY IF EXISTS "Users can view own credits" ON public.user_credits;
  CREATE POLICY "Users can view own credits" ON public.user_credits
    FOR SELECT USING (auth.uid() = user_id);
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

DO $$ BEGIN
  DROP POLICY IF EXISTS "Users can update own credits" ON public.user_credits;
  CREATE POLICY "Users can update own credits" ON public.user_credits
    FOR UPDATE USING (auth.uid() = user_id);
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

DO $$ BEGIN
  DROP POLICY IF EXISTS "Users can insert own credits" ON public.user_credits;
  CREATE POLICY "Users can insert own credits" ON public.user_credits
    FOR INSERT WITH CHECK (auth.uid() = user_id);
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

-- Credit transactions policies
DO $$ BEGIN
  DROP POLICY IF EXISTS "Users can view own transactions" ON public.credit_transactions;
  CREATE POLICY "Users can view own transactions" ON public.credit_transactions
    FOR SELECT USING (auth.uid() = user_id);
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

DO $$ BEGIN
  DROP POLICY IF EXISTS "System can insert transactions" ON public.credit_transactions;
  CREATE POLICY "System can insert transactions" ON public.credit_transactions
    FOR INSERT WITH CHECK (true);
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

-- Payment methods policies
DO $$ BEGIN
  DROP POLICY IF EXISTS "Users can manage own payment methods" ON public.user_payment_methods;
  CREATE POLICY "Users can manage own payment methods" ON public.user_payment_methods
    FOR ALL USING (auth.uid() = user_id);
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

-- Usage tracking policies
DO $$ BEGIN
  DROP POLICY IF EXISTS "Users can view own usage" ON public.usage_tracking;
  CREATE POLICY "Users can view own usage" ON public.usage_tracking
    FOR SELECT USING (auth.uid() = user_id);
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

DO $$ BEGIN
  DROP POLICY IF EXISTS "System can insert usage" ON public.usage_tracking;
  CREATE POLICY "System can insert usage" ON public.usage_tracking
    FOR INSERT WITH CHECK (true);
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

-- Billing indexes
CREATE INDEX IF NOT EXISTS idx_user_subscriptions_user_id ON public.user_subscriptions(user_id);
CREATE INDEX IF NOT EXISTS idx_user_subscriptions_stripe_customer ON public.user_subscriptions(stripe_customer_id);
CREATE INDEX IF NOT EXISTS idx_user_credits_user_id ON public.user_credits(user_id);
CREATE INDEX IF NOT EXISTS idx_credit_transactions_user_id ON public.credit_transactions(user_id);
CREATE INDEX IF NOT EXISTS idx_credit_transactions_created_at ON public.credit_transactions(created_at);
CREATE INDEX IF NOT EXISTS idx_payment_methods_user_id ON public.user_payment_methods(user_id);
CREATE INDEX IF NOT EXISTS idx_usage_tracking_user_date ON public.usage_tracking(user_id, created_date);

-- Insert default billing plans
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.billing_plans WHERE name = 'Free Tier') THEN
    INSERT INTO public.billing_plans (name, description, plan_type, price_per_month, features) VALUES
    ('Free Tier', 'Basic access with limited requests', 'subscription', 0.00, '{"max_requests": 1000, "models": ["gpt-3.5-turbo"], "support": "community"}');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.billing_plans WHERE name = 'Pro Plan') THEN
    INSERT INTO public.billing_plans (name, description, plan_type, price_per_month, features) VALUES
    ('Pro Plan', 'Advanced features for professionals', 'subscription', 29.99, '{"max_requests": 50000, "models": ["gpt-4", "claude-3"], "support": "email", "analytics": true}');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.billing_plans WHERE name = 'Enterprise') THEN
    INSERT INTO public.billing_plans (name, description, plan_type, price_per_month, features) VALUES
    ('Enterprise', 'Unlimited access for teams', 'subscription', NULL, '{"max_requests": -1, "models": ["all"], "support": "priority", "analytics": true, "custom_models": true, "contact_sales": true}');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.billing_plans WHERE name = 'Pay-As-You-Go') THEN
    INSERT INTO public.billing_plans (name, description, plan_type, features) VALUES
    ('Pay-As-You-Go', 'Pay per request', 'pay_as_you_go', '{"price_per_request": 0.002, "models": ["all"]}');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.billing_plans WHERE name = 'Buy Credits - $10') THEN
    INSERT INTO public.billing_plans (name, description, plan_type, credit_amount, credit_price, features) VALUES
    ('Buy Credits - $10', 'Purchase $10 in credits', 'buy_credit', 10.00, 10.00, '{}');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.billing_plans WHERE name = 'Buy Credits - $25') THEN
    INSERT INTO public.billing_plans (name, description, plan_type, credit_amount, credit_price, features) VALUES
    ('Buy Credits - $25', 'Purchase $25 in credits', 'buy_credit', 25.00, 25.00, '{}');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.billing_plans WHERE name = 'Buy Credits - $50') THEN
    INSERT INTO public.billing_plans (name, description, plan_type, credit_amount, credit_price, features) VALUES
    ('Buy Credits - $50', 'Purchase $50 in credits', 'buy_credit', 50.00, 50.00, '{}');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.billing_plans WHERE name = 'Buy Credits - $100') THEN
    INSERT INTO public.billing_plans (name, description, plan_type, credit_amount, credit_price, features) VALUES
    ('Buy Credits - $100', 'Purchase $100 in credits', 'buy_credit', 100.00, 100.00, '{}');
  END IF;
END $$;


-- ============================================================================
-- 2. ENHANCED ADMIN / TOKEN SYSTEM (fixes 404 on check_user_active_tokens)
-- ============================================================================

-- Create admin_tokens table
CREATE TABLE IF NOT EXISTS public.admin_tokens (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  token_code VARCHAR(255) NOT NULL UNIQUE,
  token_type VARCHAR(50) NOT NULL CHECK (token_type IN ('time_limited', 'credit_token')),
  name VARCHAR(255) NOT NULL,
  description TEXT,
  days_valid INTEGER,
  credit_amount DECIMAL(10, 2),
  max_uses INTEGER DEFAULT 1,
  current_uses INTEGER DEFAULT 0,
  is_active BOOLEAN DEFAULT true,
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  expires_at TIMESTAMP WITH TIME ZONE
);

-- Create user_token_redemptions table
CREATE TABLE IF NOT EXISTS public.user_token_redemptions (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  admin_token_id UUID NOT NULL REFERENCES public.admin_tokens(id) ON DELETE CASCADE,
  token_code VARCHAR(255) NOT NULL,
  redeemed_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  expires_at TIMESTAMP WITH TIME ZONE,
  days_granted INTEGER,
  credits_granted DECIMAL(10, 2),
  is_active BOOLEAN DEFAULT true,
  is_expired BOOLEAN DEFAULT false,
  UNIQUE(user_id, admin_token_id)
);

-- Create purchase_logs table
CREATE TABLE IF NOT EXISTS public.purchase_logs (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  purchase_type VARCHAR(50) NOT NULL CHECK (purchase_type IN ('subscription', 'credits', 'plan_change', 'token_redemption')),
  item_name VARCHAR(255) NOT NULL,
  item_description TEXT,
  amount DECIMAL(10, 4) NOT NULL,
  currency VARCHAR(3) DEFAULT 'USD',
  stripe_payment_intent_id VARCHAR(255),
  stripe_customer_id VARCHAR(255),
  stripe_subscription_id VARCHAR(255),
  payment_method_id VARCHAR(255),
  plan_id UUID REFERENCES public.billing_plans(id),
  credits_purchased DECIMAL(10, 2),
  subscription_period_start TIMESTAMP WITH TIME ZONE,
  subscription_period_end TIMESTAMP WITH TIME ZONE,
  admin_token_id UUID REFERENCES public.admin_tokens(id),
  token_code VARCHAR(255),
  status VARCHAR(50) NOT NULL DEFAULT 'completed' CHECK (status IN ('pending', 'completed', 'failed', 'refunded', 'cancelled')),
  payment_status VARCHAR(50) CHECK (payment_status IN ('paid', 'unpaid', 'failed', 'refunded')),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  completed_at TIMESTAMP WITH TIME ZONE,
  metadata JSONB DEFAULT '{}',
  notes TEXT
);

-- Create user_integrations table
CREATE TABLE IF NOT EXISTS public.user_integrations (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  integration_type VARCHAR(100) NOT NULL,
  provider_name VARCHAR(100) NOT NULL,
  display_name VARCHAR(255),
  api_key_hash TEXT,
  api_key_preview VARCHAR(20),
  is_active BOOLEAN DEFAULT true,
  is_default BOOLEAN DEFAULT false,
  daily_limit INTEGER,
  monthly_limit INTEGER,
  rate_limit_rpm INTEGER,
  allowed_models TEXT[],
  blocked_models TEXT[],
  requests_today INTEGER DEFAULT 0,
  requests_this_month INTEGER DEFAULT 0,
  last_used_at TIMESTAMP WITH TIME ZONE,
  cost_today DECIMAL(10, 4) DEFAULT 0,
  cost_this_month DECIMAL(10, 4) DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  last_health_check TIMESTAMP WITH TIME ZONE,
  health_status VARCHAR(50) DEFAULT 'unknown' CHECK (health_status IN ('healthy', 'unhealthy', 'unknown', 'rate_limited'))
);

-- Create subscription_changes table
CREATE TABLE IF NOT EXISTS public.subscription_changes (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  subscription_id UUID NOT NULL REFERENCES public.user_subscriptions(id) ON DELETE CASCADE,
  change_type VARCHAR(50) NOT NULL CHECK (change_type IN ('created', 'upgraded', 'downgraded', 'cancelled', 'renewed', 'failed', 'refunded')),
  old_plan_id UUID REFERENCES public.billing_plans(id),
  new_plan_id UUID REFERENCES public.billing_plans(id),
  old_status VARCHAR(50),
  new_status VARCHAR(50),
  proration_amount DECIMAL(10, 2) DEFAULT 0,
  effective_date TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  reason TEXT,
  triggered_by VARCHAR(50) DEFAULT 'user' CHECK (triggered_by IN ('user', 'admin', 'system', 'payment_failed', 'stripe_webhook')),
  metadata JSONB DEFAULT '{}'
);

-- Create integration_usage_logs table
CREATE TABLE IF NOT EXISTS public.integration_usage_logs (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  integration_id UUID NOT NULL REFERENCES public.user_integrations(id) ON DELETE CASCADE,
  api_key_id UUID,
  request_id VARCHAR(255),
  model_used VARCHAR(255),
  provider VARCHAR(100),
  tokens_input INTEGER DEFAULT 0,
  tokens_output INTEGER DEFAULT 0,
  tokens_total INTEGER DEFAULT 0,
  cost_input DECIMAL(10, 6) DEFAULT 0,
  cost_output DECIMAL(10, 6) DEFAULT 0,
  cost_total DECIMAL(10, 6) DEFAULT 0,
  response_time_ms INTEGER,
  status_code INTEGER,
  request_timestamp TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  created_date DATE DEFAULT CURRENT_DATE,
  error_message TEXT,
  error_code VARCHAR(50)
);

-- RLS for admin/token tables
ALTER TABLE public.admin_tokens ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_token_redemptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.purchase_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_integrations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.subscription_changes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.integration_usage_logs ENABLE ROW LEVEL SECURITY;

-- Admin tokens policies
DO $$ BEGIN
  DROP POLICY IF EXISTS "Users can view active admin tokens" ON public.admin_tokens;
  CREATE POLICY "Users can view active admin tokens" ON public.admin_tokens
    FOR SELECT USING (is_active = true AND (expires_at IS NULL OR expires_at > NOW()));
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

-- Token redemptions policies
DO $$ BEGIN
  DROP POLICY IF EXISTS "Users can view own token redemptions" ON public.user_token_redemptions;
  CREATE POLICY "Users can view own token redemptions" ON public.user_token_redemptions
    FOR SELECT USING (auth.uid() = user_id);
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

DO $$ BEGIN
  DROP POLICY IF EXISTS "Users can insert own token redemptions" ON public.user_token_redemptions;
  CREATE POLICY "Users can insert own token redemptions" ON public.user_token_redemptions
    FOR INSERT WITH CHECK (auth.uid() = user_id);
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

-- Purchase logs policies
DO $$ BEGIN
  DROP POLICY IF EXISTS "Users can view own purchase logs" ON public.purchase_logs;
  CREATE POLICY "Users can view own purchase logs" ON public.purchase_logs
    FOR SELECT USING (auth.uid() = user_id);
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

-- User integrations policies
DO $$ BEGIN
  DROP POLICY IF EXISTS "Users can manage own integrations" ON public.user_integrations;
  CREATE POLICY "Users can manage own integrations" ON public.user_integrations
    FOR ALL USING (auth.uid() = user_id);
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

-- Subscription changes policies
DO $$ BEGIN
  DROP POLICY IF EXISTS "Users can view own subscription changes" ON public.subscription_changes;
  CREATE POLICY "Users can view own subscription changes" ON public.subscription_changes
    FOR SELECT USING (auth.uid() = user_id);
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

-- Integration usage policies
DO $$ BEGIN
  DROP POLICY IF EXISTS "Users can view own integration usage" ON public.integration_usage_logs;
  CREATE POLICY "Users can view own integration usage" ON public.integration_usage_logs
    FOR SELECT USING (auth.uid() = user_id);
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

-- Admin/token indexes
CREATE INDEX IF NOT EXISTS idx_admin_tokens_code ON public.admin_tokens(token_code);
CREATE INDEX IF NOT EXISTS idx_admin_tokens_type_active ON public.admin_tokens(token_type, is_active);
CREATE INDEX IF NOT EXISTS idx_user_token_redemptions_user ON public.user_token_redemptions(user_id);
CREATE INDEX IF NOT EXISTS idx_user_token_redemptions_active ON public.user_token_redemptions(user_id, is_active, is_expired);
CREATE INDEX IF NOT EXISTS idx_purchase_logs_user_date ON public.purchase_logs(user_id, created_at);
CREATE INDEX IF NOT EXISTS idx_user_integrations_user_active ON public.user_integrations(user_id, is_active);
CREATE INDEX IF NOT EXISTS idx_subscription_changes_user ON public.subscription_changes(user_id, created_at);
CREATE INDEX IF NOT EXISTS idx_integration_usage_user_date ON public.integration_usage_logs(user_id, created_date);

-- Create check_user_active_tokens RPC function (fixes 404 on rpc/check_user_active_tokens)
CREATE OR REPLACE FUNCTION public.check_user_active_tokens(p_user_id UUID)
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
    utr.credits_granted as credits_remaining,
    CASE 
      WHEN utr.expires_at IS NOT NULL THEN 
        GREATEST(0, EXTRACT(DAY FROM (utr.expires_at - NOW()))::INTEGER)
      ELSE NULL 
    END as days_remaining
  FROM public.user_token_redemptions utr
  WHERE utr.user_id = p_user_id 
    AND utr.is_active = true 
    AND utr.is_expired = false
    AND (utr.expires_at IS NULL OR utr.expires_at > NOW());
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create update_user_credits function
CREATE OR REPLACE FUNCTION public.update_user_credits(
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
  SELECT balance INTO current_balance 
  FROM public.user_credits 
  WHERE user_id = p_user_id;
  
  IF NOT FOUND THEN
    INSERT INTO public.user_credits (user_id, balance) VALUES (p_user_id, 0.00);
    current_balance := 0.00;
  END IF;
  
  new_balance := current_balance + p_amount;
  
  UPDATE public.user_credits 
  SET balance = new_balance, updated_at = NOW()
  WHERE user_id = p_user_id;
  
  INSERT INTO public.credit_transactions (
    user_id, transaction_type, amount, balance_after, 
    description, stripe_payment_intent_id
  ) VALUES (
    p_user_id, p_transaction_type, p_amount, new_balance,
    p_description, p_stripe_payment_intent_id
  );
  
  RETURN new_balance;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Insert sample admin tokens
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.admin_tokens WHERE token_code = 'WELCOME30') THEN
    INSERT INTO public.admin_tokens (token_code, token_type, name, description, days_valid, max_uses) VALUES
    ('WELCOME30', 'time_limited', 'Welcome Token - 30 Days', 'New user welcome token for 30 days unlimited access', 30, 100);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.admin_tokens WHERE token_code = 'BETA7') THEN
    INSERT INTO public.admin_tokens (token_code, token_type, name, description, days_valid, max_uses) VALUES
    ('BETA7', 'time_limited', 'Beta Tester - 7 Days', 'Beta testing token for 7 days access', 7, 50);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.admin_tokens WHERE token_code = 'CREDIT25') THEN
    INSERT INTO public.admin_tokens (token_code, token_type, name, description, credit_amount, max_uses) VALUES
    ('CREDIT25', 'credit_token', 'Credit Token - $25', 'Promotional credit token worth $25', 25.00, 100);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.admin_tokens WHERE token_code = 'FRIEND10') THEN
    INSERT INTO public.admin_tokens (token_code, token_type, name, description, credit_amount, max_uses) VALUES
    ('FRIEND10', 'credit_token', 'Friend Referral - $10', 'Friend referral bonus credits', 10.00, 200);
  END IF;
END $$;


-- ============================================================================
-- 3. ORGANIZATION MEMBERS TABLE (fixes 500 on /v1/organizations - PGRST205)
-- ============================================================================

-- The backend expects an organization_members table
CREATE TABLE IF NOT EXISTS public.organization_members (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role VARCHAR(50) NOT NULL DEFAULT 'member' CHECK (role IN ('owner', 'admin', 'member', 'viewer')),
  email TEXT,
  usage_quota_monthly INTEGER,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(organization_id, user_id)
);

-- RLS for organization_members
ALTER TABLE public.organization_members ENABLE ROW LEVEL SECURITY;

-- Users can view members of their own organizations
DO $$ BEGIN
  DROP POLICY IF EXISTS "Users can view org members" ON public.organization_members;
  CREATE POLICY "Users can view org members" ON public.organization_members
    FOR SELECT USING (
      organization_id IN (
        SELECT om.organization_id FROM public.organization_members om WHERE om.user_id = auth.uid()
      )
    );
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

-- Users can manage their own membership
DO $$ BEGIN
  DROP POLICY IF EXISTS "Users can manage own org membership" ON public.organization_members;
  CREATE POLICY "Users can manage own org membership" ON public.organization_members
    FOR ALL USING (auth.uid() = user_id);
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

-- Org owners/admins can manage members
DO $$ BEGIN
  DROP POLICY IF EXISTS "Org admins can manage members" ON public.organization_members;
  CREATE POLICY "Org admins can manage members" ON public.organization_members
    FOR ALL USING (
      organization_id IN (
        SELECT om.organization_id FROM public.organization_members om 
        WHERE om.user_id = auth.uid() AND om.role IN ('owner', 'admin')
      )
    );
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

-- Indexes for organization_members
CREATE INDEX IF NOT EXISTS idx_org_members_org_id ON public.organization_members(organization_id);
CREATE INDEX IF NOT EXISTS idx_org_members_user_id ON public.organization_members(user_id);
CREATE INDEX IF NOT EXISTS idx_org_members_org_user ON public.organization_members(organization_id, user_id);

-- Seed existing org memberships from profiles (if profiles has organization_id)
-- Only insert for user_ids that actually exist in auth.users (skip test/seed data)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' AND table_name = 'profiles' AND column_name = 'organization_id'
  ) THEN
    INSERT INTO public.organization_members (organization_id, user_id, role, email)
    SELECT p.organization_id, p.user_id, 
      CASE WHEN p.role = 'admin' THEN 'owner' ELSE 'member' END,
      p.email
    FROM public.profiles p
    WHERE p.organization_id IS NOT NULL
      AND p.user_id IN (SELECT id FROM auth.users)
    ON CONFLICT (organization_id, user_id) DO NOTHING;
  END IF;
END $$;


-- ============================================================================
-- 4. PROMPT CLUSTERING SYSTEM (fixes 404 on prompt_uploads, cluster_warmups, prompt_clusters)
-- ============================================================================

-- Create updated_at trigger function (if not exists)
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Table to store uploaded CSV files with prompts
CREATE TABLE IF NOT EXISTS public.prompt_uploads (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  file_name TEXT NOT NULL,
  file_size INTEGER NOT NULL,
  upload_date TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  total_prompts INTEGER NOT NULL DEFAULT 0,
  processed_prompts INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'uploaded' CHECK (status IN ('uploaded', 'processing', 'clustered', 'failed')),
  error_message TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Table to store individual prompts from CSV uploads
CREATE TABLE IF NOT EXISTS public.prompts (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  upload_id UUID NOT NULL REFERENCES public.prompt_uploads(id) ON DELETE CASCADE,
  prompt_text TEXT NOT NULL,
  row_number INTEGER NOT NULL,
  cluster_id UUID NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Table to store clusters
CREATE TABLE IF NOT EXISTS public.prompt_clusters (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  upload_id UUID NOT NULL REFERENCES public.prompt_uploads(id) ON DELETE CASCADE,
  cluster_name TEXT NOT NULL,
  description TEXT NOT NULL,
  usage_examples JSONB NOT NULL DEFAULT '[]'::jsonb,
  classification_criteria JSONB NOT NULL DEFAULT '[]'::jsonb,
  prompt_count INTEGER NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Table to store cluster warm-up configurations
CREATE TABLE IF NOT EXISTS public.cluster_warmups (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  upload_id UUID NOT NULL REFERENCES public.prompt_uploads(id) ON DELETE CASCADE,
  warmup_name TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'running', 'completed', 'failed')),
  clusters_generated INTEGER NOT NULL DEFAULT 0,
  total_clusters_expected INTEGER NOT NULL DEFAULT 0,
  warmup_config JSONB NOT NULL DEFAULT '{}'::jsonb,
  started_at TIMESTAMP WITH TIME ZONE,
  completed_at TIMESTAMP WITH TIME ZONE,
  error_message TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS on clustering tables
ALTER TABLE public.prompt_uploads ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.prompts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.prompt_clusters ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cluster_warmups ENABLE ROW LEVEL SECURITY;

-- RLS Policies for prompt_uploads
DO $$ BEGIN
  DROP POLICY IF EXISTS "Users can manage own prompt uploads" ON public.prompt_uploads;
  CREATE POLICY "Users can manage own prompt uploads" ON public.prompt_uploads
    FOR ALL USING (auth.uid() = user_id)
    WITH CHECK (auth.uid() = user_id);
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

-- RLS Policies for prompts
DO $$ BEGIN
  DROP POLICY IF EXISTS "Users can manage own prompts" ON public.prompts;
  CREATE POLICY "Users can manage own prompts" ON public.prompts
    FOR ALL USING (auth.uid() = user_id)
    WITH CHECK (auth.uid() = user_id);
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

-- RLS Policies for prompt_clusters
DO $$ BEGIN
  DROP POLICY IF EXISTS "Users can manage own prompt clusters" ON public.prompt_clusters;
  CREATE POLICY "Users can manage own prompt clusters" ON public.prompt_clusters
    FOR ALL USING (auth.uid() = user_id)
    WITH CHECK (auth.uid() = user_id);
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

-- RLS Policies for cluster_warmups
DO $$ BEGIN
  DROP POLICY IF EXISTS "Users can manage own cluster warmups" ON public.cluster_warmups;
  CREATE POLICY "Users can manage own cluster warmups" ON public.cluster_warmups
    FOR ALL USING (auth.uid() = user_id)
    WITH CHECK (auth.uid() = user_id);
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

-- Clustering indexes
CREATE INDEX IF NOT EXISTS idx_prompt_uploads_user_id ON public.prompt_uploads (user_id);
CREATE INDEX IF NOT EXISTS idx_prompt_uploads_status ON public.prompt_uploads (user_id, status);
CREATE INDEX IF NOT EXISTS idx_prompts_user_id ON public.prompts (user_id);
CREATE INDEX IF NOT EXISTS idx_prompts_upload_id ON public.prompts (upload_id);
CREATE INDEX IF NOT EXISTS idx_prompts_cluster_id ON public.prompts (cluster_id) WHERE cluster_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_prompt_clusters_user_id ON public.prompt_clusters (user_id);
CREATE INDEX IF NOT EXISTS idx_prompt_clusters_upload_id ON public.prompt_clusters (upload_id);
CREATE INDEX IF NOT EXISTS idx_cluster_warmups_user_id ON public.cluster_warmups (user_id);
CREATE INDEX IF NOT EXISTS idx_cluster_warmups_status ON public.cluster_warmups (user_id, status);
CREATE INDEX IF NOT EXISTS idx_prompt_clusters_usage_examples ON public.prompt_clusters USING GIN (usage_examples);
CREATE INDEX IF NOT EXISTS idx_prompt_clusters_classification_criteria ON public.prompt_clusters USING GIN (classification_criteria);

-- Clustering triggers
DO $$ BEGIN
  CREATE TRIGGER update_prompt_uploads_updated_at
    BEFORE UPDATE ON public.prompt_uploads
    FOR EACH ROW
    EXECUTE FUNCTION public.update_updated_at_column();
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TRIGGER update_prompt_clusters_updated_at
    BEFORE UPDATE ON public.prompt_clusters
    FOR EACH ROW
    EXECUTE FUNCTION public.update_updated_at_column();
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TRIGGER update_cluster_warmups_updated_at
    BEFORE UPDATE ON public.cluster_warmups
    FOR EACH ROW
    EXECUTE FUNCTION public.update_updated_at_column();
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;


-- ============================================================================
-- 5. NOTIFY POSTGREST TO RELOAD SCHEMA CACHE
-- ============================================================================
NOTIFY pgrst, 'reload schema';

-- ============================================================================
-- DONE! All tables, policies, indexes, and functions have been created.
-- Reload your dashboard to verify the errors are resolved.
-- ============================================================================
