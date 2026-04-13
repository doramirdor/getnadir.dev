-- ============================================================================
-- Migration 003: Create all missing tables for Nadir backend
-- Target: Supabase project cxqmqnlouozrhsprtdcb
-- Tables: usage_events, cost_usage, usage_tracking, billing_plans,
--         cluster_suggestions, prompt_clusters, fine_tuning_jobs, expert_models
-- ============================================================================

-- Ensure updated_at trigger function exists
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;


-- ============================================================================
-- 1. usage_events — Individual API usage events for analytics
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.usage_events (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  api_key_id UUID,
  preset_id UUID,

  -- Event details
  event_type TEXT NOT NULL CHECK (event_type IN ('api_call', 'model_usage', 'cluster_lookup', 'fallback_triggered', 'load_balance', 'smart_route')),
  event_subtype TEXT,

  -- Request details
  request_id TEXT,
  endpoint TEXT NOT NULL,
  method TEXT NOT NULL DEFAULT 'POST',

  -- Model information
  model_name TEXT,
  provider_name TEXT,
  cluster_name TEXT,

  -- Performance metrics
  response_time_ms INTEGER,
  input_tokens INTEGER DEFAULT 0,
  output_tokens INTEGER DEFAULT 0,
  total_tokens INTEGER GENERATED ALWAYS AS (COALESCE(input_tokens, 0) + COALESCE(output_tokens, 0)) STORED,

  -- Cost tracking
  input_cost DECIMAL(10,8) DEFAULT 0,
  output_cost DECIMAL(10,8) DEFAULT 0,
  total_cost DECIMAL(10,8) GENERATED ALWAYS AS (COALESCE(input_cost, 0) + COALESCE(output_cost, 0)) STORED,

  -- Status and error tracking
  status_code INTEGER NOT NULL,
  success BOOLEAN GENERATED ALWAYS AS (status_code >= 200 AND status_code < 300) STORED,
  error_message TEXT,
  error_type TEXT,

  -- Request metadata
  user_agent TEXT,
  ip_address INET,
  country_code TEXT,

  -- Campaign and funnel tracking
  campaign_tag TEXT,
  funnel_stage TEXT,

  -- Complexity analysis
  prompt_length INTEGER,
  complexity_score DECIMAL(3,2),
  task_category TEXT,

  -- Additional metadata
  metadata JSONB DEFAULT '{}'::jsonb,

  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.usage_events ENABLE ROW LEVEL SECURITY;

-- Service role has full access (bypasses RLS), but add explicit policies too
DO $$ BEGIN
  DROP POLICY IF EXISTS "Users can view own usage events" ON public.usage_events;
  CREATE POLICY "Users can view own usage events" ON public.usage_events
    FOR SELECT USING (auth.uid() = user_id);
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

DO $$ BEGIN
  DROP POLICY IF EXISTS "Service role full access usage_events" ON public.usage_events;
  CREATE POLICY "Service role full access usage_events" ON public.usage_events
    FOR ALL USING (true) WITH CHECK (true);
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

-- Indexes
CREATE INDEX IF NOT EXISTS idx_usage_events_user_id_created_at
  ON public.usage_events (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_usage_events_api_key_id_created_at
  ON public.usage_events (api_key_id, created_at DESC) WHERE api_key_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_usage_events_event_type_created_at
  ON public.usage_events (event_type, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_usage_events_status_success
  ON public.usage_events (user_id, success, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_usage_events_model_provider
  ON public.usage_events (user_id, model_name, provider_name, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_usage_events_campaign_tag
  ON public.usage_events (user_id, campaign_tag, created_at DESC) WHERE campaign_tag IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_usage_events_complexity
  ON public.usage_events (user_id, task_category, complexity_score, created_at DESC) WHERE complexity_score IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_usage_events_metadata
  ON public.usage_events USING GIN (metadata);


-- ============================================================================
-- 2. cost_usage — Detailed per-request cost breakdown
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.cost_usage (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  request_id TEXT NOT NULL,
  user_id UUID NOT NULL,
  model_name TEXT NOT NULL,
  provider TEXT NOT NULL,

  -- Cost breakdown
  llm_cost_usd DECIMAL(12,8) DEFAULT 0,
  input_cost_usd DECIMAL(12,8) DEFAULT 0,
  output_cost_usd DECIMAL(12,8) DEFAULT 0,
  routing_fee_usd DECIMAL(12,8) DEFAULT 0,
  total_cost_usd DECIMAL(12,8) DEFAULT 0,

  -- Token usage
  prompt_tokens INTEGER DEFAULT 0,
  completion_tokens INTEGER DEFAULT 0,
  total_tokens INTEGER DEFAULT 0,

  -- Routing info
  routing_strategy TEXT,
  uses_own_keys BOOLEAN DEFAULT false,

  -- Per-token costs
  cost_per_token DECIMAL(12,10) DEFAULT 0,
  cost_per_input_token DECIMAL(12,10) DEFAULT 0,
  cost_per_output_token DECIMAL(12,10) DEFAULT 0,

  -- Extra data
  metadata JSONB DEFAULT '{}'::jsonb,

  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.cost_usage ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  DROP POLICY IF EXISTS "Users can view own cost_usage" ON public.cost_usage;
  CREATE POLICY "Users can view own cost_usage" ON public.cost_usage
    FOR SELECT USING (auth.uid() = user_id);
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

DO $$ BEGIN
  DROP POLICY IF EXISTS "Service role full access cost_usage" ON public.cost_usage;
  CREATE POLICY "Service role full access cost_usage" ON public.cost_usage
    FOR ALL USING (true) WITH CHECK (true);
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

CREATE INDEX IF NOT EXISTS idx_cost_usage_user_id_created_at
  ON public.cost_usage (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_cost_usage_request_id
  ON public.cost_usage (request_id);
CREATE INDEX IF NOT EXISTS idx_cost_usage_model_name
  ON public.cost_usage (user_id, model_name, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_cost_usage_provider
  ON public.cost_usage (user_id, provider, created_at DESC);


-- ============================================================================
-- 3. usage_tracking — Daily aggregated usage per user/key/model
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.usage_tracking (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  api_key_id UUID,
  model_name VARCHAR(255),
  tokens_used INTEGER DEFAULT 0,
  cost DECIMAL(10, 6) DEFAULT 0.000000,
  request_count INTEGER DEFAULT 1,
  created_date DATE DEFAULT CURRENT_DATE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(user_id, api_key_id, model_name, created_date)
);

ALTER TABLE public.usage_tracking ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  DROP POLICY IF EXISTS "Users can view own usage tracking" ON public.usage_tracking;
  CREATE POLICY "Users can view own usage tracking" ON public.usage_tracking
    FOR SELECT USING (auth.uid() = user_id);
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

DO $$ BEGIN
  DROP POLICY IF EXISTS "Service role full access usage_tracking" ON public.usage_tracking;
  CREATE POLICY "Service role full access usage_tracking" ON public.usage_tracking
    FOR ALL USING (true) WITH CHECK (true);
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

CREATE INDEX IF NOT EXISTS idx_usage_tracking_user_date
  ON public.usage_tracking (user_id, created_date);


-- ============================================================================
-- 4. billing_plans — Available subscription/credit plans
-- ============================================================================
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

ALTER TABLE public.billing_plans ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  DROP POLICY IF EXISTS "Billing plans viewable by authenticated" ON public.billing_plans;
  CREATE POLICY "Billing plans viewable by authenticated" ON public.billing_plans
    FOR SELECT USING (true);
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

DO $$ BEGIN
  DROP POLICY IF EXISTS "Service role full access billing_plans" ON public.billing_plans;
  CREATE POLICY "Service role full access billing_plans" ON public.billing_plans
    FOR ALL USING (true) WITH CHECK (true);
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

-- Seed default billing plans
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.billing_plans WHERE name = 'Free Tier') THEN
    INSERT INTO public.billing_plans (name, description, plan_type, price_per_month, features) VALUES
    ('Free Tier', 'Basic access with limited requests', 'subscription', 0.00,
     '{"max_requests": 1000, "models": ["gpt-3.5-turbo"], "support": "community"}');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.billing_plans WHERE name = 'Pro Plan') THEN
    INSERT INTO public.billing_plans (name, description, plan_type, price_per_month, features) VALUES
    ('Pro Plan', 'Advanced features for professionals', 'subscription', 29.99,
     '{"max_requests": 50000, "models": ["gpt-4", "claude-3"], "support": "email", "analytics": true}');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.billing_plans WHERE name = 'Enterprise') THEN
    INSERT INTO public.billing_plans (name, description, plan_type, price_per_month, features) VALUES
    ('Enterprise', 'Unlimited access for teams', 'subscription', NULL,
     '{"max_requests": -1, "models": ["all"], "support": "priority", "analytics": true, "custom_models": true}');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.billing_plans WHERE name = 'Pay-As-You-Go') THEN
    INSERT INTO public.billing_plans (name, description, plan_type, features) VALUES
    ('Pay-As-You-Go', 'Pay per request', 'pay_as_you_go',
     '{"price_per_request": 0.002, "models": ["all"]}');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.billing_plans WHERE name = 'Buy Credits - $10') THEN
    INSERT INTO public.billing_plans (name, description, plan_type, credit_amount, credit_price, features) VALUES
    ('Buy Credits - $10', 'Purchase $10 in credits', 'buy_credit', 10.00, 10.00, '{}'),
    ('Buy Credits - $25', 'Purchase $25 in credits', 'buy_credit', 25.00, 25.00, '{}'),
    ('Buy Credits - $50', 'Purchase $50 in credits', 'buy_credit', 50.00, 50.00, '{}'),
    ('Buy Credits - $100', 'Purchase $100 in credits', 'buy_credit', 100.00, 100.00, '{}');
  END IF;
END $$;


-- ============================================================================
-- 5. cluster_suggestions — Adaptive cluster discovery suggestions
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.cluster_suggestions (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  suggested_name TEXT NOT NULL,
  description TEXT,
  sample_prompts JSONB DEFAULT '[]'::jsonb,
  prompt_count INTEGER DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'rejected')),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.cluster_suggestions ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  DROP POLICY IF EXISTS "Users can view own cluster suggestions" ON public.cluster_suggestions;
  CREATE POLICY "Users can view own cluster suggestions" ON public.cluster_suggestions
    FOR SELECT USING (auth.uid() = user_id);
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

DO $$ BEGIN
  DROP POLICY IF EXISTS "Service role full access cluster_suggestions" ON public.cluster_suggestions;
  CREATE POLICY "Service role full access cluster_suggestions" ON public.cluster_suggestions
    FOR ALL USING (true) WITH CHECK (true);
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

CREATE INDEX IF NOT EXISTS idx_cluster_suggestions_user_status
  ON public.cluster_suggestions (user_id, status, created_at DESC);

DO $$ BEGIN
  CREATE TRIGGER update_cluster_suggestions_updated_at
    BEFORE UPDATE ON public.cluster_suggestions
    FOR EACH ROW
    EXECUTE FUNCTION public.update_updated_at_column();
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;


-- ============================================================================
-- 6. prompt_clusters — User-defined prompt clusters
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.prompt_clusters (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  upload_id UUID,
  cluster_name TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  usage_examples JSONB NOT NULL DEFAULT '[]'::jsonb,
  classification_criteria JSONB NOT NULL DEFAULT '[]'::jsonb,
  prompt_count INTEGER NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.prompt_clusters ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  DROP POLICY IF EXISTS "Users can manage own prompt clusters" ON public.prompt_clusters;
  CREATE POLICY "Users can manage own prompt clusters" ON public.prompt_clusters
    FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

DO $$ BEGIN
  DROP POLICY IF EXISTS "Service role full access prompt_clusters" ON public.prompt_clusters;
  CREATE POLICY "Service role full access prompt_clusters" ON public.prompt_clusters
    FOR ALL USING (true) WITH CHECK (true);
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

CREATE INDEX IF NOT EXISTS idx_prompt_clusters_user_id
  ON public.prompt_clusters (user_id);
CREATE INDEX IF NOT EXISTS idx_prompt_clusters_upload_id
  ON public.prompt_clusters (upload_id) WHERE upload_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_prompt_clusters_usage_examples
  ON public.prompt_clusters USING GIN (usage_examples);
CREATE INDEX IF NOT EXISTS idx_prompt_clusters_classification_criteria
  ON public.prompt_clusters USING GIN (classification_criteria);

DO $$ BEGIN
  CREATE TRIGGER update_prompt_clusters_updated_at
    BEFORE UPDATE ON public.prompt_clusters
    FOR EACH ROW
    EXECUTE FUNCTION public.update_updated_at_column();
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;


-- ============================================================================
-- 7. fine_tuning_jobs — Fine-tuning / distillation job tracking
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.fine_tuning_jobs (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  cluster_id TEXT NOT NULL,

  -- Job configuration
  job_type TEXT NOT NULL DEFAULT 'openai' CHECK (job_type IN ('openai', 'local')),
  base_model TEXT,
  teacher_model TEXT,
  hyperparameters JSONB DEFAULT '{}'::jsonb,
  trigger_type TEXT DEFAULT 'manual' CHECK (trigger_type IN ('manual', 'auto', 'scheduled')),

  -- Status tracking
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN (
    'pending', 'preparing_data', 'uploading', 'training',
    'evaluating', 'completed', 'failed', 'cancelled'
  )),
  error_message TEXT,

  -- OpenAI-specific fields
  openai_job_id TEXT,
  openai_file_id TEXT,

  -- Training data stats
  training_samples_count INTEGER DEFAULT 0,
  validation_samples_count INTEGER DEFAULT 0,

  -- Timestamps
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.fine_tuning_jobs ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  DROP POLICY IF EXISTS "Users can view own fine_tuning_jobs" ON public.fine_tuning_jobs;
  CREATE POLICY "Users can view own fine_tuning_jobs" ON public.fine_tuning_jobs
    FOR SELECT USING (auth.uid() = user_id);
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

DO $$ BEGIN
  DROP POLICY IF EXISTS "Service role full access fine_tuning_jobs" ON public.fine_tuning_jobs;
  CREATE POLICY "Service role full access fine_tuning_jobs" ON public.fine_tuning_jobs
    FOR ALL USING (true) WITH CHECK (true);
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

CREATE INDEX IF NOT EXISTS idx_fine_tuning_jobs_user_id
  ON public.fine_tuning_jobs (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_fine_tuning_jobs_user_cluster
  ON public.fine_tuning_jobs (user_id, cluster_id);
CREATE INDEX IF NOT EXISTS idx_fine_tuning_jobs_status
  ON public.fine_tuning_jobs (status) WHERE status NOT IN ('completed', 'failed', 'cancelled');

DO $$ BEGIN
  CREATE TRIGGER update_fine_tuning_jobs_updated_at
    BEFORE UPDATE ON public.fine_tuning_jobs
    FOR EACH ROW
    EXECUTE FUNCTION public.update_updated_at_column();
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;


-- ============================================================================
-- 8. expert_models — Fine-tuned expert models per cluster
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.expert_models (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  cluster_id TEXT NOT NULL,
  fine_tuning_job_id UUID REFERENCES public.fine_tuning_jobs(id) ON DELETE SET NULL,

  -- Model identifiers
  model_id TEXT NOT NULL,        -- e.g. ft:gpt-4o-mini:...
  base_model TEXT,
  teacher_model TEXT,

  -- Quality gate
  is_active BOOLEAN NOT NULL DEFAULT false,
  quality_gate_passed BOOLEAN NOT NULL DEFAULT false,
  quality_score DECIMAL(5,4),
  last_quality_check TIMESTAMP WITH TIME ZONE,

  -- Usage stats
  request_count INTEGER DEFAULT 0,
  total_cost_saved DECIMAL(12,6) DEFAULT 0,

  -- Deactivation tracking
  deactivated_at TIMESTAMP WITH TIME ZONE,
  deactivation_reason TEXT,

  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.expert_models ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  DROP POLICY IF EXISTS "Users can view own expert_models" ON public.expert_models;
  CREATE POLICY "Users can view own expert_models" ON public.expert_models
    FOR SELECT USING (auth.uid() = user_id);
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

DO $$ BEGIN
  DROP POLICY IF EXISTS "Service role full access expert_models" ON public.expert_models;
  CREATE POLICY "Service role full access expert_models" ON public.expert_models
    FOR ALL USING (true) WITH CHECK (true);
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

CREATE INDEX IF NOT EXISTS idx_expert_models_user_id
  ON public.expert_models (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_expert_models_user_cluster_active
  ON public.expert_models (user_id, cluster_id, is_active) WHERE is_active = true;
CREATE INDEX IF NOT EXISTS idx_expert_models_cluster_id
  ON public.expert_models (cluster_id);

DO $$ BEGIN
  CREATE TRIGGER update_expert_models_updated_at
    BEFORE UPDATE ON public.expert_models
    FOR EACH ROW
    EXECUTE FUNCTION public.update_updated_at_column();
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;


-- ============================================================================
-- Reload PostgREST schema cache
-- ============================================================================
NOTIFY pgrst, 'reload schema';

-- ============================================================================
-- DONE. All 8 missing tables created with RLS, indexes, and triggers.
-- ============================================================================
