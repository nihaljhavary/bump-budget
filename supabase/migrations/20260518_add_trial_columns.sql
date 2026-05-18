-- Add trial lifecycle columns to profiles
-- Run in Supabase SQL editor. All ADD COLUMN IF NOT EXISTS — safe to re-run.
--
-- trial_ends_at: set by create-subscription.js when a user starts a 30-day free trial.
--   Cleared by paystack-webhook.js when the first real charge fires (trialing → active).
-- subscription_status values: 'free' | 'trialing' | 'active' | 'cancelled' |
--   'payment_failed' | 'downgrade_pending'

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS trial_ends_at TIMESTAMPTZ;

-- Index for admin queries (find trials expiring soon)
CREATE INDEX IF NOT EXISTS idx_profiles_trial_ends_at
  ON public.profiles (trial_ends_at)
  WHERE trial_ends_at IS NOT NULL;
