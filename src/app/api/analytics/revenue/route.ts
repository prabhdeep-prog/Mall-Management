import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { db } from "@/lib/db"
import { sql } from "drizzle-orm"
import { getCachedOrFetch, CACHE_TTL } from "@/lib/cache"

// ── Types ─────────────────────────────────────────────────────────────────────

interface TrendPoint   { period: string; revenue: number; transactions: number }
interface TenantRank   { id: string; name: string; category: string | null; revenue: number; prevRevenue: number | null; growthPct: number | null; sqft: number | null; salesPerSqft: number | null; rank: number }
interface CategoryItem { name: string; value: number }
interface FloorItem    { floor: string; revenue: number; tenantCount: number }
interface PaymentItem  { method: string; value: number; count: number }
interface HourlyItem   { hour: number; label: string; revenue: number }
interface WeekdayItem  { dow: number; day: string; shortDay: string; revenue: number; days: number; avgRevenue: number; isWeekend: boolean }
interface MonthlyItem  { month: string; label: string; thisYear: number; lastYear: number }
interface FilterOptions { floors: string[]; categories: string[] }

// ── Date helpers ─────────────────────────────────────────────────────────────

function prevPeriod(start: string, end: string) {
  const s = new Date(start), e = new Date(end)
  const diff = Math.ceil((e.getTime() - s.getTime()) / 86400000) + 1
  const prevEnd = new Date(s); prevEnd.setDate(prevEnd.getDate() - 1)
  const prevStart = new Date(prevEnd); prevStart.setDate(prevStart.getDate() - diff + 1)
  return {
    prevStart: prevStart.toISOString().slice(0, 10),
    prevEnd:   prevEnd.toISOString().slice(0, 10),
  }
}

// ── Query helpers ─────────────────────────────────────────────────────────────

function buildFilters(params: {
  start: string; end: string
  propertyId: string | null; floor: string | null; category: string | null; tenantId: string | null
}) {
  const { start, end, propertyId, floor, category, tenantId } = params
  const catJoin      = category || tenantId ? sql`JOIN tenants t ON t.id = l.tenant_id` : sql``
  const catWhere     = category  ? sql`AND t.category = ${category}` : sql``
  const tenantWhere  = tenantId  ? sql`AND l.tenant_id = ${tenantId}::uuid` : sql``
  const propWhere    = propertyId ? sql`AND l.property_id = ${propertyId}::uuid` : sql``
  const floorWhere   = floor     ? sql`AND l.floor = ${floor}` : sql``
  const dateWhere    = sql`psd.sales_date BETWEEN ${start}::date AND ${end}::date`
  return { catJoin, catWhere, tenantWhere, propWhere, floorWhere, dateWhere }
}

// ── Individual queries ────────────────────────────────────────────────────────

async function queryTrend(params: {
  start: string; end: string; period: string
  propertyId: string | null; floor: string | null; category: string | null; tenantId: string | null
}): Promise<TrendPoint[]> {
  const { start, end, period } = params
  const unit = period === "month" ? "month" : period === "week" ? "week" : "day"
  const f = buildFilters(params)
  try {
    const rows = await db.execute(sql`
      SELECT
        DATE_TRUNC(${unit}, psd.sales_date)::text        AS period,
        COALESCE(SUM(psd.gross_sales)::float, 0)         AS revenue,
        COALESCE(SUM(psd.transaction_count)::int, 0)     AS transactions
      FROM pos_sales_data psd
      JOIN pos_integrations pi ON pi.id = psd.pos_integration_id
      JOIN leases l ON l.id = pi.lease_id
      ${f.catJoin}
      WHERE ${f.dateWhere} ${f.propWhere} ${f.floorWhere} ${f.catWhere} ${f.tenantWhere}
      GROUP BY 1 ORDER BY 1
    `)
    return rows as unknown as TrendPoint[]
  } catch { return [] }
}

