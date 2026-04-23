"use client"

/**
 * Revenue Intelligence — Full Analytics Dashboard
 * ─────────────────────────────────────────────────
 * Sections:
 *   1. Global filter bar
 *   2. KPI cards
 *   3. Revenue trend (full-width line chart + period comparison)
 *   4. Tenant performance | Category pie
 *   5. Floor analytics | Payment breakdown
 *   6. Time analytics (hourly / weekday / seasonal)
 *   7. Tenant deep-dive (dropdown + trend)
 *   8. Legacy: heatmap + tenant table + zone table
 *   9. Export bar
 */

import * as React from "react"
import {
  LineChart, Line, BarChart, Bar, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend,
  ResponsiveContainer, LabelList,
} from "recharts"
import { cn } from "@/lib/utils"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select"
import {
  Tabs, TabsContent, TabsList, TabsTrigger,
} from "@/components/ui/tabs"
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table"
import {
  TrendingUp, TrendingDown, Minus, AlertTriangle, IndianRupee,
  Users, BarChart2, MapPin, Calendar, RefreshCw, CheckCircle,
  Download, FileText, Image, Clock, CreditCard,
  Building2, Filter,
} from "lucide-react"

// ── Palette ───────────────────────────────────────────────────────────────────

const COLORS = [
  "#6366f1", "#8b5cf6", "#ec4899", "#f97316",
  "#eab308", "#22c55e", "#14b8a6", "#06b6d4",
  "#3b82f6", "#84cc16",
]
const UP_COLOR   = "#22c55e"
const DOWN_COLOR = "#ef4444"
const GRID_COLOR = "hsl(var(--border))"

// ── Formatters ────────────────────────────────────────────────────────────────

const fmtINR = new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 })
const fmtCompact = new Intl.NumberFormat("en-IN", { notation: "compact", style: "currency", currency: "INR", maximumFractionDigits: 1 })

function fmtK(n: number | null | undefined): string {
  if (n == null) return "—"
  return fmtCompact.format(n)
}
function fmtPct(n: number | null | undefined): string {
  if (n == null) return "—"
  return `${n > 0 ? "+" : ""}${n.toFixed(1)}%`
}
function fmtNum(n: number): string {
  return new Intl.NumberFormat("en-IN").format(Math.round(n))
}

// ── Date range presets ────────────────────────────────────────────────────────

