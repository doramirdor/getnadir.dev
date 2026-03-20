-- Create usage events system for analytics and logging
-- This system tracks API usage, performance metrics, and generates analytics data

-- Table to store usage events (API calls, model usage, etc.)
CREATE TABLE IF NOT EXISTS public.usage_events (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  api_key_id UUID REFERENCES public.api_keys(id) ON DELETE SET NULL,
  preset_id UUID REFERENCES public.presets(id) ON DELETE SET NULL,
  
  -- Event details
  event_type TEXT NOT NULL CHECK (event_type IN ('api_call', 'model_usage', 'cluster_lookup', 'fallback_triggered', 'load_balance', 'smart_route')),
  event_subtype TEXT, -- e.g., 'completion', 'chat', 'embedding'
  
  -- Request details
  request_id TEXT,
  endpoint TEXT NOT NULL,
  method TEXT NOT NULL DEFAULT 'POST',
  
  -- Model information
  model_name TEXT,
  provider_name TEXT,
  cluster_name TEXT, -- If routed through clustering
  
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
  error_type TEXT, -- e.g., 'rate_limit', 'authentication', 'model_error'
  
  -- Request metadata
  user_agent TEXT,
  ip_address INET,
  country_code TEXT,
  
  -- Campaign and funnel tracking
  campaign_tag TEXT,
  funnel_stage TEXT,
  
  -- Complexity analysis
  prompt_length INTEGER,
  complexity_score DECIMAL(3,2), -- 0.0 to 1.0 scale
  task_category TEXT, -- e.g., 'coding', 'creative', 'analytical', 'conversational'
  
  -- Additional metadata
  metadata JSONB DEFAULT '{}'::jsonb,
  
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Table for aggregated usage statistics (for faster analytics queries)
CREATE TABLE IF NOT EXISTS public.usage_stats_daily (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  api_key_id UUID REFERENCES public.api_keys(id) ON DELETE SET NULL,
  preset_id UUID REFERENCES public.presets(id) ON DELETE SET NULL,
  
  -- Date for aggregation
  date DATE NOT NULL,
  
  -- Volume metrics
  total_requests INTEGER NOT NULL DEFAULT 0,
  successful_requests INTEGER NOT NULL DEFAULT 0,
  failed_requests INTEGER NOT NULL DEFAULT 0,
  
  -- Token usage
  total_input_tokens BIGINT NOT NULL DEFAULT 0,
  total_output_tokens BIGINT NOT NULL DEFAULT 0,
  total_tokens BIGINT GENERATED ALWAYS AS (total_input_tokens + total_output_tokens) STORED,
  
  -- Cost metrics
  total_cost DECIMAL(10,6) NOT NULL DEFAULT 0,
  avg_cost_per_request DECIMAL(10,8) GENERATED ALWAYS AS (
    CASE 
      WHEN total_requests > 0 THEN total_cost / total_requests 
      ELSE 0 
    END
  ) STORED,
  
  -- Performance metrics
  avg_response_time_ms DECIMAL(8,2),
  p95_response_time_ms INTEGER,
  p99_response_time_ms INTEGER,
  
  -- Model usage breakdown
  model_usage JSONB DEFAULT '{}'::jsonb, -- { "gpt-4o": 150, "claude-3-5-sonnet": 75 }
  provider_usage JSONB DEFAULT '{}'::jsonb, -- { "openai": 150, "anthropic": 75 }
  
  -- Error breakdown
  error_breakdown JSONB DEFAULT '{}'::jsonb, -- { "rate_limit": 5, "timeout": 2 }
  
  -- Complexity insights
  avg_complexity_score DECIMAL(3,2),
  task_category_breakdown JSONB DEFAULT '{}'::jsonb,
  
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  
  UNIQUE(user_id, api_key_id, preset_id, date)
);

-- Table for cost optimization suggestions
CREATE TABLE IF NOT EXISTS public.cost_optimization_suggestions (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  
  suggestion_type TEXT NOT NULL CHECK (suggestion_type IN ('model_alternative', 'routing_optimization', 'caching_opportunity', 'batch_optimization')),
  priority TEXT NOT NULL CHECK (priority IN ('low', 'medium', 'high', 'critical')),
  
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  potential_savings DECIMAL(10,6), -- Estimated monthly savings
  confidence_score DECIMAL(3,2), -- 0.0 to 1.0
  
  -- Supporting data
  current_usage JSONB DEFAULT '{}'::jsonb,
  recommended_changes JSONB DEFAULT '{}'::jsonb,
  
  -- Status tracking
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'dismissed', 'implemented')),
  implemented_at TIMESTAMP WITH TIME ZONE,
  
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS on all tables
ALTER TABLE public.usage_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.usage_stats_daily ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cost_optimization_suggestions ENABLE ROW LEVEL SECURITY;

