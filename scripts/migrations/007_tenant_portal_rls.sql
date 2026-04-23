-- ============================================================================
-- Migration 007: Tenant Portal — Row-Level Security
-- ─────────────────────────────────────────────────────────────────────────────
-- Creates a dedicated `app_tenant` PostgreSQL role for all portal connections.
-- Adds SELECT-only RLS policies scoped to app.current_tenant_id on every
-- table the portal needs to read.
--
-- Why a separate role instead of reusing app_user?
-- ─────────────────────────────────────────────────
-- app_user runs internal application queries scoped by app.current_organization_id.
-- If we bolted tenant policies onto app_user we would need both GUCs set on
-- every connection — any bug that skips one GUC would silently cross scopes.
-- app_tenant is granted only the specific tables the portal displays.
-- All other tables (organizations, users, roles, agents, expenses, …) are
-- unreachable at the DB layer, not just filtered by application logic.
--
-- GUC convention
-- ──────────────
-- app.current_tenant_id   UUID of the authenticated tenant (set at portal login)
-- app.current_organization_id   still used by app_user — unrelated
--
-- USING clause pattern
-- ────────────────────
-- NULLIF(current_setting('app.current_tenant_id', true), '')::uuid
--   true  → returns NULL (not error) when GUC is unset
--   NULLIF → converts empty string to NULL (prevents invalid cast on '' )
--   ::uuid → validates format; malformed strings raise an error rather than
--             silently returning wrong rows
-- ============================================================================

-- ── 1. Role ───────────────────────────────────────────────────────────────────

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'app_tenant') THEN
    CREATE ROLE app_tenant LOGIN;
  END IF;
END
$$;

-- Let the role connect and see the schema
GRANT CONNECT ON DATABASE current_database() TO app_tenant;
GRANT USAGE ON SCHEMA public TO app_tenant;

-- ── 2. Table grants — SELECT only, explicit allowlist ─────────────────────────
-- Tables NOT listed here are invisible to app_tenant at the OS/role level even
-- if an RLS policy were to exist.  Defense-in-depth.

-- Portal-visible tables
GRANT SELECT ON tenant_users    TO app_tenant;
GRANT SELECT ON tenant_sessions TO app_tenant;
GRANT SELECT ON tenants         TO app_tenant;
GRANT SELECT ON leases          TO app_tenant;
GRANT SELECT ON invoices        TO app_tenant;
GRANT SELECT ON payments        TO app_tenant;

-- pos_transactions granted conditionally after the table is created (see §5)
-- documents         granted conditionally after the table is created (see §6)

-- Explicitly revoke everything else (belt-and-suspenders — not strictly needed
-- because roles have no default privileges, but makes intent auditable)
REVOKE ALL ON organizations  FROM app_tenant;
REVOKE ALL ON properties     FROM app_tenant;
REVOKE ALL ON users          FROM app_tenant;
REVOKE ALL ON roles          FROM app_tenant;
REVOKE ALL ON agents         FROM app_tenant;
REVOKE ALL ON agent_actions  FROM app_tenant;
REVOKE ALL ON agent_decisions FROM app_tenant;
REVOKE ALL ON expenses       FROM app_tenant;
REVOKE ALL ON work_orders    FROM app_tenant;
REVOKE ALL ON vendors        FROM app_tenant;
REVOKE ALL ON equipment      FROM app_tenant;
REVOKE ALL ON compliance_requirements FROM app_tenant;
REVOKE ALL ON conversations  FROM app_tenant;
REVOKE ALL ON messages       FROM app_tenant;
REVOKE ALL ON notifications  FROM app_tenant;
REVOKE ALL ON daily_metrics  FROM app_tenant;
REVOKE ALL ON pos_integrations FROM app_tenant;  -- config/keys hidden

-- ── 3. Helper macro ───────────────────────────────────────────────────────────
-- Reused in every USING clause.  Stored as a SQL function so the logic lives
-- in one place and every policy references it.
--
-- Returns the current tenant UUID, or NULL when the GUC is absent/empty.
-- A NULL in USING makes the row invisible (same as false).

CREATE OR REPLACE FUNCTION current_tenant_id()
RETURNS UUID
STABLE
SECURITY INVOKER            -- runs as the calling role (app_tenant), not superuser
SET search_path = public
LANGUAGE sql AS $$
  SELECT NULLIF(current_setting('app.current_tenant_id', true), '')::uuid;
