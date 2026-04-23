-- Migration 018: Finance-grade audit log hardening
-- Adds missing columns, immutability trigger, and composite indexes.
-- The audit_logs table already exists (created by 003_admin_audit.sql).

-- ── 1. New columns ────────────────────────────────────────────────────────────

ALTER TABLE audit_logs
  ADD COLUMN IF NOT EXISTS user_agent    TEXT,
  ADD COLUMN IF NOT EXISTS changed_fields JSONB;

-- ── 2. Extra indexes for the viewer UI ───────────────────────────────────────

-- Filter by user (who made the change)
CREATE INDEX IF NOT EXISTS idx_audit_logs_user
  ON audit_logs (user_id);

-- Filter by action type (create / update / delete / ...)
CREATE INDEX IF NOT EXISTS idx_audit_logs_action
  ON audit_logs (action);

-- Composite: org + created_at (primary viewer query)
CREATE INDEX IF NOT EXISTS idx_audit_logs_org_created
  ON audit_logs (organization_id, created_at DESC);

-- Composite: entity + entity_id + created_at (drill-down on one record)
CREATE INDEX IF NOT EXISTS idx_audit_logs_entity_created
  ON audit_logs (entity, entity_id, created_at DESC);

-- ── 3. Immutability trigger ───────────────────────────────────────────────────
-- Audit logs must be append-only. No UPDATE or DELETE is ever permitted.

CREATE OR REPLACE FUNCTION prevent_audit_log_modification()
RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION
    'Audit logs are immutable — modification and deletion are permanently prohibited';
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS audit_logs_immutable ON audit_logs;

CREATE TRIGGER audit_logs_immutable
  BEFORE UPDATE OR DELETE ON audit_logs
  FOR EACH ROW
  EXECUTE FUNCTION prevent_audit_log_modification();

-- ── 4. Row-level security (org-scoped reads) ─────────────────────────────────
-- Allows the service role to INSERT freely.
-- Restricts SELECT to the org that owns the records when RLS context is set.

ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;

-- Service role bypass (Supabase / Neon service_role always bypasses RLS)
-- This policy permits org-scoped reads when app.current_org_id is set.
DROP POLICY IF EXISTS audit_logs_org_read   ON audit_logs;
DROP POLICY IF EXISTS audit_logs_insert_all ON audit_logs;

CREATE POLICY audit_logs_insert_all ON audit_logs
  FOR INSERT
  WITH CHECK (true);                    -- service layer always inserts

CREATE POLICY audit_logs_org_read ON audit_logs
  FOR SELECT
  USING (
    organization_id::text =
      COALESCE(current_setting('app.current_org_id', true), '')
    OR
    COALESCE(current_setting('app.current_org_id', true), '') = ''
  );
-- Note: when app.current_org_id is not set the policy is permissive so the
-- Next.js service-role connection (which does not set the GUC) can read freely.
-- Tenant isolation is enforced at the service layer (WHERE organization_id = ?).
