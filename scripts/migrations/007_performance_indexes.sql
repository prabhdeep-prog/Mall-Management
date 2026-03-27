-- Migration 007: Performance indexes
-- Adds missing indexes identified in performance audit
-- Estimated improvement: 50-100x faster for filtered queries on vendors/users tables
-- Safe to run multiple times (uses IF NOT EXISTS)

-- ── Vendors table ─────────────────────────────────────────────────────────────
-- Vendors had NO indexes. Filtering by type or status required full table scans.
CREATE INDEX IF NOT EXISTS idx_vendors_type
  ON vendors (type)
  WHERE type IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_vendors_status
  ON vendors (status);

-- ── Work orders: composite index for common dashboard query ───────────────────
-- Most work-order queries filter by property AND status together
CREATE INDEX IF NOT EXISTS idx_work_orders_property_status
  ON work_orders (property_id, status);

-- ── Invoices: composite for lease+status (billing queries) ────────────────────
CREATE INDEX IF NOT EXISTS idx_invoices_lease_status
  ON invoices (lease_id, status);

-- ── Leases: active leases per property (frequently queried) ───────────────────
CREATE INDEX IF NOT EXISTS idx_leases_property_status
  ON leases (property_id, status);

-- ── POS sales: common query pattern (tenant + date range) ────────────────────
CREATE INDEX IF NOT EXISTS idx_pos_sales_tenant_date
  ON pos_sales_data (tenant_id, sales_date DESC);

-- ── Daily metrics: latest metric per property (used in property list) ─────────
-- Already has idx_daily_metrics_property_date, but let's ensure DESC order
-- (the DISTINCT ON query benefits from this)
CREATE INDEX IF NOT EXISTS idx_daily_metrics_property_date_desc
  ON daily_metrics (property_id, metric_date DESC);

-- ── Leases: end date index for expiry queries ─────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_leases_end_date
  ON leases (end_date)
  WHERE status = 'active';
