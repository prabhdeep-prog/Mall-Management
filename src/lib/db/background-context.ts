/**
 * Background job context management
 * ───────────────────────────────────
 * Background jobs process data for one or many organizations.
 * Each org's data must be processed in its own transaction with its own
 * org context — never share a transaction across organizations.
 *
 * Uses serviceDb (DATABASE_SERVICE_URL → app_service role).
 * RLS is still enforced; jobs must set context explicitly per-org.
 *
 * Patterns:
 *   withJobOrgContext()    → process one org's data
 *   forEachTenantOrg()    → iterate all orgs, process each in isolation
 *
 * The job ID is injected into the session so slow-query logs can be
 * correlated back to the specific job run.
 */

import { sql, eq } from "drizzle-orm"
import { serviceDb } from "./index"
import { organizations } from "./schema"
import type { PgTransaction } from "drizzle-orm/pg-core"
import type { PostgresJsQueryResultHKT } from "drizzle-orm/postgres-js"
import type * as schema from "./schema"

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

export type JobScopedTx = PgTransaction<
  PostgresJsQueryResultHKT,
  typeof schema,
  Record<string, never>
>

export interface JobContext {
  organizationId: string
  /** Unique ID for this job run — appears in DB slow-query logs */
  jobId: string
  jobName: string
}

/**
 * Execute a callback in a transaction scoped to one organization.
 *
 * @example
 * // In a cron job:
 * await withJobOrgContext(
 *   { organizationId: org.id, jobId: runId, jobName: "invoice-reminder" },
 *   async (tx) => {
 *     const overdue = await tx.query.invoices.findMany({
 *       where: eq(invoices.status, "overdue"),
 *     })
 *     // send reminders...
 *   }
 * )
 */
export async function withJobOrgContext<T>(
  ctx: JobContext,
  callback: (tx: JobScopedTx) => Promise<T>,
): Promise<T> {
  if (!ctx.organizationId || !UUID_RE.test(ctx.organizationId)) {
    throw new Error(`[bg-context] organizationId must be a valid UUID: "${ctx.organizationId}"`)
  }
  if (!ctx.jobId) {
    throw new Error("[bg-context] jobId must be provided for observability")
  }

  return serviceDb.transaction(async (tx) => {
    await tx.execute(
      sql`SELECT
        set_config('app.current_organization_id', ${ctx.organizationId}, true),
        set_config('app.current_user_id',         '',                    true),
        set_config('app.job_id',                  ${ctx.jobId},          true),
        set_config('app.job_name',                ${ctx.jobName},        true)`
    )
    return callback(tx as JobScopedTx)
  })
}

export interface TenantIterationOptions {
  jobId: string
  jobName: string
  /** Filter to only active orgs by default */
  statusFilter?: string
  /** Callback receives errors per-org; returning false stops iteration */
  onError?: (orgId: string, error: unknown) => boolean | void
}

/**
 * Iterate every organization and run a callback for each in its own
 * isolated transaction. Errors in one org do not affect others.
 *
 * Returns a summary of processed vs failed orgs.
 *
 * @example
 * const summary = await forEachTenantOrg(
 *   { jobId: runId, jobName: "daily-metrics-rollup" },
 *   async (tx, orgId) => {
 *     // all queries here automatically scoped to orgId
 *     const metrics = await computeDailyMetrics(tx)
 *     await upsertDailyMetrics(tx, metrics)
 *   }
 * )
 * console.log(`Processed ${summary.succeeded}/${summary.total} orgs`)
 */
export async function forEachTenantOrg(
  opts: TenantIterationOptions,
  callback: (tx: JobScopedTx, organizationId: string) => Promise<void>,
): Promise<{ total: number; succeeded: number; failed: Array<{ orgId: string; error: string }> }> {
  // Fetch org list without org context (service role, no RLS on this query
  // since it reads only IDs, not tenant data)
  const orgs = await serviceDb
    .select({ id: organizations.id })
    .from(organizations)
    .where(eq(organizations.type, opts.statusFilter ?? "active" as never))

  const failed: Array<{ orgId: string; error: string }> = []
  let succeeded = 0

  for (const { id: orgId } of orgs) {
    try {
      await withJobOrgContext(
        { organizationId: orgId, jobId: opts.jobId, jobName: opts.jobName },
        (tx) => callback(tx, orgId)
      )
      succeeded++
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : String(err)
      failed.push({ orgId, error: errMsg })

      const shouldStop = opts.onError?.(orgId, err)
      if (shouldStop === false) break
    }
  }

  return { total: orgs.length, succeeded, failed }
}
