-- Planning continuity + auth maturity migration (2026-05).
-- Safe to re-run: ADD COLUMN IF NOT EXISTS throughout.
-- No new tables, no new RLS policies -- inherits existing profiles row-level security.

-- planning_completed: canonical boolean indicating Smart Money Analysis was completed at least once.
-- Authoritative onboarding gate for Recommendations.jsx: if true, bypass "Start analysis" intro screen
-- even when planning_profile content fails to cross-device-sync.
-- Reset to FALSE only by explicit user "Start fresh" action. Never reset by uploads, refreshes, or nav.
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS planning_completed BOOLEAN DEFAULT FALSE;

-- has_password_set: tracks whether the user has set a real password credential.
-- Set to TRUE after a successful supabase.auth.updateUser({ password }) call.
-- Used by AccountCentre ProfileSection to decide whether to show "Set a password" prompt.
-- Magic-link-only users have this as FALSE until they create a password.
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS has_password_set BOOLEAN DEFAULT FALSE;

-- Back-fill: any profile that already has a planning_profile.result should be marked completed.
-- This heals existing users without requiring them to re-run analysis.
UPDATE profiles
SET planning_completed = TRUE
WHERE planning_profile IS NOT NULL
  AND planning_profile -> 'result' IS NOT NULL
  AND (planning_completed IS NULL OR planning_completed = FALSE);
