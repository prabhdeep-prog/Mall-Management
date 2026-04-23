-- 024_revenue_forecasts.sql
-- Adds the revenue_forecasts table used by the forecasting engine and the
-- Revenue Forecast Agent. Follows the same RLS pattern as 005_revenue_intelligence.sql.

CREATE TABLE IF NOT EXISTS revenue_forecasts (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id   uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  property_id       uuid NOT NULL REFERENCES properties(id)    ON DELETE CASCADE,
  zone_id           uuid NULL,
  forecast_date     date NOT NULL,
  predicted_revenue numeric(14,2) NOT NULL,
  confidence_score  numeric(4,3)  NOT NULL CHECK (confidence_score >= 0 AND confidence_score <= 1),
  model_version     varchar(32)   NOT NULL,
  created_at        timestamptz   NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_rev_forecast_org_prop_date
  ON revenue_forecasts (organization_id, property_id, forecast_date);

CREATE UNIQUE INDEX IF NOT EXISTS uq_rev_forecast_scope_date_version
  ON revenue_forecasts (organization_id, property_id, zone_id, forecast_date, model_version);

-- Row-Level Security: same pattern as pos_transactions / revenue_calculations.
ALTER TABLE revenue_forecasts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS revenue_forecasts_org_isolation ON revenue_forecasts;
CREATE POLICY revenue_forecasts_org_isolation ON revenue_forecasts
  FOR ALL
  USING      (organization_id = current_setting('app.current_organization_id', true)::uuid)
  WITH CHECK (organization_id = current_setting('app.current_organization_id', true)::uuid);
