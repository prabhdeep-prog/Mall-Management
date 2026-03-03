-- ============================================================================
-- Migration: Enable Row-Level Security (RLS)
-- Scope  : Ensures every query is automatically filtered to the calling
--          user's organization by reading the session-local GUC
--          `app.current_organization_id` that the application sets at the
--          start of every transaction (see src/lib/db/with-org-context.ts).
--
-- How it works
-- ─────────────
-- 1. The application connects as the `app_user` role.
-- 2. Before issuing any query the app runs (inside a transaction):
--       SELECT set_config('app.current_organization_id', '<uuid>', true);
-- 3. Every RLS policy reads that value via
--       current_setting('app.current_organization_id', true)
--    and restricts rows accordingly.
-- 4. The `true` flag makes the function return NULL instead of raising an
--    error when the GUC is not set (e.g. during migrations run as superuser).
--
-- Role notes
-- ──────────
-- • Superusers always bypass RLS — use the superuser connection for
--   migrations / seeding only.
-- • `FORCE ROW LEVEL SECURITY` also applies the policy to the table owner.
-- • Adjust `app_user` to the actual database role your DATABASE_URL uses.
-- ============================================================================

-- ── Helper: create app_user role if it doesn't exist ─────────────────────
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'app_user') THEN
    CREATE ROLE app_user LOGIN;
  END IF;
END
$$;

-- Grant connect + usage
GRANT CONNECT ON DATABASE current_database() TO app_user;
GRANT USAGE ON SCHEMA public TO app_user;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO app_user;
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO app_user;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO app_user;
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT USAGE, SELECT ON SEQUENCES TO app_user;

-- ============================================================================
-- ORGANIZATIONS
-- Users may only see their own organization.
-- ============================================================================
ALTER TABLE organizations ENABLE ROW LEVEL SECURITY;
ALTER TABLE organizations FORCE  ROW LEVEL SECURITY;

DROP POLICY IF EXISTS org_isolation ON organizations;
CREATE POLICY org_isolation ON organizations
  AS PERMISSIVE FOR ALL TO app_user
  USING (
    id::text = current_setting('app.current_organization_id', true)
  );

-- ============================================================================
-- USERS
-- ============================================================================
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE users FORCE  ROW LEVEL SECURITY;

DROP POLICY IF EXISTS org_isolation ON users;
CREATE POLICY org_isolation ON users
  AS PERMISSIVE FOR ALL TO app_user
  USING (
    organization_id::text = current_setting('app.current_organization_id', true)
  );

-- ============================================================================
-- PROPERTIES
-- ============================================================================
ALTER TABLE properties ENABLE ROW LEVEL SECURITY;
ALTER TABLE properties FORCE  ROW LEVEL SECURITY;

DROP POLICY IF EXISTS org_isolation ON properties;
CREATE POLICY org_isolation ON properties
  AS PERMISSIVE FOR ALL TO app_user
  USING (
    organization_id::text = current_setting('app.current_organization_id', true)
  );

-- ============================================================================
-- Helper subquery reused by all property-scoped tables:
--   EXISTS (SELECT 1 FROM properties p
--           WHERE p.id = <fk_col>
--             AND p.organization_id::text = current_setting(...))
-- ============================================================================

-- ── TENANTS ─────────────────────────────────────────────────────────────────
ALTER TABLE tenants ENABLE ROW LEVEL SECURITY;
ALTER TABLE tenants FORCE  ROW LEVEL SECURITY;

DROP POLICY IF EXISTS org_isolation ON tenants;
CREATE POLICY org_isolation ON tenants
  AS PERMISSIVE FOR ALL TO app_user
  USING (
    EXISTS (
      SELECT 1 FROM properties p
      WHERE p.id = tenants.property_id
        AND p.organization_id::text = current_setting('app.current_organization_id', true)
    )
  );

-- ── LEASES ──────────────────────────────────────────────────────────────────
ALTER TABLE leases ENABLE ROW LEVEL SECURITY;
ALTER TABLE leases FORCE  ROW LEVEL SECURITY;

DROP POLICY IF EXISTS org_isolation ON leases;
CREATE POLICY org_isolation ON leases
  AS PERMISSIVE FOR ALL TO app_user
  USING (
    EXISTS (
      SELECT 1 FROM properties p
      WHERE p.id = leases.property_id
        AND p.organization_id::text = current_setting('app.current_organization_id', true)
    )
  );

