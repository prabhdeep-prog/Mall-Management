import { NextRequest, NextResponse } from "next/server"
import { sql } from "drizzle-orm"
import { auth } from "@/lib/auth/config"
import { db } from "@/lib/db"
import { tenantRiskScores } from "@/lib/db/schema"
import { computeRiskForOrganization, RISK_MODEL_VERSION } from "@/lib/tenants/risk-engine"

const ALLOWED_ROLES = new Set([
  "super_admin",
  "organization_admin",
  "property_manager",
  "leasing_manager",
  "finance_manager",
])

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/**
 * GET  /api/tenants/risk            → compute risk for every tenant in the org
 * POST /api/tenants/risk            → compute + persist a snapshot row per tenant
 *
 * Both routes scope to the caller's organizationId and bind RLS via
 * `app.current_organization_id`.
 */
export async function GET(_req: NextRequest) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  if (!ALLOWED_ROLES.has(session.user.role ?? "")) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }
  const organizationId = session.user.organizationId
  if (!organizationId) return NextResponse.json({ error: "No organization" }, { status: 400 })

  try {
    await db.execute(sql`SELECT set_config('app.current_organization_id', ${organizationId}, true)`)
    const scores = await computeRiskForOrganization(organizationId)
    return NextResponse.json({ success: true, data: { modelVersion: RISK_MODEL_VERSION, scores } })
  } catch (err) {
    console.error("[tenants/risk] GET error:", err)
    return NextResponse.json({ error: "Failed to compute risk" }, { status: 500 })
  }
}

export async function POST(_req: NextRequest) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  if (!ALLOWED_ROLES.has(session.user.role ?? "")) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }
  const organizationId = session.user.organizationId
  if (!organizationId) return NextResponse.json({ error: "No organization" }, { status: 400 })

  try {
    await db.execute(sql`SELECT set_config('app.current_organization_id', ${organizationId}, true)`)
    const scores = await computeRiskForOrganization(organizationId)
    const today = new Date().toISOString().slice(0, 10)

    if (scores.length > 0) {
      await db
        .insert(tenantRiskScores)
        .values(
          scores.map((s) => ({
            organizationId,
            tenantId: s.tenantId,
            scoreDate: today,
            riskScore: s.riskScore,
            riskLevel: s.riskLevel,
            latePaymentPoints: s.latePaymentPoints,
            salesDropPoints: s.salesDropPoints,
            complaintPoints: s.complaintPoints,
            leaseExpiryPoints: s.leaseExpiryPoints,
            signals: s.signals as unknown as Record<string, unknown>,
            recommendedActions: s.recommendedActions as unknown as Record<string, unknown>,
            modelVersion: s.modelVersion,
          })),
        )
        .onConflictDoNothing()
    }

    return NextResponse.json({ success: true, data: { persisted: scores.length, scores } })
  } catch (err) {
    console.error("[tenants/risk] POST error:", err)
    return NextResponse.json({ error: "Failed to persist risk scores" }, { status: 500 })
  }
}
