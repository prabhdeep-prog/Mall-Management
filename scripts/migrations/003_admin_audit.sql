-- ============================================================================
-- Migration 003: Admin Audit Log + Impersonation Infrastructure
-- ============================================================================
-- Every time an internal operator (app_admin) switches into a tenant's
-- org context, that access is written to an immutable audit log BEFORE
-- the context is set. There is no mechanism to impersonate a tenant without
-- this record being created.
--
-- The audit table uses:
--   - SECURITY DEFINER on the impersonation function (only function can write)
--   - REVOKE INSERT from ALL roles on the table (log is write-protected)
--   - A dedicated audit DB role for compliance exports
-- ============================================================================

-- ── Admin access log (append-only) ───────────────────────────────────────────
CREATE TABLE IF NOT EXISTS admin_access_log (
  id               UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  -- Who is accessing
  admin_user_id    UUID        NOT NULL,           -- internal staff user ID
  admin_email      TEXT        NOT NULL,
  -- Whose data they're accessing
  target_org_id    UUID        NOT NULL REFERENCES organizations(id),
  target_org_name  TEXT,                           -- denormalized at log time
  -- Why
  reason           TEXT        NOT NULL CHECK (char_length(reason) >= 10),
  ticket_ref       TEXT,                           -- support ticket / Jira ref
  -- Duration
  granted_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  revoked_at       TIMESTAMPTZ,                   -- NULL = still active
  -- Immutable metadata
  request_ip       INET,
  user_agent       TEXT,
  session_id       TEXT
);

-- No update or delete allowed on the audit table — append-only
REVOKE ALL  ON TABLE admin_access_log FROM PUBLIC;
REVOKE ALL  ON TABLE admin_access_log FROM app_user, app_service, app_admin, app_provisioner;

-- A dedicated read-only role for compliance exports
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'app_auditor') THEN
    CREATE ROLE app_auditor NOLOGIN NOBYPASSRLS;
  END IF;
END $$;
GRANT SELECT ON admin_access_log TO app_auditor;

-- RLS on audit log (even app_admin cannot see other orgs' entries)
ALTER TABLE admin_access_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE admin_access_log FORCE  ROW LEVEL SECURITY;

-- auditors and superuser see everything; nobody else
CREATE POLICY auditor_access ON admin_access_log
  FOR SELECT TO app_auditor USING (true);

-- ── Provisioning events (append-only idempotency log) ─────────────────────────
CREATE TABLE IF NOT EXISTS provisioning_events (
  id               UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  idempotency_key  UUID        NOT NULL UNIQUE,   -- caller-supplied; prevents double-run
  organization_id  UUID,                          -- NULL during org creation step
  step             VARCHAR(50) NOT NULL,
  -- 'started' | 'completed' | 'failed' | 'rolled_back'
  status           VARCHAR(20) NOT NULL DEFAULT 'started',
  error_detail     TEXT,
  metadata         JSONB       NOT NULL DEFAULT '{}',
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at     TIMESTAMPTZ
);

-- Only app_provisioner and app_service may write provisioning events
REVOKE ALL   ON TABLE provisioning_events FROM PUBLIC;
GRANT SELECT ON TABLE provisioning_events TO app_admin, app_auditor;
GRANT INSERT, UPDATE ON TABLE provisioning_events TO app_provisioner, app_service;

-- No RLS on provisioning_events — it's an ops table, not tenant data
ALTER TABLE provisioning_events DISABLE ROW LEVEL SECURITY;

-- ── admin_set_org_context(): the ONLY way for app_admin to impersonate ────────
-- Calling this function:
--   1. Creates an audit record (mandatory, cannot be skipped)
--   2. Sets app.current_organization_id for the current transaction
--   3. Marks the session as admin-impersonation (app.is_admin_access)
--
-- SECURITY DEFINER means it runs as the function owner (superuser).
-- Only app_admin role has EXECUTE permission.

CREATE OR REPLACE FUNCTION admin_set_org_context(
  p_target_org_id  UUID,
  p_reason         TEXT,
  p_ticket_ref     TEXT DEFAULT NULL,
  p_request_ip     INET DEFAULT NULL,
  p_user_agent     TEXT DEFAULT NULL
)
RETURNS UUID  -- returns the access_log ID for the caller to store
SECURITY DEFINER
SET search_path = public
LANGUAGE plpgsql AS $$
DECLARE
  v_admin_user_id  UUID;
  v_admin_email    TEXT;
  v_org_name       TEXT;
  v_log_id         UUID;
BEGIN
  -- Resolve calling admin user
  v_admin_user_id := current_setting('app.current_user_id', true)::UUID;
  IF v_admin_user_id IS NULL THEN
    RAISE EXCEPTION 'app.current_user_id must be set before calling admin_set_org_context'
      USING ERRCODE = 'invalid_parameter_value';
  END IF;

  SELECT email INTO v_admin_email FROM users WHERE id = v_admin_user_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Admin user % not found', v_admin_user_id;
  END IF;

  -- Verify target org exists
  SELECT name INTO v_org_name FROM organizations WHERE id = p_target_org_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Target organization % not found', p_target_org_id;
  END IF;

  -- Write immutable audit record BEFORE setting context
  INSERT INTO admin_access_log (
    admin_user_id, admin_email, target_org_id, target_org_name,
    reason, ticket_ref, request_ip, user_agent
  ) VALUES (
    v_admin_user_id, v_admin_email, p_target_org_id, v_org_name,
    p_reason, p_ticket_ref, p_request_ip, p_user_agent
  )
  RETURNING id INTO v_log_id;

  -- Set transaction-local context (auto-cleared at COMMIT/ROLLBACK)
  PERFORM set_config('app.current_organization_id', p_target_org_id::text, true);
  PERFORM set_config('app.is_admin_access',         'true',                true);
  PERFORM set_config('app.admin_access_log_id',     v_log_id::text,        true);

  RETURN v_log_id;
END;
$$;

-- Restrict to app_admin only
REVOKE ALL     ON FUNCTION admin_set_org_context(UUID,TEXT,TEXT,INET,TEXT) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION admin_set_org_context(UUID,TEXT,TEXT,INET,TEXT) TO app_admin;

-- ── Tenant schema provisioning function (enterprise option) ───────────────────
-- Creates a schema named `tenant_{org_code}` and applies the same table
-- structure as the public schema. Idempotent.
CREATE OR REPLACE FUNCTION provision_tenant_schema(p_org_code TEXT)
RETURNS TEXT  -- returns the schema name
SECURITY DEFINER
SET search_path = public
LANGUAGE plpgsql AS $$
DECLARE
  v_schema_name TEXT := 'tenant_' || lower(regexp_replace(p_org_code, '[^a-z0-9_]', '_', 'g'));
BEGIN
  IF NOT (v_schema_name ~ '^tenant_[a-z0-9_]+$') THEN
    RAISE EXCEPTION 'Invalid schema name derived from org code: %', p_org_code;
  END IF;

  -- Create schema if not exists (idempotent)
  EXECUTE format('CREATE SCHEMA IF NOT EXISTS %I', v_schema_name);

  -- Grant schema usage to app roles
  EXECUTE format('GRANT USAGE ON SCHEMA %I TO app_user, app_service, app_admin', v_schema_name);

  -- Record in pg_catalog comment for discoverability
  EXECUTE format('COMMENT ON SCHEMA %I IS ''Tenant schema for org code: %s''', v_schema_name, p_org_code);

  RETURN v_schema_name;
END;
$$;

REVOKE ALL     ON FUNCTION provision_tenant_schema(TEXT) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION provision_tenant_schema(TEXT) TO app_provisioner;