-- RLS Policies for usage_events
CREATE POLICY "Users can view own usage events" ON public.usage_events
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "System can insert usage events" ON public.usage_events
  FOR INSERT WITH CHECK (true); -- Allow system to insert events

-- RLS Policies for usage_stats_daily
CREATE POLICY "Users can manage own usage stats" ON public.usage_stats_daily
  FOR ALL USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- RLS Policies for cost_optimization_suggestions
CREATE POLICY "Users can manage own optimization suggestions" ON public.cost_optimization_suggestions
  FOR ALL USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_usage_events_user_id_created_at 
ON public.usage_events (user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_usage_events_api_key_id_created_at 
ON public.usage_events (api_key_id, created_at DESC) 
WHERE api_key_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_usage_events_preset_id_created_at 
ON public.usage_events (preset_id, created_at DESC) 
WHERE preset_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_usage_events_event_type_created_at 
ON public.usage_events (event_type, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_usage_events_status_success 
ON public.usage_events (user_id, success, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_usage_events_model_provider 
ON public.usage_events (user_id, model_name, provider_name, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_usage_events_campaign_tag 
ON public.usage_events (user_id, campaign_tag, created_at DESC) 
WHERE campaign_tag IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_usage_events_complexity 
ON public.usage_events (user_id, task_category, complexity_score, created_at DESC) 
WHERE complexity_score IS NOT NULL;

-- Indexes for usage_stats_daily
CREATE INDEX IF NOT EXISTS idx_usage_stats_daily_user_date 
ON public.usage_stats_daily (user_id, date DESC);

CREATE INDEX IF NOT EXISTS idx_usage_stats_daily_api_key_date 
ON public.usage_stats_daily (api_key_id, date DESC) 
WHERE api_key_id IS NOT NULL;

-- JSON indexes for better performance on metadata queries
CREATE INDEX IF NOT EXISTS idx_usage_events_metadata 
ON public.usage_events USING GIN (metadata);

CREATE INDEX IF NOT EXISTS idx_usage_stats_model_usage 
ON public.usage_stats_daily USING GIN (model_usage);

CREATE INDEX IF NOT EXISTS idx_usage_stats_error_breakdown 
ON public.usage_stats_daily USING GIN (error_breakdown);

-- Create updated_at trigger
CREATE TRIGGER update_usage_stats_daily_updated_at
  BEFORE UPDATE ON public.usage_stats_daily
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_cost_optimization_suggestions_updated_at
  BEFORE UPDATE ON public.cost_optimization_suggestions
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- Function to aggregate daily usage stats
CREATE OR REPLACE FUNCTION public.aggregate_daily_stats(target_date DATE DEFAULT CURRENT_DATE)
RETURNS void AS $$
BEGIN
  INSERT INTO public.usage_stats_daily (
    user_id, api_key_id, preset_id, date,
    total_requests, successful_requests, failed_requests,
    total_input_tokens, total_output_tokens, total_cost,
    avg_response_time_ms, p95_response_time_ms, p99_response_time_ms,
    model_usage, provider_usage, error_breakdown,
    avg_complexity_score, task_category_breakdown
  )
  SELECT 
    user_id,
    api_key_id,
    preset_id,
    target_date,
    COUNT(*) as total_requests,
    COUNT(*) FILTER (WHERE success = true) as successful_requests,
    COUNT(*) FILTER (WHERE success = false) as failed_requests,
    COALESCE(SUM(input_tokens), 0) as total_input_tokens,
    COALESCE(SUM(output_tokens), 0) as total_output_tokens,
    COALESCE(SUM(total_cost), 0) as total_cost,
    AVG(response_time_ms) as avg_response_time_ms,
    PERCENTILE_CONT(0.95) WITHIN GROUP (ORDER BY response_time_ms) as p95_response_time_ms,
    PERCENTILE_CONT(0.99) WITHIN GROUP (ORDER BY response_time_ms) as p99_response_time_ms,
    json_object_agg(model_name, model_count) FILTER (WHERE model_name IS NOT NULL) as model_usage,
    json_object_agg(provider_name, provider_count) FILTER (WHERE provider_name IS NOT NULL) as provider_usage,
    json_object_agg(error_type, error_count) FILTER (WHERE error_type IS NOT NULL) as error_breakdown,
    AVG(complexity_score) FILTER (WHERE complexity_score IS NOT NULL) as avg_complexity_score,
    json_object_agg(task_category, task_count) FILTER (WHERE task_category IS NOT NULL) as task_category_breakdown
  FROM (
    SELECT 
      user_id, api_key_id, preset_id, success, input_tokens, output_tokens, 
      total_cost, response_time_ms, complexity_score, error_type,
      model_name, COUNT(*) as model_count,
      provider_name, COUNT(*) as provider_count,
      task_category, COUNT(*) as task_count,
      error_type, COUNT(*) as error_count
    FROM public.usage_events 
    WHERE DATE(created_at) = target_date
    GROUP BY user_id, api_key_id, preset_id, success, input_tokens, output_tokens, 
             total_cost, response_time_ms, complexity_score, error_type,
             model_name, provider_name, task_category
  ) aggregated
  GROUP BY user_id, api_key_id, preset_id
  ON CONFLICT (user_id, api_key_id, preset_id, date) 
  DO UPDATE SET
    total_requests = EXCLUDED.total_requests,
    successful_requests = EXCLUDED.successful_requests,
    failed_requests = EXCLUDED.failed_requests,
    total_input_tokens = EXCLUDED.total_input_tokens,
    total_output_tokens = EXCLUDED.total_output_tokens,
    total_cost = EXCLUDED.total_cost,
    avg_response_time_ms = EXCLUDED.avg_response_time_ms,
    p95_response_time_ms = EXCLUDED.p95_response_time_ms,
    p99_response_time_ms = EXCLUDED.p99_response_time_ms,
    model_usage = EXCLUDED.model_usage,
    provider_usage = EXCLUDED.provider_usage,
    error_breakdown = EXCLUDED.error_breakdown,
    avg_complexity_score = EXCLUDED.avg_complexity_score,
    task_category_breakdown = EXCLUDED.task_category_breakdown,
    updated_at = now();
    
END;
$$ LANGUAGE plpgsql;

-- Add comments for documentation
COMMENT ON TABLE public.usage_events IS 'Individual API usage events for detailed analytics and logging';
COMMENT ON TABLE public.usage_stats_daily IS 'Daily aggregated usage statistics for faster analytics queries';
COMMENT ON TABLE public.cost_optimization_suggestions IS 'AI-generated cost optimization recommendations';

COMMENT ON COLUMN public.usage_events.complexity_score IS 'Calculated complexity score (0.0-1.0) based on prompt analysis';
COMMENT ON COLUMN public.usage_events.task_category IS 'Categorized task type: coding, creative, analytical, conversational';
COMMENT ON COLUMN public.usage_events.campaign_tag IS 'Campaign identifier for funnel analytics';
COMMENT ON FUNCTION public.aggregate_daily_stats IS 'Aggregates raw usage events into daily statistics for analytics';