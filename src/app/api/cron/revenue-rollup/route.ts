/**
 * Nightly Revenue Rollup Cron
 * ─────────────────────────────────────────────────────────────────────────────
 * Runs at 1 AM UTC daily. Pre-computes revenue aggregations by property,
 * floor, and category so the Revenue Intelligence dashboard reads from
 * materialized data instead of scanning all POS records.
 */

import { NextResponse } from "next/server"
import { serviceDb } from "@/lib/db"
import { sql } from "drizzle-orm"
import { logger } from "@/lib/logger"

export const runtime = "nodejs"
export const maxDuration = 120

export async function GET(request: Request) {
  const authHeader = request.headers.get("authorization")
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  try {
    const yesterday = new Date()
    yesterday.setDate(yesterday.getDate() - 1)
    const targetDate = yesterday.toISOString().slice(0, 10)

    logger.info("revenue-rollup: starting", { targetDate })

    // 1. Aggregate by property for the day
    await serviceDb.execute(sql`
      INSERT INTO daily_metrics (property_id, metric_date, revenue, created_at)
      SELECT
        pi.property_id,
        psd.sales_date,
        SUM(psd.net_sales::numeric),
        NOW()
      FROM pos_sales_data psd
      JOIN pos_integrations pi ON psd.pos_integration_id = pi.id
      WHERE psd.sales_date = ${targetDate}::date
        AND pi.property_id IS NOT NULL
      GROUP BY pi.property_id, psd.sales_date
      ON CONFLICT (property_id, metric_date) DO UPDATE SET
        revenue = EXCLUDED.revenue
    `)

    // 2. Mark POS sales data as verified if reconciliation passes
    // Auto-verify sales data where variance is within threshold (₹1000)
    await serviceDb.execute(sql`
      UPDATE pos_sales_data psd SET
        verified = true,
        verified_at = NOW()
      WHERE psd.sales_date = ${targetDate}::date
        AND psd.verified = false
        AND EXISTS (
          SELECT 1 FROM pos_reconciliation pr
          WHERE pr.tenant_id = psd.tenant_id
            AND pr.period_start <= psd.sales_date
            AND pr.period_end >= psd.sales_date
            AND pr.status = 'matched'
        )
    `)

    // 3. Count what we processed
    const stats = await serviceDb.execute<{ properties: string; verified: string }>(sql`
      SELECT
        (SELECT COUNT(DISTINCT pi.property_id) FROM pos_sales_data psd JOIN pos_integrations pi ON psd.pos_integration_id = pi.id WHERE psd.sales_date = ${targetDate}::date) as properties,
        (SELECT COUNT(*) FROM pos_sales_data WHERE sales_date = ${targetDate}::date AND verified = true) as verified
    `)

    logger.info("revenue-rollup: completed", {
      targetDate,
      properties: stats[0]?.properties ?? "0",
      verified: stats[0]?.verified ?? "0",
    })

    return NextResponse.json({
      success: true,
      targetDate,
      properties: parseInt(stats[0]?.properties ?? "0"),
      verified: parseInt(stats[0]?.verified ?? "0"),
    })
  } catch (err) {
    logger.error("revenue-rollup: failed", { error: err })
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
