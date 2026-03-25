-- Create enum for policy types
CREATE TYPE public.policy_type AS ENUM ('fallback', 'load_balance');

-- Create model policies table
CREATE TABLE public.model_policies (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  api_key_id UUID REFERENCES public.api_keys(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  policy_type policy_type NOT NULL,
  template_name TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create model policy items table (for individual models in a policy)
CREATE TABLE public.model_policy_items (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  policy_id UUID NOT NULL REFERENCES public.model_policies(id) ON DELETE CASCADE,
  model_name TEXT NOT NULL,
  provider_name TEXT NOT NULL,
  owner TEXT NOT NULL,
  input_cost DECIMAL(10,6) NOT NULL DEFAULT 0,
  output_cost DECIMAL(10,6) NOT NULL DEFAULT 0,
  token_capacity INTEGER NOT NULL DEFAULT 0,
  distribution_percentage INTEGER, -- For load balance policies
  sequence_order INTEGER NOT NULL DEFAULT 0, -- For fallback policies
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

-- Create updated_at trigger for model_policies
CREATE TRIGGER update_model_policies_updated_at
  BEFORE UPDATE ON public.model_policies
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- Sample model policy items will be created when users create policies through the UI 