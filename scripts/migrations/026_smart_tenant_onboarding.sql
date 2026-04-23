-- 026_smart_tenant_onboarding.sql
-- Flat single-row-per-tenant onboarding checklist + per-tenant document tracking.
-- Complementary to the per-item checklist in 023.

-- ── tenant_onboarding ───────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS tenant_onboarding (
  id                 uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id          uuid        NOT NULL UNIQUE REFERENCES tenants(id) ON DELETE CASCADE,
  kyc_completed      boolean     NOT NULL DEFAULT false,
  lease_signed       boolean     NOT NULL DEFAULT false,
  deposit_paid       boolean     NOT NULL DEFAULT false,
  pos_connected      boolean     NOT NULL DEFAULT false,
  store_opening_date timestamptz,
  completed_at       timestamptz,
  created_at         timestamptz NOT NULL DEFAULT now(),
  updated_at         timestamptz NOT NULL DEFAULT now()
);

-- ── tenant_documents ────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS tenant_documents (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   uuid        NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  type        varchar(20) NOT NULL CHECK (type IN ('GST','PAN','AGREEMENT','LOGO','OTHER')),
  status      varchar(20) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','uploaded','verified')),
  file_url    text,
  uploaded_at timestamptz,
  verified_at timestamptz,
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_tenant_documents_tenant
  ON tenant_documents (tenant_id);

CREATE UNIQUE INDEX IF NOT EXISTS uq_tenant_doc_type
  ON tenant_documents (tenant_id, type);
