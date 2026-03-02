-- ============================================================
-- Migration 005: Revenue Intelligence System
-- ============================================================
-- Adds tables for:
--   • pos_transactions          — immutable raw POS events
--   • revenue_calculations      — auditable billing snapshots
--   • cam_charges               — CAM reconciliation
--   • revenue_adjustments       — dispute & override workflow
--   • footfall_data             — visitor count aggregates
--   • revenue_audit_log         — immutable changelog
-- Alters:
--   • leases                    — adds monthly_mg, cam_cap_sqft
-- ============================================================

BEGIN;

-- ─── 1. Add Minimum Guarantee + CAM cap to leases ────────────────────────────

ALTER TABLE leases
  ADD COLUMN IF NOT EXISTS monthly_mg          NUMERIC(14,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS cam_cap_per_sqft    NUMERIC(10,4),          -- annual CAM cap ₹/sqft (null = uncapped)
  ADD COLUMN IF NOT EXISTS rev_share_breakpoint NUMERIC(14,2);         -- gross sales above which rev share kicks in (null = from ₹0)

COMMENT ON COLUMN leases.monthly_mg IS
  'Minimum Guarantee: landlord receives max(MG × period_fraction, rev_share_amount) each period';
COMMENT ON COLUMN leases.cam_cap_per_sqft IS
  'Annual CAM cap per sqft. Tenant owes min(actual CAM, cap × sqft).';
COMMENT ON COLUMN leases.rev_share_breakpoint IS
  'Natural breakpoint: rev share % applies only on gross sales above this amount.';

-- ─── 2. Raw POS transactions (immutable write-once log) ──────────────────────

CREATE TABLE IF NOT EXISTS pos_transactions (
  id                  UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id     UUID          NOT NULL REFERENCES organizations(id) ON DELETE RESTRICT,
  tenant_id           UUID          NOT NULL REFERENCES tenants(id)       ON DELETE RESTRICT,
  pos_integration_id  UUID          NOT NULL REFERENCES pos_integrations(id) ON DELETE RESTRICT,

  -- Provider-side identifiers (for idempotent ingestion)
  provider_tx_id      TEXT          NOT NULL,
  provider_key        TEXT          NOT NULL,   -- e.g. 'pine_labs', 'shopify'

  transaction_date    DATE          NOT NULL,
  transaction_time    TIMESTAMPTZ,

  -- Financials (all in INR, stored as paisa-precision NUMERIC)
  gross_amount        NUMERIC(14,2) NOT NULL,
  refund_amount       NUMERIC(14,2) NOT NULL DEFAULT 0,
  discount_amount     NUMERIC(14,2) NOT NULL DEFAULT 0,
  net_amount          NUMERIC(14,2) GENERATED ALWAYS AS (gross_amount - refund_amount - discount_amount) STORED,

  payment_mode        TEXT,           -- 'card','upi','cash','wallet'
  category            TEXT,           -- merchant-reported category

  raw_payload         JSONB,          -- full provider response, kept for audit

  -- Ingestion metadata
  ingested_at         TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  ingestion_source    TEXT          NOT NULL DEFAULT 'webhook',  -- 'webhook' | 'polling' | 'manual'

  CONSTRAINT pos_transactions_idempotency UNIQUE (pos_integration_id, provider_tx_id)
);

CREATE INDEX IF NOT EXISTS idx_pos_tx_tenant_date
  ON pos_transactions (tenant_id, transaction_date);

CREATE INDEX IF NOT EXISTS idx_pos_tx_org_date
  ON pos_transactions (organization_id, transaction_date);

CREATE INDEX IF NOT EXISTS idx_pos_tx_integration
  ON pos_transactions (pos_integration_id, transaction_date);

-- Row-level security
ALTER TABLE pos_transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE pos_transactions FORCE ROW LEVEL SECURITY;

CREATE POLICY pos_transactions_org_isolation ON pos_transactions
  FOR ALL
  USING      (organization_id = current_setting('app.current_organization_id', true)::uuid)
  WITH CHECK (organization_id = current_setting('app.current_organization_id', true)::uuid);

-- ─── 3. Revenue Calculation Snapshots (auditable, versioned) ─────────────────

CREATE TABLE IF NOT EXISTS revenue_calculations (
  id                  UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id     UUID          NOT NULL REFERENCES organizations(id) ON DELETE RESTRICT,
  tenant_id           UUID          NOT NULL REFERENCES tenants(id)       ON DELETE RESTRICT,
  lease_id            UUID          NOT NULL REFERENCES leases(id)        ON DELETE RESTRICT,

  period_start        DATE          NOT NULL,
  period_end          DATE          NOT NULL,
  period_days         INTEGER       NOT NULL GENERATED ALWAYS AS (period_end - period_start + 1) STORED,

  -- Raw sales inputs
  gross_sales         NUMERIC(14,2) NOT NULL,
  net_sales           NUMERIC(14,2) NOT NULL,
  total_refunds       NUMERIC(14,2) NOT NULL DEFAULT 0,
  total_discounts     NUMERIC(14,2) NOT NULL DEFAULT 0,
  transaction_count   INTEGER       NOT NULL DEFAULT 0,

  -- Lease parameters (snapshot at calculation time — immutable record)
  lease_rev_share_pct NUMERIC(6,4)  NOT NULL,
  lease_monthly_mg    NUMERIC(14,2) NOT NULL,
  lease_breakpoint    NUMERIC(14,2),
  lease_area_sqft     NUMERIC(10,2),

  -- MG Calculation
  minimum_guarantee   NUMERIC(14,2) NOT NULL,   -- monthly_mg × (period_days / 30)
  rev_share_base      NUMERIC(14,2) NOT NULL,   -- gross_sales above breakpoint
  rev_share_amount    NUMERIC(14,2) NOT NULL,   -- rev_share_base × rev_share_pct / 100
  amount_due          NUMERIC(14,2) NOT NULL,   -- max(minimum_guarantee, rev_share_amount)
  excess_over_mg      NUMERIC(14,2) NOT NULL,   -- max(0, rev_share_amount - minimum_guarantee)

  -- KPIs
  sales_per_sqft      NUMERIC(10,4),            -- gross_sales / area_sqft
  avg_ticket_size     NUMERIC(10,2),            -- gross_sales / transaction_count

  -- CAM
  cam_charged         NUMERIC(14,2) NOT NULL DEFAULT 0,
  cam_cap_applied     BOOLEAN       NOT NULL DEFAULT FALSE,

  -- Calculation metadata
  calc_version        INTEGER       NOT NULL DEFAULT 1,  -- increments on recalc
  status              TEXT          NOT NULL DEFAULT 'draft',  -- draft | confirmed | invoiced | disputed
  calculated_by       UUID          REFERENCES users(id),
  calculated_at       TIMESTAMPTZ   NOT NULL DEFAULT NOW(),

  -- Invoice linkage
  invoice_id          TEXT,

  CONSTRAINT revenue_calc_period_check CHECK (period_end >= period_start),
  CONSTRAINT revenue_calc_status_check CHECK (status IN ('draft','confirmed','invoiced','disputed'))
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_revenue_calc_tenant_period
  ON revenue_calculations (tenant_id, period_start, period_end, calc_version);

CREATE INDEX IF NOT EXISTS idx_revenue_calc_org_period
  ON revenue_calculations (organization_id, period_start, status);

CREATE INDEX IF NOT EXISTS idx_revenue_calc_status
  ON revenue_calculations (organization_id, status)
  WHERE status IN ('draft', 'disputed');

ALTER TABLE revenue_calculations ENABLE ROW LEVEL SECURITY;
ALTER TABLE revenue_calculations FORCE ROW LEVEL SECURITY;

CREATE POLICY revenue_calculations_org_isolation ON revenue_calculations
  FOR ALL
  USING      (organization_id = current_setting('app.current_organization_id', true)::uuid)
  WITH CHECK (organization_id = current_setting('app.current_organization_id', true)::uuid);

-- ─── 4. CAM Charges ──────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS cam_charges (
  id                  UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id     UUID          NOT NULL REFERENCES organizations(id) ON DELETE RESTRICT,
  tenant_id           UUID          NOT NULL REFERENCES tenants(id)       ON DELETE RESTRICT,
  lease_id            UUID          NOT NULL REFERENCES leases(id)        ON DELETE RESTRICT,

  charge_year         INTEGER       NOT NULL,
  charge_month        INTEGER       NOT NULL CHECK (charge_month BETWEEN 1 AND 12),

  -- Actual vs estimated vs cap
  estimated_monthly   NUMERIC(14,2) NOT NULL,   -- based on lease camCharges (monthly)
  actual_monthly      NUMERIC(14,2),             -- reconciled actual (null until reconciled)
  cap_amount          NUMERIC(14,2),             -- cam_cap_per_sqft × area_sqft / 12
  charged_amount      NUMERIC(14,2) NOT NULL,    -- min(actual_monthly, cap_amount) or estimated

  reconciled          BOOLEAN       NOT NULL DEFAULT FALSE,
  reconciled_at       TIMESTAMPTZ,
  reconciled_by       UUID          REFERENCES users(id),

  notes               TEXT,
  created_at          TIMESTAMPTZ   NOT NULL DEFAULT NOW(),

  CONSTRAINT cam_charges_period_unique UNIQUE (tenant_id, charge_year, charge_month)
);

ALTER TABLE cam_charges ENABLE ROW LEVEL SECURITY;
ALTER TABLE cam_charges FORCE ROW LEVEL SECURITY;

CREATE POLICY cam_charges_org_isolation ON cam_charges
  FOR ALL
  USING      (organization_id = current_setting('app.current_organization_id', true)::uuid)
  WITH CHECK (organization_id = current_setting('app.current_organization_id', true)::uuid);

-- ─── 5. Revenue Adjustments (Disputes & Overrides) ───────────────────────────

CREATE TABLE IF NOT EXISTS revenue_adjustments (
  id                  UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id     UUID          NOT NULL REFERENCES organizations(id) ON DELETE RESTRICT,
  tenant_id           UUID          NOT NULL REFERENCES tenants(id)       ON DELETE RESTRICT,
  revenue_calc_id     UUID          REFERENCES revenue_calculations(id),

  adjustment_type     TEXT          NOT NULL,  -- 'dispute' | 'override' | 'credit' | 'debit'
  amount              NUMERIC(14,2) NOT NULL,  -- positive = reduces tenant liability, negative = increases
  reason              TEXT          NOT NULL,
  evidence_urls       TEXT[],                  -- S3 links to supporting documents

  -- Workflow state
  status              TEXT          NOT NULL DEFAULT 'pending',  -- pending | approved | rejected
  requested_by        UUID          NOT NULL REFERENCES users(id),
  requested_at        TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  reviewed_by         UUID          REFERENCES users(id),
  reviewed_at         TIMESTAMPTZ,
  review_notes        TEXT,

  -- Linked transaction (for transaction-level disputes)
  pos_transaction_id  UUID          REFERENCES pos_transactions(id),

  CONSTRAINT adjustment_type_check CHECK (adjustment_type IN ('dispute','override','credit','debit')),
  CONSTRAINT adjustment_status_check CHECK (status IN ('pending','approved','rejected'))
);

CREATE INDEX IF NOT EXISTS idx_adjustments_calc
  ON revenue_adjustments (revenue_calc_id);

CREATE INDEX IF NOT EXISTS idx_adjustments_org_status
  ON revenue_adjustments (organization_id, status)
  WHERE status = 'pending';

ALTER TABLE revenue_adjustments ENABLE ROW LEVEL SECURITY;
ALTER TABLE revenue_adjustments FORCE ROW LEVEL SECURITY;

CREATE POLICY revenue_adjustments_org_isolation ON revenue_adjustments
  FOR ALL
  USING      (organization_id = current_setting('app.current_organization_id', true)::uuid)
  WITH CHECK (organization_id = current_setting('app.current_organization_id', true)::uuid);

-- ─── 6. Footfall Data ────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS footfall_data (
  id                  UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id     UUID          NOT NULL REFERENCES organizations(id) ON DELETE RESTRICT,

  data_date           DATE          NOT NULL,
  zone                TEXT,            -- null = mall-wide, or 'food_court','fashion','electronics'
  floor               TEXT,            -- null = all floors, or 'g','1','2'

  visitor_count       INTEGER       NOT NULL,
  peak_hour           INTEGER,         -- 0-23, hour with highest traffic
  avg_dwell_minutes   INTEGER,         -- average minutes per visit

  source              TEXT          NOT NULL DEFAULT 'manual',  -- 'camera_ai' | 'wifi_probe' | 'manual'
  created_at          TIMESTAMPTZ   NOT NULL DEFAULT NOW(),

  CONSTRAINT footfall_date_zone_unique UNIQUE (organization_id, data_date, zone, floor)
);

ALTER TABLE footfall_data ENABLE ROW LEVEL SECURITY;
ALTER TABLE footfall_data FORCE ROW LEVEL SECURITY;

CREATE POLICY footfall_org_isolation ON footfall_data
  FOR ALL
  USING      (organization_id = current_setting('app.current_organization_id', true)::uuid)
  WITH CHECK (organization_id = current_setting('app.current_organization_id', true)::uuid);

-- ─── 7. Revenue Audit Log (append-only, no DELETE/UPDATE policy) ─────────────

CREATE TABLE IF NOT EXISTS revenue_audit_log (
  id                  BIGSERIAL     PRIMARY KEY,
  organization_id     UUID          NOT NULL,
  entity_type         TEXT          NOT NULL,  -- 'revenue_calculation' | 'adjustment' | 'pos_transaction'
  entity_id           UUID          NOT NULL,
  action              TEXT          NOT NULL,  -- 'created' | 'updated' | 'status_changed' | 'deleted'
  actor_id            UUID,
  actor_role          TEXT,
  old_values          JSONB,
  new_values          JSONB,
  ip_address          INET,
  user_agent          TEXT,
  occurred_at         TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_revenue_audit_entity
  ON revenue_audit_log (entity_type, entity_id);

CREATE INDEX IF NOT EXISTS idx_revenue_audit_org_time
  ON revenue_audit_log (organization_id, occurred_at DESC);

-- Audit log: only allow INSERT (no UPDATE/DELETE, even for superuser via app_user)
ALTER TABLE revenue_audit_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE revenue_audit_log FORCE ROW LEVEL SECURITY;

CREATE POLICY revenue_audit_log_insert_only ON revenue_audit_log
  FOR INSERT
  WITH CHECK (organization_id = current_setting('app.current_organization_id', true)::uuid);

CREATE POLICY revenue_audit_log_read ON revenue_audit_log
  FOR SELECT
  USING (organization_id = current_setting('app.current_organization_id', true)::uuid);

-- No UPDATE or DELETE policies → effectively immutable for app_user

-- ─── 8. Daily Sales Aggregation trigger (auto-aggregate from pos_transactions) ─

CREATE OR REPLACE FUNCTION aggregate_pos_daily_sales()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_agg RECORD;
BEGIN
  -- Reaggregate the day that was just inserted/updated
  SELECT
    NEW.organization_id,
    NEW.tenant_id,
    NEW.pos_integration_id,
    NEW.transaction_date,
    SUM(gross_amount)     AS gross_sales,
    SUM(net_amount)       AS net_sales,
    SUM(refund_amount)    AS total_refunds,
    SUM(discount_amount)  AS total_discounts,
    COUNT(*)              AS transaction_count,
    CASE WHEN COUNT(*) > 0 THEN SUM(gross_amount) / COUNT(*) ELSE 0 END AS avg_ticket
  INTO v_agg
  FROM pos_transactions
  WHERE
    pos_integration_id = NEW.pos_integration_id
    AND transaction_date = NEW.transaction_date;

  INSERT INTO pos_sales_data (
    organization_id, tenant_id, pos_integration_id,
    sale_date, gross_sales, net_sales, refunds, discounts,
    transaction_count, avg_transaction_value
  ) VALUES (
    NEW.organization_id, NEW.tenant_id, NEW.pos_integration_id,
    NEW.transaction_date, v_agg.gross_sales, v_agg.net_sales,
    v_agg.total_refunds, v_agg.total_discounts,
    v_agg.transaction_count, v_agg.avg_ticket
  )
  ON CONFLICT (pos_integration_id, sale_date)
  DO UPDATE SET
    gross_sales            = EXCLUDED.gross_sales,
    net_sales              = EXCLUDED.net_sales,
    refunds                = EXCLUDED.refunds,
    discounts              = EXCLUDED.discounts,
    transaction_count      = EXCLUDED.transaction_count,
    avg_transaction_value  = EXCLUDED.avg_transaction_value,
    updated_at             = NOW();

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_aggregate_pos_daily ON pos_transactions;
CREATE TRIGGER trg_aggregate_pos_daily
  AFTER INSERT OR UPDATE ON pos_transactions
  FOR EACH ROW
  EXECUTE FUNCTION aggregate_pos_daily_sales();

-- ─── 9. Admin bypass policies (for background jobs via app_service role) ──────

-- Allow app_service to bypass RLS on pos_transactions for bulk ingestion
GRANT INSERT, SELECT ON pos_transactions    TO app_service;
GRANT INSERT, SELECT ON revenue_audit_log   TO app_service;
GRANT INSERT, SELECT, UPDATE ON revenue_calculations TO app_service;
GRANT INSERT, SELECT, UPDATE ON cam_charges TO app_service;

COMMIT;
