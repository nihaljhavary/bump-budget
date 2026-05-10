-- bump. — deduplicate public.transactions without requiring transaction_hash
-- Run in Supabase SQL Editor after a backup.
-- Keeps the row with the smallest id (uuid) in each duplicate group.
--
-- Matches the same idea as the app fingerprint: user + date + amount + normalised merchant text.
-- Uses coalesce(raw_merchant, name) when raw_merchant exists (v4+). If you get "raw_merchant does not exist",
-- use ONLY the block marked "MINIMAL SCHEMA" below (name only).

-- ── Standard (v4+ with raw_merchant column) ───────────────────────────────────
DELETE FROM public.transactions AS a
USING public.transactions AS b
WHERE a.user_id = b.user_id
  AND a.date = b.date
  AND a.amount = b.amount
  AND left(
    lower(regexp_replace(trim(coalesce(a.raw_merchant, a.name, '')), '\s+', ' ', 'g')),
    60
  ) = left(
    lower(regexp_replace(trim(coalesce(b.raw_merchant, b.name, '')), '\s+', ' ', 'g')),
    60
  )
  AND a.id > b.id;

-- ── MINIMAL SCHEMA (only if the DELETE above errors on raw_merchant): run this instead ──
-- DELETE FROM public.transactions AS a
-- USING public.transactions AS b
-- WHERE a.user_id = b.user_id
--   AND a.date = b.date
--   AND a.amount = b.amount
--   AND left(lower(regexp_replace(trim(coalesce(a.name, '')), '\s+', ' ', 'g')), 60)
--     = left(lower(regexp_replace(trim(coalesce(b.name, '')), '\s+', ' ', 'g')), 60)
--   AND a.id > b.id;

-- ── Optional: add transaction_hash + index (run supabase-schema-v7.sql in full) ─────────
-- After duplicates are gone, v7 backfill + unique index will work for future imports.

-- Read-only audit (optional):
-- SELECT user_id, date, amount,
--   left(lower(regexp_replace(trim(coalesce(raw_merchant, name, '')), '\s+', ' ', 'g')), 60) AS key,
--   count(*) AS n
-- FROM public.transactions
-- GROUP BY 1, 2, 3, 4
-- HAVING count(*) > 1
-- ORDER BY n DESC;