function lastNDays(n: number) {
  const end = new Date(); end.setDate(end.getDate() - 1)
  const start = new Date(); start.setDate(start.getDate() - n)
  return { startDate: start.toISOString().slice(0, 10), endDate: end.toISOString().slice(0, 10) }
}
function thisMonth() {
  const d = new Date()
  const end = new Date(); end.setDate(end.getDate() - 1)
  return { startDate: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-01`, endDate: end.toISOString().slice(0, 10) }
}
function lastMonth() {
  const d = new Date(); d.setDate(1); d.setMonth(d.getMonth() - 1)
  const last = new Date(d.getFullYear(), d.getMonth() + 1, 0)
  return { startDate: d.toISOString().slice(0, 10), endDate: last.toISOString().slice(0, 10) }
}

// ── Export utilities ──────────────────────────────────────────────────────────

async function downloadXLSX(data: Record<string, unknown>[], filename: string) {
  if (!data.length) return
  const XLSX = await import("xlsx")
  const ws = XLSX.utils.json_to_sheet(data)
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, "Data")
  XLSX.writeFile(wb, filename)
}

function exportChartPNG(containerId: string, filename: string) {
  const el = document.getElementById(containerId)
  const svg = el?.querySelector("svg")
  if (!svg) return
  const svgData = new XMLSerializer().serializeToString(svg)
  const canvas = document.createElement("canvas")
  canvas.width = svg.clientWidth || 800
  canvas.height = svg.clientHeight || 400
  const ctx = canvas.getContext("2d")!
  const img = document.createElement("img") as HTMLImageElement
  img.onload = () => {
    ctx.fillStyle = "#ffffff"; ctx.fillRect(0, 0, canvas.width, canvas.height)
    ctx.drawImage(img, 0, 0)
    Object.assign(document.createElement("a"), { href: canvas.toDataURL("image/png"), download: filename }).click()
  }
  img.src = "data:image/svg+xml;base64," + btoa(unescape(encodeURIComponent(svgData)))
}

// ── Custom recharts tooltip ───────────────────────────────────────────────────

function ChartTooltip({ active, payload, label }: { active?: boolean; payload?: { name: string; value: number; color: string }[]; label?: string }) {
  if (!active || !payload?.length) return null
  return (
    <div className="rounded-lg border bg-background/95 backdrop-blur p-3 shadow-lg text-xs">
      <p className="font-semibold mb-2 text-foreground">{label}</p>
      {payload.map((p) => (
        <div key={p.name} className="flex items-center gap-2 mb-0.5">
          <span className="h-2 w-2 rounded-full shrink-0" style={{ background: p.color }} />
          <span className="text-muted-foreground">{p.name}:</span>
          <span className="font-medium text-foreground">{fmtK(p.value)}</span>
        </div>
      ))}
    </div>
  )
}

function PieTooltip({ active, payload }: { active?: boolean; payload?: { name: string; value: number; payload: { percent: number } }[] }) {
  if (!active || !payload?.length) return null
  const p = payload[0]
  return (
    <div className="rounded-lg border bg-background/95 backdrop-blur p-3 shadow-lg text-xs">
      <p className="font-semibold">{p.name}</p>
      <p className="text-muted-foreground">{fmtK(p.value)} · {(p.payload.percent * 100).toFixed(1)}%</p>
    </div>
  )
}

// ── Empty chart placeholder ───────────────────────────────────────────────────

function EmptyChart({ message = "No data for this period" }: { message?: string }) {
  return (
    <div className="flex h-full items-center justify-center text-xs text-muted-foreground">
      {message}
    </div>
  )
}

// ── KPI card ─────────────────────────────────────────────────────────────────

function KPICard({ title, value, sub, trend, icon: Icon, accent }: {
  title: string; value: string; sub?: string
  trend?: "up" | "down" | "flat" | null; icon: React.ElementType
  accent?: "amber" | "emerald" | "indigo" | "default"
}) {
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <CardTitle className="text-xs font-medium text-muted-foreground uppercase tracking-wide">{title}</CardTitle>
        <Icon className={cn("h-4 w-4",
          accent === "amber"   ? "text-amber-500"   :
          accent === "emerald" ? "text-emerald-500" :
          accent === "indigo"  ? "text-indigo-500"  :
          "text-muted-foreground")} />
      </CardHeader>
      <CardContent>
        <div className="text-2xl font-bold tracking-tight">{value}</div>
        {sub && (
          <p className={cn("mt-1 text-xs flex items-center gap-1",
            trend === "up"   ? "text-emerald-600 dark:text-emerald-400" :
            trend === "down" ? "text-red-600 dark:text-red-400" :
            "text-muted-foreground")}>
            {trend === "up"   && <TrendingUp   className="h-3 w-3" />}
            {trend === "down" && <TrendingDown  className="h-3 w-3" />}
            {trend === "flat" && <Minus         className="h-3 w-3" />}
            {sub}
          </p>
        )}
      </CardContent>
    </Card>
  )
}

// ── Section header ────────────────────────────────────────────────────────────

function SectionHeader({ title, sub, chartId, csvData, csvFilename }: {
  title: string; sub?: string
  chartId?: string; csvData?: Record<string, unknown>[]; csvFilename?: string
}) {
  return (
    <div className="flex items-center justify-between mb-4">
      <div>
        <h2 className="text-sm font-semibold">{title}</h2>
        {sub && <p className="text-xs text-muted-foreground mt-0.5">{sub}</p>}
      </div>
      <div className="flex items-center gap-1">
        {csvData && csvFilename && (
          <Button variant="ghost" size="icon" className="h-7 w-7"
            onClick={() => downloadXLSX(csvData, csvFilename)}
            title="Download Excel">
            <FileText className="h-3.5 w-3.5" />
          </Button>
        )}
        {chartId && (
          <Button variant="ghost" size="icon" className="h-7 w-7"
            onClick={() => exportChartPNG(chartId, `${chartId}.png`)}
            title="Download PNG">
            <Image className="h-3.5 w-3.5" />
          </Button>
        )}
      </div>
    </div>
  )
}

// ── Types ─────────────────────────────────────────────────────────────────────

interface TrendPoint   { period: string; revenue: number; transactions: number; prevRevenue?: number | null }
interface TenantRank   { id: string; name: string; category: string | null; revenue: number; prevRevenue: number | null; growthPct: number | null; sqft: number | null; salesPerSqft: number | null; rank: number }
interface CategoryItem { name: string; value: number }
interface FloorItem    { floor: string; revenue: number; tenantCount: number }
interface PaymentItem  { method: string; value: number; count: number }
interface HourlyItem   { hour: number; label: string; revenue: number }
interface WeekdayItem  { dow: number; day: string; shortDay: string; revenue: number; days: number; avgRevenue: number; isWeekend: boolean }
interface MonthlyItem  { month: string; label: string; thisYear: number; lastYear: number }

interface AnalyticsData {
  trend:         TrendPoint[]
  tenants:       TenantRank[]
  topTenants:    TenantRank[]
  bottomTenants: TenantRank[]
  categories:    CategoryItem[]
  floors:        FloorItem[]
  payments:      PaymentItem[]
  hourly:        HourlyItem[]
  weekdays:      WeekdayItem[]
  monthly:       MonthlyItem[]
  filterOptions: { floors: string[]; categories: string[] }
  kpis: {
    totalRevenue: number; avgPerTenant: number; avgPerSqft: number | null
    totalTransactions: number; tenantCount: number; topCategory: string | null
  }
}

// ── Heatmap (legacy) ──────────────────────────────────────────────────────────

const INTENSITY = ["bg-muted","bg-emerald-100 dark:bg-emerald-900/30","bg-emerald-200 dark:bg-emerald-800/50","bg-emerald-400 dark:bg-emerald-600","bg-emerald-600 dark:bg-emerald-400"]
interface CalendarDay { date: string; sales: number; intensity: number }

function SalesHeatmap({ days }: { days: CalendarDay[] }) {
  if (!days.length) return <p className="text-sm text-muted-foreground py-6 text-center">No daily sales data for this period</p>
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-1">
        {days.map((d) => (
          <div key={d.date} title={`${d.date}: ${fmtK(d.sales)}`}
            className={cn("h-5 w-5 rounded-sm", INTENSITY[d.intensity] ?? INTENSITY[0])} />
        ))}
      </div>
      <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
        <span>Less</span>
        {INTENSITY.map((cls, i) => <div key={i} className={cn("h-3 w-3 rounded-sm", cls)} />)}
        <span>More</span>
      </div>
    </div>
  )
}

// ── Legacy KPI data (from /api/revenue-intelligence) ─────────────────────────

interface LegacyData {
  totalGrossSales: number; totalAmountDue: number; totalTransactions: number
  avgSalesPerSqft: number | null; totalOccupiedSqft: number | null
  yoyGrowthPct: number | null; yoyGrossSalesPrior: number | null
  tenantsAboveMG: number; tenantsBelowMG: number
  totalExcessOverMG: number; anomalyCount: number
  anomalies: { tenantId: string; tenantName: string; flag: string }[]
  periodDays: number; totalFootfall: number | null; conversionRate: number | null
  byTenant: {
    tenantId: string; shopName: string; grossSales: number; amountDue: number; salesPerSqft: number | null
    isAboveMG: boolean; yoyGrowthPct: number | null; yoyTrend: string; anomalyFlag: string | null
    zone: string | null; floor: string | null
  }[]
  byZone: {
    zone: string; floor: string | null; tenantCount: number; grossSales: number
    salesPerSqft: number | null; avgYoyGrowthPct: number | null; topTenant: string | null
  }[]
  heatmap?: CalendarDay[]
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function RevenueIntelligencePage() {
  // ── Filter state ──────────────────────────────────────────────────────────
  const [preset,     setPreset]     = React.useState("last30")
  const [range,      setRange]      = React.useState(lastNDays(30))
  const [period,     setPeriod]     = React.useState<"day" | "week" | "month">("day")
  const [propertyId, setPropertyId] = React.useState<string>("all")
  const [floor,      setFloor]      = React.useState<string>("all")
  const [category,   setCategory]   = React.useState<string>("all")
  const [tenantId,   setTenantId]   = React.useState<string>("all")
  const [deepTenant, setDeepTenant] = React.useState<string>("all")

  // ── Data state ────────────────────────────────────────────────────────────
  const [analytics, setAnalytics] = React.useState<AnalyticsData | null>(null)
  const [legacy,    setLegacy]    = React.useState<LegacyData   | null>(null)
  const [loading,   setLoading]   = React.useState(true)
  const [error,     setError]     = React.useState<string | null>(null)
  const [mounted,   setMounted]   = React.useState(false)

  // Tenant trend (deep-dive)
  const [tenantTrend,     setTenantTrend]     = React.useState<TrendPoint[]>([])
  const [tenantTrendLoading, setTenantTrendLoading] = React.useState(false)

  React.useEffect(() => { setMounted(true) }, [])

  // ── Fetch main analytics ──────────────────────────────────────────────────
  const fetchData = React.useCallback(async () => {
    setLoading(true); setError(null)
    const params = new URLSearchParams({
      startDate: range.startDate,
      endDate:   range.endDate,
      period,
      ...(propertyId !== "all" ? { propertyId } : {}),
      ...(floor      !== "all" ? { floor }      : {}),
      ...(category   !== "all" ? { category }   : {}),
      ...(tenantId   !== "all" ? { tenantId }   : {}),
    })
    try {
      const [analyticsRes, legacyRes] = await Promise.all([
        fetch(`/api/analytics/revenue?${params}`),
        fetch(`/api/revenue-intelligence?${new URLSearchParams({ startDate: range.startDate, endDate: range.endDate, heatmap: "true" })}`),
      ])
      if (!analyticsRes.ok) throw new Error(await analyticsRes.text())
      const analyticsJson = await analyticsRes.json()
      setAnalytics(analyticsJson.data as AnalyticsData)
      if (legacyRes.ok) setLegacy(await legacyRes.json() as LegacyData)
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load analytics")
    } finally {
      setLoading(false)
    }
  }, [range, period, propertyId, floor, category, tenantId])

  React.useEffect(() => { void fetchData() }, [fetchData])

  // ── Tenant deep-dive fetch ────────────────────────────────────────────────
  React.useEffect(() => {
    if (deepTenant === "all") { setTenantTrend([]); return }
    setTenantTrendLoading(true)
    const params = new URLSearchParams({ startDate: range.startDate, endDate: range.endDate, period, tenantId: deepTenant })
    fetch(`/api/analytics/revenue?${params}`)
      .then((r) => r.json())
      .then((res) => { if (res.data?.trend) setTenantTrend(res.data.trend as TrendPoint[]) })
      .finally(() => setTenantTrendLoading(false))
  }, [deepTenant, range, period])

  function applyPreset(p: string) {
    setPreset(p)
    setRange(
      p === "thisMonth" ? thisMonth() :
      p === "lastMonth" ? lastMonth() :
      p === "last7"     ? lastNDays(7) :
      p === "last90"    ? lastNDays(90) :
      lastNDays(30)
    )
  }

  // ── Derived values ────────────────────────────────────────────────────────
  const kpis         = analytics?.kpis
  const legacyYoY    = legacy?.yoyGrowthPct
  const yoyTrend     = legacyYoY != null ? (legacyYoY > 2 ? "up" : legacyYoY < -2 ? "down" : "flat") : null
  const filterFloors = analytics?.filterOptions.floors ?? []
  const filterCats   = analytics?.filterOptions.categories ?? []

  // ── Skeleton chart ────────────────────────────────────────────────────────
  const SkeletonChart = () => (
    <div className="h-full w-full animate-pulse rounded bg-muted/40" />
  )

  return (
    <div className="space-y-6">

      {/* ── Header + Global Filters ──────────────────────────────────────── */}
      <div className="flex flex-col gap-4">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Revenue Intelligence</h1>
            <p className="text-sm text-muted-foreground">Executive analytics · Tenant comparisons · Investor-ready insights</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button variant="outline" size="sm" onClick={fetchData} disabled={loading} className="h-8 w-8 p-0">
              <RefreshCw className={cn("h-3.5 w-3.5", loading && "animate-spin")} />
            </Button>
            <Button variant="outline" size="sm" className="h-8 gap-1.5 text-xs" onClick={() => window.print()}>
              <Download className="h-3.5 w-3.5" /> Export PDF
            </Button>
          </div>
        </div>

        {/* Filter bar */}
        <div className="flex flex-wrap items-center gap-2 rounded-lg border bg-muted/30 px-4 py-3">
          <Filter className="h-3.5 w-3.5 text-muted-foreground shrink-0" />

          {/* Date preset */}
          <Select value={preset} onValueChange={applyPreset}>
            <SelectTrigger className="h-8 w-36 text-xs"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="thisMonth">This month</SelectItem>
              <SelectItem value="lastMonth">Last month</SelectItem>
              <SelectItem value="last7">Last 7 days</SelectItem>
              <SelectItem value="last30">Last 30 days</SelectItem>
              <SelectItem value="last90">Last 90 days</SelectItem>
            </SelectContent>
          </Select>

          <input type="date" value={range.startDate}
            onChange={(e) => setRange((r) => ({ ...r, startDate: e.target.value }))}
            className="h-8 rounded-md border bg-background px-2 text-xs" />
          <span className="text-xs text-muted-foreground">to</span>
          <input type="date" value={range.endDate}
            onChange={(e) => setRange((r) => ({ ...r, endDate: e.target.value }))}
            className="h-8 rounded-md border bg-background px-2 text-xs" />

          {/* Period grouping */}
          <Select value={period} onValueChange={(v) => setPeriod(v as "day" | "week" | "month")}>
            <SelectTrigger className="h-8 w-28 text-xs"><SelectValue placeholder="Group by" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="day">Daily</SelectItem>
              <SelectItem value="week">Weekly</SelectItem>
              <SelectItem value="month">Monthly</SelectItem>
            </SelectContent>
          </Select>

          {/* Floor filter */}
          {filterFloors.length > 0 && (
            <Select value={floor} onValueChange={setFloor}>
              <SelectTrigger className="h-8 w-28 text-xs"><SelectValue placeholder="Floor" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All floors</SelectItem>
                {filterFloors.map((f) => <SelectItem key={f} value={f}>Floor {f}</SelectItem>)}
              </SelectContent>
            </Select>
          )}

          {/* Category filter */}
          {filterCats.length > 0 && (
            <Select value={category} onValueChange={setCategory}>
              <SelectTrigger className="h-8 w-32 text-xs"><SelectValue placeholder="Category" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All categories</SelectItem>
                {filterCats.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
              </SelectContent>
            </Select>
          )}
        </div>
      </div>

      {/* ── Error ──────────────────────────────────────────────────────────── */}
      {error && (
        <div className="rounded-lg border border-destructive/30 bg-destructive/10 p-4 text-sm text-destructive">{error}</div>
      )}

      {/* ── SECTION 1: KPI Cards ─────────────────────────────────────────── */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
        <KPICard title="Total Revenue"        icon={IndianRupee}
          value={kpis ? fmtK(kpis.totalRevenue) : "—"}
          sub={legacyYoY != null ? `${fmtPct(legacyYoY)} YoY` : undefined}
          trend={yoyTrend} accent="indigo" />
        <KPICard title="MG Billing Due"        icon={CheckCircle}
          value={legacy ? fmtK(legacy.totalAmountDue) : "—"}
          sub={legacy ? `${legacy.tenantsAboveMG} tenants above MG` : undefined}
          accent="emerald" />
        <KPICard title="Avg / Tenant"          icon={Users}
          value={kpis ? fmtK(kpis.avgPerTenant) : "—"}
          sub={kpis ? `${kpis.tenantCount} active tenants` : undefined} />
        <KPICard title="Avg Sales / sqft"      icon={BarChart2}
          value={kpis?.avgPerSqft != null ? `₹${fmtNum(kpis.avgPerSqft)}` : "—"}
          sub={legacy?.totalOccupiedSqft ? `${fmtNum(legacy.totalOccupiedSqft)} sqft GLA` : undefined} />
        <KPICard title="Transactions"          icon={CreditCard}
          value={kpis ? fmtNum(kpis.totalTransactions) : "—"}
          sub={legacy?.totalFootfall ? `${fmtNum(legacy.totalFootfall)} footfall` : undefined} />
        <KPICard title={legacy?.anomalyCount ? "Anomalies" : "Data Quality"}
          icon={AlertTriangle}
          value={loading ? "…" : legacy?.anomalyCount ? String(legacy.anomalyCount) : "Clean"}
          sub={legacy?.anomalyCount ? "Review flagged tenants" : "All feeds reporting"}
          accent={legacy?.anomalyCount ? "amber" : "emerald"} />
      </div>

      {/* ── Anomaly banner ────────────────────────────────────────────────── */}
      {(legacy?.anomalies?.length ?? 0) > 0 && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 dark:bg-amber-950/20 p-4">
          <div className="flex items-center gap-2 mb-2">
            <AlertTriangle className="h-4 w-4 text-amber-600" />
            <span className="text-sm font-semibold text-amber-800 dark:text-amber-400">
              {legacy!.anomalyCount} anomal{legacy!.anomalyCount === 1 ? "y" : "ies"} detected
            </span>
          </div>
          <ul className="space-y-1">
            {legacy!.anomalies.slice(0, 5).map((a) => (
              <li key={a.tenantId} className="text-xs text-amber-700 dark:text-amber-300">
                <span className="font-medium">{a.tenantName}:</span> {a.flag}
              </li>
            ))}
            {legacy!.anomalies.length > 5 && <li className="text-xs text-amber-600">+{legacy!.anomalies.length - 5} more</li>}
          </ul>
        </div>
      )}

      {/* ── SECTION 2: Revenue Trend (full width) ────────────────────────── */}
      <Card>
        <CardContent className="pt-4">
          <SectionHeader
            title="Revenue Trend"
            sub="Current period vs previous period"
            chartId="chart-trend"
            csvData={(analytics?.trend ?? []) as unknown as Record<string, unknown>[]}
            csvFilename="revenue-trend.xlsx"
          />
          <div id="chart-trend" className="h-64">
            {!mounted || loading ? <SkeletonChart /> :
             !analytics?.trend?.length ? <EmptyChart /> : (
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={analytics.trend} margin={{ top: 5, right: 20, left: 10, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke={GRID_COLOR} />
                  <XAxis dataKey="period" tick={{ fontSize: 11 }} tickFormatter={(v) => v.slice(5)} />
                  <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => fmtK(v)} width={75} />
                  <Tooltip content={<ChartTooltip />} />
                  <Legend wrapperStyle={{ fontSize: 12 }} />
                  <Line type="monotone" dataKey="revenue"     name="Revenue"         stroke={COLORS[0]} strokeWidth={2} dot={false} />
                  <Line type="monotone" dataKey="prevRevenue" name="Previous period"  stroke={COLORS[4]} strokeWidth={1.5} strokeDasharray="5 3" dot={false} connectNulls />
                </LineChart>
              </ResponsiveContainer>
            )}
          </div>
        </CardContent>
      </Card>

      {/* ── SECTION 3: Tenant Performance | Category Pie ─────────────────── */}
      <div className="grid gap-6 lg:grid-cols-2">

        {/* Top Tenants horizontal bar */}
        <Card>
          <CardContent className="pt-4">
            <SectionHeader
              title="Top 10 Tenants"
              sub="Sorted by revenue · growth vs prior period"
              chartId="chart-tenants-top"
              csvData={(analytics?.topTenants ?? []) as unknown as Record<string, unknown>[]}
              csvFilename="top-tenants.xlsx"
            />
            <div id="chart-tenants-top" className="h-72">
              {!mounted || loading ? <SkeletonChart /> :
               !analytics?.topTenants?.length ? <EmptyChart /> : (
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart
                    layout="vertical"
                    data={analytics.topTenants.slice(0, 10).map((t) => ({ name: t.name.length > 16 ? t.name.slice(0, 16) + "…" : t.name, revenue: t.revenue, growth: t.growthPct }))}
                    margin={{ top: 5, right: 60, left: 10, bottom: 5 }}
                  >
                    <CartesianGrid strokeDasharray="3 3" stroke={GRID_COLOR} horizontal={false} />
                    <XAxis type="number" tick={{ fontSize: 10 }} tickFormatter={(v) => fmtK(v)} />
                    <YAxis type="category" dataKey="name" tick={{ fontSize: 10 }} width={100} />
                    <Tooltip content={<ChartTooltip />} />
                    <Bar dataKey="revenue" name="Revenue" radius={[0, 3, 3, 0]}>
                      {analytics.topTenants.slice(0, 10).map((_, i) => (
                        <Cell key={i} fill={COLORS[i % COLORS.length]} />
                      ))}
                      <LabelList dataKey="growth" position="right" formatter={(v: number | null) => v != null ? fmtPct(v) : ""} style={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }} />
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Category Pie */}
        <Card>
          <CardContent className="pt-4">
            <SectionHeader
              title="Revenue by Category"
              sub="Share of total gross sales"
              chartId="chart-category-pie"
              csvData={(analytics?.categories ?? []) as unknown as Record<string, unknown>[]}
              csvFilename="category-breakdown.xlsx"
            />
            <div id="chart-category-pie" className="h-72">
              {!mounted || loading ? <SkeletonChart /> :
               !analytics?.categories?.length ? <EmptyChart /> : (
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie data={analytics.categories} dataKey="value" nameKey="name"
                      cx="50%" cy="45%" outerRadius={90} innerRadius={40}
                      paddingAngle={2} labelLine={false}
                      label={({ name, percent }) => percent > 0.06 ? `${name} ${(percent * 100).toFixed(0)}%` : ""}
                    >
                      {analytics.categories.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                    </Pie>
                    <Tooltip content={<PieTooltip />} />
                    <Legend wrapperStyle={{ fontSize: 11 }} />
                  </PieChart>
                </ResponsiveContainer>
              )}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* ── SECTION 4: Floor Analytics | Payment Breakdown ───────────────── */}
      <div className="grid gap-6 lg:grid-cols-2">

        {/* Floor bar chart */}
        <Card>
          <CardContent className="pt-4">
            <SectionHeader
              title="Revenue by Floor"
              sub="Gross sales and active tenant count"
              chartId="chart-floors"
              csvData={(analytics?.floors ?? []) as unknown as Record<string, unknown>[]}
              csvFilename="floor-analytics.xlsx"
            />
            <div id="chart-floors" className="h-64">
              {!mounted || loading ? <SkeletonChart /> :
               !analytics?.floors?.length ? <EmptyChart /> : (
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={analytics.floors} margin={{ top: 5, right: 20, left: 10, bottom: 5 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke={GRID_COLOR} />
                    <XAxis dataKey="floor" tick={{ fontSize: 11 }} />
                    <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => fmtK(v)} width={70} />
                    <Tooltip content={<ChartTooltip />} />
                    <Bar dataKey="revenue" name="Revenue" radius={[3, 3, 0, 0]}>
                      {analytics.floors.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                      <LabelList dataKey="tenantCount" position="top"
                        formatter={(v: number) => `${v}t`}
                        style={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }} />
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Payment method pie */}
        <Card>
          <CardContent className="pt-4">
            <SectionHeader
              title="Payment Method Mix"
              sub="UPI · Card · Cash · Wallet"
              chartId="chart-payments-pie"
              csvData={(analytics?.payments ?? []) as unknown as Record<string, unknown>[]}
              csvFilename="payment-methods.xlsx"
            />
            <div id="chart-payments-pie" className="h-64">
              {!mounted || loading ? <SkeletonChart /> :
               !analytics?.payments?.length ? <EmptyChart /> : (
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie data={analytics.payments} dataKey="value" nameKey="method"
                      cx="50%" cy="45%" outerRadius={85} innerRadius={35}
                      paddingAngle={2} labelLine={false}
                      label={({ method, percent }) => percent > 0.05 ? `${method} ${(percent * 100).toFixed(0)}%` : ""}
                    >
                      {analytics.payments.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                    </Pie>
                    <Tooltip content={<PieTooltip />} />
                    <Legend wrapperStyle={{ fontSize: 11 }} />
                  </PieChart>
                </ResponsiveContainer>
              )}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* ── SECTION 5: Time Analytics ────────────────────────────────────── */}
      <Card>
        <CardContent className="pt-4">
          <h2 className="text-sm font-semibold mb-4">Time-Based Analytics</h2>
          <Tabs defaultValue="hourly">
            <TabsList className="mb-4">
              <TabsTrigger value="hourly"><Clock className="mr-1.5 h-3.5 w-3.5" />Hourly</TabsTrigger>
              <TabsTrigger value="weekday"><Calendar className="mr-1.5 h-3.5 w-3.5" />Weekday</TabsTrigger>
              <TabsTrigger value="seasonal"><TrendingUp className="mr-1.5 h-3.5 w-3.5" />Seasonal YoY</TabsTrigger>
            </TabsList>

            {/* Hourly */}
            <TabsContent value="hourly">
              <SectionHeader title="Hourly Sales Pattern" sub="Aggregated across selected period · useful for staffing"
                chartId="chart-hourly"
                csvData={(analytics?.hourly ?? []) as unknown as Record<string, unknown>[]}
                csvFilename="hourly-sales.xlsx" />
              <div id="chart-hourly" className="h-60">
                {!mounted || loading ? <SkeletonChart /> :
                 !analytics?.hourly?.some((h) => h.revenue > 0) ? <EmptyChart message="No hourly breakdown data available" /> : (
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={analytics.hourly} margin={{ top: 5, right: 20, left: 10, bottom: 5 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke={GRID_COLOR} />
                      <XAxis dataKey="label" tick={{ fontSize: 10 }} interval={1} />
                      <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => fmtK(v)} width={70} />
                      <Tooltip content={<ChartTooltip />} />
                      <Line type="monotone" dataKey="revenue" name="Revenue" stroke={COLORS[0]} strokeWidth={2} dot={false} />
                    </LineChart>
                  </ResponsiveContainer>
                )}
              </div>
            </TabsContent>

            {/* Weekday */}
            <TabsContent value="weekday">
              <SectionHeader title="Weekday vs Weekend" sub="Average daily revenue by day of week"
                chartId="chart-weekday"
                csvData={(analytics?.weekdays ?? []) as unknown as Record<string, unknown>[]}
                csvFilename="weekday-breakdown.xlsx" />
              <div id="chart-weekday" className="h-60">
                {!mounted || loading ? <SkeletonChart /> :
                 !analytics?.weekdays?.some((d) => d.revenue > 0) ? <EmptyChart /> : (
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={analytics.weekdays} margin={{ top: 5, right: 20, left: 10, bottom: 5 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke={GRID_COLOR} />
                      <XAxis dataKey="shortDay" tick={{ fontSize: 11 }} />
                      <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => fmtK(v)} width={70} />
                      <Tooltip content={<ChartTooltip />} />
                      <Bar dataKey="avgRevenue" name="Avg Daily Revenue" radius={[3, 3, 0, 0]}>
                        {analytics.weekdays.map((d, i) => (
                          <Cell key={i} fill={d.isWeekend ? COLORS[2] : COLORS[0]} />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                )}
              </div>
              <div className="flex items-center gap-4 mt-2 text-xs text-muted-foreground">
                <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-sm" style={{ background: COLORS[0] }} />Weekday</span>
                <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-sm" style={{ background: COLORS[2] }} />Weekend</span>
              </div>
            </TabsContent>

            {/* Seasonal YoY */}
            <TabsContent value="seasonal">
              <SectionHeader title="Seasonal Trends — Year over Year" sub="This year vs last year by month"
                chartId="chart-seasonal"
                csvData={(analytics?.monthly ?? []) as unknown as Record<string, unknown>[]}
                csvFilename="seasonal-yoy.xlsx" />
              <div id="chart-seasonal" className="h-60">
                {!mounted || loading ? <SkeletonChart /> :
                 !analytics?.monthly?.some((m) => m.thisYear > 0 || m.lastYear > 0) ? <EmptyChart /> : (
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={analytics.monthly} margin={{ top: 5, right: 20, left: 10, bottom: 5 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke={GRID_COLOR} />
                      <XAxis dataKey="label" tick={{ fontSize: 11 }} />
                      <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => fmtK(v)} width={75} />
                      <Tooltip content={<ChartTooltip />} />
                      <Legend wrapperStyle={{ fontSize: 12 }} />
                      <Line type="monotone" dataKey="thisYear" name="This year"  stroke={COLORS[0]} strokeWidth={2} dot={false} />
                      <Line type="monotone" dataKey="lastYear" name="Last year"  stroke={COLORS[4]} strokeWidth={1.5} strokeDasharray="5 3" dot={false} />
                    </LineChart>
                  </ResponsiveContainer>
                )}
              </div>
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>

      {/* ── SECTION 6: Bottom Tenants (Low Performers) ───────────────────── */}
      <Card>
        <CardContent className="pt-4">
          <SectionHeader
            title="Low Performing Tenants"
            sub="Bottom 10 by revenue · negative growth highlighted"
            csvData={(analytics?.bottomTenants ?? []) as unknown as Record<string, unknown>[]}
            csvFilename="low-performers.xlsx"
          />
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Tenant</TableHead>
                <TableHead>Category</TableHead>
                <TableHead className="text-right">Revenue</TableHead>
                <TableHead className="text-right">Growth</TableHead>
                <TableHead className="text-right">₹/sqft</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableRow><TableCell colSpan={5} className="py-8 text-center">
                  <RefreshCw className="h-5 w-5 animate-spin mx-auto text-muted-foreground" />
                </TableCell></TableRow>
              ) : !analytics?.bottomTenants?.length ? (
                <TableRow><TableCell colSpan={5} className="py-8 text-center text-muted-foreground text-sm">No data</TableCell></TableRow>
              ) : analytics.bottomTenants.map((t) => (
                <TableRow key={t.id}>
                  <TableCell className="font-medium text-sm">{t.name}</TableCell>
                  <TableCell>
                    {t.category && <Badge variant="outline" className="text-xs">{t.category}</Badge>}
                  </TableCell>
                  <TableCell className="text-right text-sm font-mono">{fmtK(t.revenue)}</TableCell>
                  <TableCell className="text-right text-sm">
                    {t.growthPct != null ? (
                      <span className={cn("flex items-center justify-end gap-0.5", t.growthPct < 0 ? "text-red-600" : "text-emerald-600")}>
                        {t.growthPct < 0 ? <TrendingDown className="h-3 w-3" /> : <TrendingUp className="h-3 w-3" />}
                        {fmtPct(t.growthPct)}
                      </span>
                    ) : "—"}
                  </TableCell>
                  <TableCell className="text-right text-sm text-muted-foreground">
                    {t.salesPerSqft != null ? `₹${fmtNum(t.salesPerSqft)}` : "—"}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* ── SECTION 7: Tenant Deep Dive ──────────────────────────────────── */}
      <Card>
        <CardContent className="pt-4">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="text-sm font-semibold">Tenant Sales Trend</h2>
              <p className="text-xs text-muted-foreground mt-0.5">Select a tenant to see their historical performance</p>
            </div>
            <Select value={deepTenant} onValueChange={setDeepTenant}>
              <SelectTrigger className="h-8 w-52 text-xs"><SelectValue placeholder="Select tenant…" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">— Choose tenant —</SelectItem>
                {(analytics?.tenants ?? []).map((t) => (
                  <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div id="chart-tenant-trend" className="h-56">
            {deepTenant === "all" ? (
              <EmptyChart message="Select a tenant from the dropdown above" />
            ) : !mounted || tenantTrendLoading ? <SkeletonChart /> :
             !tenantTrend.length ? <EmptyChart message="No sales data for this tenant in the selected period" /> : (
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={tenantTrend} margin={{ top: 5, right: 20, left: 10, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke={GRID_COLOR} />
                  <XAxis dataKey="period" tick={{ fontSize: 11 }} tickFormatter={(v) => v.slice(5)} />
                  <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => fmtK(v)} width={75} />
                  <Tooltip content={<ChartTooltip />} />
                  <Line type="monotone" dataKey="revenue" name="Revenue" stroke={COLORS[0]} strokeWidth={2} dot={false} />
                </LineChart>
              </ResponsiveContainer>
            )}
          </div>
        </CardContent>
      </Card>

      {/* ── SECTION 8: Legacy views (Heatmap · Tenant table · Zones) ─────── */}
      <Tabs defaultValue="tenants">
        <TabsList>
          <TabsTrigger value="heatmap"><Calendar className="mr-1.5 h-3.5 w-3.5" />Heatmap</TabsTrigger>
          <TabsTrigger value="tenants"><Users className="mr-1.5 h-3.5 w-3.5" />All Tenants</TabsTrigger>
          <TabsTrigger value="zones"><MapPin className="mr-1.5 h-3.5 w-3.5" />Zones</TabsTrigger>
        </TabsList>

        <TabsContent value="heatmap" className="mt-4">
          <Card>
            <CardHeader><CardTitle className="text-base">Daily Sales Calendar</CardTitle></CardHeader>
            <CardContent>
              {loading
                ? <div className="flex h-24 items-center justify-center"><RefreshCw className="h-5 w-5 animate-spin text-muted-foreground" /></div>
                : <SalesHeatmap days={legacy?.heatmap ?? []} />
              }
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="tenants" className="mt-4">
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle className="text-base">Tenant Leaderboard</CardTitle>
                <Button variant="ghost" size="sm" className="h-7 gap-1.5 text-xs"
                  onClick={() => downloadXLSX((legacy?.byTenant ?? []) as unknown as Record<string, unknown>[], "tenant-leaderboard.xlsx")}>
                  <FileText className="h-3.5 w-3.5" /> Excel
                </Button>
              </div>
            </CardHeader>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Tenant</TableHead>
                    <TableHead className="text-right">Gross Sales</TableHead>
                    <TableHead className="text-right">₹/sqft</TableHead>
                    <TableHead className="text-right">Due (MG)</TableHead>
                    <TableHead className="text-right">MG Status</TableHead>
                    <TableHead className="text-right">YoY</TableHead>
                    <TableHead className="text-right w-16">Flag</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {loading ? (
                    <TableRow><TableCell colSpan={7} className="py-12 text-center"><RefreshCw className="h-5 w-5 animate-spin mx-auto text-muted-foreground" /></TableCell></TableRow>
                  ) : !(legacy?.byTenant?.length) ? (
                    <TableRow><TableCell colSpan={7} className="py-12 text-center text-muted-foreground">No tenant data for this period</TableCell></TableRow>
                  ) : legacy.byTenant.map((t) => (
                    <TableRow key={t.tenantId} className="hover:bg-muted/50">
                      <TableCell>
                        <div className="font-medium text-sm">{t.shopName}</div>
                        {(t.zone || t.floor) && (
                          <div className="flex items-center gap-1 text-xs text-muted-foreground">
                            <MapPin className="h-2.5 w-2.5" />
                            {[t.floor && `Floor ${t.floor}`, t.zone].filter(Boolean).join(" · ")}
                          </div>
                        )}
                      </TableCell>
                      <TableCell className="text-right font-mono text-sm">{fmtK(t.grossSales)}</TableCell>
                      <TableCell className="text-right text-sm">{t.salesPerSqft != null ? `₹${fmtNum(t.salesPerSqft)}` : "—"}</TableCell>
                      <TableCell className="text-right font-mono text-sm">{fmtK(t.amountDue)}</TableCell>
                      <TableCell className="text-right">
                        {t.isAboveMG
                          ? <Badge className="bg-emerald-100 text-emerald-700 border-emerald-200 text-xs">Above MG</Badge>
                          : <Badge variant="outline" className="text-muted-foreground text-xs">MG Floor</Badge>}
                      </TableCell>
                      <TableCell className="text-right">
                        {t.yoyTrend === "new" ? <span className="text-xs text-muted-foreground">New</span> : (
                          <span className={cn("text-xs flex items-center justify-end gap-0.5",
                            t.yoyTrend === "up"   ? "text-emerald-600" :
                            t.yoyTrend === "down" ? "text-red-600" : "text-muted-foreground")}>
                            {t.yoyTrend === "up"   && <TrendingUp   className="h-3 w-3" />}
                            {t.yoyTrend === "down" && <TrendingDown  className="h-3 w-3" />}
                            {t.yoyTrend === "flat" && <Minus         className="h-3 w-3" />}
                            {fmtPct(t.yoyGrowthPct)}
                          </span>
                        )}
                      </TableCell>
                      <TableCell className="text-right">
                        {t.anomalyFlag
                          ? <span title={t.anomalyFlag}><AlertTriangle className="h-3.5 w-3.5 text-amber-500 ml-auto" /></span>
                          : <CheckCircle className="h-3.5 w-3.5 text-emerald-500 ml-auto" />}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="zones" className="mt-4">
          <Card>
            <CardHeader><CardTitle className="text-base">Zone & Floor Performance</CardTitle></CardHeader>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Zone</TableHead>
                    <TableHead>Floor</TableHead>
                    <TableHead className="text-right">Tenants</TableHead>
                    <TableHead className="text-right">Gross Sales</TableHead>
                    <TableHead className="text-right">₹/sqft</TableHead>
                    <TableHead className="text-right">Avg YoY</TableHead>
                    <TableHead>Top Tenant</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {loading ? (
                    <TableRow><TableCell colSpan={7} className="py-12 text-center"><RefreshCw className="h-5 w-5 animate-spin mx-auto text-muted-foreground" /></TableCell></TableRow>
                  ) : !(legacy?.byZone?.length) ? (
                    <TableRow><TableCell colSpan={7} className="py-12 text-center text-muted-foreground">No zone data. Assign zones in Properties.</TableCell></TableRow>
                  ) : legacy.byZone.map((z, i) => (
                    <TableRow key={i} className="hover:bg-muted/50">
                      <TableCell className="font-medium text-sm capitalize">{z.zone}</TableCell>
                      <TableCell className="text-sm text-muted-foreground uppercase">{z.floor ?? "All"}</TableCell>
                      <TableCell className="text-right text-sm">{z.tenantCount}</TableCell>
                      <TableCell className="text-right font-mono text-sm">{fmtK(z.grossSales)}</TableCell>
                      <TableCell className="text-right text-sm">{z.salesPerSqft != null ? `₹${fmtNum(z.salesPerSqft)}` : "—"}</TableCell>
                      <TableCell className="text-right text-sm">
                        {z.avgYoyGrowthPct != null ? (
                          <span className={cn(z.avgYoyGrowthPct > 0 ? "text-emerald-600" : "text-red-600")}>{fmtPct(z.avgYoyGrowthPct)}</span>
                        ) : "—"}
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">{z.topTenant ?? "—"}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* ── SECTION 9: Export bar ─────────────────────────────────────────── */}
      <Card className="border-dashed">
        <CardContent className="py-4 px-6">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-sm font-medium">Export Report</p>
              <p className="text-xs text-muted-foreground">Download data or render a full-page PDF</p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button variant="outline" size="sm" className="h-8 gap-1.5 text-xs"
                onClick={() => downloadXLSX((analytics?.tenants ?? []) as unknown as Record<string, unknown>[], "tenant-analytics.xlsx")}>
                <FileText className="h-3.5 w-3.5" /> Tenant Excel
              </Button>
              <Button variant="outline" size="sm" className="h-8 gap-1.5 text-xs"
                onClick={() => downloadXLSX((analytics?.trend ?? []) as unknown as Record<string, unknown>[], "revenue-trend.xlsx")}>
                <FileText className="h-3.5 w-3.5" /> Trend Excel
              </Button>
              <Button variant="outline" size="sm" className="h-8 gap-1.5 text-xs"
                onClick={() => exportChartPNG("chart-trend", "revenue-trend.png")}>
                <Image className="h-3.5 w-3.5" /> Trend PNG
              </Button>
              <Button variant="outline" size="sm" className="h-8 gap-1.5 text-xs"
                onClick={() => exportChartPNG("chart-category-pie", "category-pie.png")}>
                <Image className="h-3.5 w-3.5" /> Category PNG
              </Button>
              <Button variant="outline" size="sm" className="h-8 gap-1.5 text-xs" onClick={() => window.print()}>
                <Download className="h-3.5 w-3.5" /> Full PDF
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* ── Formula reference ─────────────────────────────────────────────── */}
      <Card className="border-dashed bg-muted/30">
        <CardContent className="py-3 px-4">
          <p className="text-xs text-muted-foreground leading-relaxed">
            <span className="font-semibold text-foreground">MG Billing: </span>
            minimumGuarantee = monthlyMG × (days/30) ·
            revShareAmount = grossSales × revShare% ·{" "}
            <span className="font-semibold text-primary">amountDue = max(MG, revShareAmount)</span>
            {" "}· excessOverMG = max(0, revShareAmount − MG)
          </p>
        </CardContent>
      </Card>

    </div>
  )
}
