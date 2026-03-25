-- Simplify api_keys table to match the new streamlined interface
-- This migration adds essential columns and removes complex configuration fields
-- that are now handled by the presets system

DO $$ 
BEGIN
    -- Add credit_limit column if it doesn't exist
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'api_keys' AND column_name = 'credit_limit') THEN
        ALTER TABLE public.api_keys ADD COLUMN credit_limit DECIMAL(10,2);
        CREATE INDEX IF NOT EXISTS idx_api_keys_credit_limit ON public.api_keys(credit_limit) WHERE credit_limit IS NOT NULL;
    END IF;

    -- Add include_byok_in_limit column if it doesn't exist
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'api_keys' AND column_name = 'include_byok_in_limit') THEN
        ALTER TABLE public.api_keys ADD COLUMN include_byok_in_limit BOOLEAN DEFAULT false;
        CREATE INDEX IF NOT EXISTS idx_api_keys_include_byok ON public.api_keys(include_byok_in_limit);
    END IF;

    -- Remove complex configuration columns that are now handled by presets
    -- These columns will be dropped in a future migration after ensuring no dependencies
    
    -- First, let's add comments to mark these columns as deprecated
    COMMENT ON COLUMN public.api_keys.slug IS 'DEPRECATED: Use presets for configuration';
    COMMENT ON COLUMN public.api_keys.description IS 'DEPRECATED: Use presets for configuration';
    COMMENT ON COLUMN public.api_keys.system_prompt IS 'DEPRECATED: Use presets for configuration';
    COMMENT ON COLUMN public.api_keys.selected_models IS 'DEPRECATED: Use presets for configuration';
    COMMENT ON COLUMN public.api_keys.sort_strategy IS 'DEPRECATED: Use presets for configuration';
    COMMENT ON COLUMN public.api_keys.benchmark_model IS 'DEPRECATED: Use presets for configuration';
    COMMENT ON COLUMN public.api_keys.load_balancing_policy IS 'DEPRECATED: Use presets for configuration';
    COMMENT ON COLUMN public.api_keys.use_fallback IS 'DEPRECATED: Use presets for configuration';
    COMMENT ON COLUMN public.api_keys.enable_caching IS 'DEPRECATED: Use presets for configuration';
    COMMENT ON COLUMN public.api_keys.enable_logging IS 'DEPRECATED: Use presets for configuration';
    COMMENT ON COLUMN public.api_keys.log_level IS 'DEPRECATED: Use presets for configuration';
    COMMENT ON COLUMN public.api_keys.model_parameters IS 'DEPRECATED: Use presets for configuration';
    COMMENT ON COLUMN public.api_keys.last_used IS 'DEPRECATED: Not used in simplified interface';
    COMMENT ON COLUMN public.api_keys.usage_count IS 'DEPRECATED: Not used in simplified interface';

END $$;

-- Create a view for the simplified API keys interface
-- This ensures the application only accesses the essential columns
CREATE OR REPLACE VIEW public.api_keys_simple AS
SELECT 
    id,
    user_id,
    name,
    key_hash,
    key_preview,
    status,
    created_at,
    credit_limit,
    include_byok_in_limit
FROM public.api_keys;

-- Enable RLS on the view
ALTER VIEW public.api_keys_simple SET (security_invoker = true);

-- Grant permissions on the view
GRANT SELECT, INSERT, UPDATE, DELETE ON public.api_keys_simple TO authenticated;

-- Create a function to handle insertions through the view
CREATE OR REPLACE FUNCTION public.insert_api_key_simple()
RETURNS TRIGGER AS $$
BEGIN
    INSERT INTO public.api_keys (
        user_id,
        name,
        key_hash,
        key_preview,
        status,
        credit_limit,
        include_byok_in_limit
    ) VALUES (
        NEW.user_id,
        NEW.name,
        NEW.key_hash,
        NEW.key_preview,
        NEW.status,
        NEW.credit_limit,
        NEW.include_byok_in_limit
    );
    
    -- Return the inserted row with the generated ID
    NEW.id := (SELECT id FROM public.api_keys WHERE key_hash = NEW.key_hash ORDER BY created_at DESC LIMIT 1);
    NEW.created_at := (SELECT created_at FROM public.api_keys WHERE id = NEW.id);
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create a function to handle updates through the view
CREATE OR REPLACE FUNCTION public.update_api_key_simple()
RETURNS TRIGGER AS $$
BEGIN
    UPDATE public.api_keys SET
        name = NEW.name,
        status = NEW.status,
        credit_limit = NEW.credit_limit,
        include_byok_in_limit = NEW.include_byok_in_limit
    WHERE id = NEW.id;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create a function to handle deletions through the view
CREATE OR REPLACE FUNCTION public.delete_api_key_simple()
RETURNS TRIGGER AS $$
BEGIN
    DELETE FROM public.api_keys WHERE id = OLD.id;
    RETURN OLD;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create triggers for the view
CREATE TRIGGER api_keys_simple_insert_trigger
    INSTEAD OF INSERT ON public.api_keys_simple
    FOR EACH ROW EXECUTE FUNCTION public.insert_api_key_simple();

CREATE TRIGGER api_keys_simple_update_trigger
    INSTEAD OF UPDATE ON public.api_keys_simple
    FOR EACH ROW EXECUTE FUNCTION public.update_api_key_simple();

CREATE TRIGGER api_keys_simple_delete_trigger
    INSTEAD OF DELETE ON public.api_keys_simple
    FOR EACH ROW EXECUTE FUNCTION public.delete_api_key_simple();

-- Add helpful comments
COMMENT ON VIEW public.api_keys_simple IS 'Simplified view of api_keys table showing only essential columns for the streamlined interface';
COMMENT ON FUNCTION public.insert_api_key_simple() IS 'Function to handle INSERT operations on api_keys_simple view';
COMMENT ON FUNCTION public.update_api_key_simple() IS 'Function to handle UPDATE operations on api_keys_simple view';
COMMENT ON FUNCTION public.delete_api_key_simple() IS 'Function to handle DELETE operations on api_keys_simple view';