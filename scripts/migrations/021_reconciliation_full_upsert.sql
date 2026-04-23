-- Migration 021: Fix reconciliation upsert — update all financial fields on conflict
-- ─────────────────────────────────────────────────────────────────────────────
-- Prior upsert only updated: variance, updated_at
-- This caused:
--   • flagged records never transitioning to matched
--   • adjustment invoices created on every 5-minute cron run for the same period
--
-- Changes:
--   1. Add updated_at column (required by the full upsert SET clause)
--   2. Backfill existing rows so updated_at is not null
--   3. Remove any duplicate adjustment invoices created by the old buggy engine
--      (keep the earliest one per lease+period, void the rest)

BEGIN;

-- 1. Add updated_at if not already present
ALTER TABLE pos_reconciliation
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

-- 2. Backfill to created_at for existing rows that have null updated_at
UPDATE pos_reconciliation
   SET updated_at = created_at
 WHERE updated_at IS NULL;

-- 3. Void duplicate adjustment invoices produced by the buggy engine.
--    For each (lease_id, period_start, period_end) group, keep the oldest
--    adjustment invoice (MIN id by created_at) and void all others.
WITH ranked AS (
  SELECT
    id,
    ROW_NUMBER() OVER (
      PARTITION BY lease_id, period_start, period_end
      ORDER BY created_at ASC
    ) AS rn
  FROM invoices
  WHERE invoice_type = 'adjustment'
)
UPDATE invoices
   SET status = 'voided',
       notes  = CONCAT(COALESCE(notes, ''), ' [voided: duplicate from reconciliation bug]')
 WHERE id IN (
   SELECT id FROM ranked WHERE rn > 1
 );

COMMIT;
