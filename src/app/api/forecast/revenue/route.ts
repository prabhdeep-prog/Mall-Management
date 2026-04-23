import { NextRequest, NextResponse } from "next/server"
import { sql } from "drizzle-orm"
import { auth } from "@/lib/auth/config"
import { db } from "@/lib/db"
import { revenueForecasts } from "@/lib/db/schema"
import { generateRevenueForecast, FORECAST_MODEL_VERSION } from "@/lib/revenue/forecast-engine"

const ALLOWED_ROLES = new Set([
  "super_admin",
  "organization_admin",
  "property_manager",
  "finance_manager",
  "leasing_manager",
])

/**
 * GET /api/forecast/revenue?mallId=<propertyId>&zoneId=<uuid>&persist=true
 *
 * Returns a 30-day revenue forecast for a mall (and optional zone), built from
 * the last 90 days of POS sales. When `persist=true`, also upserts each
 * forecast point into `revenue_forecasts` so historical model output is kept
 * for back-testing and the dashboard widget can compare actual vs predicted.
 *
 * Tenant isolation: session.user.organizationId scopes the request, and we
 * set `app.current_organization_id` on the connection so the table's RLS
 * policy filters every read/write.
 */
export async function GET(req: NextRequest) {
  const session = await auth()
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }
  if (!ALLOWED_ROLES.has(session.user.role ?? "")) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }
  const organizationId = session.user.organizationId
  if (!organizationId) {
    return NextResponse.json({ error: "No organization" }, { status: 400 })
  }

  const { searchParams } = new URL(req.url)
  const mallId = searchParams.get("mallId")
  const zoneId = searchParams.get("zoneId")
  const persist = searchParams.get("persist") === "true"

  if (!mallId) {
    return NextResponse.json({ error: "mallId is required" }, { status: 400 })
  }

  try {
    // Bind organization for RLS on this connection.
    await db.execute(sql`SELECT set_config('app.current_organization_id', ${organizationId}, true)`)

    const result = await generateRevenueForecast(organizationId, mallId, zoneId)

    if (persist && result.forecast.length > 0) {
      // Upsert each point — uniqueness on (org, property, zone, date, model_version).
      await db
        .insert(revenueForecasts)
        .values(
          result.forecast.map((p) => ({
            organizationId,
            propertyId: mallId,
            zoneId: zoneId ?? null,
            forecastDate: p.date,
            predictedRevenue: String(p.predictedRevenue),
            confidenceScore: String(p.confidenceScore),
            modelVersion: FORECAST_MODEL_VERSION,
          })),
        )
        .onConflictDoNothing()
    }

    return NextResponse.json({ success: true, data: result })
  } catch (err) {
    console.error("[forecast/revenue] Error:", err)
    return NextResponse.json(
      { error: "Failed to generate revenue forecast" },
      { status: 500 },
    )
  }
}
