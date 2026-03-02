import { sql } from "drizzle-orm"
import { db } from "./index"
import type { PgTransaction } from "drizzle-orm/pg-core"
import type { PostgresJsQueryResultHKT } from "drizzle-orm/postgres-js"
import type * as schema from "./schema"

/**
 * The type of the Drizzle transaction object returned inside withOrgContext.
 * Use this as the parameter type in functions that accept a scoped transaction.
 *
 * @example
 * async function getLeases(tx: OrgScopedTx) {
 *   return tx.query.leases.findMany()
 * }
 */
export type OrgScopedTx = PgTransaction<
  PostgresJsQueryResultHKT,
  typeof schema,
  Record<string, never>
>

/**
 * Wraps a database callback in a transaction that sets the PostgreSQL
 * session-local variable `app.current_organization_id`.
 *
 * All RLS policies on org-scoped tables read this variable, so every
 * SELECT / INSERT / UPDATE / DELETE inside the callback is automatically
 * restricted to the caller's organization — no manual WHERE clauses needed.
 *
 * The setting is LOCAL to the transaction, meaning it is automatically
 * cleared when the transaction commits or rolls back.
 *
 * @example
 * // In a Server Action or API route handler:
 * const session = await auth()
 * const orgId = session?.user?.organizationId
 *
 * const leases = await withOrgContext(orgId, (tx) =>
 *   tx.query.leases.findMany({ where: eq(leases.status, 'active') })
 * )
 */
export async function withOrgContext<T>(
  organizationId: string,
  callback: (tx: OrgScopedTx) => Promise<T>,
): Promise<T> {
  return db.transaction(async (tx) => {
    // set_config(key, value, is_local)
    //   is_local = true  → effective only for the current transaction
    await tx.execute(
      sql`SELECT set_config('app.current_organization_id', ${organizationId}, true)`,
    )
    return callback(tx as OrgScopedTx)
  })
}

/**
 * Creates a bound helper pre-loaded with a specific organizationId so you
 * don't have to pass it on every call.
 *
 * @example
 * const session = await auth()
 * const query = createOrgQuery(session.user.organizationId)
 *
 * const tenants = await query((tx) => tx.query.tenants.findMany())
 * const leases  = await query((tx) => tx.query.leases.findMany())
 */
export function createOrgQuery(organizationId: string) {
  return <T>(callback: (tx: OrgScopedTx) => Promise<T>): Promise<T> =>
    withOrgContext(organizationId, callback)
}
