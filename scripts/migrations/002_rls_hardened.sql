-- ============================================================================
-- Migration 002: Hardened Row-Level Security
-- ============================================================================
-- REPLACES the incomplete policies in 001_enable_rls.sql.
-- Run after 001 — will DROP all existing policies and recreate correctly.
--
-- CRITICAL SECURITY FIX in 001:
--   `FOR ALL USING (expr)` without `WITH CHECK` leaves INSERT unrestricted.
--   PostgreSQL only applies USING to SELECT/UPDATE/DELETE row filtering.
--   INSERT requires an explicit WITH CHECK; without it any row can be inserted.
--
-- Architecture
-- ─────────────
-- Four application roles, none with BYPASSRLS:
--
--   app_user        Normal authenticated end-users. Full RLS enforced.
--   app_service     Background jobs + auth lookups. RLS enforced; can set
--                   org context per-job. Can call SECURITY DEFINER functions.
--   app_admin       Internal support/ops. RLS enforced, but may call
--                   admin_set_org_context() to impersonate any org — every
--                   impersonation is immutably logged.
--   app_provisioner Tenant onboarding only. Can INSERT organizations + seed
--                   data. All other mutations are RLS-restricted.
--
-- The postgres superuser is used ONLY for migrations. It is never in a
-- connection string exposed to application code.
--
-- Session variable contract
-- ──────────────────────────
-- Before every query, the application MUST call (inside a transaction):
--   SELECT set_config('app.current_organization_id', '<uuid>', true);
--   SELECT set_config('app.current_user_id',         '<uuid>', true);
--
-- The `true` third argument scopes the setting to the current transaction only.
-- It is automatically cleared on COMMIT or ROLLBACK.
-- DO NOT use `SET LOCAL app.current_organization_id = '...'` — that syntax
-- works in psql but not via parameterized queries.
--
-- Policy semantics
-- ─────────────────
-- USING       → filters which *existing* rows are visible / targetable
--               (applies to SELECT, UPDATE row filter, DELETE row filter)
-- WITH CHECK  → validates *new* row values on write
--               (applies to INSERT, UPDATE new-value check)
-- ============================================================================

-- ── 1. Role Hierarchy ────────────────────────────────────────────────────────

DO $$
DECLARE
  r TEXT;
BEGIN
  FOREACH r IN ARRAY ARRAY['app_user','app_service','app_admin','app_provisioner'] LOOP
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = r) THEN
      EXECUTE format('CREATE ROLE %I NOINHERIT NOCREATEDB NOCREATEROLE NOBYPASSRLS', r);
    END IF;
    -- Guarantee none of these roles can bypass RLS, even if accidentally granted
    EXECUTE format('ALTER ROLE %I NOBYPASSRLS', r);
  END LOOP;
END $$;

-- app_admin and app_provisioner can log in; app_service too
ALTER ROLE app_user        LOGIN;
ALTER ROLE app_service     LOGIN;
ALTER ROLE app_admin       LOGIN;
ALTER ROLE app_provisioner LOGIN;

-- ── 2. Grants ────────────────────────────────────────────────────────────────
-- Performed against the specific DB name via psql \gset or wrapper scripts.
-- Shown here with placeholder — replace 'YOUR_DB' in your deploy script.
-- GRANT CONNECT ON DATABASE "YOUR_DB" TO app_user, app_service, app_admin, app_provisioner;

GRANT USAGE ON SCHEMA public TO app_user, app_service, app_admin, app_provisioner;

-- app_user: DML on all tables (RLS restricts to own org)
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES    IN SCHEMA public TO app_user;
GRANT USAGE, SELECT                  ON ALL SEQUENCES IN SCHEMA public TO app_user;

-- app_service: same as app_user, plus EXECUTE on SECURITY DEFINER functions
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES    IN SCHEMA public TO app_service;
GRANT USAGE, SELECT                  ON ALL SEQUENCES IN SCHEMA public TO app_service;

-- app_admin: SELECT + limited DML; impersonation via function (not raw UPDATE)
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES    IN SCHEMA public TO app_admin;
GRANT USAGE, SELECT                  ON ALL SEQUENCES IN SCHEMA public TO app_admin;

