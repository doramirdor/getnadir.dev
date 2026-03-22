-- Support tickets and ticket messages for customer support
-- Status flow: open → in_progress → resolved → closed

-- ── Tables ──────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS support_tickets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  subject TEXT NOT NULL,
  description TEXT NOT NULL,
  category TEXT NOT NULL DEFAULT 'other'
    CHECK (category IN ('billing', 'technical', 'feature_request', 'other')),
  status TEXT NOT NULL DEFAULT 'open'
    CHECK (status IN ('open', 'in_progress', 'resolved', 'closed')),
  priority TEXT NOT NULL DEFAULT 'medium'
    CHECK (priority IN ('low', 'medium', 'high')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS ticket_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_id UUID NOT NULL REFERENCES support_tickets(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  message TEXT NOT NULL,
  is_staff BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ── Indexes ─────────────────────────────────────────────────────────────

CREATE INDEX IF NOT EXISTS idx_support_tickets_user_status
  ON support_tickets (user_id, status);

CREATE INDEX IF NOT EXISTS idx_ticket_messages_ticket_id
  ON ticket_messages (ticket_id);

-- ── Auto-update updated_at trigger ──────────────────────────────────────

CREATE OR REPLACE FUNCTION update_support_ticket_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_support_tickets_updated_at ON support_tickets;
CREATE TRIGGER trg_support_tickets_updated_at
  BEFORE UPDATE ON support_tickets
  FOR EACH ROW
  EXECUTE FUNCTION update_support_ticket_updated_at();

-- ── RLS ─────────────────────────────────────────────────────────────────

ALTER TABLE support_tickets ENABLE ROW LEVEL SECURITY;
ALTER TABLE ticket_messages ENABLE ROW LEVEL SECURITY;

-- support_tickets: users can SELECT their own tickets
CREATE POLICY support_tickets_select ON support_tickets
  FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

-- support_tickets: users can INSERT their own tickets
CREATE POLICY support_tickets_insert ON support_tickets
  FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);

-- support_tickets: users can UPDATE their own tickets (e.g. close)
CREATE POLICY support_tickets_update ON support_tickets
  FOR UPDATE TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- support_tickets: service_role can do everything
CREATE POLICY support_tickets_service_all ON support_tickets
  FOR ALL TO service_role
  USING (true)
  WITH CHECK (true);

-- ticket_messages: users can SELECT messages on their own tickets
CREATE POLICY ticket_messages_select ON ticket_messages
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM support_tickets
      WHERE support_tickets.id = ticket_messages.ticket_id
        AND support_tickets.user_id = auth.uid()
    )
  );

-- ticket_messages: users can INSERT messages on their own tickets
CREATE POLICY ticket_messages_insert ON ticket_messages
  FOR INSERT TO authenticated
  WITH CHECK (
    auth.uid() = user_id
    AND EXISTS (
      SELECT 1 FROM support_tickets
      WHERE support_tickets.id = ticket_messages.ticket_id
        AND support_tickets.user_id = auth.uid()
    )
  );

-- ticket_messages: service_role can do everything
CREATE POLICY ticket_messages_service_all ON ticket_messages
  FOR ALL TO service_role
  USING (true)
  WITH CHECK (true);
