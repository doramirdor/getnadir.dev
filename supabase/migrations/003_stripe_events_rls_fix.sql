-- Fix stripe_events: allow service role to insert (webhook handler)
-- Without this policy, Stripe webhook event deduplication fails silently

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='stripe_events' AND policyname='stripe_events_service_insert') THEN
    CREATE POLICY stripe_events_service_insert ON stripe_events
      FOR INSERT WITH CHECK (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='stripe_events' AND policyname='stripe_events_service_select') THEN
    CREATE POLICY stripe_events_service_select ON stripe_events
      FOR SELECT USING (true);
  END IF;
END $$;
