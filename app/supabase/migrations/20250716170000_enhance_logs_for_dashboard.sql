-- Enhance logs table to support all dashboard metrics
ALTER TABLE public.logs ADD COLUMN IF NOT EXISTS complexity_score DECIMAL(3,2) DEFAULT 0.0;
ALTER TABLE public.logs ADD COLUMN IF NOT EXISTS selection_method TEXT DEFAULT 'user_preference';
ALTER TABLE public.logs ADD COLUMN IF NOT EXISTS benchmark_model TEXT;
ALTER TABLE public.logs ADD COLUMN IF NOT EXISTS cost_optimization_percent DECIMAL(5,2) DEFAULT 0.0;
ALTER TABLE public.logs ADD COLUMN IF NOT EXISTS estimated_cost DECIMAL(10,6) DEFAULT 0.0;

-- Add monthly usage aggregation table
CREATE TABLE IF NOT EXISTS public.monthly_usage (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  year INTEGER NOT NULL,
  month INTEGER NOT NULL,
  total_requests INTEGER DEFAULT 0,
  total_cost DECIMAL(10,6) DEFAULT 0.0,
  intelligent_routes INTEGER DEFAULT 0,
  avg_complexity_score DECIMAL(3,2) DEFAULT 0.0,
  avg_response_time_ms INTEGER DEFAULT 0,
  cost_optimization_saved DECIMAL(10,6) DEFAULT 0.0,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(user_id, year, month)
);

-- Add model performance tracking table
CREATE TABLE IF NOT EXISTS public.model_performance (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  model_name TEXT NOT NULL,
  provider TEXT NOT NULL,
  date DATE NOT NULL DEFAULT CURRENT_DATE,
  total_requests INTEGER DEFAULT 0,
  total_cost DECIMAL(10,6) DEFAULT 0.0,
  avg_response_time_ms INTEGER DEFAULT 0,
  p95_response_time_ms INTEGER DEFAULT 0,
  p99_response_time_ms INTEGER DEFAULT 0,
  auto_selected_count INTEGER DEFAULT 0,
  avg_complexity_score DECIMAL(3,2) DEFAULT 0.0,
  accuracy_score DECIMAL(5,2) DEFAULT 0.0,
  cost_optimization_percent DECIMAL(5,2) DEFAULT 0.0,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(model_name, provider, date)
);

-- Add system metrics table for dashboard aggregates
CREATE TABLE IF NOT EXISTS public.system_metrics (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  date DATE NOT NULL DEFAULT CURRENT_DATE,
  total_requests INTEGER DEFAULT 0,
  total_cost DECIMAL(10,6) DEFAULT 0.0,
  active_users INTEGER DEFAULT 0,
  intelligent_routes INTEGER DEFAULT 0,
  avg_response_time_ms INTEGER DEFAULT 0,
  cost_optimization_percent DECIMAL(5,2) DEFAULT 0.0,
  complexity_analysis_count INTEGER DEFAULT 0,
  model_accuracy_percent DECIMAL(5,2) DEFAULT 0.0,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(date)
);

-- Enable RLS on new tables
ALTER TABLE public.monthly_usage ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.model_performance ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.system_metrics ENABLE ROW LEVEL SECURITY;

-- RLS policies for new tables
CREATE POLICY "Users can view own monthly usage" ON public.monthly_usage
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Admins can view all monthly usage" ON public.monthly_usage
  FOR SELECT USING (public.is_admin());

CREATE POLICY "Authenticated users can view model performance" ON public.model_performance
  FOR SELECT USING (auth.role() = 'authenticated');

CREATE POLICY "Authenticated users can view system metrics" ON public.system_metrics
  FOR SELECT USING (auth.role() = 'authenticated');

-- Add updated_at triggers
CREATE TRIGGER update_monthly_usage_updated_at
  BEFORE UPDATE ON public.monthly_usage
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_model_performance_updated_at
  BEFORE UPDATE ON public.model_performance
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_system_metrics_updated_at
  BEFORE UPDATE ON public.system_metrics
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- Update profiles table to include user preferences
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS benchmark_model TEXT DEFAULT 'gpt-4';
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS allowed_providers TEXT[] DEFAULT ARRAY['openai', 'anthropic', 'google'];
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS allowed_models TEXT[] DEFAULT ARRAY['gpt-4', 'claude-3-opus', 'gemini-pro'];
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS monthly_budget DECIMAL(10,2) DEFAULT 100.00;