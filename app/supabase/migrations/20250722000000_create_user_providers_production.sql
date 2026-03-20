-- Migration to create user_providers table and related functionality for production
-- This enables per-user provider configurations, BYOK settings, and budgets
-- Safe migration that handles existing schema elements

-- Ensure we have the required functions (CREATE OR REPLACE is safe)
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = CURRENT_TIMESTAMP;
  RETURN NEW;
END;
$$ language 'plpgsql';

-- Ensure is_admin function exists (CREATE OR REPLACE is safe)
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS BOOLEAN AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM public.profiles 
    WHERE user_id = auth.uid() AND role = 'admin'
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE;

-- Create user_providers table for user-specific provider configurations
CREATE TABLE IF NOT EXISTS public.user_providers (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  provider_id UUID NOT NULL REFERENCES public.providers(id) ON DELETE CASCADE,
  enabled BOOLEAN NOT NULL DEFAULT false,
  use_byok BOOLEAN NOT NULL DEFAULT false, -- Bring Your Own Key
  api_key_hash TEXT, -- Encrypted/hashed user API key
  allowed_models TEXT[] NOT NULL DEFAULT '{}',
  budget_limit DECIMAL(10,2) DEFAULT 50.00,
  cost_this_month DECIMAL(10,2) DEFAULT 0.00,
  requests_this_month INTEGER DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(user_id, provider_id)
);

-- Enable RLS on user_providers
ALTER TABLE public.user_providers ENABLE ROW LEVEL SECURITY;

-- Create RLS policies for user_providers
DROP POLICY IF EXISTS "Users can manage own provider configs" ON public.user_providers;
CREATE POLICY "Users can manage own provider configs" ON public.user_providers
  FOR ALL USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Admins can manage all provider configs" ON public.user_providers;
CREATE POLICY "Admins can manage all provider configs" ON public.user_providers
  FOR ALL USING (public.is_admin());

-- Create updated_at trigger for user_providers
DROP TRIGGER IF EXISTS update_user_providers_updated_at ON public.user_providers;
CREATE TRIGGER update_user_providers_updated_at
  BEFORE UPDATE ON public.user_providers
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_user_providers_user_id ON public.user_providers(user_id);
CREATE INDEX IF NOT EXISTS idx_user_providers_provider_id ON public.user_providers(provider_id);
CREATE INDEX IF NOT EXISTS idx_user_providers_enabled ON public.user_providers(enabled);

-- Add comment for documentation
COMMENT ON TABLE public.user_providers IS 'User-specific provider configurations including BYOK settings, allowed models, and budgets';