/**
 * Revenue Intelligence API — GET /api/revenue-intelligence
 * ─────────────────────────────────────────────────────────────────────────────
 * Returns full mall KPI summary for a date range.
 *
 * Query params:
 *   startDate  YYYY-MM-DD  (default: first day of current month)
 *   endDate    YYYY-MM-DD  (default: yesterday)
 *   view       "tenant" | "zone" | "summary"  (default: "summary")
 *   heatmap    "true"  (include daily heatmap data)
 *
 * Authentication: session required
 * Authorization:  super_admin, organization_admin, finance_manager, property_manager
 *
 * Billing formula (CORRECT):
 *   minimumGuarantee  = monthlyMG × (periodDays / 30)
 *   revShareBase      = max(0, grossSales - breakpoint)
 *   revShareAmount    = revShareBase × revSharePct / 100
 *   amountDue         = max(minimumGuarantee, revShareAmount)   ← not just revShare!
 *   excessOverMG      = max(0, revShareAmount - minimumGuarantee)
 */

import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { computeMallKPIs, getDailyHeatmap } from "@/lib/revenue/kpi-engine"

// ── Allowed roles ─────────────────────────────────────────────────────────────

const ALLOWED_ROLES = new Set([
  "super_admin",
  "organization_admin",
  "finance_manager",
  "property_manager",
])

// ── GET ───────────────────────────────────────────────────────────────────────

export async function GET(req: NextRequest) {
  // ── Auth ────────────────────────────────────────────────────────────────────
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

  // ── Parse query params ──────────────────────────────────────────────────────
  const { searchParams } = new URL(req.url)

  const startDate = searchParams.get("startDate") ?? firstDayOfMonth()
  const endDate   = searchParams.get("endDate")   ?? yesterday()
  const view      = searchParams.get("view")      ?? "summary"
  const heatmap   = searchParams.get("heatmap")   === "true"

  // Validate date format
  if (!isValidDate(startDate) || !isValidDate(endDate)) {
    return NextResponse.json(
      { error: "Invalid date format. Use YYYY-MM-DD" },
      { status: 400 }
    )
  }

  if (startDate > endDate) {
    return NextResponse.json(
      { error: "startDate must be before endDate" },
      { status: 400 }
    )
  }

  // ── Compute KPIs ────────────────────────────────────────────────────────────
  try {
    const [summary, heatmapData] = await Promise.all([
      computeMallKPIs(organizationId, { startDate, endDate }),
      heatmap ? getDailyHeatmap(organizationId, startDate, endDate) : Promise.resolve(undefined),
    ])

    // Shape response based on view mode
    if (view === "tenant") {
      return NextResponse.json({
        period:       summary.period,
        periodDays:   summary.periodDays,
        tenants:      summary.byTenant,
        anomalies:    summary.anomalies,
        anomalyCount: summary.anomalyCount,
      })
    }

    if (view === "zone") {
      return NextResponse.json({
        period:     summary.period,
        periodDays: summary.periodDays,
        zones:      summary.byZone,
      })
    }

    // Default: full summary
    return NextResponse.json({
      ...summary,
      heatmap: heatmapData,
      // Include byTenant only if ≤50 tenants to avoid huge payloads
      byTenant:     summary.byTenant.length <= 50 ? summary.byTenant : undefined,
      _tenantCount: summary.byTenant.length,
    })

  } catch (err) {
    console.error("[revenue-intelligence] Error:", err)
    return NextResponse.json(
      { error: "Failed to compute revenue intelligence data" },
      { status: 500 }
    )
  }
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function firstDayOfMonth(): string {
  const d = new Date()
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-01`
}

function yesterday(): string {
  const d = new Date()
  d.setUTCDate(d.getUTCDate() - 1)
  return d.toISOString().slice(0, 10)
}

function isValidDate(s: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(s) && !isNaN(new Date(s).getTime())
}