async function queryTenantRanking(params: {
  start: string; end: string
  propertyId: string | null; floor: string | null; category: string | null
}): Promise<TenantRank[]> {
  const { start, end } = params
  const { prevStart, prevEnd } = prevPeriod(start, end)
  const propWhere  = params.propertyId ? sql`AND l.property_id = ${params.propertyId}::uuid` : sql``
  const floorWhere = params.floor ? sql`AND l.floor = ${params.floor}` : sql``
  const catWhere   = params.category ? sql`AND t.category = ${params.category}` : sql``
  try {
    const rows = await db.execute(sql`
      WITH cur AS (
        SELECT l.tenant_id, SUM(psd.gross_sales)::float AS revenue
        FROM pos_sales_data psd
        JOIN pos_integrations pi ON pi.id = psd.pos_integration_id
        JOIN leases l ON l.id = pi.lease_id
        WHERE psd.sales_date BETWEEN ${start}::date AND ${end}::date
          ${propWhere} ${floorWhere}
        GROUP BY l.tenant_id
      ),
      prv AS (
        SELECT l.tenant_id, SUM(psd.gross_sales)::float AS revenue
        FROM pos_sales_data psd
        JOIN pos_integrations pi ON pi.id = psd.pos_integration_id
        JOIN leases l ON l.id = pi.lease_id
        WHERE psd.sales_date BETWEEN ${prevStart}::date AND ${prevEnd}::date
          ${propWhere} ${floorWhere}
        GROUP BY l.tenant_id
      ),
      lease_info AS (
        SELECT DISTINCT ON (tenant_id) tenant_id, area_sqft, floor
        FROM leases ORDER BY tenant_id, updated_at DESC
      )
      SELECT
        t.id,
        t.business_name                                       AS name,
        t.category,
        cur.revenue,
        prv.revenue                                           AS prev_revenue,
        CASE WHEN prv.revenue > 0
          THEN ROUND(((cur.revenue - prv.revenue) / prv.revenue * 100)::numeric, 1)::float
          ELSE NULL
        END                                                   AS growth_pct,
        li.area_sqft::float                                   AS sqft,
        CASE WHEN li.area_sqft > 0
          THEN ROUND((cur.revenue / li.area_sqft::float)::numeric, 0)::float
          ELSE NULL
        END                                                   AS sales_per_sqft,
        RANK() OVER (ORDER BY cur.revenue DESC)::int          AS rank
      FROM cur
      JOIN tenants t ON t.id = cur.tenant_id
      LEFT JOIN prv ON prv.tenant_id = cur.tenant_id
      LEFT JOIN lease_info li ON li.tenant_id = cur.tenant_id
      ${params.category ? sql`WHERE t.category = ${params.category}` : sql``}
      ORDER BY cur.revenue DESC
      LIMIT 30
    `)
    return (rows as any[]).map((r) => ({
      id:          r.id,
      name:        r.name,
      category:    r.category,
      revenue:     Number(r.revenue),
      prevRevenue: r.prev_revenue ? Number(r.prev_revenue) : null,
      growthPct:   r.growth_pct  != null ? Number(r.growth_pct) : null,
      sqft:        r.sqft        != null ? Number(r.sqft)        : null,
      salesPerSqft:r.sales_per_sqft != null ? Number(r.sales_per_sqft) : null,
      rank:        Number(r.rank),
    }))
  } catch { return [] }
}

async function queryCategoryBreakdown(params: {
  start: string; end: string; propertyId: string | null; floor: string | null
}): Promise<CategoryItem[]> {
  const propWhere  = params.propertyId ? sql`AND l.property_id = ${params.propertyId}::uuid` : sql``
  const floorWhere = params.floor ? sql`AND l.floor = ${params.floor}` : sql``
  try {
    const rows = await db.execute(sql`
      SELECT
        COALESCE(t.category, 'Other')   AS name,
        SUM(psd.gross_sales)::float     AS value
      FROM pos_sales_data psd
      JOIN pos_integrations pi ON pi.id = psd.pos_integration_id
      JOIN leases l ON l.id = pi.lease_id
      JOIN tenants t ON t.id = l.tenant_id
      WHERE psd.sales_date BETWEEN ${params.start}::date AND ${params.end}::date
        ${propWhere} ${floorWhere}
      GROUP BY 1 ORDER BY 2 DESC
    `)
    return (rows as any[]).map((r) => ({ name: r.name, value: Number(r.value) }))
  } catch { return [] }
}