-- app_provisioner: only what's needed during tenant creation
GRANT INSERT, SELECT ON organizations TO app_provisioner;
GRANT INSERT, SELECT ON users         TO app_provisioner;
GRANT INSERT, SELECT ON roles         TO app_provisioner;
GRANT INSERT, SELECT ON wizard_sessions TO app_provisioner;
GRANT INSERT         ON provisioning_events TO app_provisioner;
GRANT USAGE, SELECT  ON ALL SEQUENCES IN SCHEMA public TO app_provisioner;

-- Default privileges for future tables
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES    TO app_user, app_service, app_admin;
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT USAGE, SELECT                  ON SEQUENCES TO app_user, app_service, app_admin;

-- ── 3. GUC validation function ───────────────────────────────────────────────
-- Returns the current org ID as UUID, or raises if not set / malformed.
-- Used inside policies to get a typed UUID (prevents string-injection tricks).

CREATE OR REPLACE FUNCTION app_current_org_id()
RETURNS UUID
STABLE
LANGUAGE plpgsql AS $$
DECLARE
  raw TEXT;
  result UUID;
BEGIN
  raw := current_setting('app.current_organization_id', true);
  IF raw IS NULL OR raw = '' THEN
    RETURN NULL;  -- Policies treat NULL as "no match" → row denied
  END IF;
  BEGIN
    result := raw::UUID;
  EXCEPTION WHEN invalid_text_representation THEN
    RAISE EXCEPTION 'app.current_organization_id is not a valid UUID: %', raw
      USING ERRCODE = 'invalid_parameter_value';
  END;
  RETURN result;
END;
$$;

-- ── 4. Helper: org_id_of_property ────────────────────────────────────────────
-- Used in WITH CHECK clauses for property-scoped tables to avoid correlated
-- subquery repetition. SECURITY DEFINER so it can read properties even when
-- called from within a restrictive RLS context.

CREATE OR REPLACE FUNCTION org_id_of_property(p_property_id UUID)
RETURNS UUID
STABLE
SECURITY DEFINER
SET search_path = public
LANGUAGE sql AS $$
  SELECT organization_id FROM properties WHERE id = p_property_id;
$$;

-- ============================================================================
-- DROP all 001 policies before recreating
-- ============================================================================
DO $$
DECLARE
  tbl  TEXT;
  pol  TEXT;
BEGIN
  FOR tbl, pol IN
    SELECT tablename, policyname
    FROM   pg_policies
    WHERE  schemaname = 'public'
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON %I', pol, tbl);
  END LOOP;
END $$;

-- ============================================================================
-- MACRO: Per-table policy templates
-- ============================================================================

-- ── ORGANIZATIONS ────────────────────────────────────────────────────────────
-- Users can see / update only their own org.
-- INSERT is intentionally not granted to app_user (provisioner only).
-- DELETE is intentionally not granted to app_user.

ALTER TABLE organizations ENABLE ROW LEVEL SECURITY;
ALTER TABLE organizations FORCE  ROW LEVEL SECURITY;

CREATE POLICY sel ON organizations FOR SELECT TO app_user, app_service, app_admin
  USING (id = app_current_org_id());

CREATE POLICY upd ON organizations FOR UPDATE TO app_user, app_service
  USING      (id = app_current_org_id())
  WITH CHECK (id = app_current_org_id());

-- app_provisioner INSERT policy (unrestricted within provisioner role)
CREATE POLICY prov_ins ON organizations FOR INSERT TO app_provisioner
  WITH CHECK (true);

-- app_admin: USING only (can read any org after calling admin_set_org_context)
-- app_admin INSERT/UPDATE done via admin_set_org_context transaction

-- ── USERS ────────────────────────────────────────────────────────────────────
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE users FORCE  ROW LEVEL SECURITY;

CREATE POLICY sel ON users FOR SELECT TO app_user, app_service, app_admin
  USING (organization_id = app_current_org_id());

CREATE POLICY ins ON users FOR INSERT TO app_user, app_service, app_provisioner
  WITH CHECK (organization_id = app_current_org_id());

-- app_provisioner inserts the first user during provisioning
CREATE POLICY prov_ins ON users FOR INSERT TO app_provisioner
  WITH CHECK (true);  -- provisioner is responsible for setting correct org_id

CREATE POLICY upd ON users FOR UPDATE TO app_user, app_service
  USING      (organization_id = app_current_org_id())
  WITH CHECK (organization_id = app_current_org_id());  -- cannot move to another org

