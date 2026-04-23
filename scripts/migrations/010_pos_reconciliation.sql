-- ============================================================
-- Migration 010: POS Reconciliation table
-- ============================================================
-- Tracks variance between POS-reported sales and invoiced
-- amounts per tenant/lease per billing period.
-- ============================================================

BEGIN;

CREATE TABLE pos_reconciliation (
  id              UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       UUID          REFERENCES tenants(id),
  lease_id        UUID          REFERENCES leases(id),
  organization_id UUID          REFERENCES organizations(id),
  period_start    DATE          NOT NULL,
  period_end      DATE          NOT NULL,
  pos_total       NUMERIC(12,2) NOT NULL,
  invoice_total   NUMERIC(12,2) NOT NULL,
  variance        NUMERIC(12,2) NOT NULL,
  status          TEXT          NOT NULL,   -- 'matched', 'variance_detected', 'resolved', 'pending'
  created_at      TIMESTAMPTZ   DEFAULT NOW()
);

-- ─── Indexes ─────────────────────────────────────────────────────────────────

CREATE INDEX idx_pos_recon_tenant_period
  ON pos_reconciliation (tenant_id, period_start, period_end);

CREATE INDEX idx_pos_recon_status
  ON pos_reconciliation (status);

-- ─── Row-level security ──────────────────────────────────────────────────────

ALTER TABLE pos_reconciliation ENABLE ROW LEVEL SECURITY;
ALTER TABLE pos_reconciliation FORCE ROW LEVEL SECURITY;

CREATE POLICY sel ON pos_reconciliation FOR SELECT TO app_user
  USING (organization_id = current_setting('app.current_organization_id')::uuid);

CREATE POLICY ins ON pos_reconciliation FOR INSERT TO app_user
  WITH CHECK (organization_id = current_setting('app.current_organization_id')::uuid);

CREATE POLICY upd ON pos_reconciliation FOR UPDATE TO app_user
  USING      (organization_id = current_setting('app.current_organization_id')::uuid)
  WITH CHECK (organization_id = current_setting('app.current_organization_id')::uuid);

COMMIT;
