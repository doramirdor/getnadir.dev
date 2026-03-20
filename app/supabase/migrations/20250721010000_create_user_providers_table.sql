-- Create user_providers table for user-specific provider configurations
-- This separates system providers from user configurations and enables BYOK vs system key options

-- Drop the existing user_provider_keys table if it exists (we'll replace it with better structure)
DROP TABLE IF EXISTS public.user_provider_keys;

-- Create the new user_providers table
CREATE TABLE public.user_providers (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  provider_id UUID NOT NULL REFERENCES public.providers(id) ON DELETE CASCADE,
  enabled BOOLEAN NOT NULL DEFAULT false,
  use_byok BOOLEAN NOT NULL DEFAULT false, -- Bring Your Own Key vs system keys
  api_key_hash TEXT, -- User's API key (encrypted/hashed) - only used when use_byok = true
  allowed_models TEXT[] NOT NULL DEFAULT '{}', -- User's selected models from this provider
  budget_limit DECIMAL(10,2) DEFAULT 50.00, -- Per-provider budget limit
  cost_this_month DECIMAL(10,2) DEFAULT 0.00, -- Current month spend for this provider
  requests_this_month INTEGER DEFAULT 0, -- Request count this month
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  
  -- Ensure one record per user-provider combination
  UNIQUE(user_id, provider_id)
);

-- Add indexes for better performance
CREATE INDEX idx_user_providers_user_id ON public.user_providers(user_id);
CREATE INDEX idx_user_providers_provider_id ON public.user_providers(provider_id);
CREATE INDEX idx_user_providers_enabled ON public.user_providers(enabled);

-- Enable RLS
ALTER TABLE public.user_providers ENABLE ROW LEVEL SECURITY;

-- RLS Policies for user_providers
CREATE POLICY "Users can manage their own provider configurations" ON public.user_providers
  FOR ALL USING (auth.uid() = user_id);

CREATE POLICY "Admins can view all provider configurations" ON public.user_providers
  FOR SELECT USING (public.is_admin());

-- Create updated_at trigger
CREATE TRIGGER update_user_providers_updated_at
  BEFORE UPDATE ON public.user_providers
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- Update the providers table to remove user-specific fields
-- Keep it as system-wide available providers only
ALTER TABLE public.providers DROP COLUMN IF EXISTS allowed_models;
ALTER TABLE public.providers DROP COLUMN IF EXISTS budget_limit;
ALTER TABLE public.providers DROP COLUMN IF EXISTS cost_this_month;

-- Update providers to be system-wide configurations (no RLS for SELECT)
DROP POLICY IF EXISTS "Users can view providers" ON public.providers;
DROP POLICY IF EXISTS "Admins can manage providers" ON public.providers;

-- New RLS policies for system providers
CREATE POLICY "Everyone can view system providers" ON public.providers
  FOR SELECT USING (true);

CREATE POLICY "Only admins can manage system providers" ON public.providers
  FOR ALL USING (public.is_admin());

-- Insert some sample user_providers data for testing
-- Note: This will only work if there are existing users and providers
-- You may need to adjust the UUIDs based on your actual data

-- Example: Enable OpenAI for all existing users with BYOK option
-- INSERT INTO public.user_providers (user_id, provider_id, enabled, use_byok, allowed_models, budget_limit)
-- SELECT 
--   p.user_id,
--   pr.id as provider_id,
--   false as enabled,
--   true as use_byok,
--   pr.models as allowed_models,
--   50.00 as budget_limit
-- FROM public.profiles p
-- CROSS JOIN public.providers pr
-- WHERE pr.provider_id IN ('openai', 'anthropic', 'google')
-- ON CONFLICT (user_id, provider_id) DO NOTHING;

-- Add comment for documentation
COMMENT ON TABLE public.user_providers IS 'User-specific provider configurations including BYOK settings and model selections';
COMMENT ON COLUMN public.user_providers.use_byok IS 'True = Bring Your Own Key, False = Use system keys (billable)';
COMMENT ON COLUMN public.user_providers.api_key_hash IS 'Encrypted user API key - only used when use_byok = true';
COMMENT ON COLUMN public.user_providers.allowed_models IS 'User-selected subset of models from this provider';