CREATE POLICY del ON users FOR DELETE TO app_user, app_service
  USING (organization_id = app_current_org_id());

-- ── PROPERTIES ───────────────────────────────────────────────────────────────
ALTER TABLE properties ENABLE ROW LEVEL SECURITY;
ALTER TABLE properties FORCE  ROW LEVEL SECURITY;

CREATE POLICY sel ON properties FOR SELECT TO app_user, app_service, app_admin
  USING (organization_id = app_current_org_id());

CREATE POLICY ins ON properties FOR INSERT TO app_user, app_service
  WITH CHECK (organization_id = app_current_org_id());

CREATE POLICY upd ON properties FOR UPDATE TO app_user, app_service
  USING      (organization_id = app_current_org_id())
  WITH CHECK (organization_id = app_current_org_id());

CREATE POLICY del ON properties FOR DELETE TO app_user, app_service
  USING (organization_id = app_current_org_id());

-- ── TENANTS ──────────────────────────────────────────────────────────────────
ALTER TABLE tenants ENABLE ROW LEVEL SECURITY;
ALTER TABLE tenants FORCE  ROW LEVEL SECURITY;

CREATE POLICY sel ON tenants FOR SELECT TO app_user, app_service, app_admin
  USING (org_id_of_property(property_id) = app_current_org_id());

CREATE POLICY ins ON tenants FOR INSERT TO app_user, app_service
  WITH CHECK (org_id_of_property(property_id) = app_current_org_id());

CREATE POLICY upd ON tenants FOR UPDATE TO app_user, app_service
  USING      (org_id_of_property(property_id) = app_current_org_id())
  WITH CHECK (org_id_of_property(property_id) = app_current_org_id());

CREATE POLICY del ON tenants FOR DELETE TO app_user, app_service
  USING (org_id_of_property(property_id) = app_current_org_id());

-- ── LEASES ───────────────────────────────────────────────────────────────────
ALTER TABLE leases ENABLE ROW LEVEL SECURITY;
ALTER TABLE leases FORCE  ROW LEVEL SECURITY;

CREATE POLICY sel ON leases FOR SELECT TO app_user, app_service, app_admin
  USING (org_id_of_property(property_id) = app_current_org_id());

CREATE POLICY ins ON leases FOR INSERT TO app_user, app_service
  WITH CHECK (org_id_of_property(property_id) = app_current_org_id());

CREATE POLICY upd ON leases FOR UPDATE TO app_user, app_service
  USING      (org_id_of_property(property_id) = app_current_org_id())
  WITH CHECK (org_id_of_property(property_id) = app_current_org_id());

CREATE POLICY del ON leases FOR DELETE TO app_user, app_service
  USING (org_id_of_property(property_id) = app_current_org_id());

-- ── EXPENSES ─────────────────────────────────────────────────────────────────
ALTER TABLE expenses ENABLE ROW LEVEL SECURITY;
ALTER TABLE expenses FORCE  ROW LEVEL SECURITY;

CREATE POLICY sel ON expenses FOR SELECT TO app_user, app_service, app_admin
  USING (org_id_of_property(property_id) = app_current_org_id());

CREATE POLICY ins ON expenses FOR INSERT TO app_user, app_service
  WITH CHECK (org_id_of_property(property_id) = app_current_org_id());

CREATE POLICY upd ON expenses FOR UPDATE TO app_user, app_service
  USING      (org_id_of_property(property_id) = app_current_org_id())
  WITH CHECK (org_id_of_property(property_id) = app_current_org_id());

CREATE POLICY del ON expenses FOR DELETE TO app_user, app_service
  USING (org_id_of_property(property_id) = app_current_org_id());

-- ── EQUIPMENT ────────────────────────────────────────────────────────────────
ALTER TABLE equipment ENABLE ROW LEVEL SECURITY;
ALTER TABLE equipment FORCE  ROW LEVEL SECURITY;

CREATE POLICY sel ON equipment FOR SELECT TO app_user, app_service, app_admin
  USING (org_id_of_property(property_id) = app_current_org_id());

CREATE POLICY ins ON equipment FOR INSERT TO app_user, app_service
  WITH CHECK (org_id_of_property(property_id) = app_current_org_id());

