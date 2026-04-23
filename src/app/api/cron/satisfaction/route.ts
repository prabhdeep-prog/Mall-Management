/**
 * Tenant Satisfaction Batch Cron
 * ─────────────────────────────────────────────────────────────────────────────
 * Recomputes satisfaction scores for all tenants in all organizations.
 * Designed to be triggered by a cron scheduler (e.g., daily).
 *
 * Auth: Bearer token via CRON_SECRET env var.
 */

import { NextResponse } from "next/server"
import { serviceDb } from "@/lib/db"
import { sql } from "drizzle-orm"
import { calculateAllSatisfaction } from "@/lib/tenants/satisfaction-engine"

export const runtime = "nodejs"
export const maxDuration = 120

export async function POST(request: Request) {
  const authHeader = request.headers.get("authorization")
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  try {
    // Get all distinct organization IDs from properties
    const orgs = await serviceDb.execute<{ organization_id: string }>(sql`
      SELECT DISTINCT organization_id FROM properties WHERE organization_id IS NOT NULL
    `)

    let totalProcessed = 0
    const errors: string[] = []

    for (const org of orgs as unknown as Array<{ organization_id: string }>) {
      try {
        const results = await calculateAllSatisfaction(org.organization_id)
        totalProcessed += results.length
      } catch (err) {
        const msg = `Org ${org.organization_id}: ${err instanceof Error ? err.message : String(err)}`
        errors.push(msg)
        console.error("[cron/satisfaction]", msg)
      }
    }

    return NextResponse.json({
      success: true,
      processed: totalProcessed,
      organizations: (orgs as unknown as Array<any>).length,
      errors: errors.length > 0 ? errors : undefined,
    })
  } catch (err) {
    console.error("[cron/satisfaction] Fatal error:", err)
    return NextResponse.json(
      { error: "Failed to run satisfaction batch" },
      { status: 500 }
    )
  }
}
