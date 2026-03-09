-- =============================================================================
-- Migration 006: Schema Improvements
-- Adds missing indexes, foreign key constraints, check constraints, and the
-- users_to_properties junction table.
-- =============================================================================

-- NOTE: CHECK constraints will validate ALL existing rows on application.
-- If any existing row violates a constraint, alter the data first, then re-run.
-- Use: ALTER TABLE ... ADD CONSTRAINT ... NOT VALID; VALIDATE CONSTRAINT ...;
-- for zero-downtime production migrations.

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. Foreign key: users.role_id → roles.id
-- ─────────────────────────────────────────────────────────────────────────────
ALTER TABLE "users"
  ADD CONSTRAINT "users_role_id_roles_id_fk"
  FOREIGN KEY ("role_id") REFERENCES "roles"("id") ON DELETE SET NULL;

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. Missing indexes on frequently queried columns
-- ─────────────────────────────────────────────────────────────────────────────

-- users
CREATE INDEX IF NOT EXISTS "idx_users_role" ON "users" ("role_id");
CREATE INDEX IF NOT EXISTS "idx_users_org"  ON "users" ("organization_id");

-- leases
CREATE INDEX IF NOT EXISTS "idx_leases_status" ON "leases" ("status");

-- invoices
CREATE INDEX IF NOT EXISTS "idx_invoices_type" ON "invoices" ("invoice_type");

-- expenses
CREATE INDEX IF NOT EXISTS "idx_expenses_category" ON "expenses" ("category");

-- work_orders
CREATE INDEX IF NOT EXISTS "idx_work_orders_priority" ON "work_orders" ("priority");

-- conversations
CREATE INDEX IF NOT EXISTS "idx_conversations_status" ON "conversations" ("status");

-- messages
CREATE INDEX IF NOT EXISTS "idx_messages_created_at" ON "messages" ("created_at");

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. Check constraints for status / priority columns
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE "properties"
  ADD CONSTRAINT "check_properties_status"
  CHECK (status IN ('active', 'under_construction', 'closed'));

ALTER TABLE "tenants"
  ADD CONSTRAINT "check_tenants_status"
  CHECK (status IN ('active', 'inactive', 'suspended'));

ALTER TABLE "leases"
  ADD CONSTRAINT "check_leases_status"
  CHECK (status IN ('draft', 'active', 'expired', 'terminated'));

ALTER TABLE "invoices"
  ADD CONSTRAINT "check_invoices_status"
  CHECK (status IN ('pending', 'paid', 'overdue', 'cancelled'));

ALTER TABLE "work_orders"
  ADD CONSTRAINT "check_work_orders_priority"
  CHECK (priority IN ('low', 'medium', 'high', 'critical'));

ALTER TABLE "work_orders"
  ADD CONSTRAINT "check_work_orders_status"
  CHECK (status IN ('open', 'assigned', 'in_progress', 'completed', 'cancelled'));

-- ─────────────────────────────────────────────────────────────────────────────
-- 4. Junction table: users_to_properties (normalized user-property access)
--    Replaces the jsonb `properties` array on the users table.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS "users_to_properties" (
  "user_id"     uuid NOT NULL,
  "property_id" uuid NOT NULL,
  CONSTRAINT "users_to_properties_user_id_property_id_pk"
    PRIMARY KEY ("user_id", "property_id")
);

ALTER TABLE "users_to_properties"
  ADD CONSTRAINT "users_to_properties_user_id_fk"
  FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE;

ALTER TABLE "users_to_properties"
  ADD CONSTRAINT "users_to_properties_property_id_fk"
  FOREIGN KEY ("property_id") REFERENCES "properties"("id") ON DELETE CASCADE;

-- ─────────────────────────────────────────────────────────────────────────────
-- 5. Migrate existing jsonb property access into the junction table
--    (only run if users.properties is populated)
-- ─────────────────────────────────────────────────────────────────────────────

INSERT INTO "users_to_properties" ("user_id", "property_id")
SELECT
  u.id,
  (jsonb_array_elements_text(u.properties))::uuid AS property_id
FROM "users" u
WHERE
  u.properties IS NOT NULL
  AND jsonb_typeof(u.properties) = 'array'
  AND jsonb_array_length(u.properties) > 0
ON CONFLICT DO NOTHING;

-- ─────────────────────────────────────────────────────────────────────────────
-- Done
-- ─────────────────────────────────────────────────────────────────────────────
