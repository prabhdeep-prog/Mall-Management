/**
 * Mall KPI Engine
 * ─────────────────────────────────────────────────────────────────────────────
 * Computes shopping-mall-specific KPIs:
 *
 *   • Sales/sqft          — primary mall efficiency metric
 *   • Floor & zone KPIs  — aggregated by physical location
 *   • YoY comparison      — seasonality-aware (not period-over-period)
 *   • Conversion rate     — sales / footfall
 *   • Occupancy cost %    — rent+CAM / gross sales
 *   • Tenant performance leaderboard
 *   • Anomaly detection   — sudden drops, POS downtime, missing data
 *
 * Schema notes:
 *   • tenants.business_name  (NOT "name" or "shop_name")
 *   • tenants has NO organization_id — filter via tenants→properties→organizations
 *   • zone / floor live on LEASES, not on tenants
 *   • pos_sales_data.sales_date  (NOT "sale_date")
 *   • pos_integrations has NO organization_id column
 *   • footfall_data / revenue_calculations created in migration 005 (may not exist)
 */

import { sql } from "drizzle-orm"
import { serviceDb } from "@/lib/db"

// ── Types ─────────────────────────────────────────────────────────────────────

export interface DateRange {
  startDate: string   // YYYY-MM-DD
  endDate:   string   // YYYY-MM-DD
}

export interface TenantKPI {
  tenantId:          string
  tenantName:        string
  shopName:          string
  zone:              string | null
  floor:             string | null
  areaSqft:          number | null

  // Sales
  grossSales:        number
  netSales:          number
  transactionCount:  number
  avgTicketSize:     number | null
  salesPerSqft:      number | null

  // MG (populated once migration 005 is applied & billing runs)
  amountDue:         number
  minimumGuarantee:  number
  excessOverMG:      number
  isAboveMG:         boolean

  // YoY
  grossSalesYoY:     number | null
  yoyGrowthPct:      number | null
  yoyTrend:          "up" | "down" | "flat" | "new"

  // Anomaly
  anomalyFlag:       string | null
}

export interface ZoneKPI {
  zone:              string
  floor:             string | null
  tenantCount:       number
  grossSales:        number
  totalAreaSqft:     number | null
  salesPerSqft:      number | null
  topTenant:         string | null
  avgYoyGrowthPct:   number | null
}

export interface MallKPISummary {
  period:            DateRange
  periodDays:        number

  // Mall-wide totals
  totalGrossSales:   number
  totalNetSales:     number
  totalTransactions: number
  totalAmountDue:    number
  totalExcessOverMG: number
  tenantsAboveMG:    number
  tenantsBelowMG:    number

  // Footfall (null until migration 005 + footfall data arrives)
  totalFootfall:     number | null
  conversionRate:    number | null

  // KPIs
  avgSalesPerSqft:   number | null
  totalOccupiedSqft: number | null

  // YoY
  yoyGrowthPct:       number | null
  yoyGrossSalesPrior: number | null

  // Breakdowns
  byTenant:          TenantKPI[]
  byZone:            ZoneKPI[]

  // Anomalies
  anomalyCount:      number
  anomalies:         Array<{ tenantId: string; tenantName: string; flag: string }>
}

// ── YoY date helper ───────────────────────────────────────────────────────────

function priorYearRange(range: DateRange): DateRange {
  return {
    startDate: shiftYear(range.startDate, -1),
    endDate:   shiftYear(range.endDate,   -1),
  }
}

function shiftYear(dateStr: string, delta: number): string {
  const d = new Date(dateStr)
  d.setFullYear(d.getFullYear() + delta)
  return d.toISOString().slice(0, 10)
}

function daysBetween(a: string, b: string): number {
  return Math.round((new Date(b).getTime() - new Date(a).getTime()) / 86_400_000) + 1
}

// ── Anomaly detection ─────────────────────────────────────────────────────────

const ANOMALY_MISSING_DATA_THRESHOLD = 0.3    // >30% days with zero sales = flag
const ANOMALY_DROP_THRESHOLD         = 0.4    // <40% of YoY = flag

function detectAnomaly(params: {
  grossSales:     number
  priorYearSales: number | null
  daysWithSales:  number
  periodDays:     number
}): string | null {
  const { grossSales, priorYearSales, daysWithSales, periodDays } = params

  if (grossSales === 0) return "Zero sales recorded — possible POS offline or no data"

  const missingRate = 1 - daysWithSales / periodDays
  if (missingRate > ANOMALY_MISSING_DATA_THRESHOLD) {
    return `Data gap: ${Math.round(missingRate * 100)}% of days have no sales`
  }

  if (priorYearSales != null && priorYearSales > 0) {
    const ratio = grossSales / priorYearSales
    if (ratio < ANOMALY_DROP_THRESHOLD) {
      return `Sales dropped ${Math.round((1 - ratio) * 100)}% vs same period last year`
    }
  }

  return null
}

