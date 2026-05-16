-- ── Schema v8: Usage Declaration, Error Logs, Profile Auto-Create Trigger ──
-- Run in Supabase SQL Editor after v7.
-- Safe to re-run: all statements use IF NOT EXISTS / OR REPLACE.

-- 1. Add usage_type to profiles (B1 — usage declaration during onboarding)
alter table profiles
  add column if not exists usage_type text
    check (usage_type in ('personal', 'household', 'side_hustle', 'sole_prop'));

-- 2. Add email column to profiles (used by AuthContext.ensureProfile)
alter table profiles
  add column if not exists email text;

-- 3. Add updated_at column to profiles (used by AuthContext.updateProfile)
alter table profiles
  add column if not exists updated_at timestamptz default now();

-- 4. Error logs table (B7 — ErrorBoundary logs uncaught client errors)
create table if not exists error_logs (
  id            uuid        default gen_random_uuid() primary key,
  user_id       uuid        references profiles(id) on delete set null,
  error_message text,
  stack_trace   text,
  url           text,
  created_at    timestamptz default now()
);

alter table error_logs enable row level security;

-- Anyone (including anonymous) can insert (errors happen before auth sometimes)
create policy if not exists "Anyone can log errors"
  on error_logs for insert
  with check (true);

-- Users can view their own error logs
create policy if not exists "Users can view own error logs"
  on error_logs for select
  using (auth.uid() = user_id);

-- Index for fast admin queries
create index if not exists idx_error_logs_created on error_logs(created_at desc);
create index if not exists idx_error_logs_user on error_logs(user_id) where user_id is not null;

-- 5. Auto-create profile row when a new user signs up via Supabase Auth
--    This ensures profile always exists after signUp/magic-link — even before
--    AuthContext.ensureProfile() runs on the client.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.profiles (id, email, created_at)
  values (new.id, new.email, now())
  on conflict (id) do nothing;
  return new;
end;
$$;

-- Drop and recreate trigger (idempotent)
drop trigger if exists on_auth_user_created on auth.users;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- 6. Ensure terms columns exist on profiles (may be missing on older DBs)
alter table profiles
  add column if not exists terms_accepted_at timestamptz,
  add column if not exists terms_version     text;

-- 7. Ensure subscription_tier alias column (analyse.js reads this)
--    The frontend uses subscription_plan; the function uses subscription_tier.
--    Keep both: add subscription_tier if missing and sync via trigger.
alter table profiles
  add column if not exists subscription_tier text;

-- One-time backfill: sync subscription_plan -> subscription_tier for existing rows
update profiles
set subscription_tier = subscription_plan
where subscription_tier is null and subscription_plan is not null;

-- 8. Index on usage_type for admin queries
create index if not exists idx_profiles_usage_type on profiles(usage_type) where usage_type is not null;

-- 9. Grant error_logs insert to anon role (for pre-auth errors)
grant insert on error_logs to anon;
grant insert on error_logs to authenticated;