CREATE POLICY upd ON equipment FOR UPDATE TO app_user, app_service
  USING      (org_id_of_property(property_id) = app_current_org_id())
  WITH CHECK (org_id_of_property(property_id) = app_current_org_id());

CREATE POLICY del ON equipment FOR DELETE TO app_user, app_service
  USING (org_id_of_property(property_id) = app_current_org_id());

-- ── WORK ORDERS ──────────────────────────────────────────────────────────────
ALTER TABLE work_orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE work_orders FORCE  ROW LEVEL SECURITY;

CREATE POLICY sel ON work_orders FOR SELECT TO app_user, app_service, app_admin
  USING (org_id_of_property(property_id) = app_current_org_id());

CREATE POLICY ins ON work_orders FOR INSERT TO app_user, app_service
  WITH CHECK (org_id_of_property(property_id) = app_current_org_id());

CREATE POLICY upd ON work_orders FOR UPDATE TO app_user, app_service
  USING      (org_id_of_property(property_id) = app_current_org_id())
  WITH CHECK (org_id_of_property(property_id) = app_current_org_id());

CREATE POLICY del ON work_orders FOR DELETE TO app_user, app_service
  USING (org_id_of_property(property_id) = app_current_org_id());

-- ── CONVERSATIONS ─────────────────────────────────────────────────────────────
ALTER TABLE conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE conversations FORCE  ROW LEVEL SECURITY;

CREATE POLICY sel ON conversations FOR SELECT TO app_user, app_service, app_admin
  USING (org_id_of_property(property_id) = app_current_org_id());

CREATE POLICY ins ON conversations FOR INSERT TO app_user, app_service
  WITH CHECK (org_id_of_property(property_id) = app_current_org_id());

CREATE POLICY upd ON conversations FOR UPDATE TO app_user, app_service
  USING      (org_id_of_property(property_id) = app_current_org_id())
  WITH CHECK (org_id_of_property(property_id) = app_current_org_id());

CREATE POLICY del ON conversations FOR DELETE TO app_user, app_service
  USING (org_id_of_property(property_id) = app_current_org_id());

-- ── AGENT ACTIONS ─────────────────────────────────────────────────────────────
ALTER TABLE agent_actions ENABLE ROW LEVEL SECURITY;
ALTER TABLE agent_actions FORCE  ROW LEVEL SECURITY;

CREATE POLICY sel ON agent_actions FOR SELECT TO app_user, app_service, app_admin
  USING (org_id_of_property(property_id) = app_current_org_id());

CREATE POLICY ins ON agent_actions FOR INSERT TO app_user, app_service
  WITH CHECK (org_id_of_property(property_id) = app_current_org_id());

CREATE POLICY upd ON agent_actions FOR UPDATE TO app_user, app_service
  USING      (org_id_of_property(property_id) = app_current_org_id())
  WITH CHECK (org_id_of_property(property_id) = app_current_org_id());

-- ── POS INTEGRATIONS ──────────────────────────────────────────────────────────
ALTER TABLE pos_integrations ENABLE ROW LEVEL SECURITY;
ALTER TABLE pos_integrations FORCE  ROW LEVEL SECURITY;

CREATE POLICY sel ON pos_integrations FOR SELECT TO app_user, app_service, app_admin
  USING (org_id_of_property(property_id) = app_current_org_id());

CREATE POLICY ins ON pos_integrations FOR INSERT TO app_user, app_service
  WITH CHECK (org_id_of_property(property_id) = app_current_org_id());

CREATE POLICY upd ON pos_integrations FOR UPDATE TO app_user, app_service
  USING      (org_id_of_property(property_id) = app_current_org_id())
  WITH CHECK (org_id_of_property(property_id) = app_current_org_id());

CREATE POLICY del ON pos_integrations FOR DELETE TO app_user, app_service
  USING (org_id_of_property(property_id) = app_current_org_id());

-- ── POS SALES DATA ────────────────────────────────────────────────────────────
ALTER TABLE pos_sales_data ENABLE ROW LEVEL SECURITY;
ALTER TABLE pos_sales_data FORCE  ROW LEVEL SECURITY;

CREATE POLICY sel ON pos_sales_data FOR SELECT TO app_user, app_service, app_admin
  USING (org_id_of_property(property_id) = app_current_org_id());