async function queryFloorBreakdown(params: {
  start: string; end: string; propertyId: string | null; category: string | null
}): Promise<FloorItem[]> {
  const propWhere = params.propertyId ? sql`AND l.property_id = ${params.propertyId}::uuid` : sql``
  const catJoin   = params.category ? sql`JOIN tenants t ON t.id = l.tenant_id AND t.category = ${params.category}` : sql``
  try {
    const rows = await db.execute(sql`
      SELECT
        COALESCE(l.floor, 'Ground')         AS floor,
        SUM(psd.gross_sales)::float         AS revenue,
        COUNT(DISTINCT l.tenant_id)::int    AS tenant_count
      FROM pos_sales_data psd
      JOIN pos_integrations pi ON pi.id = psd.pos_integration_id
      JOIN leases l ON l.id = pi.lease_id
      ${catJoin}
      WHERE psd.sales_date BETWEEN ${params.start}::date AND ${params.end}::date ${propWhere}
      GROUP BY 1 ORDER BY 2 DESC
    `)
    return (rows as any[]).map((r) => ({ floor: r.floor, revenue: Number(r.revenue), tenantCount: Number(r.tenant_count) }))
  } catch { return [] }
}

async function queryPaymentMethods(params: {
  start: string; end: string; propertyId: string | null; floor: string | null; category: string | null
}): Promise<PaymentItem[]> {
  const propWhere  = params.propertyId ? sql`AND l.property_id = ${params.propertyId}::uuid` : sql``
  const floorWhere = params.floor ? sql`AND l.floor = ${params.floor}` : sql``
  const catJoin    = params.category ? sql`JOIN tenants t ON t.id = l.tenant_id AND t.category = ${params.category}` : sql``
  try {
    const rows = await db.execute(sql`
      SELECT
        COALESCE(pt.payment_method, 'unknown')  AS method,
        COUNT(*)::int                            AS count,
        COALESCE(SUM(pt.net_amount)::float, 0)  AS value
      FROM pos_transactions pt
      JOIN pos_integrations pi ON pi.id = pt.pos_integration_id
      JOIN leases l ON l.id = pi.lease_id
      ${catJoin}
      WHERE pt.transacted_at::date BETWEEN ${params.start}::date AND ${params.end}::date
        ${propWhere} ${floorWhere}
      GROUP BY 1 ORDER BY 3 DESC
    `)
    return (rows as any[]).map((r) => ({ method: r.method, value: Number(r.value), count: Number(r.count) }))
  } catch { return [] }
}

async function queryHourlyBreakdown(params: {
  start: string; end: string; propertyId: string | null
}): Promise<HourlyItem[]> {
  const propWhere = params.propertyId ? sql`AND l.property_id = ${params.propertyId}::uuid` : sql``
  try {
    const rows = await db.execute(sql`
      SELECT
        kv.key::int                  AS hour,
        SUM(kv.value::numeric)::float AS revenue
      FROM pos_sales_data psd
      CROSS JOIN LATERAL jsonb_each_text(psd.hourly_breakdown) AS kv
      JOIN pos_integrations pi ON pi.id = psd.pos_integration_id
      JOIN leases l ON l.id = pi.lease_id
      WHERE psd.sales_date BETWEEN ${params.start}::date AND ${params.end}::date
        AND psd.hourly_breakdown IS NOT NULL
        AND psd.hourly_breakdown != 'null'::jsonb
        ${propWhere}
      GROUP BY 1 ORDER BY 1
    `)
    const DAY_HOURS = Array.from({ length: 24 }, (_, h) => h)
    const map = new Map((rows as any[]).map((r) => [Number(r.hour), Number(r.revenue)]))
    return DAY_HOURS.map((h) => ({
      hour: h,
      label: `${String(h).padStart(2, "0")}:00`,
      revenue: map.get(h) ?? 0,
    }))
  } catch { return [] }
}

