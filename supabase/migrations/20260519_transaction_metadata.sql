-- Transaction metadata enrichment (2026-05-19)
-- Adds lightweight recurring/fixed-cost metadata columns to transactions.
-- These columns ENRICH existing transactions — they do NOT change categories.
-- All values are nullable (NULL = not yet computed, not "false").
-- The existing category, analytics, ledger, and recurring detection systems
-- remain the canonical sources of financial truth.
--
-- Run in Supabase SQL editor. All statements use IF NOT EXISTS — safe to re-run.

-- ── is_recurring ──────────────────────────────────────────────────────────────
-- TRUE  = transaction was detected as part of a recurring pattern
--         (same merchant appearing in 2+ months with consistent amount)
-- FALSE = explicitly flagged as non-recurring (future use)
-- NULL  = not yet analysed (default for all existing rows)
ALTER TABLE transactions ADD COLUMN IF NOT EXISTS is_recurring BOOLEAN DEFAULT NULL;

-- ── fixed_obligation ──────────────────────────────────────────────────────────
-- TRUE  = transaction is a fixed financial obligation (rent, insurance, gym, medical aid,
--         internet, school fees, debit orders — categories: Housing, Insurance, Subscriptions,
--         Utilities, Education, Fees & Charges)
-- FALSE = explicitly flagged as non-fixed (future use)
-- NULL  = not yet classified (default for all existing rows)
ALTER TABLE transactions ADD COLUMN IF NOT EXISTS fixed_obligation BOOLEAN DEFAULT NULL;

-- ── Indexes for analytics queries ────────────────────────────────────────────
-- Allows efficient filtering of recurring or fixed transactions for AI context
-- and behavioural analysis without full table scans.
CREATE INDEX IF NOT EXISTS idx_transactions_is_recurring
  ON transactions(user_id, is_recurring)
  WHERE is_recurring IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_transactions_fixed_obligation
  ON transactions(user_id, fixed_obligation)
  WHERE fixed_obligation IS NOT NULL;

-- ── RLS ───────────────────────────────────────────────────────────────────────
-- No new RLS policies needed — transactions already has user-scoped RLS.
-- Users can read/write their own rows. New columns inherit existing policies.

-- ── Verify ───────────────────────────────────────────────────────────────────
-- SELECT column_name, data_type, column_default
--   FROM information_schema.columns
--  WHERE table_name = 'transactions'
--    AND column_name IN ('is_recurring', 'fixed_obligation')
--  ORDER BY column_name;
