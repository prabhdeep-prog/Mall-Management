-- Migration 027: Tenant Satisfaction Score Table
-- Stores calculated satisfaction scores with breakdown by component

CREATE TABLE IF NOT EXISTS tenant_satisfaction (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  score           INTEGER NOT NULL CHECK (score >= 0 AND score <= 100),
  level           VARCHAR(20) NOT NULL CHECK (level IN ('high', 'medium', 'low')),
  breakdown       JSONB NOT NULL DEFAULT '{}',
  calculated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  source          VARCHAR(50) NOT NULL DEFAULT 'calculated'
);

CREATE INDEX idx_tenant_satisfaction_tenant ON tenant_satisfaction(tenant_id);
CREATE INDEX idx_tenant_satisfaction_calculated_at ON tenant_satisfaction(calculated_at);

-- Enable RLS
ALTER TABLE tenant_satisfaction ENABLE ROW LEVEL SECURITY;

-- RLS policy: allow access when tenant belongs to the current organization
CREATE POLICY tenant_satisfaction_org_isolation ON tenant_satisfaction
  USING (
    tenant_id IN (
      SELECT t.id FROM tenants t
      JOIN properties p ON p.id = t.property_id
      WHERE p.organization_id = current_setting('app.current_organization_id', true)::uuid
    )
  );

-- Grant permissions to app roles
GRANT SELECT, INSERT ON tenant_satisfaction TO app_user;
GRANT SELECT, INSERT ON tenant_satisfaction TO app_service;
