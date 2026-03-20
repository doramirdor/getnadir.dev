-- Create model policies tables for fallback and load balancing functionality
-- This supports both API key-level policies and preset-level policies

-- Create enum for policy types
DO $$ BEGIN
    CREATE TYPE public.policy_type AS ENUM ('fallback', 'load_balance');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- Create model policies table
CREATE TABLE IF NOT EXISTS public.model_policies (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  api_key_id UUID REFERENCES public.api_keys(id) ON DELETE CASCADE,
  preset_id UUID REFERENCES public.presets(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  policy_type policy_type NOT NULL,
  template_name TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  
  -- Ensure policy belongs to either an API key OR a preset, but not both
  CONSTRAINT check_api_key_or_preset CHECK (
    (api_key_id IS NOT NULL AND preset_id IS NULL) OR 
    (api_key_id IS NULL AND preset_id IS NOT NULL) OR
    (api_key_id IS NULL AND preset_id IS NULL)
  )
);

-- Create model policy items table (for individual models in a policy)
CREATE TABLE IF NOT EXISTS public.model_policy_items (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  policy_id UUID NOT NULL REFERENCES public.model_policies(id) ON DELETE CASCADE,
  model_name TEXT NOT NULL,
  provider_name TEXT NOT NULL,
  owner TEXT NOT NULL,
  input_cost DECIMAL(10,6) NOT NULL DEFAULT 0,
  output_cost DECIMAL(10,6) NOT NULL DEFAULT 0,
  token_capacity INTEGER NOT NULL DEFAULT 0,
  distribution_percentage INTEGER, -- For load balance policies (1-100)
  sequence_order INTEGER NOT NULL DEFAULT 0, -- For fallback policies (1, 2, 3...)
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS on new tables
ALTER TABLE public.model_policies ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.model_policy_items ENABLE ROW LEVEL SECURITY;

-- RLS Policies for model_policies
CREATE POLICY "Users can manage own model policies" ON public.model_policies
  FOR ALL USING (auth.uid() = user_id);

-- RLS Policies for model_policy_items
CREATE POLICY "Users can manage own model policy items" ON public.model_policy_items
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM public.model_policies 
      WHERE id = policy_id AND user_id = auth.uid()
    )
  );

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_model_policies_user_id 
ON public.model_policies (user_id);

CREATE INDEX IF NOT EXISTS idx_model_policies_api_key_id 
ON public.model_policies (api_key_id) 
WHERE api_key_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_model_policies_preset_id 
ON public.model_policies (preset_id) 
WHERE preset_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_model_policy_items_policy_id 
ON public.model_policy_items (policy_id);

CREATE INDEX IF NOT EXISTS idx_model_policy_items_sequence 
ON public.model_policy_items (policy_id, sequence_order);

-- Create updated_at trigger for model_policies
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_model_policies_updated_at
  BEFORE UPDATE ON public.model_policies
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- Add comments for documentation
COMMENT ON TABLE public.model_policies IS 'Model routing policies for fallback and load balancing. Can be associated with API keys or presets.';
COMMENT ON TABLE public.model_policy_items IS 'Individual model configurations within policies';
COMMENT ON COLUMN public.model_policies.api_key_id IS 'API key this policy belongs to (NULL for preset policies)';
COMMENT ON COLUMN public.model_policies.preset_id IS 'Preset this policy belongs to (NULL for API key policies)';
COMMENT ON CONSTRAINT check_api_key_or_preset ON public.model_policies IS 'Ensures policy belongs to either API key OR preset, not both';

-- Insert sample fallback policy templates for users to choose from
INSERT INTO public.model_policies (user_id, name, policy_type, template_name) 
SELECT 
  auth.uid(),
  'Performance Based Fallback',
  'fallback'::policy_type,
  'Performance Based (Recommended)'
WHERE auth.uid() IS NOT NULL
ON CONFLICT DO NOTHING;