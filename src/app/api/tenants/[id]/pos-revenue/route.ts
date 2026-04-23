/**
 * GET /api/tenants/:id/pos-revenue
 *
 * Query params:
 *   startDate  YYYY-MM-DD  (default: 30 days ago)
 *   endDate    YYYY-MM-DD  (default: today)
 *   page       number      (default: 1, for history table)
 *   limit      number      (default: 30)
 *   verified   "true"      (optional filter)
 *
 * Response: { kpis, trend, heatmap, breakdown, history, leaseInfo, tenantInfo, posInfo }
 */

import { NextRequest, NextResponse } from "next/server"
import { db } from "@/lib/db"
import { tenants, leases, posIntegrations, posSalesData } from "@/lib/db/schema"
import { eq, and, gte, lte, desc, asc } from "drizzle-orm"
import { requirePermission, PERMISSIONS } from "@/lib/auth/rbac"

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

// Weekday label from JS Date.getDay() (0 = Sun)
const WEEKDAY = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"]

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const { authorized, error } = await requirePermission(PERMISSIONS.TENANTS_VIEW)
    if (!authorized) return NextResponse.json({ error }, { status: 403 })

    const tenantId = params.id
    if (!UUID_RE.test(tenantId)) {
      return NextResponse.json({ error: "Invalid tenant ID" }, { status: 400 })
    }

    const { searchParams } = new URL(request.url)

    // Date range defaults
    const today   = new Date()
    const defEnd  = today.toISOString().slice(0, 10)
    const defStart = new Date(today.getTime() - 29 * 86400000).toISOString().slice(0, 10)

    const startDate = searchParams.get("startDate") || defStart
    const endDate   = searchParams.get("endDate")   || defEnd
    const page      = Math.max(1, parseInt(searchParams.get("page")  || "1"))
    const limit     = Math.min(100, parseInt(searchParams.get("limit") || "30"))
    const verifiedOnly = searchParams.get("verified") === "true"

    // ── Tenant + lease ──────────────────────────────────────────────────────
    const tenant = await db.query.tenants.findFirst({
      where: eq(tenants.id, tenantId),
    })
    if (!tenant) return NextResponse.json({ error: "Tenant not found" }, { status: 404 })

    const activeLease = await db.query.leases.findFirst({
      where: and(eq(leases.tenantId, tenantId), eq(leases.status, "active")),
      orderBy: desc(leases.startDate),
    })

    // ── POS integration ─────────────────────────────────────────────────────
    const posInt = await db.query.posIntegrations.findFirst({
      where: eq(posIntegrations.tenantId, tenantId),
      orderBy: desc(posIntegrations.createdAt),
    })

    // ── Sales data (all for computations) ───────────────────────────────────
    const conditions = [
      eq(posSalesData.tenantId, tenantId),
      gte(posSalesData.salesDate, startDate),
      lte(posSalesData.salesDate, endDate),
    ]
    if (verifiedOnly) conditions.push(eq(posSalesData.verified, true))

    const allRows = await db
      .select()
      .from(posSalesData)
      .where(and(...conditions))
      .orderBy(asc(posSalesData.salesDate))

    if (allRows.length === 0) {
      return NextResponse.json({
        success: true,
        data: {
          tenantInfo: buildTenantInfo(tenant),
          leaseInfo:  buildLeaseInfo(activeLease),
          posInfo:    buildPosInfo(posInt),
          kpis:       null,
          trend:      [],
          heatmap:    [],
          breakdown:  { byWeekday: [], byProvider: [], byCategory: [] },
          history:    { rows: [], total: 0, page, limit },
          empty:      true,
        },
      })
    }

    // ── KPIs ────────────────────────────────────────────────────────────────
    const totalGross  = allRows.reduce((s, r) => s + parseFloat(r.grossSales  || "0"), 0)
    const totalNet    = allRows.reduce((s, r) => s + parseFloat(r.netSales    || "0"), 0)
    const totalTxns   = allRows.reduce((s, r) => s + (r.transactionCount || 0), 0)
    const days        = allRows.length
    const avgDaily    = days > 0 ? totalGross / days : 0

    const peakRow     = allRows.reduce((best, r) =>
      parseFloat(r.grossSales) > parseFloat(best.grossSales) ? r : best, allRows[0])

    const monthlyRent = parseFloat(activeLease?.baseRent || "0")
    const revSharePct = parseFloat(activeLease?.revenueSharePercentage || "0")
    const revShareDue = revSharePct > 0 ? (totalGross * revSharePct) / 100 : 0
    const salesVsRent = monthlyRent > 0 ? (totalGross / monthlyRent) * 100 : 0

    const kpis = {
      totalSales:      totalGross,
      totalNetSales:   totalNet,
      avgDailySales:   avgDaily,
      highestSalesDay: { date: peakRow.salesDate, amount: parseFloat(peakRow.grossSales) },
      transactionCount: totalTxns,
      avgTicketSize:   totalTxns > 0 ? totalNet / totalTxns : 0,
      revenueShareDue: revShareDue,
      salesVsRentPct:  salesVsRent,
      days,
    }

    // ── Trend (daily) ────────────────────────────────────────────────────────
    const trend = allRows.map((r) => ({
      date:             r.salesDate,
      grossSales:       parseFloat(r.grossSales  || "0"),
      netSales:         parseFloat(r.netSales    || "0"),
      transactionCount: r.transactionCount || 0,
      refunds:          parseFloat(r.refunds     || "0"),
      verified:         r.verified,
    }))

    // Rolling 7-day average overlay
    const trendWithAvg = trend.map((row, idx) => {
      const window = trend.slice(Math.max(0, idx - 6), idx + 1)
      const avg    = window.reduce((s, w) => s + w.grossSales, 0) / window.length
      return { ...row, rollingAvg: Math.round(avg) }
    })

    // ── Heatmap (day × hour) ─────────────────────────────────────────────────
    // hourlyBreakdown stored as { "9": 5000, "10": 8000, … } in each day row
    type HeatCell = { day: string; hour: number; value: number; count: number }
    const heatMap: Record<string, HeatCell> = {}

    allRows.forEach((r) => {
      const dow    = WEEKDAY[new Date(r.salesDate + "T00:00:00").getDay()]
      const hourly = (r.hourlyBreakdown || {}) as Record<string, number>
      Object.entries(hourly).forEach(([h, amt]) => {
        const key   = `${dow}-${h}`
        const cell  = heatMap[key] || { day: dow, hour: parseInt(h), value: 0, count: 0 }
        cell.value += typeof amt === "number" ? amt : parseFloat(String(amt))
        cell.count += 1
        heatMap[key] = cell
      })
    })

    const heatmap = Object.values(heatMap).sort((a, b) => {
      const dayOrder = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]
      return dayOrder.indexOf(a.day) - dayOrder.indexOf(b.day) || a.hour - b.hour
    })

    // ── Breakdown ────────────────────────────────────────────────────────────
    // By weekday
    const weekdayTotals: Record<string, { gross: number; txns: number; days: number }> = {}
    allRows.forEach((r) => {
      const dow = WEEKDAY[new Date(r.salesDate + "T00:00:00").getDay()]
      const e   = weekdayTotals[dow] || { gross: 0, txns: 0, days: 0 }
      e.gross  += parseFloat(r.grossSales || "0")
      e.txns   += r.transactionCount || 0
      e.days   += 1
      weekdayTotals[dow] = e
    })
    const byWeekday = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((day) => ({
      day,
      grossSales:  weekdayTotals[day]?.gross || 0,
      avgSales:    weekdayTotals[day] ? weekdayTotals[day].gross / weekdayTotals[day].days : 0,
      transactions: weekdayTotals[day]?.txns || 0,
    }))

    // By POS provider (from posIntegrationId resolved via join — use provider field from integration)
    const providerName = posInt?.provider || "unknown"
    const byProvider = [{
      provider: providerName,
      grossSales: totalGross,
      transactions: totalTxns,
    }]

    // By category (from categoryBreakdown jsonb)
    const catTotals: Record<string, number> = {}
    allRows.forEach((r) => {
      const breakdown = (r.categoryBreakdown || {}) as Record<string, number>
      Object.entries(breakdown).forEach(([cat, amt]) => {
        catTotals[cat] = (catTotals[cat] || 0) + (typeof amt === "number" ? amt : parseFloat(String(amt)))
      })
    })
    const byCategory = Object.entries(catTotals)
      .map(([category, grossSales]) => ({ category, grossSales }))
      .sort((a, b) => b.grossSales - a.grossSales)
      .slice(0, 10)

    // ── History (paginated) ──────────────────────────────────────────────────
    const sorted = [...allRows].sort((a, b) => b.salesDate.localeCompare(a.salesDate))
    const total  = sorted.length
    const start  = (page - 1) * limit
    const historyRows = sorted.slice(start, start + limit).map((r) => ({
      id:               r.id,
      date:             r.salesDate,
      grossSales:       parseFloat(r.grossSales  || "0"),
      netSales:         parseFloat(r.netSales    || "0"),
      refunds:          parseFloat(r.refunds     || "0"),
      discounts:        parseFloat(r.discounts   || "0"),
      transactionCount: r.transactionCount || 0,
      avgTicketSize:    r.avgTransactionValue ? parseFloat(r.avgTransactionValue) : 0,
      provider:         posInt?.provider || "unknown",
      verified:         r.verified || false,
      revenueSharePct:  revSharePct,
      revenueShareAmt:  revSharePct > 0 ? (parseFloat(r.grossSales || "0") * revSharePct) / 100 : 0,
      source:           r.source || "pos_api",
    }))

    return NextResponse.json({
      success: true,
      data: {
        tenantInfo: buildTenantInfo(tenant),
        leaseInfo:  buildLeaseInfo(activeLease),
        posInfo:    buildPosInfo(posInt),
        kpis,
        trend:      trendWithAvg,
        heatmap,
        breakdown:  { byWeekday, byProvider, byCategory },
        history:    { rows: historyRows, total, page, limit },
        empty:      false,
      },
    })
  } catch (err) {
    console.error("GET /api/tenants/[id]/pos-revenue error:", err)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}

