-- Migration 017: Analytics performance indexes
-- Adds composite indexes to accelerate the Revenue Intelligence analytics queries.
-- All queries join pos_sales_data → pos_integrations → leases → tenants
-- and filter by date range, property, floor, category.

-- pos_sales_data: date + integration compound (most queries filter on both)
CREATE INDEX IF NOT EXISTS idx_psd_integration_date
  ON pos_sales_data (pos_integration_id, sales_date);

-- pos_sales_data: date alone (range scans on date before joining)
CREATE INDEX IF NOT EXISTS idx_psd_date
  ON pos_sales_data (sales_date);

-- pos_integrations: lease lookup (JOIN path)
CREATE INDEX IF NOT EXISTS idx_pos_integrations_lease
  ON pos_integrations (lease_id);

-- pos_integrations: property lookup (filter path)
CREATE INDEX IF NOT EXISTS idx_pos_integrations_property
  ON pos_integrations (property_id);

-- leases: tenant lookup (JOIN path from integrations)
CREATE INDEX IF NOT EXISTS idx_leases_tenant
  ON leases (tenant_id);

-- leases: floor filter
CREATE INDEX IF NOT EXISTS idx_leases_floor
  ON leases (floor);

-- leases: property + floor compound (frequent filter combination)
CREATE INDEX IF NOT EXISTS idx_leases_property_floor
  ON leases (property_id, floor);

-- tenants: category filter
CREATE INDEX IF NOT EXISTS idx_tenants_category
  ON tenants (category);

-- pos_transactions: date range (analytics payment queries cast timestamp to date)
CREATE INDEX IF NOT EXISTS idx_pos_transactions_date
  ON pos_transactions ((transacted_at::date));

-- pos_transactions: integration + date compound
CREATE INDEX IF NOT EXISTS idx_pos_transactions_integration_date
  ON pos_transactions (pos_integration_id, (transacted_at::date));

-- pos_transactions: payment method (for GROUP BY payment_method aggregations)
CREATE INDEX IF NOT EXISTS idx_pos_transactions_payment_method
  ON pos_transactions (payment_method);
