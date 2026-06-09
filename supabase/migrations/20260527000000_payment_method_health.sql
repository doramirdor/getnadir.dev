-- Pre-billing payment-method health check.
--
-- We validate the saved card twice: (1) immediately after Stripe
-- Checkout completes, (2) on a daily cron 4-6 days before the next
-- invoice posts. If the validation fails we flip the flag, surface a
-- banner on the Billing page, and email the user to update their card
-- before access is blocked by the past_due path.

ALTER TABLE user_subscriptions
  ADD COLUMN IF NOT EXISTS payment_method_health TEXT NOT NULL DEFAULT 'unchecked',
  ADD COLUMN IF NOT EXISTS payment_method_health_checked_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS payment_method_health_last_error TEXT;

ALTER TABLE user_subscriptions
  DROP CONSTRAINT IF EXISTS user_subscriptions_payment_method_health_check;

ALTER TABLE user_subscriptions
  ADD CONSTRAINT user_subscriptions_payment_method_health_check
  CHECK (payment_method_health IN ('unchecked', 'healthy', 'failing'));

-- Index the daily scheduler's lookup: active subs with period_end in a
-- given window. Partial index keeps it small (only active rows matter).
CREATE INDEX IF NOT EXISTS idx_user_subscriptions_active_period_end
  ON user_subscriptions(current_period_end)
  WHERE status = 'active';