// ── Helpers ─────────────────────────────────────────────────────────────────

function buildTenantInfo(t: typeof import("@/lib/db/schema").tenants.$inferSelect) {
  return {
    id:           t.id,
    businessName: t.businessName,
    brandName:    t.brandName,
    category:     t.category,
    subcategory:  t.subcategory,
    email:        t.email,
    phone:        t.phone,
    status:       t.status,
  }
}

function buildLeaseInfo(l: typeof import("@/lib/db/schema").leases.$inferSelect | undefined | null) {
  if (!l) return null
  return {
    id:                     l.id,
    unitNumber:             l.unitNumber,
    floor:                  l.floor,
    zone:                   l.zone,
    areaSqft:               l.areaSqft,
    leaseType:              l.leaseType,
    baseRent:               l.baseRent,
    revenueSharePercentage: l.revenueSharePercentage,
    monthlyMg:              l.monthlyMg,
    camCharges:             l.camCharges,
    startDate:              l.startDate,
    endDate:                l.endDate,
    status:                 l.status,
  }
}

function buildPosInfo(p: typeof import("@/lib/db/schema").posIntegrations.$inferSelect | undefined | null) {
  if (!p) return null
  return {
    id:           p.id,
    provider:     p.provider,
    storeId:      p.storeId,
    status:       p.status,
    syncFrequency: p.syncFrequency,
    lastSyncAt:   p.lastSyncAt,
    lastSyncStatus: p.lastSyncStatus,
  }
}
