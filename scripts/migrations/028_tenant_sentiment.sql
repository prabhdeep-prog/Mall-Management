-- Migration 028: Tenant Sentiment Tracking Table
-- Stores individual sentiment entries from communications and notes

CREATE TABLE IF NOT EXISTS tenant_sentiment (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  sentiment       VARCHAR(20) NOT NULL CHECK (sentiment IN ('positive', 'neutral', 'negative')),
  score           NUMERIC(4,3) NOT NULL CHECK (score >= -1 AND score <= 1),
  source          VARCHAR(50) NOT NULL CHECK (source IN ('email', 'note', 'call', 'chat')),
  content         TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_tenant_sentiment_tenant ON tenant_sentiment(tenant_id);
CREATE INDEX idx_tenant_sentiment_created_at ON tenant_sentiment(created_at);

-- Enable RLS
ALTER TABLE tenant_sentiment ENABLE ROW LEVEL SECURITY;

-- RLS policy: allow access when tenant belongs to the current organization
CREATE POLICY tenant_sentiment_org_isolation ON tenant_sentiment
  USING (
    tenant_id IN (
      SELECT t.id FROM tenants t
      JOIN properties p ON p.id = t.property_id
      WHERE p.organization_id = current_setting('app.current_organization_id', true)::uuid
    )
  );

-- Grant permissions to app roles
GRANT SELECT, INSERT ON tenant_sentiment TO app_user;
GRANT SELECT, INSERT ON tenant_sentiment TO app_service;