CREATE POLICY ins ON pos_sales_data FOR INSERT TO app_user, app_service
  WITH CHECK (org_id_of_property(property_id) = app_current_org_id());

CREATE POLICY upd ON pos_sales_data FOR UPDATE TO app_user, app_service
  USING      (org_id_of_property(property_id) = app_current_org_id())
  WITH CHECK (org_id_of_property(property_id) = app_current_org_id());

CREATE POLICY del ON pos_sales_data FOR DELETE TO app_user, app_service
  USING (org_id_of_property(property_id) = app_current_org_id());

-- ── COMPLIANCE REQUIREMENTS ────────────────────────────────────────────────────
ALTER TABLE compliance_requirements ENABLE ROW LEVEL SECURITY;
ALTER TABLE compliance_requirements FORCE  ROW LEVEL SECURITY;

CREATE POLICY sel ON compliance_requirements FOR SELECT TO app_user, app_service, app_admin
  USING (org_id_of_property(property_id) = app_current_org_id());

CREATE POLICY ins ON compliance_requirements FOR INSERT TO app_user, app_service
  WITH CHECK (org_id_of_property(property_id) = app_current_org_id());

CREATE POLICY upd ON compliance_requirements FOR UPDATE TO app_user, app_service
  USING      (org_id_of_property(property_id) = app_current_org_id())
  WITH CHECK (org_id_of_property(property_id) = app_current_org_id());

CREATE POLICY del ON compliance_requirements FOR DELETE TO app_user, app_service
  USING (org_id_of_property(property_id) = app_current_org_id());

-- ── DAILY METRICS ─────────────────────────────────────────────────────────────
ALTER TABLE daily_metrics ENABLE ROW LEVEL SECURITY;
ALTER TABLE daily_metrics FORCE  ROW LEVEL SECURITY;

CREATE POLICY sel ON daily_metrics FOR SELECT TO app_user, app_service, app_admin
  USING (org_id_of_property(property_id) = app_current_org_id());

CREATE POLICY ins ON daily_metrics FOR INSERT TO app_user, app_service
  WITH CHECK (org_id_of_property(property_id) = app_current_org_id());

CREATE POLICY upd ON daily_metrics FOR UPDATE TO app_user, app_service
  USING      (org_id_of_property(property_id) = app_current_org_id())
  WITH CHECK (org_id_of_property(property_id) = app_current_org_id());

-- ── INVOICES  (via lease → property) ─────────────────────────────────────────
ALTER TABLE invoices ENABLE ROW LEVEL SECURITY;
ALTER TABLE invoices FORCE  ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION org_id_of_lease(p_lease_id UUID)
RETURNS UUID STABLE SECURITY DEFINER SET search_path = public
LANGUAGE sql AS $$
  SELECT org_id_of_property(l.property_id)
  FROM leases l WHERE l.id = p_lease_id;
$$;

CREATE POLICY sel ON invoices FOR SELECT TO app_user, app_service, app_admin
  USING (org_id_of_lease(lease_id) = app_current_org_id());

CREATE POLICY ins ON invoices FOR INSERT TO app_user, app_service
  WITH CHECK (org_id_of_lease(lease_id) = app_current_org_id());

CREATE POLICY upd ON invoices FOR UPDATE TO app_user, app_service
  USING      (org_id_of_lease(lease_id) = app_current_org_id())
  WITH CHECK (org_id_of_lease(lease_id) = app_current_org_id());

CREATE POLICY del ON invoices FOR DELETE TO app_user, app_service
  USING (org_id_of_lease(lease_id) = app_current_org_id());

-- ── PAYMENTS  (via invoice → lease → property) ────────────────────────────────
ALTER TABLE payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE payments FORCE  ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION org_id_of_invoice(p_invoice_id UUID)
RETURNS UUID STABLE SECURITY DEFINER SET search_path = public
LANGUAGE sql AS $$
  SELECT org_id_of_lease(i.lease_id) FROM invoices i WHERE i.id = p_invoice_id;
$$;

CREATE POLICY sel ON payments FOR SELECT TO app_user, app_service, app_admin
  USING (org_id_of_invoice(invoice_id) = app_current_org_id());

CREATE POLICY ins ON payments FOR INSERT TO app_user, app_service
  WITH CHECK (org_id_of_invoice(invoice_id) = app_current_org_id());

