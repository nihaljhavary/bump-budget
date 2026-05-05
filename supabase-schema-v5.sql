-- ── Schema v5: Subscription tiers, T&C acceptance, admin flag ────────────────
-- Run in Supabase SQL Editor after v4

-- 1. Add new columns to profiles
alter table profiles
  add column if not exists subscription_plan   text        not null default 'free',
  add column if not exists subscription_status text        not null default 'active',
  add column if not exists paystack_sub_code   text        default null,
  add column if not exists paystack_cust_code  text        default null,
  add column if not exists next_billing_date   timestamptz default null,
  add column if not exists is_admin            boolean     not null default false,
  add column if not exists terms_accepted_at   timestamptz default null,
  add column if not exists terms_version       text        default null,
  add column if not exists free_consult_used   boolean     not null default false;

-- 2. Subscription events audit log (every Paystack webhook event recorded)
create table if not exists subscription_events (
  id            uuid        default gen_random_uuid() primary key,
  user_id       uuid        references profiles(id) on delete cascade,
  event_type    text        not null,  -- 'subscribed' | 'renewed' | 'payment_failed' | 'cancelled' | 'downgraded'
  plan          text,
  paystack_ref  text,
  amount        integer,               -- cents (ZAR × 100)
  raw_payload   jsonb,
  created_at    timestamptz default now()
);

alter table subscription_events enable row level security;

-- Only service key (admin client) writes to this; no user-facing policy needed
-- Admins can read via admin client directly

-- 3. Indexes
create index if not exists idx_profiles_plan  on profiles(subscription_plan);
create index if not exists idx_profiles_admin on profiles(is_admin) where is_admin = true;
create index if not exists idx_sub_events_user on subscription_events(user_id);

-- 4. Set your admin account (replace with your actual auth user ID from Supabase → Auth → Users)
-- update profiles set is_admin = true where id = 'YOUR-USER-UUID-HERE';
