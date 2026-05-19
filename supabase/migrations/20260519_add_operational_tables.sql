-- Operational tables migration (2026-05-19)
-- Run in Supabase SQL editor. All statements are idempotent (IF NOT EXISTS throughout).
--
-- Creates:
--   error_logs       — structured application error/warn events from observe.js + ErrorBoundary
--   support_requests — user-submitted support tickets from the Support tab
--
-- RLS:
--   error_logs:       users can INSERT own rows; nobody can SELECT (admin uses service role)
--   support_requests: users can INSERT + SELECT own rows; admin uses service role for all

-- ── error_logs ────────────────────────────────────────────────────────────────
-- Consolidated schema covering both observe.js (severity/domain/message/metadata)
-- and ErrorBoundary.jsx (error_message, stack_trace) patterns.
-- Old columns added as nullable so existing rows and both write paths are compatible.

CREATE TABLE IF NOT EXISTS error_logs (
  id            UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id       UUID        REFERENCES auth.users(id) ON DELETE SET NULL,
  severity      TEXT        NOT NULL DEFAULT 'error',   -- 'info' | 'warn' | 'error'
  domain        TEXT,                                    -- observe.js DOMAIN constant
  message       TEXT,                                    -- short human-readable summary (≤200 chars)
  metadata      JSONB,                                   -- full context object from observe.js
  -- Legacy columns written by ErrorBoundary.jsx (kept for compatibility):
  error_message TEXT,
  stack_trace   TEXT,
  url           TEXT,
  created_at    TIMESTAMPTZ DEFAULT NOW()
);

-- Index for admin dashboard queries (most-recent first, filter by severity/domain)
CREATE INDEX IF NOT EXISTS idx_error_logs_created_at
  ON error_logs(created_at DESC);

CREATE INDEX IF NOT EXISTS idx_error_logs_user_severity
  ON error_logs(user_id, severity, created_at DESC);

-- Enable RLS
ALTER TABLE error_logs ENABLE ROW LEVEL SECURITY;

-- Users can insert their own error logs (observe.js writes via anon client with session)
DROP POLICY IF EXISTS "Users can insert own error logs" ON error_logs;
CREATE POLICY "Users can insert own error logs"
  ON error_logs FOR INSERT
  WITH CHECK (user_id = auth.uid() OR user_id IS NULL);

-- No SELECT policy for regular users — admin reads via service role (bypasses RLS)

-- ── support_requests ──────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS support_requests (
  id          UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id     UUID        REFERENCES auth.users(id) ON DELETE SET NULL,
  email       TEXT,                              -- denormalized from auth.users for admin convenience
  full_name   TEXT,                              -- denormalized from profiles for admin convenience
  category    TEXT        NOT NULL,              -- 'Technical issue' | 'Billing' | 'Feature request' | 'Data / Privacy' | 'Other'
  message     TEXT        NOT NULL,
  status      TEXT        NOT NULL DEFAULT 'open', -- 'open' | 'in_progress' | 'resolved'
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

-- Index for admin dashboard queries
CREATE INDEX IF NOT EXISTS idx_support_requests_created_at
  ON support_requests(created_at DESC);

CREATE INDEX IF NOT EXISTS idx_support_requests_status
  ON support_requests(status, created_at DESC);

-- Enable RLS
ALTER TABLE support_requests ENABLE ROW LEVEL SECURITY;

-- Users can insert their own requests
DROP POLICY IF EXISTS "Users can insert own support requests" ON support_requests;
CREATE POLICY "Users can insert own support requests"
  ON support_requests FOR INSERT
  WITH CHECK (user_id = auth.uid());

-- Users can read their own requests (so they can see status)
DROP POLICY IF EXISTS "Users can select own support requests" ON support_requests;
CREATE POLICY "Users can select own support requests"
  ON support_requests FOR SELECT
  USING (user_id = auth.uid());

-- Verify (run these selects to confirm after migration):
-- SELECT COUNT(*) FROM error_logs;
-- SELECT COUNT(*) FROM support_requests;
-- SELECT column_name, data_type FROM information_schema.columns WHERE table_name = 'error_logs';
-- SELECT column_name, data_type FROM information_schema.columns WHERE table_name = 'support_requests';
