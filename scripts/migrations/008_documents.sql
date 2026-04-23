-- Migration 008: Documents table
-- Stores files uploaded by property managers and shared with tenants.

CREATE TABLE IF NOT EXISTS documents (
  id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id    UUID        REFERENCES tenants(id) ON DELETE CASCADE,
  property_id  UUID        REFERENCES properties(id) ON DELETE CASCADE,
  lease_id     UUID        REFERENCES leases(id) ON DELETE SET NULL,
  name         VARCHAR(255) NOT NULL,
  type         VARCHAR(100),
  category     VARCHAR(100) NOT NULL DEFAULT 'other',
  file_size    INTEGER,
  mime_type    VARCHAR(100),
  url          TEXT        NOT NULL,
  expires_at   TIMESTAMPTZ,
  uploaded_by  UUID,
  metadata     JSONB       NOT NULL DEFAULT '{}',
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_documents_tenant   ON documents(tenant_id);
CREATE INDEX IF NOT EXISTS idx_documents_property ON documents(property_id);
CREATE INDEX IF NOT EXISTS idx_documents_category ON documents(category);

-- Grants
GRANT SELECT, INSERT, UPDATE, DELETE ON documents TO app_user;
GRANT SELECT, INSERT, UPDATE, DELETE ON documents TO app_service;
GRANT SELECT ON documents TO app_tenant;

-- Enable RLS (policies created in 011_documents_upgrade)
ALTER TABLE documents ENABLE ROW LEVEL SECURITY;
