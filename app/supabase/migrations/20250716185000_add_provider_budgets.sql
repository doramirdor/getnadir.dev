-- Add provider_budgets field to profiles table for per-provider budget limits

-- Add the provider_budgets column to store budget limits for each provider
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS provider_budgets JSONB DEFAULT '{}'::jsonb;

-- Update the column comment to explain the structure
COMMENT ON COLUMN public.profiles.provider_budgets IS 'JSON object storing budget limits for each provider (e.g., {"openai": 100, "anthropic": 50})';

-- Add index for better performance when querying provider budgets
CREATE INDEX IF NOT EXISTS idx_profiles_provider_budgets ON public.profiles USING gin (provider_budgets);

-- Set default provider budgets for existing users
UPDATE public.profiles 
SET provider_budgets = '{
  "openai": 50,
  "anthropic": 50,
  "google": 50,
  "bedrock": 50
}'::jsonb
WHERE provider_budgets IS NULL OR provider_budgets = '{}'::jsonb;

-- Add constraint to ensure provider_budgets is valid JSON
ALTER TABLE public.profiles ADD CONSTRAINT valid_provider_budgets 
CHECK (provider_budgets IS NULL OR jsonb_typeof(provider_budgets) = 'object');