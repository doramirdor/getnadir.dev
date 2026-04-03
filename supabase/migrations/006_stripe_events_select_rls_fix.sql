-- Fix: Restrict stripe_events SELECT to service_role only.
-- Previously the SELECT policy used USING (true), allowing any authenticated
-- user to read all Stripe webhook events (including other users' payment data).

DROP POLICY IF EXISTS stripe_events_service_select ON stripe_events;

CREATE POLICY stripe_events_service_select ON stripe_events
  FOR SELECT TO service_role USING (true);