async function queryWeekdayBreakdown(params: {
  start: string; end: string; propertyId: string | null
}): Promise<WeekdayItem[]> {
  const propWhere = params.propertyId ? sql`AND l.property_id = ${params.propertyId}::uuid` : sql``
  const DOW_MAP = ["Sunday","Monday","Tuesday","Wednesday","Thursday","Friday","Saturday"]
  const SHORT   = ["Sun","Mon","Tue","Wed","Thu","Fri","Sat"]
  try {
    const rows = await db.execute(sql`
      SELECT
        EXTRACT(DOW FROM psd.sales_date)::int  AS dow,
        SUM(psd.gross_sales)::float            AS revenue,
        COUNT(DISTINCT psd.sales_date)::int    AS days
      FROM pos_sales_data psd
      JOIN pos_integrations pi ON pi.id = psd.pos_integration_id
      JOIN leases l ON l.id = pi.lease_id
      WHERE psd.sales_date BETWEEN ${params.start}::date AND ${params.end}::date ${propWhere}
      GROUP BY 1 ORDER BY 1
    `)
    const map = new Map((rows as any[]).map((r) => [Number(r.dow), r]))
    return Array.from({ length: 7 }, (_, dow) => {
      const row = map.get(dow)
      const rev = row ? Number(row.revenue) : 0
      const days = row ? Number(row.days) : 1
      return { dow, day: DOW_MAP[dow], shortDay: SHORT[dow], revenue: rev, days, avgRevenue: days > 0 ? rev / days : 0, isWeekend: dow === 0 || dow === 6 }
    })
  } catch { return [] }
}

async function queryMonthlyYoY(params: {
  end: string; propertyId: string | null
}): Promise<MonthlyItem[]> {
  const propWhere = params.propertyId ? sql`AND l.property_id = ${params.propertyId}::uuid` : sql``
  const twoYearsAgo = new Date(params.end)
  twoYearsAgo.setFullYear(twoYearsAgo.getFullYear() - 2)
  const rangeStart = twoYearsAgo.toISOString().slice(0, 10)
  const MONTHS = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"]
  try {
    const rows = await db.execute(sql`
      SELECT
        DATE_TRUNC('month', psd.sales_date)::text  AS month,
        SUM(psd.gross_sales)::float                 AS revenue
      FROM pos_sales_data psd
      JOIN pos_integrations pi ON pi.id = psd.pos_integration_id
      JOIN leases l ON l.id = pi.lease_id
      WHERE psd.sales_date BETWEEN ${rangeStart}::date AND ${params.end}::date ${propWhere}
      GROUP BY 1 ORDER BY 1
    `)
    const currentYear = new Date(params.end).getFullYear()
    const revenueByMonth = new Map((rows as any[]).map((r) => [r.month as string, Number(r.revenue)]))
    return Array.from({ length: 12 }, (_, i) => {
      const m = String(i + 1).padStart(2, "0")
      const thisKey = `${currentYear}-${m}-01`
      const lastKey = `${currentYear - 1}-${m}-01`
      return {
        month: thisKey,
        label: MONTHS[i],
        thisYear: revenueByMonth.get(thisKey) ?? 0,
        lastYear: revenueByMonth.get(lastKey) ?? 0,
      }
    })
  } catch { return [] }
}

async function queryFilterOptions(params: {
  propertyId: string | null
}): Promise<FilterOptions> {
  const propWhere = params.propertyId ? sql`AND l.property_id = ${params.propertyId}::uuid` : sql``
  try {
    const [floorRows, catRows] = await Promise.all([
      db.execute(sql`
        SELECT DISTINCT l.floor FROM leases l
        WHERE l.floor IS NOT NULL ${propWhere} ORDER BY l.floor
      `),
      db.execute(sql`SELECT DISTINCT category FROM tenants WHERE category IS NOT NULL ORDER BY category`),
    ])
    return {
      floors:     (floorRows as any[]).map((r) => r.floor as string),
      categories: (catRows  as any[]).map((r) => r.category as string),
    }
  } catch { return { floors: [], categories: [] } }
}

