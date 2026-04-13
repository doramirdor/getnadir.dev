-- Migration: Add atomic invite code usage increment RPC
-- Prevents race condition where two users redeem the same invite code simultaneously.
-- Run this in Supabase SQL Editor (Dashboard > SQL Editor > New query)

CREATE OR REPLACE FUNCTION increment_invite_code_usage(p_code TEXT)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  rows_affected INT;
BEGIN
  -- Atomic: increment times_used only if code is active, under limit, and not expired
  UPDATE invite_codes
  SET times_used = times_used + 1,
      updated_at = now()
  WHERE code = p_code
    AND is_active = true
    AND (max_uses IS NULL OR times_used < max_uses)
    AND (expires_at IS NULL OR expires_at > now());

  GET DIAGNOSTICS rows_affected = ROW_COUNT;

  -- Returns true if the increment succeeded (code was valid and under limit)
  -- Returns false if code was already at max_uses, expired, or inactive
  RETURN rows_affected > 0;
END;
$$;
