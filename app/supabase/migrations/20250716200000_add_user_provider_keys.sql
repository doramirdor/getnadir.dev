-- Create table for user-specific provider API keys (BYOK)
CREATE TABLE IF NOT EXISTS public.user_provider_keys (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  provider_id TEXT NOT NULL, -- e.g., 'openai', 'anthropic', 'google', 'bedrock'
  provider_name TEXT NOT NULL, -- e.g., 'OpenAI', 'Anthropic', 'Google', 'AWS Bedrock'
  api_key_hash TEXT, -- Encrypted/hashed API key
  byok_enabled BOOLEAN NOT NULL DEFAULT false, -- Bring Your Own Key enabled
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(user_id, provider_id)
);

-- Enable RLS
ALTER TABLE public.user_provider_keys ENABLE ROW LEVEL SECURITY;

-- RLS Policies - users can only access their own keys
CREATE POLICY "Users can manage their own provider keys" ON public.user_provider_keys
  FOR ALL USING (auth.uid() = user_id);

-- Admins can view all user provider keys in their organization (for future organization support)
CREATE POLICY "Admins can view organization provider keys" ON public.user_provider_keys
  FOR SELECT USING (
    public.is_admin() AND user_id IN (
      SELECT user_id FROM public.profiles 
      WHERE organization_id = (
        SELECT organization_id FROM public.profiles WHERE user_id = auth.uid()
      )
    )
  );

-- Add indexes for performance
CREATE INDEX IF NOT EXISTS idx_user_provider_keys_user_id ON public.user_provider_keys(user_id);
CREATE INDEX IF NOT EXISTS idx_user_provider_keys_provider_id ON public.user_provider_keys(provider_id);
CREATE INDEX IF NOT EXISTS idx_user_provider_keys_byok_enabled ON public.user_provider_keys(byok_enabled);

-- Add updated_at trigger
CREATE TRIGGER update_user_provider_keys_updated_at
  BEFORE UPDATE ON public.user_provider_keys
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- Insert default entries for common providers for existing users
INSERT INTO public.user_provider_keys (user_id, provider_id, provider_name, byok_enabled)
SELECT 
  p.user_id,
  provider.id,
  provider.name,
  false
FROM public.profiles p
CROSS JOIN (
  VALUES 
    ('openai', 'OpenAI'),
    ('anthropic', 'Anthropic'),
    ('google', 'Google'),
    ('bedrock', 'AWS Bedrock')
) AS provider(id, name)
ON CONFLICT (user_id, provider_id) DO NOTHING;

-- Add comment
COMMENT ON TABLE public.user_provider_keys IS 'Stores user-specific API keys for providers when BYOK (Bring Your Own Keys) is enabled';