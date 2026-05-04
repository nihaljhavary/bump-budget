-- ─────────────────────────────────────────────────────────────────────────────
-- BumpBudget — Phase 3 schema additions
-- Run this in Supabase SQL Editor AFTER supabase-schema-v2.sql
-- ─────────────────────────────────────────────────────────────────────────────

-- ── Add subscription fields to profiles ──────────────────────────────────────
alter table profiles
  add column if not exists subscription_status text default 'free',  -- 'free' | 'active' | 'cancelled'
  add column if not exists subscription_tier   text default null;     -- null | 'budget_coach'

-- ── Claude usage tracking ─────────────────────────────────────────────────────
create table if not exists claude_usage (
  user_id    uuid  references profiles(id) on delete cascade,
  month      text  not null,   -- format: 'YYYY-MM'
  call_count int   not null default 0,
  primary key (user_id, month)
);

alter table claude_usage enable row level security;

-- Users can read their own usage (for display purposes)
create policy "users read own claude usage"
  on claude_usage for select
  using (auth.uid() = user_id);

-- Service role handles inserts/updates (via Netlify functions using SUPABASE_SERVICE_KEY)
-- No insert/update policy needed for anon/authenticated roles
