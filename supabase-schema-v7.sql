-- Run this in Supabase SQL editor after v6.
-- Adds import fingerprints so repeated statement uploads cannot duplicate rows.

alter table transactions
  add column if not exists transaction_hash text;

-- Backfill only one canonical row for each historical fingerprint.
-- Existing duplicate rows are intentionally left with null transaction_hash so
-- this migration does not delete user data or fail while creating the unique index.
with hashed as (
  select
    id,
    coalesce(date::text, '') || '|' ||
    coalesce(
      nullif(
        trim(trailing '.' from trim(trailing '0' from round(amount::numeric, 2)::text)),
        ''
      ),
      '0'
    ) || '|' ||
    left(
      lower(regexp_replace(trim(coalesce(raw_merchant, name, '')), '\s+', ' ', 'g')),
      60
    ) as fingerprint,
    row_number() over (
      partition by
        user_id,
        coalesce(date::text, '') || '|' ||
        coalesce(
          nullif(
            trim(trailing '.' from trim(trailing '0' from round(amount::numeric, 2)::text)),
            ''
          ),
          '0'
        ) || '|' ||
        left(
          lower(regexp_replace(trim(coalesce(raw_merchant, name, '')), '\s+', ' ', 'g')),
          60
        )
      order by created_at asc, id asc
    ) as rn
  from transactions
  where transaction_hash is null
)
update transactions t
set transaction_hash = hashed.fingerprint
from hashed
where t.id = hashed.id
  and hashed.rn = 1;

create unique index if not exists transactions_user_transaction_hash_unique
  on transactions(user_id, transaction_hash)
  where transaction_hash is not null;

create index if not exists transactions_import_batch
  on transactions(user_id, import_batch_id)
  where import_batch_id is not null;

-- Optional duplicate audit before manual cleanup:
-- select user_id, date, amount, coalesce(raw_merchant, name) as merchant, count(*)
-- from transactions
-- group by user_id, date, amount, coalesce(raw_merchant, name)
-- having count(*) > 1
-- order by count(*) desc, date desc;