CREATE POLICY upd ON payments FOR UPDATE TO app_user, app_service
  USING      (org_id_of_invoice(invoice_id) = app_current_org_id())
  WITH CHECK (org_id_of_invoice(invoice_id) = app_current_org_id());

CREATE POLICY del ON payments FOR DELETE TO app_user, app_service
  USING (org_id_of_invoice(invoice_id) = app_current_org_id());

-- ── MESSAGES  (via conversation → property) ────────────────────────────────────
ALTER TABLE messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE messages FORCE  ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION org_id_of_conversation(p_conv_id UUID)
RETURNS UUID STABLE SECURITY DEFINER SET search_path = public
LANGUAGE sql AS $$
  SELECT org_id_of_property(c.property_id) FROM conversations c WHERE c.id = p_conv_id;
$$;

CREATE POLICY sel ON messages FOR SELECT TO app_user, app_service, app_admin
  USING (org_id_of_conversation(conversation_id) = app_current_org_id());

CREATE POLICY ins ON messages FOR INSERT TO app_user, app_service
  WITH CHECK (org_id_of_conversation(conversation_id) = app_current_org_id());

CREATE POLICY upd ON messages FOR UPDATE TO app_user, app_service
  USING      (org_id_of_conversation(conversation_id) = app_current_org_id())
  WITH CHECK (org_id_of_conversation(conversation_id) = app_current_org_id());

CREATE POLICY del ON messages FOR DELETE TO app_user, app_service
  USING (org_id_of_conversation(conversation_id) = app_current_org_id());

-- ── WORK ORDER PHOTOS ─────────────────────────────────────────────────────────
ALTER TABLE work_order_photos ENABLE ROW LEVEL SECURITY;
ALTER TABLE work_order_photos FORCE  ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION org_id_of_work_order(p_wo_id UUID)
RETURNS UUID STABLE SECURITY DEFINER SET search_path = public
LANGUAGE sql AS $$
  SELECT org_id_of_property(wo.property_id) FROM work_orders wo WHERE wo.id = p_wo_id;
$$;

CREATE POLICY sel ON work_order_photos FOR SELECT TO app_user, app_service, app_admin
  USING (org_id_of_work_order(work_order_id) = app_current_org_id());

CREATE POLICY ins ON work_order_photos FOR INSERT TO app_user, app_service
  WITH CHECK (org_id_of_work_order(work_order_id) = app_current_org_id());

CREATE POLICY upd ON work_order_photos FOR UPDATE TO app_user, app_service
  USING      (org_id_of_work_order(work_order_id) = app_current_org_id())
  WITH CHECK (org_id_of_work_order(work_order_id) = app_current_org_id());

CREATE POLICY del ON work_order_photos FOR DELETE TO app_user, app_service
  USING (org_id_of_work_order(work_order_id) = app_current_org_id());

-- ── PWA SYNC QUEUE ────────────────────────────────────────────────────────────
ALTER TABLE pwa_sync_queue ENABLE ROW LEVEL SECURITY;
ALTER TABLE pwa_sync_queue FORCE  ROW LEVEL SECURITY;

CREATE POLICY sel ON pwa_sync_queue FOR SELECT TO app_user, app_service
  USING (organization_id = app_current_org_id());

CREATE POLICY ins ON pwa_sync_queue FOR INSERT TO app_user, app_service
  WITH CHECK (organization_id = app_current_org_id());

CREATE POLICY upd ON pwa_sync_queue FOR UPDATE TO app_service
  USING      (organization_id = app_current_org_id())
  WITH CHECK (organization_id = app_current_org_id());

-- ── WIZARD SESSIONS ───────────────────────────────────────────────────────────
ALTER TABLE wizard_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE wizard_sessions FORCE  ROW LEVEL SECURITY;

CREATE POLICY sel ON wizard_sessions FOR SELECT TO app_user, app_service, app_provisioner
  USING (organization_id = app_current_org_id());

CREATE POLICY ins ON wizard_sessions FOR INSERT TO app_user, app_service, app_provisioner
  WITH CHECK (organization_id = app_current_org_id());

-- app_provisioner uses org_id it's in the process of creating; allow via prov_ins
CREATE POLICY prov_ins ON wizard_sessions FOR INSERT TO app_provisioner
  WITH CHECK (true);

