-- ============================================================
-- Migration 012: CAM Allocation Engine
-- ============================================================
-- Common Area Maintenance cost pool + tenant-level allocations.
--   • cam_charges      – property-level expense pool per period
--   • cam_allocations  – tenant-level breakdown
--   • tenant_footfall  – daily footfall per tenant (for footfall-based allocation)
-- ============================================================

BEGIN;

-- ─── 1. CAM Charges (expense pool) ─────────────────────────────────────────

CREATE TABLE IF NOT EXISTS cam_charges (
  id                UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id   UUID          NOT NULL REFERENCES organizations(id),
  property_id       UUID          NOT NULL REFERENCES properties(id) ON DELETE CASCADE,
  period_start      DATE          NOT NULL,
  period_end        DATE          NOT NULL,
  category          TEXT          NOT NULL,  -- electricity, housekeeping, security, shared_utilities
  total_amount      NUMERIC(12,2) NOT NULL,
  allocation_method TEXT          NOT NULL DEFAULT 'per_sqft', -- per_sqft, equal, footfall
  status            TEXT          NOT NULL DEFAULT 'draft',    -- draft, allocated, invoiced
  created_by        UUID,
  created_at        TIMESTAMPTZ   NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_cam_charges_org      ON cam_charges(organization_id);
CREATE INDEX IF NOT EXISTS idx_cam_charges_property ON cam_charges(property_id);
CREATE INDEX IF NOT EXISTS idx_cam_charges_period   ON cam_charges(period_start, period_end);
CREATE INDEX IF NOT EXISTS idx_cam_charges_status   ON cam_charges(status);

-- ─── 2. CAM Allocations (tenant breakdown) ─────────────────────────────────

CREATE TABLE IF NOT EXISTS cam_allocations (
  id               UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  charge_id        UUID          NOT NULL REFERENCES cam_charges(id) ON DELETE CASCADE,
  tenant_id        UUID          NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  lease_id         UUID          REFERENCES leases(id) ON DELETE SET NULL,
  ratio            NUMERIC(8,4)  NOT NULL,
  allocated_amount NUMERIC(12,2) NOT NULL,
  created_at       TIMESTAMPTZ   NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_cam_alloc_charge ON cam_allocations(charge_id);
CREATE INDEX IF NOT EXISTS idx_cam_alloc_tenant ON cam_allocations(tenant_id);

-- ─── 3. Tenant Footfall (for footfall-based allocation) ────────────────────

CREATE TABLE IF NOT EXISTS tenant_footfall (
  id         UUID    PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id  UUID    NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  date       DATE    NOT NULL,
  footfall   INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_tenant_footfall_dedup
  ON tenant_footfall(tenant_id, date);

-- ─── 4. Grants ─────────────────────────────────────────────────────────────

GRANT SELECT, INSERT, UPDATE, DELETE ON cam_charges     TO app_user;
GRANT SELECT, INSERT, UPDATE, DELETE ON cam_charges     TO app_service;
GRANT SELECT, INSERT, UPDATE, DELETE ON cam_allocations TO app_user;
GRANT SELECT, INSERT, UPDATE, DELETE ON cam_allocations TO app_service;
GRANT SELECT, INSERT, UPDATE, DELETE ON tenant_footfall TO app_user;
GRANT SELECT, INSERT, UPDATE, DELETE ON tenant_footfall TO app_service;

-- Tenant portal: read-only on own allocations
GRANT SELECT ON cam_allocations TO app_tenant;

-- ─── 5. Enable RLS ────────────────────────────────────────────────────────

ALTER TABLE cam_charges     ENABLE ROW LEVEL SECURITY;
ALTER TABLE cam_allocations ENABLE ROW LEVEL SECURITY;
ALTER TABLE tenant_footfall ENABLE ROW LEVEL SECURITY;

-- ─── 6. RLS Policies ──────────────────────────────────────────────────────

-- cam_charges: organization isolation
CREATE POLICY cam_charges_org_isolation ON cam_charges
  FOR ALL
  USING (organization_id = current_setting('app.current_organization_id')::uuid)
  WITH CHECK (organization_id = current_setting('app.current_organization_id')::uuid);

-- cam_allocations: org isolation via charge → cam_charges.organization_id
CREATE POLICY cam_allocations_org_isolation ON cam_allocations
  FOR ALL
  USING (
    charge_id IN (
      SELECT id FROM cam_charges
      WHERE organization_id = current_setting('app.current_organization_id')::uuid
    )
  )
  WITH CHECK (
    charge_id IN (
      SELECT id FROM cam_charges
      WHERE organization_id = current_setting('app.current_organization_id')::uuid
    )
  );

-- cam_allocations: tenant portal read-only
CREATE POLICY cam_allocations_tenant_access ON cam_allocations
  FOR SELECT
  TO app_tenant
  USING (tenant_id = current_setting('app.current_tenant_id')::uuid);

-- tenant_footfall: org isolation via tenant → property → org
CREATE POLICY tenant_footfall_org_isolation ON tenant_footfall
  FOR ALL
  USING (
    tenant_id IN (
      SELECT t.id FROM tenants t
      JOIN properties p ON t.property_id = p.id
      WHERE p.organization_id = current_setting('app.current_organization_id')::uuid
    )
  )
  WITH CHECK (
    tenant_id IN (
      SELECT t.id FROM tenants t
      JOIN properties p ON t.property_id = p.id
      WHERE p.organization_id = current_setting('app.current_organization_id')::uuid
    )
  );

COMMIT;
