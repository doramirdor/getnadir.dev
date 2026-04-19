-- Public contact form submissions (marketing leads / sales inquiries).
-- Anyone (anon or authenticated) can INSERT. Only service_role can read/manage.

CREATE TABLE IF NOT EXISTS public.contact_submissions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  email TEXT NOT NULL,
  company TEXT,
  message TEXT NOT NULL,
  source TEXT,
  status TEXT NOT NULL DEFAULT 'new'
    CHECK (status IN ('new', 'contacted', 'qualified', 'closed')),
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS contact_submissions_created_at_idx
  ON public.contact_submissions (created_at DESC);

CREATE INDEX IF NOT EXISTS contact_submissions_status_idx
  ON public.contact_submissions (status);

ALTER TABLE public.contact_submissions ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'contact_submissions'
      AND policyname = 'contact_submissions_insert_anyone'
  ) THEN
    CREATE POLICY contact_submissions_insert_anyone
      ON public.contact_submissions
      FOR INSERT
      TO anon, authenticated
      WITH CHECK (true);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'contact_submissions'
      AND policyname = 'contact_submissions_service_all'
  ) THEN
    CREATE POLICY contact_submissions_service_all
      ON public.contact_submissions
      FOR ALL
      TO service_role
      USING (true)
      WITH CHECK (true);
  END IF;
END $$;
