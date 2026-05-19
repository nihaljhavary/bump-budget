-- Operational tables migration (2026-05-19, v2 — safe re-run)
-- Run in Supabase SQL editor. All statements are idempotent.
--
-- Handles the case where error_logs already exists from a prior attempt
-- but is missing the observe.js columns (severity, domain, message, metadata).
-- Uses ADD COLUMN IF NOT EXISTS for all new columns so it is safe to re-run.
--
-- Creates / patches:
--   error_logs       — structured application error/warn events from observe.js + ErrorBoundary
--   support_requests — user-submitted support tickets from the Support tab
--
-- RLS:
--   error_logs:       users can INSERT own rows; nobody can SELECT (admin uses service role)
--   support_requests: users can INSERT + SELECT own rows; admin uses service role for all

-- ── error_logs ────────────────────────────────────────────────────────────────

-- Create if it doesn't exist at all (minimal base schema)
CREATE TABLE IF NOT EXISTS error_logs (
  id         UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id    UUID        REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Add every column with IF NOT EXISTS so re-runs are safe
ALTER TABLE error_logs ADD COLUMN IF NOT EXISTS severity      TEXT        NOT NULL DEFAULT 'error';
ALTER TABLE error_logs ADD COLUMN IF NOT EXISTS domain        TEXT;
ALTER TABLE error_logs ADD COLUMN IF NOT EXISTS message       TEXT;
ALTER TABLE error_logs ADD COLUMN IF NOT EXISTS metadata      JSONB;
-- Legacy columns written by ErrorBoundary (kept for compatibility)
ALTER TABLE error_logs ADD COLUMN IF NOT EXISTS error_message TEXT;
ALTER TABLE error_logs ADD COLUMN IF NOT EXISTS stack_trace   TEXT;
ALTER TABLE error_logs ADD COLUMN IF NOT EXISTS url           TEXT;

-- Indexes
CREATE INDEX IF NOT EXISTS idx_error_logs_created_at
  ON error_logs(created_at DESC);

CREATE INDEX IF NOT EXISTS idx_error_logs_user_severity
  ON error_logs(user_id, severity, created_at DESC);

-- RLS
ALTER TABLE error_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can insert own error logs" ON error_logs;
CREATE POLICY "Users can insert own error logs"
  ON error_logs FOR INSERT
  WITH CHECK (user_id = auth.uid() OR user_id IS NULL);

-- No SELECT policy for regular users — admin reads via service role (bypasses RLS)

-- ── support_requests ──────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS support_requests (
  id         UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id    UUID        REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE support_requests ADD COLUMN IF NOT EXISTS email     TEXT;
ALTER TABLE support_requests ADD COLUMN IF NOT EXISTS full_name TEXT;
ALTER TABLE support_requests ADD COLUMN IF NOT EXISTS category  TEXT NOT NULL DEFAULT 'Other';
ALTER TABLE support_requests ADD COLUMN IF NOT EXISTS message   TEXT NOT NULL DEFAULT '';
ALTER TABLE support_requests ADD COLUMN IF NOT EXISTS status    TEXT NOT NULL DEFAULT 'open';

-- Indexes
CREATE INDEX IF NOT EXISTS idx_support_requests_created_at
  ON support_requests(created_at DESC);

CREATE INDEX IF NOT EXISTS idx_support_requests_status
  ON support_requests(status, created_at DESC);

-- RLS
ALTER TABLE support_requests ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can insert own support requests" ON support_requests;
CREATE POLICY "Users can insert own support requests"
  ON support_requests FOR INSERT
  WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "Users can select own support requests" ON support_requests;
CREATE POLICY "Users can select own support requests"
  ON support_requests FOR SELECT
  USING (user_id = auth.uid());

-- Verify:
-- SELECT column_name, data_type FROM information_schema.columns WHERE table_name = 'error_logs' ORDER BY ordinal_position;
-- SELECT column_name, data_type FROM information_schema.columns WHERE table_name = 'support_requests' ORDER BY ordinal_position;