-- ── EXPENSES ─────────────────────────────────────────────────────────────────
ALTER TABLE expenses ENABLE ROW LEVEL SECURITY;
ALTER TABLE expenses FORCE  ROW LEVEL SECURITY;

DROP POLICY IF EXISTS org_isolation ON expenses;
CREATE POLICY org_isolation ON expenses
  AS PERMISSIVE FOR ALL TO app_user
  USING (
    EXISTS (
      SELECT 1 FROM properties p
      WHERE p.id = expenses.property_id
        AND p.organization_id::text = current_setting('app.current_organization_id', true)
    )
  );

-- ── EQUIPMENT ────────────────────────────────────────────────────────────────
ALTER TABLE equipment ENABLE ROW LEVEL SECURITY;
ALTER TABLE equipment FORCE  ROW LEVEL SECURITY;

DROP POLICY IF EXISTS org_isolation ON equipment;
CREATE POLICY org_isolation ON equipment
  AS PERMISSIVE FOR ALL TO app_user
  USING (
    EXISTS (
      SELECT 1 FROM properties p
      WHERE p.id = equipment.property_id
        AND p.organization_id::text = current_setting('app.current_organization_id', true)
    )
  );

-- ── WORK ORDERS ──────────────────────────────────────────────────────────────
ALTER TABLE work_orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE work_orders FORCE  ROW LEVEL SECURITY;

DROP POLICY IF EXISTS org_isolation ON work_orders;
CREATE POLICY org_isolation ON work_orders
  AS PERMISSIVE FOR ALL TO app_user
  USING (
    EXISTS (
      SELECT 1 FROM properties p
      WHERE p.id = work_orders.property_id
        AND p.organization_id::text = current_setting('app.current_organization_id', true)
    )
  );

-- ── CONVERSATIONS ─────────────────────────────────────────────────────────────
ALTER TABLE conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE conversations FORCE  ROW LEVEL SECURITY;

DROP POLICY IF EXISTS org_isolation ON conversations;
CREATE POLICY org_isolation ON conversations
  AS PERMISSIVE FOR ALL TO app_user
  USING (
    EXISTS (
      SELECT 1 FROM properties p
      WHERE p.id = conversations.property_id
        AND p.organization_id::text = current_setting('app.current_organization_id', true)
    )
  );

-- ── AGENT ACTIONS ────────────────────────────────────────────────────────────
ALTER TABLE agent_actions ENABLE ROW LEVEL SECURITY;
ALTER TABLE agent_actions FORCE  ROW LEVEL SECURITY;

DROP POLICY IF EXISTS org_isolation ON agent_actions;
CREATE POLICY org_isolation ON agent_actions
  AS PERMISSIVE FOR ALL TO app_user
  USING (
    EXISTS (
      SELECT 1 FROM properties p
      WHERE p.id = agent_actions.property_id
        AND p.organization_id::text = current_setting('app.current_organization_id', true)
    )
  );

-- ── POS INTEGRATIONS ─────────────────────────────────────────────────────────
ALTER TABLE pos_integrations ENABLE ROW LEVEL SECURITY;
ALTER TABLE pos_integrations FORCE  ROW LEVEL SECURITY;

DROP POLICY IF EXISTS org_isolation ON pos_integrations;
CREATE POLICY org_isolation ON pos_integrations
  AS PERMISSIVE FOR ALL TO app_user
  USING (
    EXISTS (
      SELECT 1 FROM properties p
      WHERE p.id = pos_integrations.property_id
        AND p.organization_id::text = current_setting('app.current_organization_id', true)
    )
  );

-- ── POS SALES DATA ───────────────────────────────────────────────────────────
ALTER TABLE pos_sales_data ENABLE ROW LEVEL SECURITY;
ALTER TABLE pos_sales_data FORCE  ROW LEVEL SECURITY;

DROP POLICY IF EXISTS org_isolation ON pos_sales_data;
CREATE POLICY org_isolation ON pos_sales_data
  AS PERMISSIVE FOR ALL TO app_user
  USING (
    EXISTS (
      SELECT 1 FROM properties p
      WHERE p.id = pos_sales_data.property_id
        AND p.organization_id::text = current_setting('app.current_organization_id', true)
    )
  );

-- ── COMPLIANCE REQUIREMENTS ──────────────────────────────────────────────────
ALTER TABLE compliance_requirements ENABLE ROW LEVEL SECURITY;
ALTER TABLE compliance_requirements FORCE  ROW LEVEL SECURITY;

