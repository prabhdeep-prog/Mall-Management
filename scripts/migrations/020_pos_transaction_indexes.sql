-- Migration 020: Additional indexes on pos_transactions for query performance
-- ─────────────────────────────────────────────────────────────────────────────
-- idx_pos_integration_id  — speeds up per-integration transaction lookups
--                           (fetchDailySales, aggregate queries)
-- idx_external_id         — speeds up dedup lookups by external provider ID

BEGIN;

CREATE INDEX IF NOT EXISTS idx_pos_integration_id
  ON pos_transactions (pos_integration_id);

CREATE INDEX IF NOT EXISTS idx_external_id
  ON pos_transactions (external_id);

COMMIT;
