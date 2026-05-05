-- ── Schema v4: Bulk Import + Categorization Rules ──────────────────────────

-- 1. Categorization rules (merchant pattern → category)
create table if not exists categorization_rules (
  id          uuid        default gen_random_uuid() primary key,
  user_id     uuid        references profiles(id) on delete cascade not null,
  merchant_pattern text   not null,          -- e.g. "engen", "woolworths"
  category    text        not null,           -- e.g. "Transport", "Groceries"
  created_at  timestamptz default now()
);

alter table categorization_rules enable row level security;

create policy "users manage own rules" on categorization_rules
  for all using (auth.uid() = user_id);

-- 2. Bank preference on profiles
alter table profiles
  add column if not exists preferred_bank text default null;

-- 3. Extra columns on transactions for bulk imports
alter table transactions
  add column if not exists raw_merchant   text default null,
  add column if not exists import_batch_id text default null;

-- 4. Unique constraint so upsert works (user_id + merchant_pattern must be unique)
alter table categorization_rules
  drop constraint if exists categorization_rules_user_merchant_unique;
alter table categorization_rules
  add constraint categorization_rules_user_merchant_unique unique (user_id, merchant_pattern);

-- 5. Index for fast rule lookups
create index if not exists idx_cat_rules_user on categorization_rules(user_id);

-- 5. User preferences (bank personalisation + other settings)
create table if not exists user_preferences (
  user_id       uuid references profiles(id) on delete cascade primary key,
  preferred_bank text default null,
  settings      jsonb default '{}'::jsonb,
  updated_at    timestamptz default now()
);

alter table user_preferences enable row level security;

create policy "users manage own preferences" on user_preferences
  for all using (auth.uid() = user_id);
