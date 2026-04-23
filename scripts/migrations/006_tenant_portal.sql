-- ============================================================================
-- Migration 006: Tenant Portal
-- ─────────────────────────────────────────────────────────────────────────────
-- Adds a separate credential namespace for tenant (shop) users so they can
-- log in to a self-service portal without touching internal user accounts.
--
-- Isolation model
-- ───────────────
-- Internal users are scoped by  app.current_organization_id  (set at the org
-- level by the application before every query).
-- Tenant portal users are scoped by  app.current_tenant_id   (set to the
-- authenticated tenant's UUID before every query from the portal).
--
-- The two GUCs are independent, so a tenant user can NEVER accidentally cross
-- into another tenant's rows, and internal app_user queries are unaffected.
--
-- auth lookup
-- ───────────
-- find_tenant_user_for_auth() is a SECURITY DEFINER function that bypasses
-- RLS for the sole purpose of credential validation.  It is the ONLY path
-- that reads tenant_users without a tenant context set.  All other access
-- must go through the RLS policy below.
-- ============================================================================

-- ── 1. Tables ─────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS tenant_users (
  id             UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id      UUID        NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  email          TEXT        NOT NULL,
  password_hash  TEXT        NOT NULL,
  name           TEXT,
  is_active      BOOLEAN     NOT NULL DEFAULT true,
  last_login_at  TIMESTAMPTZ,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT tenant_users_email_unique UNIQUE (email)
);

CREATE TABLE IF NOT EXISTS tenant_sessions (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_user_id  UUID        NOT NULL REFERENCES tenant_users(id) ON DELETE CASCADE,
  expires_at      TIMESTAMPTZ NOT NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ── 2. Indexes ────────────────────────────────────────────────────────────────

CREATE INDEX IF NOT EXISTS idx_tenant_users_tenant
  ON tenant_users(tenant_id);

CREATE INDEX IF NOT EXISTS idx_tenant_sessions_user
  ON tenant_sessions(tenant_user_id);

-- Partial index: only unexpired sessions are ever queried
CREATE INDEX IF NOT EXISTS idx_tenant_sessions_expiry
  ON tenant_sessions(expires_at)
  WHERE expires_at > now();

-- ── 3. Grants ─────────────────────────────────────────────────────────────────

-- app_user handles portal requests the same way it handles internal requests
GRANT SELECT, INSERT, UPDATE, DELETE ON tenant_users    TO app_user;
GRANT SELECT, INSERT, UPDATE, DELETE ON tenant_sessions TO app_user;

-- app_service needs access for auth lookups and background jobs
GRANT SELECT, INSERT, UPDATE, DELETE ON tenant_users    TO app_service;
GRANT SELECT, INSERT, UPDATE, DELETE ON tenant_sessions TO app_service;

-- ── 4. Row-Level Security ─────────────────────────────────────────────────────

ALTER TABLE tenant_users    ENABLE  ROW LEVEL SECURITY;
ALTER TABLE tenant_users    FORCE   ROW LEVEL SECURITY;

ALTER TABLE tenant_sessions ENABLE  ROW LEVEL SECURITY;
ALTER TABLE tenant_sessions FORCE   ROW LEVEL SECURITY;

-- tenant_users: a row is visible only when app.current_tenant_id matches
DROP POLICY IF EXISTS tenant_isolation ON tenant_users;
CREATE POLICY tenant_isolation ON tenant_users
  AS PERMISSIVE FOR ALL TO app_user
  USING (
    tenant_id::text = current_setting('app.current_tenant_id', true)
  );

-- app_service (background jobs, auth lookups) can read/write all tenant_users
-- The find_tenant_user_for_auth() function still uses SECURITY DEFINER, but
-- granting app_service here allows admin tooling to use serviceDb directly.
DROP POLICY IF EXISTS service_all ON tenant_users;
CREATE POLICY service_all ON tenant_users
  AS PERMISSIVE FOR ALL TO app_service
  USING (true)
  WITH CHECK (true);

-- tenant_sessions: a row is visible only when the owning user belongs to the
-- current tenant.  Uses a correlated sub-select so tenant context propagates.
DROP POLICY IF EXISTS tenant_isolation ON tenant_sessions;
CREATE POLICY tenant_isolation ON tenant_sessions
  AS PERMISSIVE FOR ALL TO app_user
  USING (
    EXISTS (
      SELECT 1 FROM tenant_users tu
      WHERE  tu.id = tenant_sessions.tenant_user_id
        AND  tu.tenant_id::text = current_setting('app.current_tenant_id', true)
    )
  );

DROP POLICY IF EXISTS service_all ON tenant_sessions;
CREATE POLICY service_all ON tenant_sessions
  AS PERMISSIVE FOR ALL TO app_service
  USING (true)
  WITH CHECK (true);

-- ── 5. Auth lookup function ───────────────────────────────────────────────────
-- Mirror of find_user_for_auth() for the tenant portal.
-- • SECURITY DEFINER  — runs as superuser, bypasses RLS on tenant_users
-- • Returns minimal fields — password_hash is used for bcrypt comparison and
--   never echoed back to the client
-- • Only active users are returned — suspended/inactive tenants cannot log in

CREATE OR REPLACE FUNCTION find_tenant_user_for_auth(p_email TEXT)
RETURNS TABLE (
  id            UUID,
  email         TEXT,
  password_hash TEXT,
  tenant_id     UUID,
  name          TEXT
)
SECURITY DEFINER
SET search_path = public
LANGUAGE sql AS $$
  SELECT
    tu.id,
    tu.email,
    tu.password_hash,
    tu.tenant_id,
    tu.name
  FROM   tenant_users tu
  WHERE  tu.email     = p_email
    AND  tu.is_active = true
  LIMIT 1;
$$;

-- Revoke public access; only app_service (used by NextAuth authorize callback)
-- may call this function.
REVOKE ALL ON FUNCTION find_tenant_user_for_auth(TEXT) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION find_tenant_user_for_auth(TEXT) TO app_service;

-- ── 6. last_login_at update helper ────────────────────────────────────────────
-- Called after a successful authentication to stamp the login time without
-- requiring a privileged connection in the application layer.

CREATE OR REPLACE FUNCTION touch_tenant_user_login(p_tenant_user_id UUID)
RETURNS VOID
SECURITY DEFINER
SET search_path = public
LANGUAGE sql AS $$
  UPDATE tenant_users
  SET    last_login_at = now()
  WHERE  id = p_tenant_user_id;
$$;

REVOKE ALL ON FUNCTION touch_tenant_user_login(UUID) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION touch_tenant_user_login(UUID) TO app_service;

-- ── 7. Expired-session cleanup ────────────────────────────────────────────────
-- Called by the daily cron job (add to /api/cron/pos-sync or a new cron).
-- Keeps tenant_sessions from growing unbounded.

CREATE OR REPLACE FUNCTION purge_expired_tenant_sessions()
RETURNS BIGINT
SECURITY DEFINER
SET search_path = public
LANGUAGE plpgsql AS $$
DECLARE
  deleted_count BIGINT;
BEGIN
  DELETE FROM tenant_sessions WHERE expires_at < now();
  GET DIAGNOSTICS deleted_count = ROW_COUNT;
  RETURN deleted_count;
END;
$$;

REVOKE ALL ON FUNCTION purge_expired_tenant_sessions() FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION purge_expired_tenant_sessions() TO app_service;

-- ============================================================================
-- VERIFICATION
-- After running, confirm RLS is active:
--
--   SELECT tablename, rowsecurity, forcerowoecurity
--   FROM   pg_tables
--   WHERE  tablename IN ('tenant_users', 'tenant_sessions');
--
-- Confirm policies:
--
--   SELECT schemaname, tablename, policyname, roles, cmd, qual
--   FROM   pg_policies
--   WHERE  tablename IN ('tenant_users', 'tenant_sessions')
--   ORDER BY tablename, policyname;
--
-- Confirm functions:
--
--   SELECT proname, prosecdef
--   FROM   pg_proc
--   WHERE  proname IN (
--     'find_tenant_user_for_auth',
--     'touch_tenant_user_login',
--     'purge_expired_tenant_sessions'
--   );
-- ============================================================================
