-- Referral program: each user gets a unique code; sharing it earns them
-- 1 free month of Pro Base when the referee converts to a paid customer.
-- The referee also gets 1 free month when they subscribe with a referral code.
--
-- Reward mechanic:
--  - Referee free month: 100%-off coupon applied at checkout (one cycle).
--  - Referrer free month: $base credit added to their Stripe customer balance
--    on referee's first invoice.paid event. Accumulates across referrals.
--  - If the referrer has no Stripe customer yet, the credit is held as
--    referral_pending_credits and drained when they first subscribe.

CREATE TABLE IF NOT EXISTS referral_codes (
    user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    code TEXT NOT NULL UNIQUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_referral_codes_code ON referral_codes(code);

CREATE TABLE IF NOT EXISTS referrals (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    referrer_user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    referee_user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    code TEXT NOT NULL,
    -- pending: signed up, no Stripe customer yet
    -- subscribed: referee opened a paid Stripe subscription (free month active)
    -- rewarded: referee's first real paid invoice cleared, referrer credited
    -- rejected: self-referral, duplicate, or other guard hit
    status TEXT NOT NULL DEFAULT 'pending',
    referee_rewarded_at TIMESTAMPTZ,
    referrer_rewarded_at TIMESTAMPTZ,
    rejected_reason TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    -- Each referee can only be referred once.
    UNIQUE (referee_user_id)
);

CREATE INDEX IF NOT EXISTS idx_referrals_referrer ON referrals(referrer_user_id);
CREATE INDEX IF NOT EXISTS idx_referrals_code ON referrals(code);
CREATE INDEX IF NOT EXISTS idx_referrals_status ON referrals(status);

-- Pending Stripe credits queued for users who haven't opened a Stripe customer
-- yet. Drained when stripe_service.create_customer runs.
CREATE TABLE IF NOT EXISTS referral_pending_credits (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    referral_id UUID NOT NULL REFERENCES referrals(id) ON DELETE CASCADE,
    amount_cents INT NOT NULL,
    applied_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (referral_id)
);

CREATE INDEX IF NOT EXISTS idx_referral_pending_credits_user
    ON referral_pending_credits(user_id) WHERE applied_at IS NULL;

-- Trigger to keep updated_at fresh on referrals.
CREATE OR REPLACE FUNCTION public.touch_referral_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_referrals_touch ON referrals;
CREATE TRIGGER trg_referrals_touch
    BEFORE UPDATE ON referrals
    FOR EACH ROW EXECUTE FUNCTION public.touch_referral_updated_at();

-- RLS

ALTER TABLE referral_codes ENABLE ROW LEVEL SECURITY;
ALTER TABLE referrals ENABLE ROW LEVEL SECURITY;
ALTER TABLE referral_pending_credits ENABLE ROW LEVEL SECURITY;

-- Service role: full access on all three tables.
CREATE POLICY "service_role full access on referral_codes"
    ON referral_codes FOR ALL
    USING (auth.role() = 'service_role');

CREATE POLICY "service_role full access on referrals"
    ON referrals FOR ALL
    USING (auth.role() = 'service_role');

CREATE POLICY "service_role full access on referral_pending_credits"
    ON referral_pending_credits FOR ALL
    USING (auth.role() = 'service_role');

-- Users can read their own code (the dashboard reads it via Supabase JS).
CREATE POLICY "users read own referral_code"
    ON referral_codes FOR SELECT
    USING (auth.uid() = user_id);

-- Users can read referrals they've made (to render the stats page).
CREATE POLICY "users read own referrals"
    ON referrals FOR SELECT
    USING (auth.uid() = referrer_user_id);

-- Users can read their own pending credits.
CREATE POLICY "users read own pending credits"
    ON referral_pending_credits FOR SELECT
    USING (auth.uid() = user_id);

-- Auto-generate a referral code for new users.
-- Format: 4-char prefix from email local-part (uppercased letters/digits) +
-- 5 random digits. e.g. amirdor+nadir@gmail.com → AMIR + 12345 → AMIR12345.
-- Falls back to USER + digits if the prefix can't be derived.
CREATE OR REPLACE FUNCTION public.generate_referral_code(email TEXT)
RETURNS TEXT AS $$
DECLARE
    prefix TEXT;
    suffix TEXT;
    candidate TEXT;
    attempts INT := 0;
BEGIN
    prefix := upper(regexp_replace(split_part(coalesce(email, ''), '@', 1), '[^a-zA-Z0-9]', '', 'g'));
    prefix := substring(prefix from 1 for 4);
    IF prefix IS NULL OR length(prefix) < 2 THEN
        prefix := 'USER';
    END IF;

    LOOP
        suffix := lpad((floor(random() * 100000))::int::text, 5, '0');
        candidate := prefix || suffix;
        EXIT WHEN NOT EXISTS (SELECT 1 FROM referral_codes WHERE code = candidate);
        attempts := attempts + 1;
        IF attempts > 10 THEN
            -- Pathological collision; widen the suffix.
            candidate := prefix || lpad((floor(random() * 100000000))::bigint::text, 8, '0');
            EXIT;
        END IF;
    END LOOP;

    RETURN candidate;
END;
$$ LANGUAGE plpgsql VOLATILE SECURITY DEFINER;

-- Extend handle_new_user (defined in 000_base_schema.sql) to also seed a
-- referral code. Re-create with the additional INSERT.
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
    INSERT INTO public.profiles (id, email, full_name)
    VALUES (
        NEW.id,
        NEW.email,
        COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.raw_user_meta_data->>'name', '')
    );

    INSERT INTO public.referral_codes (user_id, code)
    VALUES (NEW.id, public.generate_referral_code(NEW.email))
    ON CONFLICT (user_id) DO NOTHING;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Backfill codes for existing users.
INSERT INTO public.referral_codes (user_id, code)
SELECT u.id, public.generate_referral_code(u.email)
FROM auth.users u
LEFT JOIN public.referral_codes rc ON rc.user_id = u.id
WHERE rc.user_id IS NULL;
