-- Migration 016: Finance-grade invoice immutability
-- Adds lifecycle_status column (draft | posted | cancelled) and DB-level trigger
-- to prevent edits on posted invoices.
--
-- NOTE: The existing `status` column tracks payment state (pending, paid, overdue, etc.)
--       `lifecycle_status` tracks the document lifecycle for immutability control.

-- 1. Add lifecycle_status column ------------------------------------------------
ALTER TABLE invoices
  ADD COLUMN IF NOT EXISTS lifecycle_status VARCHAR(20)
    NOT NULL DEFAULT 'draft'
    CHECK (lifecycle_status IN ('draft', 'posted', 'cancelled'));

-- 2. Index for fast lookups -----------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_invoices_lifecycle_status
  ON invoices (lifecycle_status);

-- 3. Immutability trigger function ----------------------------------------------
-- Blocks DELETE entirely on posted invoices.
-- Blocks changes to financial/definitional fields on posted invoices.
-- Allows payment-tracking field updates (paid_amount, paid_date, status, notes).
-- Prevents reverting lifecycle_status back from 'posted'.

CREATE OR REPLACE FUNCTION prevent_posted_invoice_edit()
RETURNS trigger AS $$
BEGIN
  IF OLD.lifecycle_status = 'posted' THEN

    -- Block hard deletes
    IF TG_OP = 'DELETE' THEN
      RAISE EXCEPTION 'Posted invoices are immutable';
    END IF;

    -- Block changes to financial / definitional fields
    IF (
      OLD.amount            IS DISTINCT FROM NEW.amount            OR
      OLD.gst_amount        IS DISTINCT FROM NEW.gst_amount        OR
      OLD.total_amount      IS DISTINCT FROM NEW.total_amount      OR
      OLD.invoice_type      IS DISTINCT FROM NEW.invoice_type      OR
      OLD.invoice_number    IS DISTINCT FROM NEW.invoice_number    OR
      OLD.period_start      IS DISTINCT FROM NEW.period_start      OR
      OLD.period_end        IS DISTINCT FROM NEW.period_end        OR
      OLD.due_date          IS DISTINCT FROM NEW.due_date          OR
      OLD.lease_id          IS DISTINCT FROM NEW.lease_id
    ) THEN
      RAISE EXCEPTION 'Posted invoices are immutable';
    END IF;

    -- Block reverting lifecycle_status away from 'posted'
    IF NEW.lifecycle_status IS DISTINCT FROM 'posted' THEN
      RAISE EXCEPTION 'Posted invoices are immutable';
    END IF;

  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 4. Attach trigger ------------------------------------------------------------
DROP TRIGGER IF EXISTS invoice_immutable ON invoices;

CREATE TRIGGER invoice_immutable
  BEFORE UPDATE OR DELETE ON invoices
  FOR EACH ROW
  EXECUTE FUNCTION prevent_posted_invoice_edit();