CREATE POLICY upd ON wizard_sessions FOR UPDATE TO app_user, app_service
  USING      (organization_id = app_current_org_id())
  WITH CHECK (organization_id = app_current_org_id());

-- ── ASSISTANT SESSIONS ────────────────────────────────────────────────────────
ALTER TABLE assistant_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE assistant_sessions FORCE  ROW LEVEL SECURITY;

CREATE POLICY sel ON assistant_sessions FOR SELECT TO app_user, app_service
  USING (organization_id = app_current_org_id());

CREATE POLICY ins ON assistant_sessions FOR INSERT TO app_user, app_service
  WITH CHECK (organization_id = app_current_org_id());

CREATE POLICY upd ON assistant_sessions FOR UPDATE TO app_user, app_service
  USING      (organization_id = app_current_org_id())
  WITH CHECK (organization_id = app_current_org_id());

-- ── ASSISTANT MESSAGES ────────────────────────────────────────────────────────
ALTER TABLE assistant_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE assistant_messages FORCE  ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION org_id_of_assistant_session(p_session_id UUID)
RETURNS UUID STABLE SECURITY DEFINER SET search_path = public
LANGUAGE sql AS $$
  SELECT organization_id FROM assistant_sessions WHERE id = p_session_id;
$$;

CREATE POLICY sel ON assistant_messages FOR SELECT TO app_user, app_service
  USING (org_id_of_assistant_session(session_id) = app_current_org_id());

CREATE POLICY ins ON assistant_messages FOR INSERT TO app_user, app_service
  WITH CHECK (org_id_of_assistant_session(session_id) = app_current_org_id());

-- ── ASSISTANT QUERY LOG ────────────────────────────────────────────────────────
ALTER TABLE assistant_query_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE assistant_query_log FORCE  ROW LEVEL SECURITY;

CREATE POLICY sel ON assistant_query_log FOR SELECT TO app_user, app_service
  USING (organization_id = app_current_org_id());

CREATE POLICY ins ON assistant_query_log FOR INSERT TO app_user, app_service
  WITH CHECK (organization_id = app_current_org_id());

-- ── GLOBAL / SHARED TABLES ────────────────────────────────────────────────────
-- Not org-scoped. All authenticated app users may read; writes are controlled
-- by application-level permissions (RBAC), not RLS.
DO $$
DECLARE tbl TEXT;
BEGIN
  FOREACH tbl IN ARRAY ARRAY[
    'agents', 'agent_decisions', 'vendors', 'roles', 'notifications'
  ] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', tbl);
    EXECUTE format('ALTER TABLE %I FORCE  ROW LEVEL SECURITY', tbl);
    EXECUTE format(
      'CREATE POLICY sel ON %I FOR SELECT TO app_user, app_service, app_admin USING (true)',
      tbl
    );
    -- Writes to global tables only via app_service (agents create notifications, etc.)
    EXECUTE format(
      'CREATE POLICY ins ON %I FOR INSERT TO app_service WITH CHECK (true)', tbl
    );
    EXECUTE format(
      'CREATE POLICY upd ON %I FOR UPDATE TO app_service USING (true) WITH CHECK (true)', tbl
    );
  END LOOP;
END $$;

-- ── SECURITY DEFINER: auth user lookup ────────────────────────────────────────
-- Called during NextAuth credential validation.
-- Runs as its definer (superuser) so it can read users without org context.
-- Returns minimal data — never exposes password to logs.
CREATE OR REPLACE FUNCTION find_user_for_auth(p_email TEXT)
RETURNS TABLE (
  id              UUID,
  email           TEXT,
  password_hash   TEXT,
  organization_id UUID,
  role_id         UUID,
  status          TEXT
)
SECURITY DEFINER
SET search_path = public
LANGUAGE sql AS $$
  SELECT id, email, password, organization_id, role_id, status
  FROM   users
  WHERE  email = p_email
    AND  status != 'suspended'
  LIMIT 1;
$$;

REVOKE ALL ON FUNCTION find_user_for_auth(TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION find_user_for_auth(TEXT) TO app_service;

-- ============================================================================
-- VERIFICATION QUERY
-- Run after migration to confirm all tables have RLS enabled:
-- SELECT tablename, rowsecurity, forcerowoecurity
-- FROM   pg_tables
-- WHERE  schemaname = 'public'
-- ORDER  BY tablename;
-- ============================================================================
