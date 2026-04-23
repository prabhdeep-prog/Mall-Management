/**
 * GET /api/cron/pos-offline-check
 * ─────────────────────────────────────────────────────────────────────────────
 * Hourly cron that detects POS integrations that have gone silent for more
 * than 24 hours and emits a structured warning log per integration.
 *
 * An integration is considered offline when:
 *   last_sync_at < now() - interval '24 hours'
 *
 * Vercel cron schedule: "0 * * * *" (top of every hour)
 * Auth: Bearer CRON_SECRET
 */

import { type NextRequest, NextResponse } from "next/server"
import { serviceDb } from "@/lib/db"
import { sql } from "drizzle-orm"
import { logger } from "@/lib/logger"
import { metrics } from "@/lib/monitoring/metrics"

export const runtime = "nodejs"
export const maxDuration = 60

interface OfflineRow extends Record<string, unknown> {
  id:           string
  tenant_id:    string
  provider_key: string
  last_sync_at: string | null
}

export async function GET(req: NextRequest) {
  const authHeader = req.headers.get("authorization")
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return new Response("Unauthorized", { status: 401 })
  }

  const offlineIntegrations = await serviceDb.execute<OfflineRow>(sql`
    SELECT id, tenant_id, provider_key, last_sync_at
    FROM pos_integrations
    WHERE is_active  = true
      AND (
        last_sync_at IS NULL
        OR last_sync_at < NOW() - INTERVAL '24 hours'
      )
    ORDER BY last_sync_at ASC NULLS FIRST
  `)

  for (const row of offlineIntegrations) {
    logger.warn("POS offline", {
      integrationId: row.id,
      tenantId:      row.tenant_id,
      provider:      row.provider_key,
      lastSyncAt:    row.last_sync_at ?? "never",
    })
    metrics.increment("pos_offline_detected")
  }

  return NextResponse.json({
    ok:      true,
    offline: offlineIntegrations.length,
    ids:     offlineIntegrations.map((r) => r.id),
  })
}
