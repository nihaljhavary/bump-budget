-- Security hardening migration (2026-05-19)
-- Adds: consent_records, support_chat_usage, profiles.privacy_version
-- All statements are idempotent (safe to re-run).
--
-- Run in Supabase SQL editor.

-- ── profiles: privacy_version column ─────────────────────────────────────────
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS privacy_version TEXT;

-- ── consent_records ───────────────────────────────────────────────────────────
-- Immutable audit trail of every T&C / Privacy Policy acceptance event.
-- Written on signup terms-accept and every re-acceptance after policy updates.
--
-- RLS: users can INSERT own rows; nobody can SELECT or UPDATE via anon key.
-- Admin reads via service role (bypasses RLS).

CREATE TABLE IF NOT EXISTS consent_records (
  id               UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id          UUID        REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at       TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE consent_records ADD COLUMN IF NOT EXISTS email          TEXT;
ALTER TABLE consent_records ADD COLUMN IF NOT EXISTS terms_version  TEXT NOT NULL DEFAULT '';
ALTER TABLE consent_records ADD COLUMN IF NOT EXISTS privacy_version TEXT NOT NULL DEFAULT '';
ALTER TABLE consent_records ADD COLUMN IF NOT EXISTS accepted_at    TIMESTAMPTZ NOT NULL DEFAULT NOW();
ALTER TABLE consent_records ADD COLUMN IF NOT EXISTS user_agent     TEXT;
ALTER TABLE consent_records ADD COLUMN IF NOT EXISTS action         TEXT NOT NULL DEFAULT 'accept';
-- action values: 'accept' (initial), 're_accept' (after policy update)

-- Indexes
CREATE INDEX IF NOT EXISTS idx_consent_records_user_id
  ON consent_records(user_id, accepted_at DESC);

CREATE INDEX IF NOT EXISTS idx_consent_records_terms_version
  ON consent_records(terms_version, accepted_at DESC);

-- RLS
ALTER TABLE consent_records ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can insert own consent records" ON consent_records;
CREATE POLICY "Users can insert own consent records"
  ON consent_records FOR INSERT
  WITH CHECK (user_id = auth.uid());

-- No SELECT policy for regular users — admin reads via service role

-- ── support_chat_usage ────────────────────────────────────────────────────────
-- Rate-limiting table for support-chat.js endpoint.
-- One row per message sent. COUNT in last 24h to enforce per-day limit.
--
-- RLS: users can INSERT own rows; nobody can SELECT via anon key.

CREATE TABLE IF NOT EXISTS support_chat_usage (
  id         UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id    UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Index for the COUNT(..) WHERE user_id = ? AND created_at > ? query
CREATE INDEX IF NOT EXISTS idx_support_chat_usage_user_created
  ON support_chat_usage(user_id, created_at DESC);

-- RLS
ALTER TABLE support_chat_usage ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can insert own chat usage" ON support_chat_usage;
CREATE POLICY "Users can insert own chat usage"
  ON support_chat_usage FOR INSERT
  WITH CHECK (user_id = auth.uid());

-- No SELECT policy for regular users — admin reads via service role

-- Verify:
-- SELECT column_name, data_type FROM information_schema.columns WHERE table_name = 'consent_records' ORDER BY ordinal_position;
-- SELECT column_name, data_type FROM information_schema.columns WHERE table_name = 'support_chat_usage' ORDER BY ordinal_position;
-- SELECT column_name, data_type FROM information_schema.columns WHERE table_name = 'profiles' AND column_name = 'privacy_version';
