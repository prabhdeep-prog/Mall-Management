-- ============================================================================
-- Migration 023: Tenant Onboarding Workflow
-- ============================================================================

-- ── Extend tenants table ─────────────────────────────────────────────────────

ALTER TABLE tenants
  ADD COLUMN IF NOT EXISTS onboarding_status      VARCHAR(50)  DEFAULT 'LEAD_CREATED',
  ADD COLUMN IF NOT EXISTS onboarding_started_at  TIMESTAMP,
  ADD COLUMN IF NOT EXISTS onboarding_completed_at TIMESTAMP,
  ADD COLUMN IF NOT EXISTS target_opening_date    DATE,
  ADD COLUMN IF NOT EXISTS brand_name             VARCHAR(255),
  ADD COLUMN IF NOT EXISTS emergency_contact      JSONB        DEFAULT '{}';

-- Index for onboarding pipeline queries
CREATE INDEX IF NOT EXISTS idx_tenants_onboarding_status
  ON tenants(onboarding_status)
  WHERE onboarding_status IS NOT NULL AND onboarding_status != 'ACTIVE';

-- ── Onboarding checklist ─────────────────────────────────────────────────────
-- Tracks per-tenant document / task completion items

CREATE TABLE IF NOT EXISTS tenant_onboarding_checklist (
  id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     UUID        NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  item          VARCHAR(100) NOT NULL,   -- machine key: 'gst_certificate', 'pan_card', …
  label         VARCHAR(255) NOT NULL,   -- human label
  required      BOOLEAN     NOT NULL DEFAULT true,
  completed     BOOLEAN     NOT NULL DEFAULT false,
  completed_at  TIMESTAMP,
  completed_by  UUID,                   -- user id who marked it done
  document_id   UUID        REFERENCES documents(id) ON DELETE SET NULL,
  metadata      JSONB       DEFAULT '{}',
  created_at    TIMESTAMP   NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMP   NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ob_checklist_tenant
  ON tenant_onboarding_checklist(tenant_id);

CREATE INDEX IF NOT EXISTS idx_ob_checklist_completed
  ON tenant_onboarding_checklist(tenant_id, completed)
  WHERE completed = false;

-- ── Onboarding approvals ──────────────────────────────────────────────────────
-- Multi-role approval gate (leasing_manager, finance_manager, operations_manager)

CREATE TABLE IF NOT EXISTS tenant_onboarding_approvals (
  id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     UUID        NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  approver_role VARCHAR(100) NOT NULL,   -- 'leasing_manager' | 'finance_manager' | 'operations_manager'
  status        VARCHAR(50) NOT NULL DEFAULT 'pending',  -- pending | approved | rejected
  approved_by   UUID,                   -- user id of the approver
  approved_at   TIMESTAMP,
  comments      TEXT,
  created_at    TIMESTAMP   NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMP   NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ob_approvals_tenant
  ON tenant_onboarding_approvals(tenant_id);

CREATE INDEX IF NOT EXISTS idx_ob_approvals_pending
  ON tenant_onboarding_approvals(status, created_at)
  WHERE status = 'pending';

-- Unique constraint: one approval row per role per tenant
CREATE UNIQUE INDEX IF NOT EXISTS idx_ob_approvals_unique
  ON tenant_onboarding_approvals(tenant_id, approver_role);
