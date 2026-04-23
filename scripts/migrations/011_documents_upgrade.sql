-- ============================================================
-- Migration 011: Documents table upgrade
-- ============================================================
-- Evolves the documents table (from 008) into a full enterprise
-- document management system with:
--   • organization_id for multi-tenant isolation
--   • vendor_id for vendor contract linking
--   • file_key for S3 storage
--   • versioning (version + is_active)
--   • tagging (JSONB array)
--   • document_type enum column
--   • updated_at tracking
--   • upgraded RLS policies (org, tenant, role-based)
-- ============================================================

BEGIN;

-- ─── 1. Add new columns ─────────────────────────────────────────────────────

ALTER TABLE documents
  ADD COLUMN IF NOT EXISTS organization_id UUID REFERENCES organizations(id),
  ADD COLUMN IF NOT EXISTS vendor_id       UUID REFERENCES vendors(id),
  ADD COLUMN IF NOT EXISTS file_key        TEXT,
  ADD COLUMN IF NOT EXISTS document_type   TEXT NOT NULL DEFAULT 'other',
  ADD COLUMN IF NOT EXISTS description     TEXT,
  ADD COLUMN IF NOT EXISTS version         INTEGER NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS is_active       BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS tags            JSONB NOT NULL DEFAULT '[]',
  ADD COLUMN IF NOT EXISTS updated_at      TIMESTAMPTZ;

-- Rename 'type' to avoid confusion with the new 'document_type'
-- Keep 'type' as legacy; new code uses 'document_type'

-- ─── 2. Backfill organization_id from property → organization ───────────────

UPDATE documents d
SET organization_id = p.organization_id
FROM properties p
WHERE d.property_id = p.id
  AND d.organization_id IS NULL;

-- ─── 3. New indexes ─────────────────────────────────────────────────────────

CREATE INDEX IF NOT EXISTS idx_documents_org
  ON documents (organization_id);

CREATE INDEX IF NOT EXISTS idx_documents_document_type
  ON documents (document_type);

CREATE INDEX IF NOT EXISTS idx_documents_vendor
  ON documents (vendor_id);

CREATE INDEX IF NOT EXISTS idx_documents_active
  ON documents (is_active) WHERE is_active = true;

-- ─── 4. Drop old RLS policies and recreate ──────────────────────────────────

DROP POLICY IF EXISTS internal_rls     ON documents;
DROP POLICY IF EXISTS service_all      ON documents;
DROP POLICY IF EXISTS tenant_isolation ON documents;

-- Organization isolation: all operations scoped to current org
CREATE POLICY documents_org_isolation ON documents
  FOR ALL
  USING (organization_id = current_setting('app.current_organization_id')::uuid)
  WITH CHECK (organization_id = current_setting('app.current_organization_id')::uuid);

-- Tenant portal access: read-only, scoped to own tenant
CREATE POLICY documents_tenant_access ON documents
  FOR SELECT
  TO app_tenant
  USING (tenant_id = current_setting('app.current_tenant_id')::uuid);

COMMIT;
