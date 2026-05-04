-- ─────────────────────────────────────────────────────────────────────────────
-- BumpBudget — Phase 1 & 2 schema additions
-- Run this in Supabase SQL Editor AFTER supabase-schema.sql
-- ─────────────────────────────────────────────────────────────────────────────

-- ── profiles ─────────────────────────────────────────────────────────────────
create table if not exists profiles (
  id          uuid references auth.users(id) on delete cascade primary key,
  role        text        not null default 'user',   -- 'user' | 'admin'
  full_name   text,
  created_at  timestamptz not null default now()
);

alter table profiles enable row level security;

create policy "users read own profile"
  on profiles for select
  using (auth.uid() = id);

create policy "users insert own profile"
  on profiles for insert
  with check (auth.uid() = id);

create policy "users update own profile"
  on profiles for update
  using (auth.uid() = id)
  with check (auth.uid() = id);


-- ── consultant_access ────────────────────────────────────────────────────────
create table if not exists consultant_access (
  id               uuid        default gen_random_uuid() primary key,
  user_id          uuid        not null references profiles(id) on delete cascade,
  requested_by     uuid        not null references profiles(id) on delete cascade,
  status           text        not null default 'pending', -- pending | approved | denied
  podcast_consent  boolean     not null default false,
  granted_at       timestamptz,
  created_at       timestamptz not null default now()
);

alter table consultant_access enable row level security;

-- Users can see requests aimed at them
create policy "users read own access requests"
  on consultant_access for select
  using (auth.uid() = user_id);

-- Users can approve / deny / set podcast_consent on their own requests
create policy "users update own access requests"
  on consultant_access for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);


-- ── bookings ─────────────────────────────────────────────────────────────────
create table if not exists bookings (
  id           uuid        default gen_random_uuid() primary key,
  user_id      uuid        not null references profiles(id) on delete cascade,
  tier         text        not null,
  amount       integer     not null,               -- cents (ZAR × 100)
  payment_ref  text        unique,
  status       text        not null default 'pending', -- pending | paid | completed
  scheduled_at timestamptz,
  notes        text,
  created_at   timestamptz not null default now()
);

alter table bookings enable row level security;

create policy "users read own bookings"
  on bookings for select
  using (auth.uid() = user_id);

create policy "users insert own bookings"
  on bookings for insert
  with check (auth.uid() = user_id);


-- ── Auto-create profile on sign-up ───────────────────────────────────────────
create or replace function handle_new_user()
returns trigger as $$
begin
  insert into profiles (id, role, full_name)
  values (
    new.id,
    case when new.email = 'nihal1995@gmail.com' then 'admin' else 'user' end,
    coalesce(
      new.raw_user_meta_data->>'full_name',
      split_part(new.email, '@', 1)
    )
  )
  on conflict (id) do nothing;
  return new;
end;
$$ language plpgsql security definer;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure handle_new_user();


-- ── Backfill profiles for existing users ─────────────────────────────────────
insert into profiles (id, role, full_name)
select
  id,
  case when email = 'nihal1995@gmail.com' then 'admin' else 'user' end,
  coalesce(
    raw_user_meta_data->>'full_name',
    split_part(email, '@', 1)
  )
from auth.users
on conflict (id) do nothing;
