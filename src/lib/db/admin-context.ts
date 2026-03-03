/**
 * Admin impersonation context — for internal support tools ONLY
 * ──────────────────────────────────────────────────────────────
 * Uses the app_admin database role (DATABASE_ADMIN_URL).
 *
 * Every call to withAdminOrgContext() MUST provide a reason and a ticket
 * reference. The SECURITY DEFINER function admin_set_org_context() writes
 * an immutable record to admin_access_log BEFORE the context is set.
 * There is no path to access tenant data without this audit trail.
 *
 * Import restrictions:
 *   ✗ Never import this file from src/app/(dashboard)/
 *   ✗ Never import this file from any user-facing API route
 *   ✓ Only import from src/app/admin/ or src/app/api/internal/
 */

import { sql } from "drizzle-orm"
import { getAdminDb } from "./index"
import type { PgTransaction } from "drizzle-orm/pg-core"
import type { PostgresJsQueryResultHKT } from "drizzle-orm/postgres-js"
import type * as schema from "./schema"

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

export type AdminScopedTx = PgTransaction<
  PostgresJsQueryResultHKT,
  typeof schema,
  Record<string, never>
>

export interface AdminImpersonationOptions {
  /** Internal staff user performing the access */
  adminUserId: string
  /** Target tenant organization to access */
  targetOrgId: string
  /** Human-readable justification (min 10 chars, enforced by DB) */
  reason: string
  /** Support ticket or Jira reference */
  ticketRef?: string
  /** Request IP for audit (pass from req.headers) */
  requestIp?: string
  /** User-agent string for audit */
  userAgent?: string
}

/**
 * Access a tenant's data as an internal support operator.
 *
 * Audit trail is mandatory and written before context is set.
 * Returns the admin_access_log ID so callers can include it in their
 * own logs for cross-reference.
 *
 * @example
 * // In a support API route:
 * const { accessLogId, data } = await withAdminOrgContext(
 *   {
 *     adminUserId: session.user.id,
 *     targetOrgId: params.orgId,
 *     reason: "Customer reported missing invoices",
 *     ticketRef: "SUPPORT-1234",
 *     requestIp: request.headers.get("x-forwarded-for") ?? undefined,
 *   },
 *   (tx) => tx.query.invoices.findMany()
 * )
 */
export async function withAdminOrgContext<T>(
  opts: AdminImpersonationOptions,
  callback: (tx: AdminScopedTx) => Promise<T>,
): Promise<{ accessLogId: string; data: T }> {
  // Input validation
  for (const [key, val] of Object.entries({
    adminUserId: opts.adminUserId,
    targetOrgId: opts.targetOrgId,
  })) {
    if (!val || !UUID_RE.test(val)) {
      throw new Error(`[admin-context] ${key} must be a valid UUID, received: "${val}"`)
    }
  }
  if (!opts.reason || opts.reason.length < 10) {
    throw new Error("[admin-context] reason must be at least 10 characters")
  }

  const adminDb = getAdminDb()

  let accessLogId: string | null = null

  const data = await adminDb.transaction(async (tx) => {
    // 1. Set admin user identity (needed by admin_set_org_context)
    await tx.execute(
      sql`SELECT set_config('app.current_user_id', ${opts.adminUserId}, true)`
    )

    // 2. Call SECURITY DEFINER function — writes audit log + sets org context
    //    This is the ONLY path to set org context for app_admin role.
    const result = await tx.execute<{ admin_set_org_context: string }>(
      sql`SELECT admin_set_org_context(
        ${opts.targetOrgId}::uuid,
        ${opts.reason},
        ${opts.ticketRef ?? null},
        ${opts.requestIp ?? null}::inet,
        ${opts.userAgent ?? null}
      )`
    )

    accessLogId = result.rows[0]?.admin_set_org_context ?? null
    if (!accessLogId) {
      throw new Error("[admin-context] admin_set_org_context() did not return an access log ID")
    }

    // 3. Execute caller's query — now scoped to target org via RLS
    return callback(tx as AdminScopedTx)
  })

  return { accessLogId: accessLogId!, data }
}
