-- Add provider-specific settings columns
ALTER TABLE public.providers ADD COLUMN IF NOT EXISTS allowed_models TEXT[] DEFAULT ARRAY[]::TEXT[];
ALTER TABLE public.providers ADD COLUMN IF NOT EXISTS budget_limit DECIMAL(10,2) DEFAULT 50.00;

-- Add indexes for better performance
CREATE INDEX IF NOT EXISTS idx_providers_allowed_models ON public.providers USING gin (allowed_models);
CREATE INDEX IF NOT EXISTS idx_providers_budget_limit ON public.providers(budget_limit);

-- Update existing providers to have all models allowed by default
UPDATE public.providers 
SET allowed_models = models 
WHERE allowed_models IS NULL OR allowed_models = ARRAY[]::TEXT[];

-- Add column comments
COMMENT ON COLUMN public.providers.allowed_models IS 'Array of model names that are allowed to be used from this provider';
COMMENT ON COLUMN public.providers.budget_limit IS 'Monthly budget limit for this provider in USD';