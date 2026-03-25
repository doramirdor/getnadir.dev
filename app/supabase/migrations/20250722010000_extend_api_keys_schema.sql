-- Extend api_keys table to support comprehensive configuration
-- This migration adds all the fields needed by ComprehensiveApiKeyDialog

-- Add new columns to api_keys table
ALTER TABLE public.api_keys ADD COLUMN IF NOT EXISTS slug TEXT;
ALTER TABLE public.api_keys ADD COLUMN IF NOT EXISTS description TEXT;
ALTER TABLE public.api_keys ADD COLUMN IF NOT EXISTS system_prompt TEXT;
ALTER TABLE public.api_keys ADD COLUMN IF NOT EXISTS selected_models TEXT[] DEFAULT '{}';

-- Routing Configuration
ALTER TABLE public.api_keys ADD COLUMN IF NOT EXISTS sort_strategy TEXT;
ALTER TABLE public.api_keys ADD COLUMN IF NOT EXISTS benchmark_model TEXT;
ALTER TABLE public.api_keys ADD COLUMN IF NOT EXISTS load_balancing_policy TEXT DEFAULT 'round-robin';

-- Nadir Configuration
ALTER TABLE public.api_keys ADD COLUMN IF NOT EXISTS use_fallback BOOLEAN DEFAULT true;
ALTER TABLE public.api_keys ADD COLUMN IF NOT EXISTS enable_caching BOOLEAN DEFAULT true;
ALTER TABLE public.api_keys ADD COLUMN IF NOT EXISTS enable_logging BOOLEAN DEFAULT true;
ALTER TABLE public.api_keys ADD COLUMN IF NOT EXISTS log_level TEXT DEFAULT 'info';

-- Model Parameters (stored as JSONB for flexibility)
ALTER TABLE public.api_keys ADD COLUMN IF NOT EXISTS model_parameters JSONB DEFAULT '{}';

-- Create unique constraint on slug for user
CREATE UNIQUE INDEX IF NOT EXISTS idx_api_keys_user_slug ON public.api_keys(user_id, slug) 
WHERE slug IS NOT NULL;

-- Create indexes for better query performance
CREATE INDEX IF NOT EXISTS idx_api_keys_sort_strategy ON public.api_keys(sort_strategy);
CREATE INDEX IF NOT EXISTS idx_api_keys_use_fallback ON public.api_keys(use_fallback);
CREATE INDEX IF NOT EXISTS idx_api_keys_selected_models ON public.api_keys USING gin(selected_models);

-- Update any existing records to have default values
UPDATE public.api_keys SET 
  use_fallback = true,
  enable_caching = true, 
  enable_logging = true,
  log_level = 'info',
  load_balancing_policy = 'round-robin',
  model_parameters = '{}'::jsonb
WHERE use_fallback IS NULL;