-- Restrict overly permissive INSERT policies to service_role only
-- Previously these used WITH CHECK (true) allowing any authenticated user
-- to insert rows with arbitrary user_id values

-- Fix savings_tracking_service_insert (from 001_savings_billing.sql)
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_policies WHERE tablename='savings_tracking' AND policyname='savings_tracking_service_insert') THEN
    DROP POLICY savings_tracking_service_insert ON savings_tracking;
  END IF;
END $$;

CREATE POLICY savings_tracking_service_insert ON savings_tracking
  FOR INSERT TO service_role WITH CHECK (true);

-- Fix savings_invoices_service_insert (from 001_savings_billing.sql)
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_policies WHERE tablename='savings_invoices' AND policyname='savings_invoices_service_insert') THEN
    DROP POLICY savings_invoices_service_insert ON savings_invoices;
  END IF;
END $$;

CREATE POLICY savings_invoices_service_insert ON savings_invoices
  FOR INSERT TO service_role WITH CHECK (true);

-- Fix usage_logs_service_insert (from 002_usage_logs.sql)
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_policies WHERE tablename='usage_logs' AND policyname='usage_logs_service_insert') THEN
    DROP POLICY usage_logs_service_insert ON usage_logs;
  END IF;
END $$;

CREATE POLICY usage_logs_service_insert ON usage_logs
  FOR INSERT TO service_role WITH CHECK (true);

-- Fix stripe_events policies (from 003_stripe_events_rls_fix.sql)
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_policies WHERE tablename='stripe_events' AND policyname='stripe_events_service_insert') THEN
    DROP POLICY stripe_events_service_insert ON stripe_events;
  END IF;
END $$;

CREATE POLICY stripe_events_service_insert ON stripe_events
  FOR INSERT TO service_role WITH CHECK (true);

DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_policies WHERE tablename='stripe_events' AND policyname='stripe_events_service_select') THEN
    DROP POLICY stripe_events_service_select ON stripe_events;
  END IF;
END $$;

CREATE POLICY stripe_events_service_select ON stripe_events
  FOR SELECT TO service_role USING (true);
