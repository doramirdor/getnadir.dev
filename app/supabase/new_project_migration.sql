-- ============================================================================
-- NADIR ADMIN DASHBOARD - Complete Database Schema Migration
-- Run this on a fresh Supabase project to set up all tables
-- Generated from existing migrations
-- ============================================================================

-- ============================================================================
-- SECTION 1: Functions
-- ============================================================================

-- Create update_updated_at_column function
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- SECTION 2: Enums
-- ============================================================================

-- Create enum for user roles
CREATE TYPE public.user_role AS ENUM ('admin', 'user');

-- Create enum for status types
CREATE TYPE public.status_type AS ENUM ('active', 'inactive', 'connected', 'disconnected');

-- Create enum for policy types
CREATE TYPE public.policy_type AS ENUM ('fallback', 'load_balance', 'smart_route');

-- ============================================================================
-- SECTION 3: Core Tables
-- ============================================================================

-- Profiles table for user management
CREATE TABLE public.profiles (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  email TEXT NOT NULL,
  role user_role NOT NULL DEFAULT 'user',
  status status_type NOT NULL DEFAULT 'active',
  last_login TIMESTAMP WITH TIME ZONE,
  requests_this_month INTEGER DEFAULT 0,
  cost_this_month DECIMAL(10,2) DEFAULT 0.00,
  provider_budgets JSONB DEFAULT '{"openai": 50, "anthropic": 50, "google": 50, "bedrock": 50}'::jsonb,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  CONSTRAINT valid_provider_budgets CHECK (provider_budgets IS NULL OR jsonb_typeof(provider_budgets) = 'object')
);

