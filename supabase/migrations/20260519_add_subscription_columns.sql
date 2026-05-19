-- Subscription & tier lifecycle columns for profiles (2026-05-19)
--
-- These columns are referenced throughout the codebase (TierContext, manage-subscription.js,
-- paystack-webhook.js, admin-data.js, create-subscription.js) but were never captured in a
-- migration file. This migration makes the schema reproducible on fresh environments.
--
-- All statements use ADD COLUMN IF NOT EXISTS — safe to run on an existing database
-- where some or all columns already exist.
--
-- Run in Supabase SQL editor.

-- ── Core plan / status ────────────────────────────────────────────────────────
-- subscription_plan:   'free' | 'starter' | 'growth' | 'pro'
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS subscription_plan   TEXT DEFAULT 'free';
-- subscription_status: 'free' | 'trialing' | 'active' | 'cancelled' | 'payment_failed'
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS subscription_status TEXT DEFAULT 'active';

-- ── Paystack identifiers ──────────────────────────────────────────────────────
-- Written by create-subscription.js / paystack-webhook.js; cleared by revoke_tier.
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS paystack_sub_code  TEXT;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS paystack_cust_code TEXT;

-- ── Billing cycle dates ───────────────────────────────────────────────────────
-- Written by paystack-webhook.js on charge.success events.
-- Read by TierContext to display renewal / end dates in AccountCentre.
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS billing_cycle_start  TIMESTAMPTZ;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS billing_cycle_end    TIMESTAMPTZ;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS next_billing_date    TIMESTAMPTZ;

-- ── Cancellation / downgrade lifecycle ───────────────────────────────────────
-- cancel_at_period_end: TRUE = access continues until billing_cycle_end then drops to free
-- scheduled_plan:       plan to apply when Paystack fires subscription.disable webhook
--                       (non-null means a downgrade is pending, not a full cancel)
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS cancel_at_period_end BOOLEAN DEFAULT FALSE;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS scheduled_plan       TEXT;

-- ── Admin flag (belt-and-suspenders — likely already exists) ──────────────────
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS is_admin BOOLEAN DEFAULT FALSE;

-- ── Indexes for common queries ────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_profiles_subscription_plan
  ON public.profiles (subscription_plan);

CREATE INDEX IF NOT EXISTS idx_profiles_subscription_status
  ON public.profiles (subscription_status);

CREATE INDEX IF NOT EXISTS idx_profiles_cancel_at_period_end
  ON public.profiles (cancel_at_period_end)
  WHERE cancel_at_period_end = TRUE;

-- ── Verify ───────────────────────────────────────────────────────────────────
-- SELECT column_name, data_type, column_default
--   FROM information_schema.columns
--  WHERE table_name = 'profiles'
--    AND column_name IN (
--      'subscription_plan','subscription_status',
--      'paystack_sub_code','paystack_cust_code',
--      'billing_cycle_start','billing_cycle_end','next_billing_date',
--      'cancel_at_period_end','scheduled_plan','is_admin'
--    )
--  ORDER BY column_name;
