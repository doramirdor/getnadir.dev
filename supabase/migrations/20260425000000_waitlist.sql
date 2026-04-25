-- Waitlist signups for "coming soon" features (e.g., Clusters).
-- Anyone (anon or authenticated) can INSERT. Only service_role can read/manage.

CREATE TABLE IF NOT EXISTS public.waitlist (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT NOT NULL,
  source TEXT NOT NULL,
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Dedupe per (email, source) so the same person can't fill the table by spamming.
CREATE UNIQUE INDEX IF NOT EXISTS waitlist_email_source_uidx
  ON public.waitlist (lower(email), source);

CREATE INDEX IF NOT EXISTS waitlist_source_idx
  ON public.waitlist (source);

CREATE INDEX IF NOT EXISTS waitlist_created_at_idx
  ON public.waitlist (created_at DESC);

ALTER TABLE public.waitlist ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'waitlist'
      AND policyname = 'waitlist_insert_anyone'
  ) THEN
    CREATE POLICY waitlist_insert_anyone
      ON public.waitlist
      FOR INSERT
      TO anon, authenticated
      WITH CHECK (true);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'waitlist'
      AND policyname = 'waitlist_service_all'
  ) THEN
    CREATE POLICY waitlist_service_all
      ON public.waitlist
      FOR ALL
      TO service_role
      USING (true)
      WITH CHECK (true);
  END IF;
END $$;
