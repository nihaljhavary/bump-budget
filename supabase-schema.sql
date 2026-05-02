-- Run this in your Supabase SQL editor (Database > SQL Editor > New query)

-- Transactions table
create table if not exists transactions (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references auth.users(id) on delete cascade not null,
  name text not null,
  amount numeric not null,
  category text not null,
  date date default current_date not null,
  created_at timestamptz default now() not null
);

-- Budgets table (per user, per category, per month)
create table if not exists budgets (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references auth.users(id) on delete cascade not null,
  category text not null,
  amount numeric not null,
  month date not null,
  created_at timestamptz default now() not null,
  unique(user_id, category, month)
);

-- Row level security — users only ever see their own data
alter table transactions enable row level security;
alter table budgets enable row level security;

create policy "users own their transactions"
  on transactions for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "users own their budgets"
  on budgets for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- Index for fast monthly queries
create index if not exists transactions_user_date
  on transactions(user_id, date desc);
