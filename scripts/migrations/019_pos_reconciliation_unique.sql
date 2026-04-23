-- Migration 019: Add UNIQUE constraint to pos_reconciliation
-- ─────────────────────────────────────────────────────────────────────────────
-- Required for the reconcile-pos cron to use ON CONFLICT DO UPDATE upsert
-- instead of plain INSERT (which creates duplicate rows for the same period).
--
-- Safe to run on existing data: removes duplicates first, keeping the latest
-- row per (tenant_id, period_start, period_end) by created_at DESC.

BEGIN;

-- 1. Remove duplicate rows, keeping the most recently created one per key
DELETE FROM pos_reconciliation
WHERE id NOT IN (
  SELECT DISTINCT ON (tenant_id, period_start, period_end) id
  FROM pos_reconciliation
  ORDER BY tenant_id, period_start, period_end, created_at DESC
);

-- 2. Add UNIQUE constraint (used for ON CONFLICT target in reconcileTenant)
ALTER TABLE pos_reconciliation
  ADD CONSTRAINT unique_recon_period
  UNIQUE (tenant_id, period_start, period_end);

-- 3. Add updated_at column if missing (the upsert sets updated_at = NOW())
ALTER TABLE pos_reconciliation
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

COMMIT;
