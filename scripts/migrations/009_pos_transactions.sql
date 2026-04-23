-- ============================================================
-- Migration 009: Recreate pos_transactions table
-- ============================================================
-- Drops the existing pos_transactions table (from migration 005)
-- and recreates it with:
--   • Multi-tenant isolation via organization_id
--   • Dedup via provider external_id
--   • Support for refunds, voids, partial payments
--   • Multiple payment methods
--   • Raw payload storage for debugging
--   • Optimized indexes for aggregation queries
-- ============================================================

BEGIN;

-- Drop existing table and its dependencies
DROP TABLE IF EXISTS pos_transactions CASCADE;

-- ─── Recreate pos_transactions ─────────────────────────────────────────────────

CREATE TABLE pos_transactions (
  id                  UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  external_id         TEXT          NOT NULL,
  pos_integration_id  UUID          REFERENCES pos_integrations(id),
  tenant_id           UUID          REFERENCES tenants(id),
  property_id         UUID          REFERENCES properties(id),
  organization_id     UUID          REFERENCES organizations(id),

  -- Financials
  gross_amount        NUMERIC(12,2) NOT NULL,
  net_amount          NUMERIC(12,2) NOT NULL,
  discount_amount     NUMERIC(12,2) DEFAULT 0,
  tax_amount          NUMERIC(12,2) DEFAULT 0,
  refund_amount       NUMERIC(12,2) DEFAULT 0,

  -- Classification
  transaction_type    TEXT          NOT NULL,       -- 'sale', 'refund', 'void', 'partial_payment'
  payment_method      TEXT,                         -- 'card', 'upi', 'cash', 'wallet', 'mixed'
  status              TEXT          NOT NULL,       -- 'completed', 'refunded', 'voided', 'pending'
  currency            VARCHAR(3)    DEFAULT 'INR',

  -- Terminal / operator metadata
  terminal_id         TEXT,
  merchant_id         TEXT,
  operator_id         TEXT,

  -- Structured + raw data
  line_items          JSONB         DEFAULT '[]',
  raw_payload         JSONB,

  -- Timestamps
  transacted_at       TIMESTAMPTZ   NOT NULL,
  synced_at           TIMESTAMPTZ   DEFAULT NOW(),
  created_at          TIMESTAMPTZ   DEFAULT NOW(),

  -- Dedup constraint
  CONSTRAINT pos_transactions_dedup UNIQUE (pos_integration_id, external_id)
);

-- ─── Indexes optimized for aggregation queries ─────────────────────────────────

CREATE INDEX idx_pos_txn_tenant_date
  ON pos_transactions (tenant_id, transacted_at);

CREATE INDEX idx_pos_txn_payment_method
  ON pos_transactions (payment_method);

-- ─── Row-level security for multi-tenant isolation ─────────────────────────────

ALTER TABLE pos_transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE pos_transactions FORCE ROW LEVEL SECURITY;

CREATE POLICY sel ON pos_transactions FOR SELECT TO app_user
  USING (organization_id = current_setting('app.current_organization_id')::uuid);

CREATE POLICY ins ON pos_transactions FOR INSERT TO app_user
  WITH CHECK (organization_id = current_setting('app.current_organization_id')::uuid);

CREATE POLICY upd ON pos_transactions FOR UPDATE TO app_user
  USING      (organization_id = current_setting('app.current_organization_id')::uuid)
  WITH CHECK (organization_id = current_setting('app.current_organization_id')::uuid);

COMMIT;