// ── Main KPI computation ──────────────────────────────────────────────────────

/**
 * Computes full mall KPI summary for a given period.
 *
 * Filtering by organization: tenants don't carry organization_id directly.
 * The path is:  tenants.property_id → properties.organization_id
 */
export async function computeMallKPIs(
  organizationId: string,
  range: DateRange,
): Promise<MallKPISummary> {
  const periodDays = daysBetween(range.startDate, range.endDate)
  const prior      = priorYearRange(range)

  // ── 1. Fetch current period tenant + sales data ───────────────────────────────
  //
  //  Key fixes vs original:
  //  • t.business_name  (not t.name / t.shop_name)
  //  • zone + floor come from leases (MAX to collapse multiple active leases)
  //  • organization filter via properties join (tenants have no org_id)
  //  • p.sales_date  (not p.sale_date)
  //  • revenue_calculations omitted — table created in migration 005
  //    (returns literal 0 until billing engine populates it)
  //
  const tenantRows = await serviceDb.execute<{
    tenant_id:         string
    tenant_name:       string
    shop_name:         string
    zone:              string | null
    floor:             string | null
    area_sqft:         string | null
    gross_sales:       string
    net_sales:         string
    refunds:           string
    transaction_count: string
    days_with_sales:   string
    amount_due:        string
    minimum_guarantee: string
    excess_over_mg:    string
  }>(sql`
    SELECT
      t.id                                               AS tenant_id,
      t.business_name                                    AS tenant_name,
      t.business_name                                    AS shop_name,
      MAX(l.zone)                                        AS zone,
      MAX(l.floor)::text                                 AS floor,
      MAX(l.area_sqft)                                   AS area_sqft,
      COALESCE(SUM(p.gross_sales),        0)             AS gross_sales,
      COALESCE(SUM(p.net_sales),          0)             AS net_sales,
      COALESCE(SUM(p.refunds),            0)             AS refunds,
      COALESCE(SUM(p.transaction_count),  0)             AS transaction_count,
      COUNT(DISTINCT CASE WHEN p.gross_sales > 0 THEN p.sales_date END)
                                                         AS days_with_sales,
      0::text                                            AS amount_due,
      0::text                                            AS minimum_guarantee,
      0::text                                            AS excess_over_mg
    FROM tenants t
    JOIN properties pr
      ON pr.id               = t.property_id
     AND pr.organization_id  = ${organizationId}::uuid
    LEFT JOIN leases l
      ON l.tenant_id = t.id
     AND l.status    = 'active'
    LEFT JOIN (
      SELECT
        pi.tenant_id,
        psd.sales_date,
        SUM(psd.gross_sales)       AS gross_sales,
        SUM(psd.net_sales)         AS net_sales,
        SUM(psd.refunds)           AS refunds,
        SUM(psd.transaction_count) AS transaction_count
      FROM pos_sales_data psd
      JOIN pos_integrations pi
        ON pi.id     = psd.pos_integration_id
       AND pi.status = 'connected'
      WHERE psd.sales_date >= ${range.startDate}::date
        AND psd.sales_date <= ${range.endDate}::date
      GROUP BY pi.tenant_id, psd.sales_date
    ) p ON p.tenant_id = t.id
    WHERE t.status = 'active'
    GROUP BY t.id, t.business_name
    ORDER BY SUM(p.gross_sales) DESC NULLS LAST
  `)

  // ── 2. Fetch prior year sales for YoY ─────────────────────────────────────
  //  pos_integrations has no organization_id — filter via tenants→properties
  //
  const priorRows = await serviceDb.execute<{
    tenant_id:   string
    gross_sales: string
  }>(sql`
    SELECT
      p.tenant_id,
      COALESCE(SUM(p.gross_sales), 0) AS gross_sales
    FROM pos_sales_data p
    JOIN tenants t    ON t.id    = p.tenant_id
    JOIN properties pr ON pr.id = t.property_id
                      AND pr.organization_id = ${organizationId}::uuid
    WHERE p.sales_date >= ${prior.startDate}::date
      AND p.sales_date <= ${prior.endDate}::date
    GROUP BY p.tenant_id
  `)

  const priorByTenant = new Map<string, number>()
  for (const r of priorRows) {
    priorByTenant.set(r.tenant_id, parseFloat(r.gross_sales))
  }

  // ── 3. Mall-wide footfall (optional — table created in migration 005) ───────
  let totalFootfall = 0
  try {
    const footfallRows = await serviceDb.execute<{ total_visitors: string }>(sql`
      SELECT COALESCE(SUM(visitor_count), 0)::text AS total_visitors
      FROM footfall_data
      WHERE organization_id = ${organizationId}::uuid
        AND data_date >= ${range.startDate}::date
        AND data_date <= ${range.endDate}::date
        AND zone IS NULL
    `)
    totalFootfall = parseInt(footfallRows[0]?.total_visitors ?? "0", 10)
  } catch {
    // footfall_data table not yet created (migration 005 pending) — return 0
    totalFootfall = 0
  }

  // ── 4. Build per-tenant KPIs ───────────────────────────────────────────────
  const byTenant: TenantKPI[] = Array.from(tenantRows).map((row) => {
    const grossSales       = parseFloat(row.gross_sales)
    const netSales         = parseFloat(row.net_sales)
    const transactionCount = parseInt(row.transaction_count, 10)
    const areaSqft         = row.area_sqft ? parseFloat(row.area_sqft) : null
    const daysWithSales    = parseInt(String(row.days_with_sales), 10) || 0
    const amountDue        = parseFloat(row.amount_due)
    const minimumGuarantee = parseFloat(row.minimum_guarantee)
    const excessOverMG     = parseFloat(row.excess_over_mg)
    const priorYearSales   = priorByTenant.get(row.tenant_id) ?? null

    const salesPerSqft  = areaSqft && areaSqft > 0
      ? Math.round((grossSales / areaSqft) * 100) / 100
      : null
    const avgTicketSize = transactionCount > 0
      ? Math.round((grossSales / transactionCount) * 100) / 100
      : null

    // YoY
    let yoyGrowthPct: number | null = null
    let yoyTrend: TenantKPI["yoyTrend"] = "new"
    if (priorYearSales != null) {
      if (priorYearSales === 0) {
        yoyTrend = grossSales > 0 ? "up" : "flat"
      } else {
        yoyGrowthPct = Math.round(
          ((grossSales - priorYearSales) / priorYearSales) * 10000,
        ) / 100
        yoyTrend = yoyGrowthPct > 2 ? "up" : yoyGrowthPct < -2 ? "down" : "flat"
      }
    }

    const anomalyFlag = detectAnomaly({
      grossSales,
      priorYearSales,
      daysWithSales,
      periodDays,
    })

    return {
      tenantId:          row.tenant_id,
      tenantName:        row.tenant_name,
      shopName:          row.shop_name,
      zone:              row.zone,
      floor:             row.floor,
      areaSqft,
      grossSales,
      netSales,
      transactionCount,
      avgTicketSize,
      salesPerSqft,
      amountDue,
      minimumGuarantee,
      excessOverMG,
      isAboveMG:         excessOverMG > 0,
      grossSalesYoY:     priorYearSales,
      yoyGrowthPct,
      yoyTrend,
      anomalyFlag,
    }
  })

  // ── 5. Zone aggregation ────────────────────────────────────────────────────
  const zoneMap = new Map<string, ZoneKPI>()

  for (const t of byTenant) {
    const key      = `${t.zone ?? "uncategorized"}|${t.floor ?? "all"}`
    const zoneName = t.zone ?? "Uncategorized"
    const existing = zoneMap.get(key)

    if (!existing) {
      zoneMap.set(key, {
        zone:            zoneName,
        floor:           t.floor,
        tenantCount:     1,
        grossSales:      t.grossSales,
        totalAreaSqft:   t.areaSqft,
        salesPerSqft:    null,
        topTenant:       t.tenantName,
        avgYoyGrowthPct: null,
      })
    } else {
      existing.tenantCount  += 1
      existing.grossSales   += t.grossSales
      existing.totalAreaSqft =
        existing.totalAreaSqft != null && t.areaSqft != null
          ? existing.totalAreaSqft + t.areaSqft
          : existing.totalAreaSqft ?? t.areaSqft
      // Track top tenant by sales
      const currentTopSales =
        byTenant.find((x) => x.tenantName === existing.topTenant)?.grossSales ?? 0
      if (t.grossSales > currentTopSales) existing.topTenant = t.tenantName
    }
  }

  // Compute salesPerSqft + avgYoY per zone
  for (const z of zoneMap.values()) {
    const zoneTenants = byTenant.filter(
      (t) =>
        (t.zone ?? "uncategorized") === (z.zone === "Uncategorized" ? "uncategorized" : z.zone) &&
        (t.floor ?? "all") === (z.floor ?? "all"),
    )
    z.salesPerSqft =
      z.totalAreaSqft && z.totalAreaSqft > 0
        ? Math.round((z.grossSales / z.totalAreaSqft) * 100) / 100
        : null

    const yoyValues = zoneTenants
      .filter((t) => t.yoyGrowthPct != null)
      .map((t) => t.yoyGrowthPct!)
    z.avgYoyGrowthPct =
      yoyValues.length > 0
        ? Math.round(
            (yoyValues.reduce((a, b) => a + b, 0) / yoyValues.length) * 100,
          ) / 100
        : null
  }

  const byZone = Array.from(zoneMap.values()).sort(
    (a, b) => b.grossSales - a.grossSales,
  )

  // ── 6. Mall-wide totals ────────────────────────────────────────────────────
  const totalGrossSales   = byTenant.reduce((s, t) => s + t.grossSales, 0)
  const totalNetSales     = byTenant.reduce((s, t) => s + t.netSales, 0)
  const totalTransactions = byTenant.reduce((s, t) => s + t.transactionCount, 0)
  const totalAmountDue    = byTenant.reduce((s, t) => s + t.amountDue, 0)
  const totalExcessOverMG = byTenant.reduce((s, t) => s + t.excessOverMG, 0)
  const tenantsAboveMG    = byTenant.filter((t) => t.isAboveMG).length
  const tenantsBelowMG    = byTenant.filter((t) => !t.isAboveMG && t.amountDue > 0).length
  const totalOccupiedSqft = byTenant.reduce((s, t) => s + (t.areaSqft ?? 0), 0) || null

  const avgSalesPerSqft =
    totalOccupiedSqft && totalOccupiedSqft > 0
      ? Math.round((totalGrossSales / totalOccupiedSqft) * 100) / 100
      : null

  // YoY mall-wide
  const totalPriorYearSales = byTenant.reduce(
    (s, t) => s + (t.grossSalesYoY ?? 0),
    0,
  )
  const yoyGrowthPct =
    totalPriorYearSales > 0
      ? Math.round(
          ((totalGrossSales - totalPriorYearSales) / totalPriorYearSales) * 10000,
        ) / 100
      : null

  // Conversion rate (transactions per visitor)
  const conversionRate =
    totalFootfall > 0
      ? Math.round((totalTransactions / totalFootfall) * 10000) / 100
      : null

  // Anomalies
  const anomalies = byTenant
    .filter((t) => t.anomalyFlag != null)
    .map((t) => ({
      tenantId:   t.tenantId,
      tenantName: t.tenantName,
      flag:       t.anomalyFlag!,
    }))

  return {
    period:             range,
    periodDays,
    totalGrossSales:    Math.round(totalGrossSales   * 100) / 100,
    totalNetSales:      Math.round(totalNetSales     * 100) / 100,
    totalTransactions,
    totalAmountDue:     Math.round(totalAmountDue    * 100) / 100,
    totalExcessOverMG:  Math.round(totalExcessOverMG * 100) / 100,
    tenantsAboveMG,
    tenantsBelowMG,
    totalFootfall:      totalFootfall > 0 ? totalFootfall : null,
    conversionRate,
    avgSalesPerSqft,
    totalOccupiedSqft,
    yoyGrowthPct,
    yoyGrossSalesPrior: totalPriorYearSales > 0
      ? Math.round(totalPriorYearSales * 100) / 100
      : null,
    byTenant,
    byZone,
    anomalyCount:       anomalies.length,
    anomalies,
  }
}