DROP POLICY IF EXISTS org_isolation ON compliance_requirements;
CREATE POLICY org_isolation ON compliance_requirements
  AS PERMISSIVE FOR ALL TO app_user
  USING (
    EXISTS (
      SELECT 1 FROM properties p
      WHERE p.id = compliance_requirements.property_id
        AND p.organization_id::text = current_setting('app.current_organization_id', true)
    )
  );

-- ── DAILY METRICS ────────────────────────────────────────────────────────────
ALTER TABLE daily_metrics ENABLE ROW LEVEL SECURITY;
ALTER TABLE daily_metrics FORCE  ROW LEVEL SECURITY;

DROP POLICY IF EXISTS org_isolation ON daily_metrics;
CREATE POLICY org_isolation ON daily_metrics
  AS PERMISSIVE FOR ALL TO app_user
  USING (
    EXISTS (
      SELECT 1 FROM properties p
      WHERE p.id = daily_metrics.property_id
        AND p.organization_id::text = current_setting('app.current_organization_id', true)
    )
  );

-- ============================================================================
-- INVOICES  (lease → property → org)
-- ============================================================================
ALTER TABLE invoices ENABLE ROW LEVEL SECURITY;
ALTER TABLE invoices FORCE  ROW LEVEL SECURITY;

DROP POLICY IF EXISTS org_isolation ON invoices;
CREATE POLICY org_isolation ON invoices
  AS PERMISSIVE FOR ALL TO app_user
  USING (
    EXISTS (
      SELECT 1
      FROM leases l
      JOIN properties p ON p.id = l.property_id
      WHERE l.id = invoices.lease_id
        AND p.organization_id::text = current_setting('app.current_organization_id', true)
    )
  );

-- ============================================================================
-- PAYMENTS  (invoice → lease → property → org)
-- ============================================================================
ALTER TABLE payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE payments FORCE  ROW LEVEL SECURITY;

DROP POLICY IF EXISTS org_isolation ON payments;
CREATE POLICY org_isolation ON payments
  AS PERMISSIVE FOR ALL TO app_user
  USING (
    EXISTS (
      SELECT 1
      FROM invoices i
      JOIN leases l   ON l.id = i.lease_id
      JOIN properties p ON p.id = l.property_id
      WHERE i.id = payments.invoice_id
        AND p.organization_id::text = current_setting('app.current_organization_id', true)
    )
  );

-- ============================================================================
-- MESSAGES  (conversation → property → org)
-- ============================================================================
ALTER TABLE messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE messages FORCE  ROW LEVEL SECURITY;

DROP POLICY IF EXISTS org_isolation ON messages;
CREATE POLICY org_isolation ON messages
  AS PERMISSIVE FOR ALL TO app_user
  USING (
    EXISTS (
      SELECT 1
      FROM conversations c
      JOIN properties p ON p.id = c.property_id
      WHERE c.id = messages.conversation_id
        AND p.organization_id::text = current_setting('app.current_organization_id', true)
    )
  );

-- ============================================================================
-- GLOBAL TABLES  (not org-scoped; all authenticated app_users may access)
-- agents, agent_decisions, vendors, roles are shared across organizations.
-- Notifications are recipient-scoped — allow all for now.
-- ============================================================================
ALTER TABLE agents              ENABLE ROW LEVEL SECURITY;
ALTER TABLE agent_decisions     ENABLE ROW LEVEL SECURITY;
ALTER TABLE vendors             ENABLE ROW LEVEL SECURITY;
ALTER TABLE roles               ENABLE ROW LEVEL SECURITY;
ALTER TABLE notifications       ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS allow_all ON agents;
DROP POLICY IF EXISTS allow_all ON agent_decisions;
DROP POLICY IF EXISTS allow_all ON vendors;
DROP POLICY IF EXISTS allow_all ON roles;
DROP POLICY IF EXISTS allow_all ON notifications;

CREATE POLICY allow_all ON agents          AS PERMISSIVE FOR ALL TO app_user USING (true);
CREATE POLICY allow_all ON agent_decisions AS PERMISSIVE FOR ALL TO app_user USING (true);
CREATE POLICY allow_all ON vendors         AS PERMISSIVE FOR ALL TO app_user USING (true);
CREATE POLICY allow_all ON roles           AS PERMISSIVE FOR ALL TO app_user USING (true);
CREATE POLICY allow_all ON notifications   AS PERMISSIVE FOR ALL TO app_user USING (true);
