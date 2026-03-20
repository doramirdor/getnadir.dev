-- CLEANUP MIGRATION: Remove deprecated columns from api_keys table
-- ⚠️  WARNING: Only run this after ensuring the application is fully updated
-- ⚠️  WARNING: This will permanently remove data in these columns
-- 
-- This migration should be run AFTER:
-- 1. The application has been updated to use the simplified api_keys interface
-- 2. Any existing API keys with complex configurations have been migrated to presets
-- 3. You have confirmed no other parts of the system depend on these columns

-- DO NOT UNCOMMENT AND RUN THIS UNTIL YOU ARE READY TO PERMANENTLY DELETE THE COLUMNS
/*
DO $$ 
BEGIN
    -- Drop indexes related to deprecated columns
    DROP INDEX IF EXISTS public.idx_api_keys_user_slug;
    DROP INDEX IF EXISTS public.idx_api_keys_selected_models;
    DROP INDEX IF EXISTS public.idx_api_keys_sort_strategy;
    DROP INDEX IF EXISTS public.idx_api_keys_use_fallback;

    -- Remove deprecated columns (THIS WILL PERMANENTLY DELETE DATA)
    ALTER TABLE public.api_keys DROP COLUMN IF EXISTS slug;
    ALTER TABLE public.api_keys DROP COLUMN IF EXISTS description;
    ALTER TABLE public.api_keys DROP COLUMN IF EXISTS system_prompt;
    ALTER TABLE public.api_keys DROP COLUMN IF EXISTS selected_models;
    ALTER TABLE public.api_keys DROP COLUMN IF EXISTS sort_strategy;
    ALTER TABLE public.api_keys DROP COLUMN IF EXISTS benchmark_model;
    ALTER TABLE public.api_keys DROP COLUMN IF EXISTS load_balancing_policy;
    ALTER TABLE public.api_keys DROP COLUMN IF EXISTS use_fallback;
    ALTER TABLE public.api_keys DROP COLUMN IF EXISTS enable_caching;
    ALTER TABLE public.api_keys DROP COLUMN IF EXISTS enable_logging;
    ALTER TABLE public.api_keys DROP COLUMN IF EXISTS log_level;
    ALTER TABLE public.api_keys DROP COLUMN IF EXISTS model_parameters;
    ALTER TABLE public.api_keys DROP COLUMN IF EXISTS last_used;
    ALTER TABLE public.api_keys DROP COLUMN IF EXISTS usage_count;

    -- Update the table comment
    COMMENT ON TABLE public.api_keys IS 'Simplified API keys table - configuration handled by presets system';

END $$;
*/

-- For now, we'll just add a comment indicating this migration is ready when needed
COMMENT ON TABLE public.api_keys IS 'Table contains deprecated columns marked for removal - see migration 
 for cleanup';