// ── Sales calendar heatmap ────────────────────────────────────────────────────

export interface CalendarDay {
  date:      string   // YYYY-MM-DD
  sales:     number
  intensity: number   // 0–4 (0=no data, 1=low, 4=high)
}

/**
 * Returns daily sales for the heatmap calendar view.
 * Filters by organization via tenants→properties chain
 * (pos_sales_data has no organization_id column).
 */
export async function getDailyHeatmap(
  organizationId: string,
  startDate: string,
  endDate: string,
): Promise<CalendarDay[]> {
  const rows = await serviceDb.execute<{
    sale_date:   string
    gross_sales: string
  }>(sql`
    SELECT
      p.sales_date            AS sale_date,
      SUM(p.gross_sales)      AS gross_sales
    FROM pos_sales_data p
    JOIN tenants t    ON t.id    = p.tenant_id
    JOIN properties pr ON pr.id = t.property_id
                      AND pr.organization_id = ${organizationId}::uuid
    WHERE p.sales_date >= ${startDate}::date
      AND p.sales_date <= ${endDate}::date
    GROUP BY p.sales_date
    ORDER BY p.sales_date
  `)

  if (rows.length === 0) return []

  const salesValues = Array.from(rows).map((r) => parseFloat(r.gross_sales))
  const sorted      = [...salesValues].sort((a, b) => a - b)
  const p25         = sorted[Math.floor(sorted.length * 0.25)] ?? 0
  const p75         = sorted[Math.floor(sorted.length * 0.75)] ?? 0

  return Array.from(rows).map((r) => {
    const v = parseFloat(r.gross_sales)
    let intensity = 0
    if (v > 0) {
      if (v < p25)      intensity = 1
      else if (v < p75 / 2) intensity = 2
      else if (v < p75) intensity = 3
      else              intensity = 4
    }
    return {
      date:      r.sale_date,
      sales:     Math.round(v * 100) / 100,
      intensity,
    }
  })
}
