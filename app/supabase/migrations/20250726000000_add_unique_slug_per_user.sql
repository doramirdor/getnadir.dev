-- Add slug column to presets table and unique constraint for slug per user
-- This ensures that each user can only have one preset with a given slug

-- First, add the slug column if it doesn't exist
ALTER TABLE public.presets 
ADD COLUMN IF NOT EXISTS slug TEXT;

-- First, let's check if there are any duplicate slugs for the same user
-- and update them if needed
DO $$
DECLARE
    duplicate_record RECORD;
    counter INTEGER;
BEGIN
    -- Find and fix any existing duplicate slugs per user
    FOR duplicate_record IN 
        SELECT user_id, slug, array_agg(id) as ids
        FROM public.presets 
        WHERE slug IS NOT NULL AND slug != ''
        GROUP BY user_id, slug 
        HAVING COUNT(*) > 1
    LOOP
        counter := 1;
        -- Update duplicate slugs by appending a number
        FOREACH duplicate_record.id IN ARRAY duplicate_record.ids[2:]
        LOOP
            counter := counter + 1;
            UPDATE public.presets 
            SET slug = duplicate_record.slug || '-' || counter::text
            WHERE id = duplicate_record.id;
        END LOOP;
    END LOOP;
END $$;

-- Add the unique constraint on (user_id, slug) combination
-- This ensures each user can only have one preset with a given slug
ALTER TABLE public.presets 
ADD CONSTRAINT unique_user_slug 
UNIQUE (user_id, slug);

-- Add index for better performance on slug lookups
CREATE INDEX IF NOT EXISTS idx_presets_user_slug 
ON public.presets (user_id, slug) 
WHERE slug IS NOT NULL;

-- Add comment explaining the constraint
COMMENT ON CONSTRAINT unique_user_slug ON public.presets IS 
'Ensures each user can only have one preset with a given slug for API routing';