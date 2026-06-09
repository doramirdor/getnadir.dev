-- Hosted prepaid credits + ledger, and key_mode on savings_tracking.
--
-- Reconciles the stale 001_savings_billing.sql `user_credits` table with the
-- live schema (which already carries balance + auto-recharge config) and adds
-- the `credit_transactions` ledger the CreditsService writes to. Idempotent so
-- it is safe to run against both fresh and live databases.

-- ---------------------------------------------------------------------------
-- user_credits: prepaid balance + auto-recharge config
-- ---------------------------------------------------------------------------
ALTER TABLE user_credits ADD COLUMN IF NOT EXISTS balance NUMERIC(12,4) NOT NULL DEFAULT 0;
ALTER TABLE user_credits ADD COLUMN IF NOT EXISTS auto_charge_enabled BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE user_credits ADD COLUMN IF NOT EXISTS auto_charge_threshold NUMERIC(12,4) NOT NULL DEFAULT 5;
ALTER TABLE user_credits ADD COLUMN IF NOT EXISTS auto_charge_amount NUMERIC(12,4) NOT NULL DEFAULT 20;
ALTER TABLE user_credits ADD COLUMN IF NOT EXISTS upper_limit NUMERIC(12,4);
ALTER TABLE user_credits ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT now();

-- Backfill `balance` from the legacy `balance_usd` column when present so no
-- existing prepaid balance is lost on databases created from migration 001.
DO $$ BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'user_credits' AND column_name = 'balance_usd'
  ) THEN
    UPDATE user_credits SET balance = balance_usd
    WHERE balance = 0 AND balance_usd IS NOT NULL AND balance_usd <> 0;
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- credit_transactions: append-only debit/credit ledger
-- ---------------------------------------------------------------------------
-- For fresh databases, create the table outright.
CREATE TABLE IF NOT EXISTS credit_transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  transaction_type TEXT NOT NULL,
  amount NUMERIC(12,4) NOT NULL,
  balance_after NUMERIC(12,4) NOT NULL,
  description TEXT,
  stripe_payment_intent_id TEXT,
  api_key_id UUID REFERENCES api_keys(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- The live table may pre-date this migration with a different shape, in which
-- case CREATE TABLE IF NOT EXISTS above was a no-op. Reconcile every column the
-- CreditsService writes. Columns are added nullable so the ALTER succeeds even
-- when the table already holds rows; the service always supplies values.
ALTER TABLE credit_transactions ADD COLUMN IF NOT EXISTS user_id UUID;
ALTER TABLE credit_transactions ADD COLUMN IF NOT EXISTS transaction_type TEXT;
ALTER TABLE credit_transactions ADD COLUMN IF NOT EXISTS amount NUMERIC(12,4);
ALTER TABLE credit_transactions ADD COLUMN IF NOT EXISTS balance_after NUMERIC(12,4);
ALTER TABLE credit_transactions ADD COLUMN IF NOT EXISTS description TEXT;
ALTER TABLE credit_transactions ADD COLUMN IF NOT EXISTS stripe_payment_intent_id TEXT;
ALTER TABLE credit_transactions ADD COLUMN IF NOT EXISTS api_key_id UUID;
ALTER TABLE credit_transactions ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT now();

CREATE INDEX IF NOT EXISTS idx_credit_tx_user_date
  ON credit_transactions(user_id, created_at DESC);

-- Idempotency guard for Stripe top-ups: never double-credit the same payment.
CREATE UNIQUE INDEX IF NOT EXISTS uq_credit_tx_payment_intent
  ON credit_transactions(stripe_payment_intent_id)
  WHERE stripe_payment_intent_id IS NOT NULL;

ALTER TABLE credit_transactions ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'credit_transactions' AND policyname = 'credit_transactions_user_select'
  ) THEN
    CREATE POLICY credit_transactions_user_select ON credit_transactions
      FOR SELECT USING (auth.uid() = user_id);
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'credit_transactions' AND policyname = 'credit_transactions_service_insert'
  ) THEN
    CREATE POLICY credit_transactions_service_insert ON credit_transactions
      FOR INSERT TO service_role WITH CHECK (true);
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- savings_tracking.key_mode: 'hosted' | 'byok' (read by billing rollups)
-- ---------------------------------------------------------------------------
ALTER TABLE savings_tracking ADD COLUMN IF NOT EXISTS key_mode TEXT;
