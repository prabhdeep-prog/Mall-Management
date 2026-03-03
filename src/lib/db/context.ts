/**
 * Tenant context injection for database queries
 * ───────────────────────────────────────────────
 * This is the ONLY correct way to run queries against org-scoped tables.
 *
 * Every call:
 *   1. Validates the organizationId is a non-empty UUID
 *   2. Opens a Drizzle transaction
 *   3. Sets app.current_organization_id + app.current_user_id as LOCAL
 *      (auto-cleared on COMMIT / ROLLBACK — safe with connection pools)
 *   4. Invokes your callback with the scoped transaction
 *
 * The RLS policies in 002_rls_hardened.sql enforce isolation at the
 * database level. This helper ensures the GUCs are always set correctly
 * so those policies can evaluate.
 *
 * Common mistakes this design prevents:
 * ✗ Forgetting to set context  → policies see NULL → all rows denied
 * ✗ Using SET instead of set_config(…, true) → leaks across pooled connections
 * ✗ Passing empty string or malformed UUID → rejected before hitting DB
 * ✗ Running outside a transaction → set_config LOCAL has nothing to scope to
 */

import { sql } from "drizzle-orm"
import { db } from "./index"
import type { PgTransaction } from "drizzle-orm/pg-core"
import type { PostgresJsQueryResultHKT } from "drizzle-orm/postgres-js"
import type * as schema from "./schema"

// Strict UUID v4 pattern
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

export type OrgScopedTx = PgTransaction<
  PostgresJsQueryResultHKT,
  typeof schema,
  Record<string, never>
>

export interface OrgContext {
  organizationId: string
  userId?: string
}

function assertValidUuid(value: string, label: string): void {
  if (!value || !UUID_RE.test(value)) {
    throw new Error(
      `[context] ${label} must be a valid UUID v4, received: "${value}". ` +
      "Do not call withOrgContext with untrusted or unvalidated input."
    )
  }
}

/**
 * Execute `callback` inside a transaction scoped to `organizationId`.
 *
 * @example
 * const session = await auth()
 * const leases = await withOrgContext(
 *   { organizationId: session.user.organizationId, userId: session.user.id },
 *   (tx) => tx.query.leases.findMany()
 * )
 */
export async function withOrgContext<T>(
  ctx: OrgContext,
  callback: (tx: OrgScopedTx) => Promise<T>,
): Promise<T> {
  assertValidUuid(ctx.organizationId, "organizationId")
  if (ctx.userId) assertValidUuid(ctx.userId, "userId")

  return db.transaction(async (tx) => {
    // set_config(name, value, is_local=true) → scoped to current transaction
    await tx.execute(
      sql`SELECT
        set_config('app.current_organization_id', ${ctx.organizationId}, true),
        set_config('app.current_user_id',         ${ctx.userId ?? ""}, true)`
    )
    return callback(tx as OrgScopedTx)
  })
}

/**
 * Returns a pre-bound query function for a given context.
 * Avoids threading `ctx` through every function signature.
 *
 * @example
 * const query = bindOrgContext({ organizationId, userId })
 *
 * const [tenants, leases] = await Promise.all([
 *   query((tx) => tx.query.tenants.findMany()),
 *   query((tx) => tx.query.leases.findMany()),
 * ])
 */
export function bindOrgContext(ctx: OrgContext) {
  return <T>(callback: (tx: OrgScopedTx) => Promise<T>): Promise<T> =>
    withOrgContext(ctx, callback)
}

/**
 * Build an OrgContext from a NextAuth session.
 * Throws if the session is missing or malformed — fail closed.
 *
 * @example
 * const session = await auth()
 * const ctx = orgContextFromSession(session)
 * const data = await withOrgContext(ctx, (tx) => tx.query.properties.findMany())
 */
export function orgContextFromSession(
  session: { user?: { organizationId?: string; id?: string } } | null
): OrgContext {
  if (!session?.user?.organizationId) {
    throw new Error(
      "[context] Cannot build org context: session is null or missing organizationId. " +
      "Ensure the user is authenticated before calling data-access functions."
    )
  }
  return {
    organizationId: session.user.organizationId,
    userId: session.user.id,
  }
}
