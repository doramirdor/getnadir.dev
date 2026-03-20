-- Insert sample system metrics for the last 6 months
INSERT INTO public.system_metrics (date, total_requests, total_cost, active_users, intelligent_routes, avg_response_time_ms, cost_optimization_percent, complexity_analysis_count, model_accuracy_percent) VALUES
  ('2025-01-01', 4000, 240.50, 12, 3480, 1200, 15.30, 3680, 94.20),
  ('2025-02-01', 3000, 198.30, 11, 2610, 1150, 18.70, 2760, 95.10),
  ('2025-03-01', 5000, 360.75, 15, 4350, 1300, 22.10, 4600, 93.80),
  ('2025-04-01', 4500, 290.20, 14, 3915, 1180, 25.40, 4140, 94.70),
  ('2025-05-01', 6000, 410.60, 18, 5220, 1100, 28.20, 5520, 95.30),
  ('2025-06-01', 5500, 380.45, 16, 4785, 1050, 31.50, 5060, 96.10),
  ('2025-07-01', 6200, 365.80, 19, 5394, 1020, 34.80, 5704, 96.80);

-- Insert sample model performance data
INSERT INTO public.model_performance (model_name, provider, date, total_requests, total_cost, avg_response_time_ms, p95_response_time_ms, p99_response_time_ms, auto_selected_count, avg_complexity_score, accuracy_score, cost_optimization_percent) VALUES
  ('gpt-4', 'openai', '2025-07-01', 1247, 1247.50, 1250, 2100, 3500, 975, 0.72, 96.20, 15.30),
  ('claude-3-opus', 'anthropic', '2025-07-01', 892, 892.30, 1100, 2000, 3200, 580, 0.85, 94.80, 22.10),
  ('gpt-3.5-turbo', 'openai', '2025-07-01', 678, 203.40, 800, 1400, 2200, 603, 0.35, 91.50, 45.20),
  ('claude-3-sonnet', 'anthropic', '2025-07-01', 421, 315.75, 950, 1700, 2800, 307, 0.58, 93.40, 28.70),
  ('gemini-pro', 'google', '2025-07-01', 285, 142.50, 1150, 1900, 3100, 234, 0.42, 89.30, 35.80);

-- Insert sample monthly usage data for different users
INSERT INTO public.monthly_usage (user_id, year, month, total_requests, total_cost, intelligent_routes, avg_complexity_score, avg_response_time_ms, cost_optimization_saved)
SELECT 
  id as user_id,
  2025 as year,
  7 as month,
  (requests_this_month + COALESCE(FLOOR(RANDOM() * 100), 0)) as total_requests,
  (cost_this_month + COALESCE(RANDOM() * 50, 0)) as total_cost,
  FLOOR((requests_this_month + COALESCE(FLOOR(RANDOM() * 100), 0)) * 0.87) as intelligent_routes,
  (0.3 + RANDOM() * 0.7) as avg_complexity_score,
  (800 + FLOOR(RANDOM() * 600)) as avg_response_time_ms,
  (cost_this_month * 0.15 + RANDOM() * cost_this_month * 0.1) as cost_optimization_saved
FROM public.profiles 
WHERE requests_this_month > 0;

-- Update profiles with user preferences
UPDATE public.profiles SET
  benchmark_model = CASE 
    WHEN RANDOM() < 0.4 THEN 'gpt-4'
    WHEN RANDOM() < 0.7 THEN 'claude-3-opus'
    ELSE 'gemini-pro'
  END,
  allowed_providers = CASE 
    WHEN RANDOM() < 0.3 THEN ARRAY['openai']
    WHEN RANDOM() < 0.6 THEN ARRAY['openai', 'anthropic']
    ELSE ARRAY['openai', 'anthropic', 'google']
  END,
  allowed_models = CASE 
    WHEN RANDOM() < 0.3 THEN ARRAY['gpt-4', 'gpt-3.5-turbo']
    WHEN RANDOM() < 0.6 THEN ARRAY['gpt-4', 'claude-3-opus', 'claude-3-sonnet']
    ELSE ARRAY['gpt-4', 'claude-3-opus', 'gemini-pro', 'gpt-3.5-turbo']
  END,
  monthly_budget = (50 + FLOOR(RANDOM() * 450));

-- Update existing logs with enhanced data
UPDATE public.logs SET
  complexity_score = (0.1 + RANDOM() * 0.9),
  selection_method = CASE 
    WHEN RANDOM() < 0.7 THEN 'complexity_based'
    ELSE 'user_preference'
  END,
  benchmark_model = CASE 
    WHEN RANDOM() < 0.4 THEN 'gpt-4'
    WHEN RANDOM() < 0.7 THEN 'claude-3-opus'
    ELSE 'gemini-pro'
  END,
  cost_optimization_percent = (5 + RANDOM() * 45),
  estimated_cost = cost * (0.85 + RANDOM() * 0.25);

-- Insert additional sample logs for better dashboard data
INSERT INTO public.logs (request_id, prompt, model, provider, cost, status, response_time_ms, complexity_score, selection_method, benchmark_model, cost_optimization_percent, estimated_cost) VALUES
  ('req_d001', 'Analyze market trends for renewable energy sector', 'gpt-4', 'openai', 0.024, 'completed', 1200, 0.75, 'complexity_based', 'gpt-4', 15.3, 0.028),
  ('req_d002', 'Generate Python code for data visualization', 'claude-3-opus', 'anthropic', 0.018, 'completed', 800, 0.45, 'complexity_based', 'gpt-4', 22.1, 0.023),
  ('req_d003', 'Summarize research paper on quantum computing', 'gpt-3.5-turbo', 'openai', 0.008, 'completed', 600, 0.35, 'complexity_based', 'gpt-4', 45.2, 0.015),
  ('req_d004', 'Create marketing copy for new product launch', 'claude-3-sonnet', 'anthropic', 0.012, 'completed', 900, 0.58, 'complexity_based', 'gpt-4', 28.7, 0.017),
  ('req_d005', 'Explain complex mathematical concepts', 'gemini-pro', 'google', 0.010, 'completed', 1100, 0.42, 'complexity_based', 'gpt-4', 35.8, 0.016),
  ('req_d006', 'Write a simple email response', 'gpt-3.5-turbo', 'openai', 0.003, 'completed', 500, 0.15, 'complexity_based', 'gpt-4', 48.5, 0.006),
  ('req_d007', 'Analyze financial data and provide insights', 'claude-3-opus', 'anthropic', 0.032, 'completed', 1500, 0.88, 'complexity_based', 'gpt-4', 18.2, 0.039),
  ('req_d008', 'Generate creative story outline', 'gpt-4', 'openai', 0.019, 'completed', 1000, 0.62, 'user_preference', 'gpt-4', 0.0, 0.019);