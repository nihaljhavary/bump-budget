-- ── Schema v6: Onboarding, Budgets (with month), Grocery Comparison, Budget Chat ──
-- Run in Supabase SQL Editor after v5

-- 1. Add onboarding columns to profiles
alter table profiles
  add column if not exists full_name              text,
  add column if not exists gross_income           int,        -- monthly, ZAR cents
  add column if not exists net_income             int,        -- monthly, ZAR cents
  add column if not exists monthly_debit_orders   int,        -- ZAR cents
  add column if not exists savings_goal           int,        -- monthly, ZAR cents
  add column if not exists bank                   text,       -- FNB/Nedbank/ABSA/Capitec/Standard Bank/Discovery Bank/TymeBank
  add column if not exists has_discovery_vitality boolean     default false,
  add column if not exists vitality_cashback_pct  int         default 0,
  add column if not exists onboarding_complete    boolean     default false;

-- 2. Budgets table (supports per-month budgets; also backward-compatible with existing amount column)
create table if not exists budgets (
  id             uuid        default gen_random_uuid() primary key,
  user_id        uuid        references profiles(id) on delete cascade,
  category       text        not null,
  amount         int         not null default 0,   -- ZAR cents (legacy / default budget)
  monthly_amount int,                               -- ZAR cents (per-month override)
  month          text,                              -- 'YYYY-MM' (null = default/evergreen)
  created_at     timestamptz default now(),
  updated_at     timestamptz default now(),
  unique(user_id, category)  -- legacy unique constraint
);

-- Drop legacy constraint if it exists and re-add a more flexible one
-- (safe to run multiple times)
do $$
begin
  -- Add a partial unique index for monthly budgets
  execute 'create unique index if not exists budgets_user_cat_month_idx
    on budgets(user_id, category, month) where month is not null';
exception when others then null;
end $$;

alter table budgets enable row level security;

create policy if not exists "Users can manage their own budgets"
  on budgets for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- 3. Budget chat usage (rate limiting for free tier)
create table if not exists budget_chat_usage (
  id               uuid        default gen_random_uuid() primary key,
  user_id          uuid        references profiles(id) on delete cascade,
  question_preview text,
  created_at       timestamptz default now()
);

alter table budget_chat_usage enable row level security;

create policy if not exists "Users can view their own chat usage"
  on budget_chat_usage for select
  using (auth.uid() = user_id);

-- Service role inserts (from Netlify function)
create policy if not exists "Service role can insert chat usage"
  on budget_chat_usage for insert
  with check (true);

-- Index for fast monthly count queries
create index if not exists idx_chat_usage_user_date
  on budget_chat_usage(user_id, created_at);

-- 4. Indexes for performance
create index if not exists idx_budgets_user    on budgets(user_id);
create index if not exists idx_profiles_bank   on profiles(bank) where bank is not null;
create index if not exists idx_profiles_onboarding on profiles(onboarding_complete);
