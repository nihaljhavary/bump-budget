-- Migration: Add upload tracking columns to transactions table
-- Run this in the Supabase SQL editor (Dashboard > SQL editor > New query)
-- All columns are nullable to preserve backwards compatibility with existing rows.

-- Bank detected at import time ('fnb', 'nedbank', 'absa', 'standard', 'capitec',
-- 'discovery', 'tyme', 'investec', 'generic'). Null for manually added transactions.
ALTER TABLE transactions
  ADD COLUMN IF NOT EXISTS detected_bank TEXT;

-- Original raw bank statement description before any normalisation.
-- Used for merchant intelligence and dedup fingerprinting.
ALTER TABLE transactions
  ADD COLUMN IF NOT EXISTS raw_merchant TEXT;

-- Deduplication fingerprint (hash of date + amount + raw description).
-- Prevents double-import of the same transaction.
ALTER TABLE transactions
  ADD COLUMN IF NOT EXISTS transaction_hash TEXT;

-- Groups all transactions from a single upload together.
-- Used by manage-uploads.js to list and delete upload batches.
ALTER TABLE transactions
  ADD COLUMN IF NOT EXISTS import_batch_id UUID;

-- Optional index for batch lookups (speeds up manage-uploads list queries).
CREATE INDEX IF NOT EXISTS idx_transactions_import_batch_id
  ON transactions(user_id, import_batch_id)
  WHERE import_batch_id IS NOT NULL;

-- Verify the columns exist (optional: run this to check after migration)
-- SELECT column_name FROM information_schema.columns
-- WHERE table_name = 'transactions'
-- AND column_name IN ('detected_bank', 'raw_merchant', 'transaction_hash', 'import_batch_id');
