-- Create enum for user roles
CREATE TYPE public.user_role AS ENUM ('admin', 'user');

-- Create enum for status types
CREATE TYPE public.status_type AS ENUM ('active', 'inactive', 'connected', 'disconnected');

-- Create profiles table for user management
CREATE TABLE public.profiles (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  email TEXT NOT NULL,
  role user_role NOT NULL DEFAULT 'user',
  status status_type NOT NULL DEFAULT 'active',
  last_login TIMESTAMP WITH TIME ZONE,
  requests_this_month INTEGER DEFAULT 0,
  cost_this_month DECIMAL(10,2) DEFAULT 0.00,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create API keys table
CREATE TABLE public.api_keys (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  key_hash TEXT NOT NULL, -- Store hashed version, never plain text
  key_preview TEXT NOT NULL, -- First few and last few characters for display
  status status_type NOT NULL DEFAULT 'active',
  last_used TIMESTAMP WITH TIME ZONE,
  usage_count INTEGER DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create providers table
CREATE TABLE public.providers (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  provider_id TEXT NOT NULL UNIQUE, -- e.g., 'openai', 'anthropic'
  status status_type NOT NULL DEFAULT 'disconnected',
  models TEXT[] NOT NULL DEFAULT '{}',
  api_key_hash TEXT, -- Encrypted/hashed API key
  cost_this_month DECIMAL(10,2) DEFAULT 0.00,
  enabled BOOLEAN DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create integrations table
CREATE TABLE public.integrations (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  status status_type NOT NULL DEFAULT 'inactive',
  icon_url TEXT,
  description TEXT,
  config JSONB DEFAULT '{}',
  enabled BOOLEAN DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS on all tables
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.api_keys ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.providers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.integrations ENABLE ROW LEVEL SECURITY;

-- Create security definer function to check admin role
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS BOOLEAN AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM public.profiles 
    WHERE user_id = auth.uid() AND role = 'admin'
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE;

-- RLS Policies for profiles
CREATE POLICY "Admins can view all profiles" ON public.profiles
  FOR SELECT USING (public.is_admin());

CREATE POLICY "Admins can insert profiles" ON public.profiles
  FOR INSERT WITH CHECK (public.is_admin());

CREATE POLICY "Admins can update profiles" ON public.profiles
  FOR UPDATE USING (public.is_admin());

CREATE POLICY "Users can view own profile" ON public.profiles
  FOR SELECT USING (auth.uid() = user_id);

-- RLS Policies for api_keys
CREATE POLICY "Admins can manage all API keys" ON public.api_keys
  FOR ALL USING (public.is_admin());

CREATE POLICY "Users can manage own API keys" ON public.api_keys
  FOR ALL USING (auth.uid() = user_id);

-- RLS Policies for providers (admin only)
CREATE POLICY "Admins can manage providers" ON public.providers
  FOR ALL USING (public.is_admin());

CREATE POLICY "Users can view providers" ON public.providers
  FOR SELECT USING (true);

-- RLS Policies for integrations (admin only)
CREATE POLICY "Admins can manage integrations" ON public.integrations
  FOR ALL USING (public.is_admin());

CREATE POLICY "Users can view integrations" ON public.integrations
  FOR SELECT USING (true);

-- Create updated_at triggers
CREATE TRIGGER update_profiles_updated_at
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_api_keys_updated_at
  BEFORE UPDATE ON public.api_keys
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_providers_updated_at
  BEFORE UPDATE ON public.providers
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_integrations_updated_at
  BEFORE UPDATE ON public.integrations
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- Insert some default providers
INSERT INTO public.providers (name, provider_id, models, status) VALUES
  ('OpenAI', 'openai', '{"gpt-4", "gpt-3.5-turbo", "gpt-4-vision"}', 'disconnected'),
  ('Anthropic', 'anthropic', '{"claude-3-opus", "claude-3-sonnet", "claude-3-haiku"}', 'disconnected'),
  ('Google (Gemini)', 'google', '{"gemini-pro", "gemini-pro-vision"}', 'disconnected'),
  ('xAI', 'xai', '{"grok-1"}', 'disconnected');

-- Insert some default integrations
INSERT INTO public.integrations (name, status, description) VALUES
  ('AI21', 'inactive', 'AI21 Labs language models'),
  ('AionLabs', 'inactive', 'AionLabs AI services'),
  ('Alibaba', 'inactive', 'Alibaba Cloud AI services'),
  ('Amazon Bedrock', 'inactive', 'Amazon Bedrock foundation models'),
  ('AtlasCloud', 'inactive', 'AtlasCloud AI platform'),
  ('Atoma', 'inactive', 'Atoma AI services'),
  ('Avian.io', 'inactive', 'Avian.io data platform'),
  ('Azure', 'inactive', 'Microsoft Azure AI services'),
  ('Baseten', 'inactive', 'Baseten ML platform');