$$;

GRANT EXECUTE ON FUNCTION current_tenant_id() TO app_tenant;
GRANT EXECUTE ON FUNCTION current_tenant_id() TO app_user;
GRANT EXECUTE ON FUNCTION current_tenant_id() TO app_service;

-- ── 4. RLS policies ───────────────────────────────────────────────────────────
-- Note: RLS was already enabled (FORCE) on tenant_users and tenant_sessions in
-- migration 006.  Those tables only need an app_tenant policy added here.
-- The remaining tables (leases, invoices, payments) already have FORCE RLS
-- from migration 001; we add a second policy for app_tenant.
-- Multiple PERMISSIVE policies on a table are OR'd together — the existing
-- app_user org-isolation policy is unaffected.

-- ── tenant_users ─────────────────────────────────────────────────────────────
-- Direct tenant_id column.  app_tenant may read their own account row only.

DROP POLICY IF EXISTS tenant_portal_isolation ON tenant_users;
CREATE POLICY tenant_portal_isolation ON tenant_users
  AS PERMISSIVE FOR SELECT TO app_tenant
  USING (
    tenant_id = current_tenant_id()
  );

-- ── tenant_sessions ───────────────────────────────────────────────────────────
-- Correlated through tenant_users to reach tenant_id.

DROP POLICY IF EXISTS tenant_portal_isolation ON tenant_sessions;
CREATE POLICY tenant_portal_isolation ON tenant_sessions
  AS PERMISSIVE FOR SELECT TO app_tenant
  USING (
    EXISTS (
      SELECT 1 FROM tenant_users tu
      WHERE  tu.id        = tenant_sessions.tenant_user_id
        AND  tu.tenant_id = current_tenant_id()
    )
  );

-- ── tenants ───────────────────────────────────────────────────────────────────
-- The tenant's own business record.  Direct id match, not tenant_id FK.
-- Portal reads this for its own profile page.
--
-- NOTE: sensitive agent-calculated columns (risk_score, sentiment_score) are
-- filtered at the API layer (SELECT specific columns), not here — RLS is
-- row-level only.

DROP POLICY IF EXISTS tenant_portal_isolation ON tenants;
CREATE POLICY tenant_portal_isolation ON tenants
  AS PERMISSIVE FOR SELECT TO app_tenant
  USING (
    id = current_tenant_id()
  );

-- ── leases ────────────────────────────────────────────────────────────────────
-- Has a direct tenant_id column.

DROP POLICY IF EXISTS tenant_portal_isolation ON leases;
CREATE POLICY tenant_portal_isolation ON leases
  AS PERMISSIVE FOR SELECT TO app_tenant
  USING (
    tenant_id = current_tenant_id()
  );

-- ── invoices ──────────────────────────────────────────────────────────────────
-- No direct tenant_id.  Route: invoices.lease_id → leases.tenant_id.
-- EXISTS is faster than JOIN for a USING clause (avoids row multiplication).

DROP POLICY IF EXISTS tenant_portal_isolation ON invoices;
CREATE POLICY tenant_portal_isolation ON invoices
  AS PERMISSIVE FOR SELECT TO app_tenant
  USING (
    EXISTS (
      SELECT 1 FROM leases l
      WHERE  l.id        = invoices.lease_id
        AND  l.tenant_id = current_tenant_id()
    )
  );

-- ── payments ──────────────────────────────────────────────────────────────────
-- No direct tenant_id.  Route: payments.invoice_id → invoices.lease_id
--                                                   → leases.tenant_id.

DROP POLICY IF EXISTS tenant_portal_isolation ON payments;
CREATE POLICY tenant_portal_isolation ON payments
  AS PERMISSIVE FOR SELECT TO app_tenant
  USING (
    EXISTS (
      SELECT 1
      FROM   invoices  i
      JOIN   leases    l ON l.id = i.lease_id
      WHERE  i.id        = payments.invoice_id
        AND  l.tenant_id = current_tenant_id()
    )
  );

