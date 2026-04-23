/**
 * POST /api/cron/reconcile-pos
 * ─────────────────────────────────────────────────────────────────────────────
 * Batch POS ↔ invoice reconciliation cron — runs every 5 minutes.
 *
 * Replaces the per-transaction reconcileTenant() call that was removed from
 * ingestTransaction().  Processing each tenant once per cron tick (rather
 * than once per transaction) reduces DB load by ~10× during peak trading.
 *
 * Algorithm:
 *   1. Fetch all tenants with an active POS integration for the current month.
 *   2. For each tenant, call reconcileTenant() which now uses ON CONFLICT DO
 *      UPDATE so it is safe to re-run multiple times per period.
 *   3. Return a summary: tenants processed, errors, duration.
 *
 * Auth: CRON_SECRET bearer token (same convention as other cron routes).
 * Vercel cron schedule: "every 5 minutes" (see vercel.json).
 */

import { NextRequest, NextResponse } from "next/server"
import { serviceDb } from "@/lib/db"
import { sql } from "drizzle-orm"
import { reconcileTenant } from "@/lib/reconciliation/engine"
import { logger } from "@/lib/logger"

export const maxDuration = 300   // Vercel Pro: up to 5 min

// ── Auth ─────────────────────────────────────────────────────────────────────

function isAuthorized(req: NextRequest): boolean {
  const secret = process.env.CRON_SECRET
  if (!secret) return false
  const auth = req.headers.get("authorization") ?? ""
  return auth === `Bearer ${secret}`
}

// ── Active tenant row ─────────────────────────────────────────────────────────

interface ActiveTenantRow extends Record<string, unknown> {
  tenant_id: string
}

// ── Handler ───────────────────────────────────────────────────────────────────

export async function GET(req: NextRequest) {
  if (!isAuthorized(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const startedAt = Date.now()

  // ── Current month period ────────────────────────────────────────────────
  const now        = new Date()
  const year       = now.getUTCFullYear()
  const month      = now.getUTCMonth()
  const periodStart = new Date(Date.UTC(year, month, 1)).toISOString().slice(0, 10)
  const periodEnd   = new Date(Date.UTC(year, month + 1, 0)).toISOString().slice(0, 10)

  // ── 1. Fetch tenants with active POS integrations ───────────────────────
  const tenantRows = await serviceDb.execute<ActiveTenantRow>(sql`
    SELECT DISTINCT pi.tenant_id
    FROM pos_integrations pi
    WHERE pi.status     = 'active'
      AND pi.tenant_id IS NOT NULL
  `)

  const tenantIds = tenantRows.map((r) => r.tenant_id)

  logger.info("cron:reconcile-pos starting", {
    periodStart,
    periodEnd,
    tenantCount: tenantIds.length,
  })

  // ── 2. Reconcile each tenant ────────────────────────────────────────────
  const errors: Array<{ tenantId: string; error: string }> = []
  let processed = 0

  for (const tenantId of tenantIds) {
    try {
      await reconcileTenant(tenantId, periodStart, periodEnd)
      processed++
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      errors.push({ tenantId, error: message })
      logger.error("cron:reconcile-pos tenant failed", { tenantId, error: message })
    }
  }

  const durationMs = Date.now() - startedAt

  logger.info("cron:reconcile-pos complete", {
    processed,
    errors: errors.length,
    durationMs,
  })

  return NextResponse.json({
    ok:         errors.length === 0,
    processed,
    errors,
    periodStart,
    periodEnd,
    durationMs,
  })
}