-- API keys table
CREATE TABLE public.api_keys (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  key_hash TEXT NOT NULL,
  key_preview TEXT NOT NULL,
  status status_type NOT NULL DEFAULT 'active',
  last_used TIMESTAMP WITH TIME ZONE,
  usage_count INTEGER DEFAULT 0,
  credit_limit DECIMAL(10,2),
  include_byok_in_limit BOOLEAN DEFAULT false,
  slug TEXT,
  description TEXT,
  system_prompt TEXT,
  selected_models TEXT[] DEFAULT '{}',
  sort_strategy TEXT,
  benchmark_model TEXT,
  load_balancing_policy TEXT DEFAULT 'round-robin',
  use_fallback BOOLEAN DEFAULT true,
  enable_caching BOOLEAN DEFAULT true,
  enable_logging BOOLEAN DEFAULT true,
  log_level TEXT DEFAULT 'info',
  model_parameters JSONB DEFAULT '{}',
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Providers table
CREATE TABLE public.providers (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  provider_id TEXT NOT NULL UNIQUE,
  status status_type NOT NULL DEFAULT 'disconnected',
  models TEXT[] NOT NULL DEFAULT '{}',
  api_key_hash TEXT,
  enabled BOOLEAN DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Integrations table
CREATE TABLE public.integrations (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  status status_type NOT NULL DEFAULT 'inactive',
  icon_url TEXT,
  description TEXT,
  config JSONB DEFAULT '{}',
  enabled BOOLEAN DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Logs table
CREATE TABLE public.logs (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  request_id TEXT NOT NULL,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  prompt TEXT NOT NULL,
  model TEXT NOT NULL,
  provider TEXT NOT NULL,
  cost DECIMAL(10,6) NOT NULL DEFAULT 0.00,
  status TEXT NOT NULL DEFAULT 'pending',
  response_time_ms INTEGER,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- User providers table (BYOK settings)
CREATE TABLE public.user_providers (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  provider_id UUID NOT NULL REFERENCES public.providers(id) ON DELETE CASCADE,
  enabled BOOLEAN NOT NULL DEFAULT false,
  use_byok BOOLEAN NOT NULL DEFAULT false,
  api_key_hash TEXT,
  allowed_models TEXT[] NOT NULL DEFAULT '{}',
  budget_limit DECIMAL(10,2) DEFAULT 50.00,
  cost_this_month DECIMAL(10,2) DEFAULT 0.00,
  requests_this_month INTEGER DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(user_id, provider_id)
);

-- User provider keys table
CREATE TABLE public.user_provider_keys (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  provider_id TEXT NOT NULL,
  provider_name TEXT NOT NULL,
  api_key_hash TEXT,
  byok_enabled BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(user_id, provider_id)
);

-- Presets table
CREATE TABLE public.presets (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  system_prompt TEXT,
  selected_models TEXT[] DEFAULT '{}',
  model_parameters JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Model policies table
CREATE TABLE public.model_policies (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  api_key_id UUID REFERENCES public.api_keys(id) ON DELETE CASCADE,
  preset_id UUID REFERENCES public.presets(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  policy_type policy_type NOT NULL,
  template_name TEXT,
  models JSONB DEFAULT '[]'::jsonb,
  policy_config JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  CONSTRAINT check_api_key_or_preset CHECK (
    (api_key_id IS NOT NULL AND preset_id IS NULL) OR 
    (api_key_id IS NULL AND preset_id IS NOT NULL) OR
    (api_key_id IS NULL AND preset_id IS NULL)
  )
);

-- Waitlist table
CREATE TABLE public.waitlist (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  email TEXT NOT NULL UNIQUE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- ============================================================================
-- SECTION 4: Billing Tables
-- ============================================================================

-- Billing plans table
CREATE TABLE public.billing_plans (
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

-- User subscriptions table
CREATE TABLE public.user_subscriptions (
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
  trial_ends_at TIMESTAMP WITH TIME ZONE,
  discount_percent DECIMAL(5, 2) DEFAULT 0,
  discount_amount DECIMAL(10, 2) DEFAULT 0,
  next_billing_amount DECIMAL(10, 2),
  billing_cycle_anchor TIMESTAMP WITH TIME ZONE,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(user_id)
);

-- User credits table
CREATE TABLE public.user_credits (
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

-- Credit transactions table
CREATE TABLE public.credit_transactions (
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

-- User payment methods table
CREATE TABLE public.user_payment_methods (
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

-- Usage tracking table
CREATE TABLE public.usage_tracking (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  api_key_id UUID REFERENCES api_keys(id),
  model_name VARCHAR(255),
  tokens_used INTEGER DEFAULT 0,
  cost DECIMAL(10, 6) DEFAULT 0.000000,
  request_count INTEGER DEFAULT 1,
  created_date DATE DEFAULT CURRENT_DATE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(user_id, api_key_id, model_name, created_date)
);

-- Admin tokens table
CREATE TABLE public.admin_tokens (
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
  expires_at TIMESTAMP WITH TIME ZONE,
  CONSTRAINT check_admin_token_data CHECK (
    (token_type = 'time_limited' AND days_valid IS NOT NULL AND credit_amount IS NULL) OR
    (token_type = 'credit_token' AND credit_amount IS NOT NULL AND days_valid IS NULL)
  )
);

-- User token redemptions table
CREATE TABLE public.user_token_redemptions (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  admin_token_id UUID NOT NULL REFERENCES admin_tokens(id) ON DELETE CASCADE,
  token_code VARCHAR(255) NOT NULL,
  redeemed_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  expires_at TIMESTAMP WITH TIME ZONE,
  days_granted INTEGER,
  credits_granted DECIMAL(10, 2),
  is_active BOOLEAN DEFAULT true,
  is_expired BOOLEAN DEFAULT false,
  UNIQUE(user_id, admin_token_id)
);

-- Purchase logs table
CREATE TABLE public.purchase_logs (
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
  plan_id UUID REFERENCES billing_plans(id),
  credits_purchased DECIMAL(10, 2),
  subscription_period_start TIMESTAMP WITH TIME ZONE,
  subscription_period_end TIMESTAMP WITH TIME ZONE,
  admin_token_id UUID REFERENCES admin_tokens(id),
  token_code VARCHAR(255),
  status VARCHAR(50) NOT NULL DEFAULT 'completed' CHECK (status IN ('pending', 'completed', 'failed', 'refunded', 'cancelled')),
  payment_status VARCHAR(50) CHECK (payment_status IN ('paid', 'unpaid', 'failed', 'refunded')),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  completed_at TIMESTAMP WITH TIME ZONE,
  metadata JSONB DEFAULT '{}',
  notes TEXT
);

-- User integrations table (for BYOK)
CREATE TABLE public.user_integrations (
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
  health_status VARCHAR(50) DEFAULT 'unknown' CHECK (health_status IN ('healthy', 'unhealthy', 'unknown', 'rate_limited')),
  UNIQUE(user_id, integration_type, api_key_hash)
);

-- Subscription changes table
CREATE TABLE public.subscription_changes (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  subscription_id UUID NOT NULL REFERENCES user_subscriptions(id) ON DELETE CASCADE,
  change_type VARCHAR(50) NOT NULL CHECK (change_type IN ('created', 'upgraded', 'downgraded', 'cancelled', 'renewed', 'failed', 'refunded')),
  old_plan_id UUID REFERENCES billing_plans(id),
  new_plan_id UUID REFERENCES billing_plans(id),
  old_status VARCHAR(50),
  new_status VARCHAR(50),
  proration_amount DECIMAL(10, 2) DEFAULT 0,
  effective_date TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  reason TEXT,
  triggered_by VARCHAR(50) DEFAULT 'user' CHECK (triggered_by IN ('user', 'admin', 'system', 'payment_failed', 'stripe_webhook')),
  metadata JSONB DEFAULT '{}'
);

-- Integration usage logs table
CREATE TABLE public.integration_usage_logs (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  integration_id UUID NOT NULL REFERENCES user_integrations(id) ON DELETE CASCADE,
  api_key_id UUID REFERENCES api_keys(id),
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

-- ============================================================================
-- SECTION 5: Indexes
-- ============================================================================

-- API keys indexes
CREATE UNIQUE INDEX idx_api_keys_user_slug ON public.api_keys(user_id, slug) WHERE slug IS NOT NULL;
CREATE INDEX idx_api_keys_sort_strategy ON public.api_keys(sort_strategy);
CREATE INDEX idx_api_keys_use_fallback ON public.api_keys(use_fallback);
CREATE INDEX idx_api_keys_selected_models ON public.api_keys USING gin(selected_models);

-- Profiles indexes
CREATE INDEX idx_profiles_provider_budgets ON public.profiles USING gin (provider_budgets);

-- User providers indexes
CREATE INDEX idx_user_providers_user_id ON public.user_providers(user_id);
CREATE INDEX idx_user_providers_provider_id ON public.user_providers(provider_id);
CREATE INDEX idx_user_providers_enabled ON public.user_providers(enabled);

-- User provider keys indexes
CREATE INDEX idx_user_provider_keys_user_id ON public.user_provider_keys(user_id);
CREATE INDEX idx_user_provider_keys_provider_id ON public.user_provider_keys(provider_id);
CREATE INDEX idx_user_provider_keys_byok_enabled ON public.user_provider_keys(byok_enabled);

-- Presets indexes
CREATE INDEX idx_presets_user_id ON presets(user_id);
CREATE INDEX idx_presets_name ON presets(name);

-- Model policies indexes
CREATE INDEX idx_model_policies_user_id ON public.model_policies (user_id);
CREATE INDEX idx_model_policies_api_key_id ON public.model_policies (api_key_id) WHERE api_key_id IS NOT NULL;
CREATE INDEX idx_model_policies_preset_id ON public.model_policies (preset_id) WHERE preset_id IS NOT NULL;
CREATE INDEX idx_model_policies_models ON model_policies USING GIN (models);
CREATE INDEX idx_model_policies_config ON model_policies USING GIN (policy_config);

-- Billing indexes
CREATE INDEX idx_user_subscriptions_user_id ON user_subscriptions(user_id);
CREATE INDEX idx_user_subscriptions_stripe_customer ON user_subscriptions(stripe_customer_id);
CREATE INDEX idx_user_credits_user_id ON user_credits(user_id);
CREATE INDEX idx_credit_transactions_user_id ON credit_transactions(user_id);
CREATE INDEX idx_credit_transactions_created_at ON credit_transactions(created_at);
CREATE INDEX idx_payment_methods_user_id ON user_payment_methods(user_id);
CREATE INDEX idx_usage_tracking_user_date ON usage_tracking(user_id, created_date);
CREATE INDEX idx_usage_tracking_api_key ON usage_tracking(api_key_id);

-- Admin tokens indexes
CREATE INDEX idx_admin_tokens_code ON admin_tokens(token_code);
CREATE INDEX idx_admin_tokens_type_active ON admin_tokens(token_type, is_active);
CREATE INDEX idx_admin_tokens_expires ON admin_tokens(expires_at);

-- User token redemptions indexes
CREATE INDEX idx_user_token_redemptions_user ON user_token_redemptions(user_id);
CREATE INDEX idx_user_token_redemptions_active ON user_token_redemptions(user_id, is_active, is_expired);
CREATE INDEX idx_user_token_redemptions_expires ON user_token_redemptions(expires_at);

-- Purchase logs indexes
CREATE INDEX idx_purchase_logs_user_date ON purchase_logs(user_id, created_at);
CREATE INDEX idx_purchase_logs_type_status ON purchase_logs(purchase_type, status);
CREATE INDEX idx_purchase_logs_stripe_payment ON purchase_logs(stripe_payment_intent_id);

-- User integrations indexes
CREATE INDEX idx_user_integrations_user_active ON user_integrations(user_id, is_active);
CREATE INDEX idx_user_integrations_type ON user_integrations(integration_type);
CREATE INDEX idx_user_integrations_health ON user_integrations(health_status, last_health_check);

-- Subscription changes indexes
CREATE INDEX idx_subscription_changes_user ON subscription_changes(user_id, created_at);
CREATE INDEX idx_subscription_changes_subscription ON subscription_changes(subscription_id);

-- Integration usage logs indexes
CREATE INDEX idx_integration_usage_user_date ON integration_usage_logs(user_id, created_date);
CREATE INDEX idx_integration_usage_integration ON integration_usage_logs(integration_id, created_date);
CREATE INDEX idx_integration_usage_model ON integration_usage_logs(model_used, created_date);

-- ============================================================================
-- SECTION 6: Enable RLS on All Tables
-- ============================================================================

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.api_keys ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.providers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.integrations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_providers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_provider_keys ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.presets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.model_policies ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.waitlist ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.billing_plans ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_credits ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.credit_transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_payment_methods ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.usage_tracking ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.admin_tokens ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_token_redemptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.purchase_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_integrations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.subscription_changes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.integration_usage_logs ENABLE ROW LEVEL SECURITY;

-- ============================================================================
-- SECTION 7: is_admin Function (needed for RLS policies)
-- ============================================================================

CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS BOOLEAN AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM public.profiles 
    WHERE user_id = auth.uid() AND role = 'admin'
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE;

-- ============================================================================
-- SECTION 8: RLS Policies
-- ============================================================================

-- Profiles policies
CREATE POLICY "Admins can view all profiles" ON public.profiles
  FOR SELECT USING (public.is_admin());
CREATE POLICY "Admins can insert profiles" ON public.profiles
  FOR INSERT WITH CHECK (public.is_admin());
CREATE POLICY "Admins can update profiles" ON public.profiles
  FOR UPDATE USING (public.is_admin());
CREATE POLICY "Users can view own profile" ON public.profiles
  FOR SELECT USING (auth.uid() = user_id);

-- API keys policies
CREATE POLICY "Admins can manage all API keys" ON public.api_keys
  FOR ALL USING (public.is_admin());
CREATE POLICY "Users can manage own API keys" ON public.api_keys
  FOR ALL USING (auth.uid() = user_id);

-- Providers policies
CREATE POLICY "Admins can manage providers" ON public.providers
  FOR ALL USING (public.is_admin());
CREATE POLICY "Users can view providers" ON public.providers
  FOR SELECT USING (true);

-- Integrations policies
CREATE POLICY "Admins can manage integrations" ON public.integrations
  FOR ALL USING (public.is_admin());
CREATE POLICY "Users can view integrations" ON public.integrations
  FOR SELECT USING (true);

-- Logs policies
CREATE POLICY "Admins can view all logs" ON public.logs
  FOR SELECT USING (public.is_admin());
CREATE POLICY "Users can view own logs" ON public.logs
  FOR SELECT USING (auth.uid() = user_id);

-- User providers policies
CREATE POLICY "Users can manage own provider configs" ON public.user_providers
  FOR ALL USING (auth.uid() = user_id);
CREATE POLICY "Admins can manage all provider configs" ON public.user_providers
  FOR ALL USING (public.is_admin());

-- User provider keys policies
CREATE POLICY "Users can manage their own provider keys" ON public.user_provider_keys
  FOR ALL USING (auth.uid() = user_id);

-- Presets policies
CREATE POLICY "Users can view their own presets" ON presets
  FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert their own presets" ON presets
  FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update their own presets" ON presets
  FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete their own presets" ON presets
  FOR DELETE USING (auth.uid() = user_id);

-- Model policies policies
CREATE POLICY "Users can manage own model policies" ON public.model_policies
  FOR ALL USING (auth.uid() = user_id);

-- Waitlist policies
CREATE POLICY "Anyone can insert to waitlist" ON public.waitlist
  FOR INSERT WITH CHECK (true);
CREATE POLICY "Admins can view waitlist" ON public.waitlist
  FOR SELECT USING (public.is_admin());

-- Billing plans policies
CREATE POLICY "Billing plans are viewable by authenticated users" ON billing_plans
  FOR SELECT USING (auth.role() = 'authenticated');

-- User subscriptions policies
CREATE POLICY "Users can view own subscription" ON user_subscriptions
  FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can update own subscription" ON user_subscriptions
  FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own subscription" ON user_subscriptions
  FOR INSERT WITH CHECK (auth.uid() = user_id);

-- User credits policies
CREATE POLICY "Users can view own credits" ON user_credits
  FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can update own credits" ON user_credits
  FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own credits" ON user_credits
  FOR INSERT WITH CHECK (auth.uid() = user_id);

-- Credit transactions policies
CREATE POLICY "Users can view own transactions" ON credit_transactions
  FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "System can insert transactions" ON credit_transactions
  FOR INSERT WITH CHECK (true);

-- User payment methods policies
CREATE POLICY "Users can view own payment methods" ON user_payment_methods
  FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can manage own payment methods" ON user_payment_methods
  FOR ALL USING (auth.uid() = user_id);

-- Usage tracking policies
CREATE POLICY "Users can view own usage" ON usage_tracking
  FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "System can insert usage" ON usage_tracking
  FOR INSERT WITH CHECK (true);

-- Admin tokens policies
CREATE POLICY "Admins can manage admin tokens" ON admin_tokens
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM profiles 
      WHERE profiles.user_id = auth.uid() 
      AND profiles.role = 'admin'
    )
  );
CREATE POLICY "Users can view active admin tokens" ON admin_tokens
  FOR SELECT USING (is_active = true AND (expires_at IS NULL OR expires_at > NOW()));

-- User token redemptions policies
CREATE POLICY "Users can view own token redemptions" ON user_token_redemptions
  FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own token redemptions" ON user_token_redemptions
  FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "System can update token redemptions" ON user_token_redemptions
  FOR UPDATE USING (true);

-- Purchase logs policies
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

-- User integrations policies
CREATE POLICY "Users can manage own integrations" ON user_integrations
  FOR ALL USING (auth.uid() = user_id);

-- Subscription changes policies
CREATE POLICY "Users can view own subscription changes" ON subscription_changes
  FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "System can insert subscription changes" ON subscription_changes
  FOR INSERT WITH CHECK (true);

-- Integration usage logs policies
CREATE POLICY "Users can view own integration usage" ON integration_usage_logs
  FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "System can insert integration usage" ON integration_usage_logs
  FOR INSERT WITH CHECK (true);

-- ============================================================================
-- SECTION 9: Triggers
-- ============================================================================

CREATE TRIGGER update_profiles_updated_at
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_api_keys_updated_at
  BEFORE UPDATE ON public.api_keys
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_providers_updated_at
  BEFORE UPDATE ON public.providers
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_integrations_updated_at
  BEFORE UPDATE ON public.integrations
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_logs_updated_at
  BEFORE UPDATE ON public.logs
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_user_providers_updated_at
  BEFORE UPDATE ON public.user_providers
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_user_provider_keys_updated_at
  BEFORE UPDATE ON public.user_provider_keys
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER trigger_update_presets_updated_at
  BEFORE UPDATE ON presets
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_model_policies_updated_at
  BEFORE UPDATE ON public.model_policies
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- ============================================================================
-- SECTION 10: Billing Functions
-- ============================================================================

-- Function to update user credits
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
  SELECT balance INTO current_balance 
  FROM user_credits 
  WHERE user_id = p_user_id;
  
  IF NOT FOUND THEN
    INSERT INTO user_credits (user_id, balance) VALUES (p_user_id, 0.00);
    current_balance := 0.00;
  END IF;
  
  new_balance := current_balance + p_amount;
  
  UPDATE user_credits 
  SET balance = new_balance, updated_at = NOW()
  WHERE user_id = p_user_id;
  
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

-- Function to check if auto-charge should trigger
CREATE OR REPLACE FUNCTION check_auto_charge(p_user_id UUID) 
RETURNS BOOLEAN AS $$
DECLARE
  user_credits_record RECORD;
BEGIN
  SELECT * INTO user_credits_record
  FROM user_credits 
  WHERE user_id = p_user_id;
  
  IF NOT FOUND THEN
    RETURN FALSE;
  END IF;
  
  RETURN (
    user_credits_record.auto_charge_enabled = TRUE AND 
    user_credits_record.balance <= user_credits_record.auto_charge_threshold
  );
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
  
  IF EXISTS (
    SELECT 1 FROM user_token_redemptions 
    WHERE user_id = p_user_id AND admin_token_id = token_record.id
  ) THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Token already redeemed'
    );
  END IF;
  
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
  
  UPDATE admin_tokens 
  SET current_uses = current_uses + 1,
      is_active = CASE WHEN current_uses + 1 >= max_uses THEN false ELSE is_active END
  WHERE id = token_record.id;
  
  IF token_record.token_type = 'credit_token' THEN
    PERFORM update_user_credits(
      p_user_id, 
      token_record.credit_amount, 
      'token_grant',
      'Credits from token: ' || p_token_code,
      NULL
    );
  END IF;
  
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

-- ============================================================================
-- SECTION 11: Default Data
-- ============================================================================

-- Insert default providers
INSERT INTO public.providers (name, provider_id, models, status) VALUES
  ('OpenAI', 'openai', '{"gpt-4", "gpt-4-turbo", "gpt-4o", "gpt-4o-mini", "gpt-3.5-turbo", "o1", "o1-mini", "o1-preview"}', 'disconnected'),
  ('Anthropic', 'anthropic', '{"claude-3-opus-20240229", "claude-3-sonnet-20240229", "claude-3-haiku-20240307", "claude-3-5-sonnet-20241022", "claude-3-5-haiku-20241022"}', 'disconnected'),
  ('Google (Gemini)', 'google', '{"gemini-1.5-pro", "gemini-1.5-flash", "gemini-2.0-flash-exp"}', 'disconnected'),
  ('xAI', 'xai', '{"grok-beta", "grok-2-1212"}', 'disconnected'),
  ('Mistral', 'mistral', '{"mistral-large-latest", "mistral-medium-latest", "mistral-small-latest", "codestral-latest"}', 'disconnected'),
  ('Cohere', 'cohere', '{"command-r-plus", "command-r", "command-light"}', 'disconnected'),
  ('DeepSeek', 'deepseek', '{"deepseek-chat", "deepseek-coder"}', 'disconnected'),
  ('AWS Bedrock', 'bedrock', '{"amazon.titan-text-premier-v1:0", "amazon.titan-text-lite-v1", "anthropic.claude-3-sonnet-20240229-v1:0"}', 'disconnected'),
  ('Azure OpenAI', 'azure', '{"gpt-4", "gpt-4-turbo", "gpt-35-turbo"}', 'disconnected'),
  ('Groq', 'groq', '{"llama-3.3-70b-versatile", "llama-3.1-8b-instant", "mixtral-8x7b-32768"}', 'disconnected'),
  ('Together AI', 'together', '{"meta-llama/Llama-3.3-70B-Instruct-Turbo", "mistralai/Mixtral-8x22B-Instruct-v0.1"}', 'disconnected'),
  ('Fireworks', 'fireworks', '{"accounts/fireworks/models/llama-v3p3-70b-instruct", "accounts/fireworks/models/mixtral-8x22b-instruct"}', 'disconnected')
ON CONFLICT (provider_id) DO NOTHING;

-- Insert default integrations
INSERT INTO public.integrations (name, status, description) VALUES
  ('AI21', 'inactive', 'AI21 Labs language models'),
  ('AionLabs', 'inactive', 'AionLabs AI services'),
  ('Alibaba', 'inactive', 'Alibaba Cloud AI services'),
  ('Amazon Bedrock', 'inactive', 'Amazon Bedrock foundation models'),
  ('Azure', 'inactive', 'Microsoft Azure AI services'),
  ('Baseten', 'inactive', 'Baseten ML platform'),
  ('Cohere', 'inactive', 'Cohere language models'),
  ('DeepSeek', 'inactive', 'DeepSeek AI models'),
  ('Fireworks', 'inactive', 'Fireworks AI platform'),
  ('Google', 'inactive', 'Google AI services'),
  ('Groq', 'inactive', 'Groq inference platform'),
  ('Mistral', 'inactive', 'Mistral AI models'),
  ('OpenAI', 'inactive', 'OpenAI GPT models'),
  ('Perplexity', 'inactive', 'Perplexity AI search'),
  ('Together', 'inactive', 'Together AI platform')
ON CONFLICT DO NOTHING;

-- Insert default billing plans
INSERT INTO billing_plans (name, description, plan_type, price_per_month, features) VALUES
  ('Free Tier', 'Basic access with limited requests', 'subscription', 0.00, '{"max_requests": 1000, "models": ["gpt-3.5-turbo"], "support": "community"}'),
  ('Pro Plan', 'Advanced features for professionals', 'subscription', 29.99, '{"max_requests": 50000, "models": ["gpt-4", "claude-3"], "support": "email", "analytics": true}'),
  ('Enterprise', 'Unlimited access for teams', 'subscription', NULL, '{"max_requests": -1, "models": ["all"], "support": "priority", "analytics": true, "custom_models": true, "contact_sales": true}'),
  ('Pay-As-You-Go', 'Pay per request', 'pay_as_you_go', NULL, '{"price_per_request": 0.002, "models": ["all"]}')
ON CONFLICT DO NOTHING;

INSERT INTO billing_plans (name, description, plan_type, credit_amount, credit_price, features) VALUES
  ('Buy Credits - $10', 'Purchase $10 in credits', 'buy_credit', 10.00, 10.00, '{}'),
  ('Buy Credits - $25', 'Purchase $25 in credits', 'buy_credit', 25.00, 25.00, '{}'),
  ('Buy Credits - $50', 'Purchase $50 in credits', 'buy_credit', 50.00, 50.00, '{}'),
  ('Buy Credits - $100', 'Purchase $100 in credits', 'buy_credit', 100.00, 100.00, '{}')
ON CONFLICT DO NOTHING;

-- Insert sample admin tokens
INSERT INTO admin_tokens (token_code, token_type, name, description, days_valid, max_uses) VALUES
  ('WELCOME30', 'time_limited', 'Welcome Token - 30 Days', 'New user welcome token for 30 days unlimited access', 30, 100),
  ('BETA7', 'time_limited', 'Beta Tester - 7 Days', 'Beta testing token for 7 days access', 7, 50)
ON CONFLICT (token_code) DO NOTHING;

INSERT INTO admin_tokens (token_code, token_type, name, description, credit_amount, max_uses) VALUES
  ('CREDIT25', 'credit_token', 'Credit Token - $25', 'Promotional credit token worth $25', 25.00, 100),
  ('FRIEND10', 'credit_token', 'Friend Referral - $10', 'Friend referral bonus credits', 10.00, 200)
ON CONFLICT (token_code) DO NOTHING;

-- ============================================================================
-- SECTION 12: Grant Permissions
-- ============================================================================

GRANT ALL ON ALL TABLES IN SCHEMA public TO authenticated;
GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO authenticated;
GRANT USAGE ON SCHEMA public TO authenticated;
GRANT USAGE ON SCHEMA public TO anon;

-- ============================================================================
-- DONE!
-- ============================================================================

