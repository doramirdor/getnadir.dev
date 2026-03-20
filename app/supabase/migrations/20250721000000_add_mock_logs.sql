-- Insert mock log entries for testing the system logs functionality
-- This will help demonstrate the logs page with sample data

INSERT INTO public.logs (
  model,
  prompt,
  provider,
  request_id,
  status,
  response_time_ms,
  cost,
  user_id,
  created_at
) VALUES
  -- OpenAI successful requests
  (
    'gpt-4o',
    'Write a comprehensive analysis of renewable energy trends in 2024, including solar, wind, and hydroelectric power developments worldwide.',
    'OpenAI',
    'req_openai_001_' || substr(md5(random()::text), 1, 12),
    '200',
    1240,
    0.0048,
    auth.uid(),
    now() - interval '5 minutes'
  ),
  (
    'gpt-4o-mini',
    'Create a Python function that calculates the Fibonacci sequence using dynamic programming.',
    'OpenAI', 
    'req_openai_002_' || substr(md5(random()::text), 1, 12),
    '200',
    890,
    0.0021,
    auth.uid(),
    now() - interval '10 minutes'
  ),
  (
    'gpt-3.5-turbo',
    'Explain the concept of machine learning to a 10-year-old child.',
    'OpenAI',
    'req_openai_003_' || substr(md5(random()::text), 1, 12),
    '200',
    520,
    0.0008,
    auth.uid(),
    now() - interval '15 minutes'
  ),
  
  -- Anthropic successful requests
  (
    'claude-3-opus',
    'Analyze the philosophical implications of artificial intelligence on human consciousness and free will.',
    'Anthropic',
    'req_anthropic_001_' || substr(md5(random()::text), 1, 12),
    '200',
    2340,
    0.0089,
    auth.uid(),
    now() - interval '20 minutes'
  ),
  (
    'claude-3-sonnet',
    'Write a detailed business plan for a sustainable coffee shop startup.',
    'Anthropic',
    'req_anthropic_002_' || substr(md5(random()::text), 1, 12),
    '200',
    1680,
    0.0034,
    auth.uid(),
    now() - interval '25 minutes'
  ),
  
  -- Google successful requests
  (
    'gemini-pro',
    'Generate a creative story about a time-traveling detective solving historical mysteries.',
    'Google',
    'req_google_001_' || substr(md5(random()::text), 1, 12),
    '200',
    1950,
    0.0028,
    auth.uid(),
    now() - interval '30 minutes'
  ),
  (
    'gemini-1.5-pro',
    'Provide a comprehensive review of the latest developments in quantum computing.',
    'Google',
    'req_google_002_' || substr(md5(random()::text), 1, 12),
    '200',
    2100,
    0.0045,
    auth.uid(),
    now() - interval '35 minutes'
  ),
  
  -- Error responses (4xx client errors)
  (
    'gpt-4o',
    'This is a test prompt that exceeds the maximum token limit and should trigger a 400 error response.',
    'OpenAI',
    'req_openai_err_001_' || substr(md5(random()::text), 1, 12),
    '400',
    320,
    0.0000,
    auth.uid(),
    now() - interval '40 minutes'
  ),
  (
    'claude-3-opus',
    'Request with invalid API key format',
    'Anthropic',
    'req_anthropic_err_001_' || substr(md5(random()::text), 1, 12),
    '401',
    180,
    0.0000,
    auth.uid(),
    now() - interval '45 minutes'
  ),
  (
    'gpt-3.5-turbo',
    'Rate limited request due to exceeding quota',
    'OpenAI',
    'req_openai_err_002_' || substr(md5(random()::text), 1, 12),
    '429',
    150,
    0.0000,
    auth.uid(),
    now() - interval '50 minutes'
  ),
  
  -- Server errors (5xx)
  (
    'gemini-pro',
    'Request that triggered an internal server error during processing',
    'Google',
    'req_google_err_001_' || substr(md5(random()::text), 1, 12),
    '500',
    5240,
    0.0000,
    auth.uid(),
    now() - interval '55 minutes'
  ),
  (
    'claude-3-sonnet',
    'Service temporarily unavailable during maintenance window',
    'Anthropic',
    'req_anthropic_err_002_' || substr(md5(random()::text), 1, 12),
    '503',
    120,
    0.0000,
    auth.uid(),
    now() - interval '60 minutes'
  ),
  
  -- Recent high-cost requests for testing
  (
    'gpt-4o',
    'Generate a comprehensive 50-page technical documentation for a complex API with detailed examples, use cases, authentication methods, and troubleshooting guides.',
    'OpenAI',
    'req_openai_large_001_' || substr(md5(random()::text), 1, 12),
    '200',
    45600,
    0.2340,
    auth.uid(),
    now() - interval '2 hours'
  ),
  (
    'claude-3-opus',
    'Perform an in-depth analysis of a 100-page research paper on climate change, including data visualization recommendations and policy implications.',
    'Anthropic',
    'req_anthropic_large_001_' || substr(md5(random()::text), 1, 12),
    '200',
    38900,
    0.1892,
    auth.uid(),
    now() - interval '3 hours'
  ),
  
  -- Various request patterns for different time periods
  (
    'gemini-1.5-pro',
    'Translate a technical manual from English to Spanish, French, and German.',
    'Google',
    'req_google_003_' || substr(md5(random()::text), 1, 12),
    '200',
    12400,
    0.0567,
    auth.uid(),
    now() - interval '4 hours'
  ),
  (
    'gpt-4o-mini',
    'Debug this Python code and provide optimization suggestions.',
    'OpenAI',
    'req_openai_004_' || substr(md5(random()::text), 1, 12),
    '200',
    1120,
    0.0032,
    auth.uid(),
    now() - interval '6 hours'
  ),
  (
    'claude-3-sonnet',
    'Create unit tests for a React component with comprehensive edge cases.',
    'Anthropic',
    'req_anthropic_003_' || substr(md5(random()::text), 1, 12),
    '200',
    2890,
    0.0078,
    auth.uid(),
    now() - interval '8 hours'
  ),
  (
    'gemini-pro',
    'Summarize the key findings from quarterly financial reports.',
    'Google',
    'req_google_004_' || substr(md5(random()::text), 1, 12),
    '200',
    1450,
    0.0041,
    auth.uid(),
    now() - interval '12 hours'
  ),
  (
    'gpt-3.5-turbo',
    'Generate social media content for a product launch campaign.',
    'OpenAI',
    'req_openai_005_' || substr(md5(random()::text), 1, 12),
    '200',
    780,
    0.0019,
    auth.uid(),
    now() - interval '1 day'
  ),
  (
    'claude-3-haiku',
    'Quick fact-check for news article claims about recent scientific discoveries.',
    'Anthropic',
    'req_anthropic_004_' || substr(md5(random()::text), 1, 12),
    '200',
    560,
    0.0012,
    auth.uid(),
    now() - interval '2 days'
  );

-- Note: This migration uses auth.uid() to associate logs with the currently authenticated user
-- If run without authentication context, these entries will have null user_id
-- For testing purposes, you may want to replace auth.uid() with specific user UUIDs

-- To verify the data was inserted correctly, you can run:
-- SELECT COUNT(*) FROM public.logs WHERE created_at > now() - interval '3 days';