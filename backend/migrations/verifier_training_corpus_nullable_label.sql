-- verifier_training_corpus_nullable_label.sql
--
-- Make the `label` column nullable so we can stage triples that are
-- pending OAuth-judge labeling (label_source='pending_oauth_judge'),
-- then back-fill them once the judge has run.
--
-- Companion to ip-1-verifier-gated-cascade.md Section 2 and
-- validation-oauth-judge.md "Schema amendment (prerequisite migration)".
--
-- Reversible: every existing row had label IN (0, 1); allowing NULL is
-- additive and does not invalidate any prior data.
--
-- Apply via Supabase MCP (apply_migration) once founder has approved
-- the OAuth-judge validation pass.

ALTER TABLE verifier_training_corpus ALTER COLUMN label DROP NOT NULL;

ALTER TABLE verifier_training_corpus
  DROP CONSTRAINT IF EXISTS verifier_training_corpus_label_check;

ALTER TABLE verifier_training_corpus
  ADD CONSTRAINT verifier_training_corpus_label_check
  CHECK (label IS NULL OR label IN (0, 1));

-- Partial index for the pending-judge query the validation runner issues:
--   WHERE label IS NULL AND label_source='pending_oauth_judge'
--   ORDER BY created_at
-- Keeps the index small (only pending rows) and lets ORDER BY created_at
-- skip a sort once we add it to the column list.
CREATE INDEX IF NOT EXISTS vtc_pending_idx
  ON verifier_training_corpus (label_source, label)
  WHERE label IS NULL;
