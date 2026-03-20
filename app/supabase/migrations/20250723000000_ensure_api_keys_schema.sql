-- Ensure api_keys table has all required columns for routing configuration
-- This migration safely adds missing columns without affecting existing data

DO $$ 
BEGIN
    -- Ensure api_keys table exists
    CREATE TABLE IF NOT EXISTS public.api_keys (
        id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
        user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
        name TEXT NOT NULL,
        key_hash TEXT NOT NULL,
        key_preview TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'active',
        created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        last_used TIMESTAMP WITH TIME ZONE,
        usage_count INTEGER DEFAULT 0
    );

    -- Add slug column if it doesn't exist
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'api_keys' AND column_name = 'slug') THEN
        ALTER TABLE public.api_keys ADD COLUMN slug TEXT;
        CREATE UNIQUE INDEX IF NOT EXISTS idx_api_keys_user_slug ON public.api_keys(user_id, slug) WHERE slug IS NOT NULL;
    END IF;

    -- Add description column if it doesn't exist
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'api_keys' AND column_name = 'description') THEN
        ALTER TABLE public.api_keys ADD COLUMN description TEXT;
    END IF;

    -- Add system_prompt column if it doesn't exist
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'api_keys' AND column_name = 'system_prompt') THEN
        ALTER TABLE public.api_keys ADD COLUMN system_prompt TEXT;
    END IF;

    -- Add selected_models column if it doesn't exist
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'api_keys' AND column_name = 'selected_models') THEN
        ALTER TABLE public.api_keys ADD COLUMN selected_models TEXT[] DEFAULT '{}';
        CREATE INDEX IF NOT EXISTS idx_api_keys_selected_models ON public.api_keys USING gin(selected_models);
    END IF;

    -- Add sort_strategy column if it doesn't exist
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'api_keys' AND column_name = 'sort_strategy') THEN
        ALTER TABLE public.api_keys ADD COLUMN sort_strategy TEXT;
        CREATE INDEX IF NOT EXISTS idx_api_keys_sort_strategy ON public.api_keys(sort_strategy);
    END IF;

    -- Add benchmark_model column if it doesn't exist
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'api_keys' AND column_name = 'benchmark_model') THEN
        ALTER TABLE public.api_keys ADD COLUMN benchmark_model TEXT;
    END IF;

    -- Add load_balancing_policy column if it doesn't exist
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'api_keys' AND column_name = 'load_balancing_policy') THEN
        ALTER TABLE public.api_keys ADD COLUMN load_balancing_policy TEXT DEFAULT 'round-robin';
    END IF;

    -- Add use_fallback column if it doesn't exist
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'api_keys' AND column_name = 'use_fallback') THEN
        ALTER TABLE public.api_keys ADD COLUMN use_fallback BOOLEAN DEFAULT true;
        CREATE INDEX IF NOT EXISTS idx_api_keys_use_fallback ON public.api_keys(use_fallback);
    END IF;

    -- Add enable_caching column if it doesn't exist
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'api_keys' AND column_name = 'enable_caching') THEN
        ALTER TABLE public.api_keys ADD COLUMN enable_caching BOOLEAN DEFAULT true;
    END IF;

    -- Add enable_logging column if it doesn't exist
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'api_keys' AND column_name = 'enable_logging') THEN
        ALTER TABLE public.api_keys ADD COLUMN enable_logging BOOLEAN DEFAULT true;
    END IF;

    -- Add log_level column if it doesn't exist
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'api_keys' AND column_name = 'log_level') THEN
        ALTER TABLE public.api_keys ADD COLUMN log_level TEXT DEFAULT 'info';
    END IF;

    -- Add model_parameters column if it doesn't exist
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'api_keys' AND column_name = 'model_parameters') THEN
        ALTER TABLE public.api_keys ADD COLUMN model_parameters JSONB DEFAULT '{}';
    END IF;

    -- Enable RLS if not already enabled
    ALTER TABLE public.api_keys ENABLE ROW LEVEL SECURITY;

    -- Drop existing policies if they exist
    DROP POLICY IF EXISTS "Users can manage own API keys" ON public.api_keys;

    -- Create RLS policies
    CREATE POLICY "Users can manage own API keys" ON public.api_keys
        FOR ALL USING (auth.uid() = user_id);

    -- Update any existing records to have default values for new columns
    UPDATE public.api_keys SET 
        use_fallback = COALESCE(use_fallback, true),
        enable_caching = COALESCE(enable_caching, true), 
        enable_logging = COALESCE(enable_logging, true),
        log_level = COALESCE(log_level, 'info'),
        load_balancing_policy = COALESCE(load_balancing_policy, 'round-robin'),
        model_parameters = COALESCE(model_parameters, '{}'::jsonb),
        selected_models = COALESCE(selected_models, '{}')
    WHERE use_fallback IS NULL OR enable_caching IS NULL OR enable_logging IS NULL 
       OR log_level IS NULL OR load_balancing_policy IS NULL OR model_parameters IS NULL 
       OR selected_models IS NULL;

END $$;