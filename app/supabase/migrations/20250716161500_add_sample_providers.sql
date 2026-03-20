-- Insert sample providers if they don't exist
INSERT INTO public.providers (name, provider_id, models, status, enabled, cost_this_month) VALUES
  ('OpenAI', 'openai', ARRAY['gpt-4o', 'gpt-4o-mini', 'gpt-3.5-turbo'], 'disconnected', false, 0.00),
  ('Anthropic', 'anthropic', ARRAY['claude-3-opus', 'claude-3-sonnet', 'claude-3-haiku'], 'disconnected', false, 0.00),
  ('Google', 'google', ARRAY['gemini-pro', 'gemini-pro-vision', 'gemini-1.5-pro'], 'disconnected', false, 0.00),
  ('Mistral AI', 'mistral', ARRAY['mistral-large', 'mistral-medium', 'mistral-small'], 'disconnected', false, 0.00)
ON CONFLICT (provider_id) DO NOTHING;

-- Add unique constraint to integrations name first
ALTER TABLE public.integrations ADD CONSTRAINT integrations_name_unique UNIQUE (name);

-- Insert sample integrations if they don't exist
INSERT INTO public.integrations (name, status, description, enabled) VALUES
  ('OpenRouter', 'inactive', 'Access multiple AI models through OpenRouter with automatic fallback', false),
  ('Langfuse', 'inactive', 'Track and monitor AI model performance and costs', false),
  ('Weights & Biases', 'inactive', 'Experiment tracking and model monitoring', false),
  ('Zapier', 'inactive', 'Automate workflows with thousands of applications', false)
ON CONFLICT (name) DO NOTHING;