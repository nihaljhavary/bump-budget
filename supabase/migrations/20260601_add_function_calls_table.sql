-- bump. — supabase/migrations/20260601_add_function_calls_table.sql
--
-- Generic per-user per-function call log for rate limiting.
-- Used by: get-recommendations, scenario-interpret, recategorise-all, compare-groceries
--
-- Run in the Supabase SQL editor. Safe to re-run (IF NOT EXISTS).

CREATE TABLE IF NOT EXISTS function_calls (
  id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  function_name TEXT        NOT NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Index for efficient per-user per-function window queries
CREATE INDEX IF NOT EXISTS idx_function_calls_user_fn_time
  ON function_calls (user_id, function_name, created_at DESC);

-- RLS: users can INSERT their own rows only. No SELECT (admin reads via service role).
ALTER TABLE function_calls ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can insert own function_calls" ON function_calls;
CREATE POLICY "Users can insert own function_calls"
  ON function_calls FOR INSERT
  WITH CHECK (auth.uid() = user_id);
