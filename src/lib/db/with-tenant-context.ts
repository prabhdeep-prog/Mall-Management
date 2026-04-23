import { sql } from "drizzle-orm"
import { serviceDb } from "./index"
import type { PgTransaction } from "drizzle-orm/pg-core"
import type { PostgresJsQueryResultHKT } from "drizzle-orm/postgres-js"
import type * as schema from "./schema"

/**
 * The type of the Drizzle transaction object returned inside withTenantContext.
 * Use this as the parameter type in functions that accept a tenant-scoped tx.
 *
 * @example
 * async function getLeases(tx: TenantScopedTx) {
 *   return tx.query.leases.findMany()
 * }
 */
export type TenantScopedTx = PgTransaction<
  PostgresJsQueryResultHKT,
  typeof schema,
  Record<string, never>
>

/**
 * Wraps a database callback in a transaction that sets the PostgreSQL
 * session-local variable `app.current_tenant_id`.
 *
 * All RLS policies added in migration 007 read this variable, so every
 * SELECT inside the callback is automatically restricted to the caller's
 * tenant — no manual WHERE clauses needed.
 *
 * Uses serviceDb (app_service role) rather than db (app_user role) so the
 * connection can call the set_tenant_context() SECURITY DEFINER function
 * and read across the tenant-portal tables without requiring a separate
 * app_tenant connection string in development.
 *
 * In production you can swap serviceDb for a dedicated app_tenant pool by
 * pointing DATABASE_TENANT_URL at a connection string that authenticates as
 * the app_tenant role.
 *
 * The setting is LOCAL to the transaction — automatically cleared on commit
 * or rollback, so there is no risk of tenant context leaking between requests.
 *
 * @example
 * // In a portal API route:
 * const { tenantId } = await verifyTenantSession(req)
 *
 * const invoices = await withTenantContext(tenantId, (tx) =>
 *   tx.query.invoices.findMany({ where: eq(invoices.status, 'pending') })
 * )
 */
export async function withTenantContext<T>(
  tenantId: string,
  callback: (tx: TenantScopedTx) => Promise<T>,
): Promise<T> {
  return serviceDb.transaction(async (tx) => {
    // set_tenant_context() validates the UUID format before writing the GUC,
    // rejecting malformed values at the DB layer.
    await tx.execute(
      sql`SELECT set_tenant_context(${tenantId}::uuid)`,
    )
    return callback(tx as TenantScopedTx)
  })
}

/**
 * Creates a bound helper pre-loaded with a specific tenantId so you
 * don't have to pass it on every call within the same request.
 *
 * @example
 * const { tenantId } = await verifyTenantSession(req)
 * const query = createTenantQuery(tenantId)
 *
 * const leases   = await query((tx) => tx.query.leases.findMany())
 * const invoices = await query((tx) => tx.query.invoices.findMany())
 */
export function createTenantQuery(tenantId: string) {
  return <T>(callback: (tx: TenantScopedTx) => Promise<T>): Promise<T> =>
    withTenantContext(tenantId, callback)
}
