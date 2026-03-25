-- Seed usage events data for testing analytics
-- This creates realistic usage patterns for the past 30 days

-- Function to generate sample usage events
CREATE OR REPLACE FUNCTION generate_sample_usage_events()
RETURNS void AS $$
DECLARE
  user_record RECORD;
  api_key_record RECORD;
  preset_record RECORD;
  days_back INTEGER;
  events_per_day INTEGER;
  i INTEGER;
  event_data RECORD;
BEGIN
  -- Get the first user (in production, you'd run this for specific users)
  SELECT id INTO user_record FROM auth.users LIMIT 1;
  
  IF user_record.id IS NULL THEN
    RAISE NOTICE 'No users found. Please ensure you have authenticated users first.';
    RETURN;
  END IF;

  -- Get sample API keys and presets
  SELECT id INTO api_key_record FROM api_keys WHERE user_id = user_record.id LIMIT 1;
  SELECT id INTO preset_record FROM presets WHERE user_id = user_record.id LIMIT 1;

  -- Generate events for the past 30 days
  FOR days_back IN 0..29 LOOP
    -- Vary events per day (more on weekdays, less on weekends)
    events_per_day := CASE 
      WHEN EXTRACT(DOW FROM (CURRENT_DATE - days_back)) IN (0, 6) THEN 20 + (RANDOM() * 30)::INTEGER
      ELSE 50 + (RANDOM() * 100)::INTEGER
    END;

    -- Generate events for this day
    FOR i IN 1..events_per_day LOOP
      -- Create varied event data
      SELECT 
        (ARRAY['api_call', 'model_usage', 'cluster_lookup', 'smart_route'])[1 + (RANDOM() * 3)::INTEGER] as event_type,
        (ARRAY['completion', 'chat', 'embedding'])[1 + (RANDOM() * 2)::INTEGER] as event_subtype,
        '/v1/' || (ARRAY['chat/completions', 'completions', 'embeddings'])[1 + (RANDOM() * 2)::INTEGER] as endpoint,
        (ARRAY['gpt-4o', 'gpt-4o-mini', 'claude-3-5-sonnet-20241022', 'o1', 'deepseek-r1'])[1 + (RANDOM() * 4)::INTEGER] as model_name,
        (ARRAY['openai', 'anthropic', 'deepseek'])[1 + (RANDOM() * 2)::INTEGER] as provider_name,
        (CASE WHEN RANDOM() < 0.3 THEN (ARRAY['Landing_Page_Marketing', 'Portfolio_Personal_Showcase', 'Blog_Content_Platform'])[1 + (RANDOM() * 2)::INTEGER] ELSE NULL END) as cluster_name,
        (50 + (RANDOM() * 2000)::INTEGER) as response_time_ms,
        (100 + (RANDOM() * 3000)::INTEGER) as input_tokens,
        (50 + (RANDOM() * 2000)::INTEGER) as output_tokens,
        (CASE WHEN RANDOM() < 0.95 THEN 200 ELSE (ARRAY[400, 429, 500, 503])[1 + (RANDOM() * 3)::INTEGER] END) as status_code,
        (CASE WHEN RANDOM() < 0.1 THEN (ARRAY['rate_limit', 'timeout', 'model_error', 'authentication'])[1 + (RANDOM() * 3)::INTEGER] ELSE NULL END) as error_type,
        (CASE WHEN RANDOM() < 0.2 THEN (ARRAY['campaign_001', 'promo_spring', 'beta_test'])[1 + (RANDOM() * 2)::INTEGER] ELSE NULL END) as campaign_tag,
        (10 + (RANDOM() * 5000)::INTEGER) as prompt_length,
        (0.1 + (RANDOM() * 0.9))::DECIMAL(3,2) as complexity_score,
        (ARRAY['coding', 'creative', 'analytical', 'conversational'])[1 + (RANDOM() * 3)::INTEGER] as task_category
      INTO event_data;

      -- Calculate costs based on model
      DECLARE
        input_cost_rate DECIMAL(10,8);
        output_cost_rate DECIMAL(10,8);
      BEGIN
        CASE event_data.model_name
          WHEN 'gpt-4o' THEN 
            input_cost_rate := 0.000005;
            output_cost_rate := 0.000015;
          WHEN 'gpt-4o-mini' THEN
            input_cost_rate := 0.00000015;
            output_cost_rate := 0.0000006;
          WHEN 'o1' THEN
            input_cost_rate := 0.000015;
            output_cost_rate := 0.00006;
          WHEN 'claude-3-5-sonnet-20241022' THEN
            input_cost_rate := 0.000003;
            output_cost_rate := 0.000015;
          WHEN 'deepseek-r1' THEN
            input_cost_rate := 0.0000014;
            output_cost_rate := 0.0000028;
          ELSE
            input_cost_rate := 0.000001;
            output_cost_rate := 0.000002;
        END CASE;

        -- Insert the usage event
        INSERT INTO usage_events (
          user_id, api_key_id, preset_id,
          event_type, event_subtype, request_id, endpoint, method,
          model_name, provider_name, cluster_name,
          response_time_ms, input_tokens, output_tokens,
          input_cost, output_cost,
          status_code, error_type,
          campaign_tag, prompt_length, complexity_score, task_category,
          created_at
        ) VALUES (
          user_record.id,
          CASE WHEN RANDOM() < 0.6 THEN api_key_record.id ELSE NULL END,
          CASE WHEN RANDOM() < 0.4 THEN preset_record.id ELSE NULL END,
          event_data.event_type,
          event_data.event_subtype,
          'req_' || generate_random_string(16),
          event_data.endpoint,
          'POST',
          event_data.model_name,
          event_data.provider_name,
          event_data.cluster_name,
          event_data.response_time_ms,
          event_data.input_tokens,
          event_data.output_tokens,
          (event_data.input_tokens * input_cost_rate),
          (event_data.output_tokens * output_cost_rate),
          event_data.status_code,
          CASE WHEN event_data.status_code >= 400 THEN event_data.error_type ELSE NULL END,
          event_data.campaign_tag,
          event_data.prompt_length,
          event_data.complexity_score,
          event_data.task_category,
          (CURRENT_DATE - days_back + (RANDOM() * INTERVAL '1 day'))::TIMESTAMP WITH TIME ZONE
        );
      END;

    END LOOP;

    RAISE NOTICE 'Generated % events for % days ago', events_per_day, days_back;
  END LOOP;

  -- Generate daily aggregations
  FOR days_back IN 0..29 LOOP
    PERFORM aggregate_daily_stats(CURRENT_DATE - days_back);
  END LOOP;

  -- Generate some cost optimization suggestions
  INSERT INTO cost_optimization_suggestions (
    user_id, suggestion_type, priority, title, description, potential_savings, confidence_score,
    current_usage, recommended_changes
  ) VALUES 
  (
    user_record.id,
    'model_alternative',
    'high',
    'Switch to GPT-4o Mini for Simple Tasks',
    'Analysis shows 40% of your requests are simple tasks that could use GPT-4o Mini instead of GPT-4o, saving ~$50/month.',
    50.00,
    0.85,
    '{"current_model": "gpt-4o", "usage_percentage": 40, "task_complexity": "low"}',
    '{"recommended_model": "gpt-4o-mini", "expected_savings": "$50", "quality_impact": "minimal"}'
  ),
  (
    user_record.id,
    'caching_opportunity',
    'medium',
    'Enable Response Caching',
    'Detected 25% duplicate requests. Implementing caching could reduce costs by ~$30/month.',
    30.00,
    0.72,
    '{"duplicate_requests": 25, "cache_hit_potential": "high"}',
    '{"cache_strategy": "semantic", "ttl": "1h", "expected_hit_rate": "60%"}'
  ),
  (
    user_record.id,
    'routing_optimization',
    'medium',
    'Optimize Load Balancing',
    'Current load balancing is not cost-optimal. Routing more traffic to cheaper models could save ~$25/month.',
    25.00,
    0.68,
    '{"current_distribution": {"gpt-4o": 60, "gpt-4o-mini": 40}}',
    '{"recommended_distribution": {"gpt-4o": 40, "gpt-4o-mini": 60}}'
  );

  RAISE NOTICE 'Sample usage events generated successfully!';
END;
$$ LANGUAGE plpgsql;

-- Helper function to generate random strings
CREATE OR REPLACE FUNCTION generate_random_string(length INTEGER)
RETURNS TEXT AS $$
DECLARE
  chars TEXT := 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  result TEXT := '';
  i INTEGER;
BEGIN
  FOR i IN 1..length LOOP
    result := result || substr(chars, floor(random() * length(chars) + 1)::INTEGER, 1);
  END LOOP;
  RETURN result;
END;
$$ LANGUAGE plpgsql;

-- Run the function to generate sample data
-- SELECT generate_sample_usage_events();