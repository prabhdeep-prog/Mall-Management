-- ============================================================
-- Migration 015: Security Hardening
-- ============================================================
-- • audit_logs table for financial operation tracking
-- • Missing indexes on high-traffic columns
-- • RLS on audit_logs (append-only)
-- ============================================================

BEGIN;

-- ─── 1. Audit Logs ────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS audit_logs (
  id               UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id  UUID          NOT NULL REFERENCES organizations(id),
  action           TEXT          NOT NULL,  -- invoice_created, payment_recorded, cam_allocated, etc.
  entity           TEXT          NOT NULL,  -- invoice, payment, cam_charge, lease, etc.
  entity_id        TEXT          NOT NULL,
  before_data      JSONB,
  after_data       JSONB,
  user_id          TEXT,
  ip_address       TEXT,
  created_at       TIMESTAMPTZ   NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_audit_logs_org      ON audit_logs(organization_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_entity   ON audit_logs(entity, entity_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_created  ON audit_logs(created_at);

-- Grants: insert-only for app_user, read for auditors
GRANT INSERT, SELECT ON audit_logs TO app_user;
GRANT INSERT, SELECT ON audit_logs TO app_service;

-- Enable RLS
ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;

-- Organization isolation (read + insert only)
CREATE POLICY audit_logs_org_isolation ON audit_logs
  FOR ALL
  USING (organization_id = current_setting('app.current_organization_id')::uuid)
  WITH CHECK (organization_id = current_setting('app.current_organization_id')::uuid);

-- ─── 2. Missing Indexes ───────────────────────────────────────────────────

-- Composite index for common lease query pattern
CREATE INDEX IF NOT EXISTS idx_leases_property_status
  ON leases(property_id, status);

-- cam_allocations: missing lease_id index
CREATE INDEX IF NOT EXISTS idx_cam_alloc_lease
  ON cam_allocations(lease_id);

COMMIT;
