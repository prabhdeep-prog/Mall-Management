-- ============================================================================
-- Migration 022: Security Hardening v2
-- ============================================================================
-- 1. Make audit_logs table append-only (prevent UPDATE/DELETE)
-- 2. Make revenue_audit_log append-only
-- 3. Add invoice immutability trigger (prevent edits to posted invoices)
-- 4. Add performance indexes for new crons
-- ============================================================================

-- ── 1. Append-only audit_logs ──────────────────────────────────────────────
CREATE OR REPLACE FUNCTION prevent_audit_log_mutation()
RETURNS TRIGGER AS $$
BEGIN
  RAISE EXCEPTION 'Audit logs are immutable. UPDATE and DELETE are not permitted.';
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS audit_logs_immutable ON audit_logs;
CREATE TRIGGER audit_logs_immutable
  BEFORE UPDATE OR DELETE ON audit_logs
  FOR EACH ROW EXECUTE FUNCTION prevent_audit_log_mutation();

-- ── 2. Append-only revenue_audit_log ─────────────────────────────────────
DROP TRIGGER IF EXISTS revenue_audit_log_immutable ON revenue_audit_log;
CREATE TRIGGER revenue_audit_log_immutable
  BEFORE UPDATE OR DELETE ON revenue_audit_log
  FOR EACH ROW EXECUTE FUNCTION prevent_audit_log_mutation();

-- ── 3. Invoice immutability ──────────────────────────────────────────────
-- Prevent modification of invoices once lifecycle_status = 'posted'
CREATE OR REPLACE FUNCTION prevent_posted_invoice_edit()
RETURNS TRIGGER AS $$
BEGIN
  -- Allow status transitions and payment recording on posted invoices
  IF OLD.lifecycle_status = 'posted' THEN
    -- Only allow: paid_amount, paid_date, payment_method, payment_reference, status, reminders_sent, last_reminder_date, updated_at, updated_by, metadata
    IF (OLD.amount IS DISTINCT FROM NEW.amount) OR
       (OLD.gst_amount IS DISTINCT FROM NEW.gst_amount) OR
       (OLD.total_amount IS DISTINCT FROM NEW.total_amount) OR
       (OLD.period_start IS DISTINCT FROM NEW.period_start) OR
       (OLD.period_end IS DISTINCT FROM NEW.period_end) OR
       (OLD.invoice_number IS DISTINCT FROM NEW.invoice_number) OR
       (OLD.lease_id IS DISTINCT FROM NEW.lease_id) OR
       (OLD.due_date IS DISTINCT FROM NEW.due_date) THEN
      RAISE EXCEPTION 'Cannot modify financial fields on a posted invoice. Use a credit note/adjustment instead.';
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS invoice_immutability ON invoices;
CREATE TRIGGER invoice_immutability
  BEFORE UPDATE ON invoices
  FOR EACH ROW EXECUTE FUNCTION prevent_posted_invoice_edit();

-- ── 4. Performance indexes for new cron jobs ─────────────────────────────
CREATE INDEX IF NOT EXISTS idx_leases_end_date ON leases(end_date) WHERE status = 'active';
CREATE INDEX IF NOT EXISTS idx_work_orders_sla ON work_orders(created_at, priority) WHERE status IN ('open', 'assigned', 'in_progress');
CREATE INDEX IF NOT EXISTS idx_compliance_auto_reminder ON compliance_requirements(next_due_date) WHERE auto_reminder = true AND status IN ('pending', 'in_progress');
CREATE INDEX IF NOT EXISTS idx_notifications_type_meta ON notifications(type) WHERE type IN ('lease_expiry', 'sla_breach', 'compliance_reminder');
CREATE INDEX IF NOT EXISTS idx_invoices_period ON invoices(period_start, period_end);
CREATE INDEX IF NOT EXISTS idx_tenants_active ON tenants(id) WHERE status = 'active';
CREATE INDEX IF NOT EXISTS idx_pos_sales_verification ON pos_sales_data(verified) WHERE verified = false;

-- ── 5. Add organization_id to vendors for proper multi-tenancy ──────────
ALTER TABLE vendors ADD COLUMN IF NOT EXISTS organization_id UUID REFERENCES organizations(id);
CREATE INDEX IF NOT EXISTS idx_vendors_org ON vendors(organization_id);
