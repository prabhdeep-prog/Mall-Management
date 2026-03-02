/**
 * Three-connection database architecture
 * ───────────────────────────────────────
 *
 * db           → DATABASE_URL          → role: app_user
 *                All user-facing queries. Full RLS enforced.
 *                MUST be wrapped in withOrgContext() before use.
 *
 * serviceDb    → DATABASE_SERVICE_URL  → role: app_service
 *                Background jobs, internal APIs, auth lookups.
 *                Can call SECURITY DEFINER functions (find_user_for_auth, etc.).
 *                Still RLS-enforced; must set org context per-job.
 *
 * getAdminDb() → DATABASE_ADMIN_URL    → role: app_admin
 *                Internal support tools only.
 *                RLS enforced; must call admin_set_org_context() to access
 *                tenant data — every access is immutably logged.
 *
 * NEVER import getAdminDb in a user-facing Server Action or API route.
 * NEVER use any connection without setting org context first (except
 * serviceDb for explicit SECURITY DEFINER function calls like auth lookups).
 */

import { drizzle } from "drizzle-orm/postgres-js"
import postgres from "postgres"
import * as schema from "./schema"

// ── Validate required env vars at module load ─────────────────────────────────
if (!process.env.DATABASE_URL) {
  throw new Error("Missing required environment variable: DATABASE_URL")
}
if (!process.env.DATABASE_SERVICE_URL && process.env.NODE_ENV === "production") {
  throw new Error("Missing required environment variable: DATABASE_SERVICE_URL")
}

// ── Connection pool config (PgBouncer / Neon compatible) ─────────────────────
const BASE_CONFIG: postgres.Options<Record<string, postgres.PostgresType>> = {
  prepare: false,   // Required for PgBouncer transaction-mode pooling
  idle_timeout: 20,
  connect_timeout: 10,
}

// ── app_user: all normal user-facing queries ──────────────────────────────────
const appClient = postgres(process.env.DATABASE_URL!, {
  ...BASE_CONFIG,
  max: 20,
})
export const db = drizzle(appClient, { schema })

// ── app_service: background jobs, auth lookups, internal APIs ─────────────────
// Falls back to DATABASE_URL in development (single-connection dev setup)
const serviceClient = postgres(
  process.env.DATABASE_SERVICE_URL ?? process.env.DATABASE_URL!,
  { ...BASE_CONFIG, max: 5 }
)
export const serviceDb = drizzle(serviceClient, { schema })

// ── app_admin: support tools only — lazy init, never in request handlers ──────
let _adminDb: ReturnType<typeof drizzle<typeof schema>> | null = null

export function getAdminDb() {
  if (!process.env.DATABASE_ADMIN_URL) {
    throw new Error(
      "DATABASE_ADMIN_URL is not configured. " +
      "Admin DB access is not available in this environment."
    )
  }
  if (!_adminDb) {
    const adminClient = postgres(process.env.DATABASE_ADMIN_URL, {
      ...BASE_CONFIG,
      max: 3, // Admin actions must be rare; hard limit enforces this
    })
    _adminDb = drizzle(adminClient, { schema })
  }
  return _adminDb
}

export * from "./schema"
