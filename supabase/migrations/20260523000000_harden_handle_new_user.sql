-- Harden handle_new_user so a failed insert into profiles / referral_codes
-- never blocks Supabase Auth from creating the user row.
--
-- Symptom this fixes:
--   GET /auth/callback?error=server_error&error_code=unexpected_failure
--   &error_description=Database+error+saving+new+user
--
-- Causes that previously bubbled up:
--   - profiles row already exists (re-signup, manual seed)
--   - referral_codes unique collision on `code`
--   - generate_referral_code raising on edge inputs
--   - search_path issues in SECURITY DEFINER functions
--
-- The trigger now isolates each side-effect in its own EXCEPTION block and
-- logs a warning instead of failing the auth.users insert.

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
    BEGIN
        INSERT INTO public.profiles (id, email, full_name)
        VALUES (
            NEW.id,
            NEW.email,
            COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.raw_user_meta_data->>'name', '')
        )
        ON CONFLICT (id) DO NOTHING;
    EXCEPTION WHEN OTHERS THEN
        RAISE WARNING 'handle_new_user: profiles insert failed for %: %', NEW.id, SQLERRM;
    END;

    BEGIN
        INSERT INTO public.referral_codes (user_id, code)
        VALUES (NEW.id, public.generate_referral_code(NEW.email))
        ON CONFLICT (user_id) DO NOTHING;
    EXCEPTION WHEN OTHERS THEN
        RAISE WARNING 'handle_new_user: referral_codes insert failed for %: %', NEW.id, SQLERRM;
    END;

    RETURN NEW;
END;
$$;

-- Backfill profiles for any auth users missing one (failed signups before this fix).
INSERT INTO public.profiles (id, email, full_name)
SELECT
    u.id,
    u.email,
    COALESCE(u.raw_user_meta_data->>'full_name', u.raw_user_meta_data->>'name', '')
FROM auth.users u
LEFT JOIN public.profiles p ON p.id = u.id
WHERE p.id IS NULL
ON CONFLICT (id) DO NOTHING;

-- Backfill referral codes for any auth users missing one.
INSERT INTO public.referral_codes (user_id, code)
SELECT u.id, public.generate_referral_code(u.email)
FROM auth.users u
LEFT JOIN public.referral_codes rc ON rc.user_id = u.id
WHERE rc.user_id IS NULL
ON CONFLICT (user_id) DO NOTHING;
