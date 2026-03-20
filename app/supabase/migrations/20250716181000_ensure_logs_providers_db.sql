-- Ensure logs and providers are properly integrated with the database

-- Make sure providers table has all necessary fields
ALTER TABLE public.providers ADD COLUMN IF NOT EXISTS last_used TIMESTAMP WITH TIME ZONE;
ALTER TABLE public.providers ADD COLUMN IF NOT EXISTS total_requests INTEGER DEFAULT 0;
ALTER TABLE public.providers ADD COLUMN IF NOT EXISTS error_count INTEGER DEFAULT 0;
ALTER TABLE public.providers ADD COLUMN IF NOT EXISTS avg_response_time_ms INTEGER DEFAULT 0;

-- Add indexes for better performance
CREATE INDEX IF NOT EXISTS idx_logs_created_at ON public.logs(created_at);
CREATE INDEX IF NOT EXISTS idx_logs_user_id ON public.logs(user_id);
CREATE INDEX IF NOT EXISTS idx_logs_provider ON public.logs(provider);
CREATE INDEX IF NOT EXISTS idx_logs_model ON public.logs(model);
CREATE INDEX IF NOT EXISTS idx_logs_status ON public.logs(status);
CREATE INDEX IF NOT EXISTS idx_logs_selection_method ON public.logs(selection_method);

CREATE INDEX IF NOT EXISTS idx_providers_status ON public.providers(status);
CREATE INDEX IF NOT EXISTS idx_providers_enabled ON public.providers(enabled);
CREATE INDEX IF NOT EXISTS idx_providers_provider_id ON public.providers(provider_id);

CREATE INDEX IF NOT EXISTS idx_profiles_user_id ON public.profiles(user_id);
CREATE INDEX IF NOT EXISTS idx_profiles_role ON public.profiles(role);
CREATE INDEX IF NOT EXISTS idx_profiles_status ON public.profiles(status);

-- Add function to automatically update provider stats when logs are inserted
CREATE OR REPLACE FUNCTION update_provider_stats()
RETURNS TRIGGER AS $$
BEGIN
    -- Update provider statistics
    UPDATE public.providers 
    SET 
        last_used = NOW(),
        total_requests = total_requests + 1,
        error_count = error_count + CASE WHEN NEW.status = 'failed' THEN 1 ELSE 0 END,
        avg_response_time_ms = (
            SELECT AVG(response_time_ms)::INTEGER 
            FROM public.logs 
            WHERE provider = NEW.provider 
            AND model = NEW.model 
            AND response_time_ms IS NOT NULL
        )
    WHERE provider_id = NEW.provider 
    AND name = NEW.model;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger to update provider stats
DROP TRIGGER IF EXISTS trigger_update_provider_stats ON public.logs;
CREATE TRIGGER trigger_update_provider_stats
    AFTER INSERT ON public.logs
    FOR EACH ROW
    EXECUTE FUNCTION update_provider_stats();

-- Add function to update user monthly costs
CREATE OR REPLACE FUNCTION update_user_monthly_costs()
RETURNS TRIGGER AS $$
BEGIN
    -- Update user's monthly cost
    UPDATE public.profiles 
    SET 
        cost_this_month = (
            SELECT COALESCE(SUM(cost), 0)
            FROM public.logs 
            WHERE user_id = NEW.user_id 
            AND EXTRACT(MONTH FROM created_at) = EXTRACT(MONTH FROM CURRENT_DATE)
            AND EXTRACT(YEAR FROM created_at) = EXTRACT(YEAR FROM CURRENT_DATE)
        ),
        requests_this_month = (
            SELECT COUNT(*)
            FROM public.logs 
            WHERE user_id = NEW.user_id 
            AND EXTRACT(MONTH FROM created_at) = EXTRACT(MONTH FROM CURRENT_DATE)
            AND EXTRACT(YEAR FROM created_at) = EXTRACT(YEAR FROM CURRENT_DATE)
        )
    WHERE user_id = NEW.user_id;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger to update user monthly costs
DROP TRIGGER IF EXISTS trigger_update_user_monthly_costs ON public.logs;
CREATE TRIGGER trigger_update_user_monthly_costs
    AFTER INSERT ON public.logs
    FOR EACH ROW
    EXECUTE FUNCTION update_user_monthly_costs();

-- Skip inserting provider stats for now - will be handled by triggers when logs are inserted

-- Update integrations with proper status
UPDATE public.integrations SET
  status = CASE 
    WHEN enabled = true THEN 'active'::status_type
    ELSE 'inactive'::status_type
  END;