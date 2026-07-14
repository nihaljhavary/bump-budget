-- Public booking contact & property details columns (2026-07-14)
-- Run in the Supabase SQL editor. Safe to re-run (IF NOT EXISTS everywhere).

ALTER TABLE bookings ADD COLUMN IF NOT EXISTS name    TEXT;
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS email   TEXT;
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS phone   TEXT;
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS details JSONB;

-- Public bookings have no authenticated user — user_id must be nullable.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'bookings' AND column_name = 'user_id' AND is_nullable = 'NO'
  ) THEN
    ALTER TABLE bookings ALTER COLUMN user_id DROP NOT NULL;
  END IF;
END $$;
