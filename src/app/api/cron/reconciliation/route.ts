/**
 * Reconciliation Daily Cron
 * ─────────────────────────────────────────────────────────────────────────────
 * Runs POS ↔ invoice reconciliation for every tenant with active POS
 * integrations.  Reconciles the previous calendar month.
 *
 * Schedule: 0 3 * * * (daily at 3 AM UTC = 8:30 AM IST)
 * Protected: Bearer CRON_SECRET
 */

import { type NextRequest, NextResponse } from "next/server"
import { serviceDb } from "@/lib/db"
import { sql } from "drizzle-orm"
import { reconcileTenant } from "@/lib/reconciliation/engine"

export const runtime = "nodejs"
export const maxDuration = 300

interface TenantRow extends Record<string, unknown> {
  tenant_id: string
}

export async function GET(req: NextRequest) {
  const authHeader = req.headers.get("authorization")
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const startedAt = Date.now()

  // Last calendar month boundaries
  const now   = new Date()
  const year  = now.getUTCMonth() === 0 ? now.getUTCFullYear() - 1 : now.getUTCFullYear()
  const month = now.getUTCMonth() === 0 ? 11 : now.getUTCMonth() - 1
  const periodStart = new Date(Date.UTC(year, month, 1))
  const periodEnd   = new Date(Date.UTC(year, month + 1, 0))

  const periodStartStr = periodStart.toISOString().slice(0, 10)
  const periodEndStr   = periodEnd.toISOString().slice(0, 10)

  // All tenants with active POS integrations
  const tenants = await serviceDb.execute<TenantRow>(sql`
    SELECT DISTINCT pi.tenant_id
    FROM pos_integrations pi
    JOIN leases l ON l.tenant_id = pi.tenant_id AND l.status = 'active'
    WHERE pi.is_active = true
  `)

  const results = {
    total:      tenants.length,
    reconciled: 0,
    flagged:    0,
    failed:     0,
    errors:     [] as Array<{ tenantId: string; error: string }>,
  }

  for (const row of tenants) {
    try {
      const result = await reconcileTenant(row.tenant_id, periodStartStr, periodEndStr)
      results.reconciled++
      if (result.status === "flagged") results.flagged++
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      results.failed++
      results.errors.push({ tenantId: row.tenant_id, error: message })
    }
  }

  return NextResponse.json({
    ok:          true,
    period:      { start: periodStartStr, end: periodEndStr },
    durationMs:  Date.now() - startedAt,
    ...results,
  })
}