// ── Main handler ──────────────────────────────────────────────────────────────

export async function GET(request: NextRequest) {
  try {
    const session = await auth()
    if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

    const sp = request.nextUrl.searchParams

    // Default to last 30 days
    const today = new Date(); today.setDate(today.getDate() - 1)
    const defaultEnd   = today.toISOString().slice(0, 10)
    const defaultStart = new Date(today); defaultStart.setDate(defaultStart.getDate() - 29)

    const startDate  = sp.get("startDate")  || defaultStart.toISOString().slice(0, 10)
    const endDate    = sp.get("endDate")    || defaultEnd
    const propertyId = sp.get("propertyId") || null
    const floor      = sp.get("floor")      || null
    const category   = sp.get("category")   || null
    const tenantId   = sp.get("tenantId")   || null
    const period     = sp.get("period")     || "day"

    const cacheKey = `analytics:revenue:${[startDate, endDate, propertyId, floor, category, tenantId, period].join(":")}`

    const data = await getCachedOrFetch(cacheKey, async () => {
      const { prevStart, prevEnd } = prevPeriod(startDate, endDate)

      const baseParams = { start: startDate, end: endDate, propertyId, floor, category, tenantId }
      const prevParams = { start: prevStart, end: prevEnd, propertyId, floor, category, tenantId }

      const [trend, prevTrend, tenants, categories, floors, payments, hourly, weekdays, monthly, filterOptions] =
        await Promise.all([
          queryTrend({ ...baseParams, period }),
          queryTrend({ ...prevParams, period }),
          queryTenantRanking({ start: startDate, end: endDate, propertyId, floor, category }),
          queryCategoryBreakdown({ start: startDate, end: endDate, propertyId, floor }),
          queryFloorBreakdown({ start: startDate, end: endDate, propertyId, category }),
          queryPaymentMethods({ start: startDate, end: endDate, propertyId, floor, category }),
          queryHourlyBreakdown({ start: startDate, end: endDate, propertyId }),
          queryWeekdayBreakdown({ start: startDate, end: endDate, propertyId }),
          queryMonthlyYoY({ end: endDate, propertyId }),
          queryFilterOptions({ propertyId }),
        ])

      // Merge prev trend into trend for comparison line
      const prevMap = new Map(prevTrend.map((p, i) => [i, p]))
      const trendWithPrev = trend.map((t, i) => ({
        ...t,
        prevRevenue: prevMap.get(i)?.revenue ?? null,
      }))

      // Derived KPIs from tenants array
      const totalRevenue      = tenants.reduce((s, t) => s + t.revenue, 0)
      const avgPerTenant      = tenants.length ? totalRevenue / tenants.length : 0
      const totalSqft         = tenants.reduce((s, t) => s + (t.sqft ?? 0), 0)
      const avgPerSqft        = totalSqft > 0 ? totalRevenue / totalSqft : null
      const topTenants        = [...tenants].sort((a, b) => b.revenue - a.revenue).slice(0, 10)
      const bottomTenants     = [...tenants].sort((a, b) => a.revenue - b.revenue).slice(0, 10)

      // Payment trend: aggregate payments into stacked area from trend data
      const paymentTrend = trend.map((t) => ({ period: t.period, revenue: t.revenue }))

      return {
        trend:         trendWithPrev,
        tenants,
        topTenants,
        bottomTenants,
        categories,
        floors,
        payments,
        hourly,
        weekdays,
        monthly,
        filterOptions,
        paymentTrend,
        kpis: {
          totalRevenue,
          avgPerTenant,
          avgPerSqft,
          totalTransactions: trend.reduce((s, t) => s + t.transactions, 0),
          tenantCount: tenants.length,
          topCategory: categories[0]?.name ?? null,
        },
      }
    }, CACHE_TTL.MEDIUM)

    return NextResponse.json({ success: true, data })
  } catch (error) {
    console.error("Analytics revenue error:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
