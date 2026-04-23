-- 025_tenant_risk_scores.sql
-- Historical/time-series risk scores per tenant. Composite 0..100 score with
-- per-signal contributions retained for dashboard transparency. RLS mirrors
-- the existing org-isolation pattern (005_revenue_intelligence.sql).

CREATE TABLE IF NOT EXISTS tenant_risk_scores (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id      uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  tenant_id            uuid NOT NULL REFERENCES tenants(id)       ON DELETE CASCADE,
  score_date           date NOT NULL,
  risk_score           integer NOT NULL CHECK (risk_score BETWEEN 0 AND 100),
  risk_level           varchar(16) NOT NULL CHECK (risk_level IN ('low','medium','high','critical')),
  late_payment_points  integer NOT NULL DEFAULT 0,
  sales_drop_points    integer NOT NULL DEFAULT 0,
  complaint_points     integer NOT NULL DEFAULT 0,
  lease_expiry_points  integer NOT NULL DEFAULT 0,
  signals              jsonb DEFAULT '{}'::jsonb,
  recommended_actions  jsonb DEFAULT '[]'::jsonb,
  model_version        varchar(32) NOT NULL,
  created_at           timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_risk_org_tenant_date
  ON tenant_risk_scores (organization_id, tenant_id, score_date);

CREATE INDEX IF NOT EXISTS idx_risk_org_level
  ON tenant_risk_scores (organization_id, risk_level);

CREATE UNIQUE INDEX IF NOT EXISTS uq_risk_tenant_day
  ON tenant_risk_scores (tenant_id, score_date);

ALTER TABLE tenant_risk_scores ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS tenant_risk_scores_org_isolation ON tenant_risk_scores;
CREATE POLICY tenant_risk_scores_org_isolation ON tenant_risk_scores
  FOR ALL
  USING      (organization_id = current_setting('app.current_organization_id', true)::uuid)
  WITH CHECK (organization_id = current_setting('app.current_organization_id', true)::uuid);