-- ── 5. pos_transactions (conditional) ────────────────────────────────────────
-- This table is defined in the architecture plan but not yet created.
-- Run this block after migration 008_pos_transactions.sql is applied.

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE  table_schema = 'public'
      AND  table_name   = 'pos_transactions'
  ) THEN
    -- Grant
    EXECUTE 'GRANT SELECT ON pos_transactions TO app_tenant';

    -- Policy: pos_transactions has a direct tenant_id column
    EXECUTE '
      DROP POLICY IF EXISTS tenant_portal_isolation ON pos_transactions;
      CREATE POLICY tenant_portal_isolation ON pos_transactions
        AS PERMISSIVE FOR SELECT TO app_tenant
        USING (tenant_id = current_tenant_id())
    ';

    RAISE NOTICE 'tenant_portal_isolation policy created on pos_transactions';
  ELSE
    RAISE NOTICE 'pos_transactions does not exist yet — skipping policy (re-run after migration 008)';
  END IF;
END
$$;

-- ── 6. documents (conditional) ───────────────────────────────────────────────
-- Documents table is not yet in the schema.  Stub applied when it exists.
-- Expected columns: id UUID, tenant_id UUID, ...

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE  table_schema = 'public'
      AND  table_name   = 'documents'
  ) THEN
    EXECUTE 'GRANT SELECT ON documents TO app_tenant';

    EXECUTE '
      DROP POLICY IF EXISTS tenant_portal_isolation ON documents;
      CREATE POLICY tenant_portal_isolation ON documents
        AS PERMISSIVE FOR SELECT TO app_tenant
        USING (tenant_id = current_tenant_id())
    ';

    RAISE NOTICE 'tenant_portal_isolation policy created on documents';
  ELSE
    RAISE NOTICE 'documents table does not exist yet — skipping policy';
  END IF;
END
$$;

-- ── 7. set_tenant_context() helper ────────────────────────────────────────────
-- Called by the portal's DB context layer before every query, mirroring the
-- set_config call used for app.current_organization_id in withOrgContext.ts.
-- Using a function (rather than raw SET in app code) centralises validation:
-- it rejects non-UUID values before they reach the GUC.

CREATE OR REPLACE FUNCTION set_tenant_context(p_tenant_id UUID)
RETURNS VOID
SECURITY INVOKER
SET search_path = public
LANGUAGE sql AS $$
  SELECT set_config('app.current_tenant_id', p_tenant_id::text, true);
$$;

-- Callable by the application role only.  Not public.
REVOKE ALL  ON FUNCTION set_tenant_context(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION set_tenant_context(UUID) TO app_tenant;
GRANT EXECUTE ON FUNCTION set_tenant_context(UUID) TO app_service;

-- ── 8. pos_sales_data (read-only for tenant) ──────────────────────────────────
-- Tenant can see their own daily sales summaries (useful for portal dashboard).
-- pos_integrations is NOT exposed — it contains API keys.

GRANT SELECT ON pos_sales_data TO app_tenant;

DROP POLICY IF EXISTS tenant_portal_isolation ON pos_sales_data;
CREATE POLICY tenant_portal_isolation ON pos_sales_data
  AS PERMISSIVE FOR SELECT TO app_tenant
  USING (
    tenant_id = current_tenant_id()
  );

-- ============================================================================
-- VERIFICATION
-- ─────────────────────────────────────────────────────────────────────────────
-- 1. Confirm app_tenant role exists:
--      SELECT rolname FROM pg_roles WHERE rolname = 'app_tenant';
--
-- 2. Confirm policies on each table:
--      SELECT tablename, policyname, roles, cmd, qual
--      FROM   pg_policies
--      WHERE  policyname = 'tenant_portal_isolation'
--      ORDER  BY tablename;
--
-- 3. Smoke test — should return 0 rows (no tenant context set):
--      SET ROLE app_tenant;
--      SELECT count(*) FROM leases;          -- expect 0
--      SELECT count(*) FROM invoices;        -- expect 0
--      SELECT count(*) FROM payments;        -- expect 0
--      RESET ROLE;
--
-- 4. Smoke test — should return rows for tenant only:
--      SET ROLE app_tenant;
--      SELECT set_config('app.current_tenant_id', '<valid-tenant-uuid>', true);
--      SELECT count(*) FROM leases;          -- expect N rows for that tenant
--      RESET ROLE;
--
-- 5. Confirm blocked tables return permission-denied (not 0 rows):
--      SET ROLE app_tenant;
--      SELECT count(*) FROM organizations;   -- expect ERROR: permission denied
--      SELECT count(*) FROM users;           -- expect ERROR: permission denied
--      RESET ROLE;
-- ============================================================================
