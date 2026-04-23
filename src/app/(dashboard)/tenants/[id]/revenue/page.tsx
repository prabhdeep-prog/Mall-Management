"use client"

import * as React from "react"
import { useParams, useRouter } from "next/navigation"
import Link from "next/link"
import {
  LineChart, Line, BarChart, Bar,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend, ReferenceLine,
} from "recharts"
import {
  ArrowLeft, Building2, Calendar, CheckCircle2, ChevronLeft, ChevronRight,
  Download, ExternalLink, Filter, IndianRupee, Loader2, RefreshCw,
  ShoppingCart, TrendingUp, Wifi, WifiOff, Zap, AlertCircle,
  BarChart3, Activity, Star, Clock,
} from "lucide-react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Separator } from "@/components/ui/separator"
import { Switch } from "@/components/ui/switch"
import { Skeleton } from "@/components/ui/skeleton"
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table"
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select"
import { cn, formatCurrency } from "@/lib/utils"
import { format, subDays, subMonths } from "date-fns"

// ─── Types ────────────────────────────────────────────────────────────────────

interface TenantInfo { id: string; businessName: string; brandName: string | null; category: string | null; subcategory: string | null; email: string | null; phone: string | null }
interface LeaseInfo  { unitNumber: string; floor: number | null; zone: string | null; areaSqft: string | null; leaseType: string | null; baseRent: string | null; revenueSharePercentage: string | null; monthlyMg: string | null; camCharges: string | null; startDate: string; endDate: string; status: string | null }
interface PosInfo    { provider: string; status: string | null; syncFrequency: string | null; lastSyncAt: string | null; storeId: string | null }

interface KPI {
  totalSales: number; totalNetSales: number; avgDailySales: number
  highestSalesDay: { date: string; amount: number }
  transactionCount: number; avgTicketSize: number
  revenueShareDue: number; salesVsRentPct: number; days: number
}

interface TrendRow   { date: string; grossSales: number; netSales: number; transactionCount: number; rollingAvg: number }
interface HeatCell   { day: string; hour: number; value: number }
type HeatmapView   = "day-hour" | "month-day" | "week-hour"
type HeatmapMetric = "sales" | "transactions"
type HeatmapPalette = "blue" | "green" | "purple" | "orange"
interface WeekdayRow { day: string; grossSales: number; avgSales: number; transactions: number }
interface CategoryRow{ category: string; grossSales: number }
interface HistoryRow { id: string; date: string; grossSales: number; netSales: number; refunds: number; transactionCount: number; avgTicketSize: number; provider: string; verified: boolean; revenueSharePct: number; revenueShareAmt: number; source: string }

interface APIData {
  tenantInfo: TenantInfo; leaseInfo: LeaseInfo | null; posInfo: PosInfo | null
  kpis: KPI | null; trend: TrendRow[]; heatmap: HeatCell[]
  breakdown: { byWeekday: WeekdayRow[]; byProvider: { provider: string; grossSales: number }[]; byCategory: CategoryRow[] }
  history: { rows: HistoryRow[]; total: number; page: number; limit: number }
  empty: boolean
}

// ─── Constants ────────────────────────────────────────────────────────────────

const PRESET_RANGES = [
  { label: "Today",     days: 0 },
  { label: "Yesterday", days: 1, yesterday: true },
  { label: "7 Days",    days: 7 },
  { label: "30 Days",   days: 30 },
  { label: "90 Days",   days: 90 },
] as const

const HOURS  = Array.from({ length: 15 }, (_, i) => i + 9) // 9..23
const DAYS   = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]

const PALETTE_COLORS: Record<HeatmapPalette, { levels: string[]; legendClasses: string[]; textThreshold: number }> = {
  blue: {
    levels: [
      "bg-muted/40 border-border",
      "bg-blue-100 border-blue-200 dark:bg-blue-950/60 dark:border-blue-900",
      "bg-blue-300 border-blue-400 dark:bg-blue-800 dark:border-blue-700",
      "bg-blue-500 border-blue-600 dark:bg-blue-600 dark:border-blue-500",
      "bg-blue-700 border-blue-800 dark:bg-blue-500 dark:border-blue-400",
    ],
    legendClasses: ["bg-blue-100", "bg-blue-300", "bg-blue-500", "bg-blue-700"],
    textThreshold: 0.5,
  },
  green: {
    levels: [
      "bg-muted/40 border-border",
      "bg-emerald-100 border-emerald-200 dark:bg-emerald-950/60 dark:border-emerald-900",
      "bg-emerald-300 border-emerald-400 dark:bg-emerald-800 dark:border-emerald-700",
      "bg-emerald-500 border-emerald-600 dark:bg-emerald-600 dark:border-emerald-500",
      "bg-emerald-700 border-emerald-800 dark:bg-emerald-500 dark:border-emerald-400",
    ],
    legendClasses: ["bg-emerald-100", "bg-emerald-300", "bg-emerald-500", "bg-emerald-700"],
    textThreshold: 0.5,
  },
  purple: {
    levels: [
      "bg-muted/40 border-border",
      "bg-purple-100 border-purple-200 dark:bg-purple-950/60 dark:border-purple-900",
      "bg-purple-300 border-purple-400 dark:bg-purple-800 dark:border-purple-700",
      "bg-purple-500 border-purple-600 dark:bg-purple-600 dark:border-purple-500",
      "bg-purple-700 border-purple-800 dark:bg-purple-500 dark:border-purple-400",
    ],
    legendClasses: ["bg-purple-100", "bg-purple-300", "bg-purple-500", "bg-purple-700"],
    textThreshold: 0.5,
  },
  orange: {
    levels: [
      "bg-muted/40 border-border",
      "bg-orange-100 border-orange-200 dark:bg-orange-950/60 dark:border-orange-900",
      "bg-orange-300 border-orange-400 dark:bg-orange-800 dark:border-orange-700",
      "bg-orange-500 border-orange-600 dark:bg-orange-600 dark:border-orange-500",
      "bg-orange-700 border-orange-800 dark:bg-orange-500 dark:border-orange-400",
    ],
    legendClasses: ["bg-orange-100", "bg-orange-300", "bg-orange-500", "bg-orange-700"],
    textThreshold: 0.5,
  },
}

const CAT_LABELS: Record<string, string> = {
  fashion: "Fashion", food_beverage: "F&B", electronics: "Electronics",
  entertainment: "Entertainment", services: "Services", health_beauty: "Health & Beauty",
  jewelry: "Jewelry", sports: "Sports",
}

const LEASE_TYPE_LABELS: Record<string, string> = {
  fixed_rent: "Fixed Rent", revenue_share: "Revenue Share",
  hybrid: "Hybrid", minimum_guarantee: "Min Guarantee",
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function today()     { return new Date().toISOString().slice(0, 10) }
function daysAgo(n: number) { return subDays(new Date(), n).toISOString().slice(0, 10) }

/** Compact currency for KPI cards: ₹5.9Cr, ₹29.4L, ₹6,531 */
function compactCurrency(amount: number): string {
  if (amount >= 10000000) return `₹${(amount / 10000000).toFixed(1)}Cr`
  if (amount >= 100000) return `₹${(amount / 100000).toFixed(1)}L`
  return formatCurrency(amount)
}

function exportCSV(rows: HistoryRow[], filename: string) {
  const headers = ["Date","Gross Sales","Net Sales","Refunds","Transactions","Avg Ticket","Provider","Verified","Rev Share %","Rev Share Amt"]
  const lines   = rows.map(r => [
    r.date, r.grossSales.toFixed(2), r.netSales.toFixed(2), r.refunds.toFixed(2),
    r.transactionCount, r.avgTicketSize.toFixed(2), r.provider,
    r.verified ? "Yes" : "No", r.revenueSharePct, r.revenueShareAmt.toFixed(2),
  ].join(","))
  const blob = new Blob([[headers.join(","), ...lines].join("\n")], { type: "text/csv" })
  const a    = document.createElement("a"); a.href = URL.createObjectURL(blob)
  a.download = filename; a.click()
}

async function exportExcel(rows: HistoryRow[], filename: string) {
  const XLSX = await import("xlsx")
  const ws   = XLSX.utils.json_to_sheet(rows.map(r => ({
    Date: r.date, "Gross Sales": r.grossSales, "Net Sales": r.netSales,
    Refunds: r.refunds, Transactions: r.transactionCount,
    "Avg Ticket": r.avgTicketSize, Provider: r.provider,
    Verified: r.verified ? "Yes" : "No",
    "Rev Share %": r.revenueSharePct, "Rev Share Amt": r.revenueShareAmt,
  })))
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, "Sales")
  XLSX.writeFile(wb, filename)
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function KpiCard({ label, value, sub, icon: Icon, color = "blue", loading }: {
  label: string; value: React.ReactNode; sub?: string; icon: React.ElementType; color?: string; loading?: boolean
}) {
  const colors: Record<string, string> = {
    blue:   "from-blue-50 to-white border-blue-100 dark:from-blue-950/40 dark:to-card dark:border-blue-900/40",
    green:  "from-emerald-50 to-white border-emerald-100 dark:from-emerald-950/40 dark:to-card dark:border-emerald-900/40",
    amber:  "from-amber-50 to-white border-amber-100 dark:from-amber-950/40 dark:to-card dark:border-amber-900/40",
    purple: "from-purple-50 to-white border-purple-100 dark:from-purple-950/40 dark:to-card dark:border-purple-900/40",
    pink:   "from-pink-50 to-white border-pink-100 dark:from-pink-950/40 dark:to-card dark:border-pink-900/40",
    indigo: "from-indigo-50 to-white border-indigo-100 dark:from-indigo-950/40 dark:to-card dark:border-indigo-900/40",
  }
  const iconColors: Record<string, string> = {
    blue: "text-blue-500 dark:text-blue-400",
    green: "text-emerald-500 dark:text-emerald-400",
    amber: "text-amber-500 dark:text-amber-400",
    purple: "text-purple-500 dark:text-purple-400",
    pink: "text-pink-500 dark:text-pink-400",
    indigo: "text-indigo-500 dark:text-indigo-400",
  }
  return (
    <Card className={cn("bg-gradient-to-br overflow-hidden", colors[color])}>
      <CardContent className="pt-4 pb-3">
        <div className="flex items-center gap-1.5 text-xs text-muted-foreground mb-1">
          <Icon className={cn("h-3.5 w-3.5 flex-shrink-0", iconColors[color])} />
          <span className="truncate">{label}</span>
        </div>
        {loading
          ? <Skeleton className="h-7 w-28 mt-1" />
          : <div className="text-lg sm:text-xl lg:text-2xl font-bold truncate" title={typeof value === "string" ? value : undefined}>{value}</div>
        }
        {sub && !loading && <p className="text-xs text-muted-foreground mt-0.5 truncate">{sub}</p>}
      </CardContent>
    </Card>
  )
}

function compactVal(val: number): string {
  if (val >= 100000) return `${(val / 100000).toFixed(0)}L`
  if (val >= 1000)   return `${(val / 1000).toFixed(0)}K`
  return val.toFixed(0)
}

function buildMonthDayData(trend: TrendRow[]): { rows: string[]; cols: string[]; lookup: Record<string, number> } {
  const lookup: Record<string, number> = {}
  const monthSet = new Set<string>()
  trend.forEach(r => {
    const d = new Date(r.date + "T00:00:00")
    const month = MONTHS[d.getMonth()]
    const dow = DAYS[(d.getDay() + 6) % 7] // getDay: 0=Sun → shift to Mon=0
    const key = `${month}-${dow}`
    lookup[key] = (lookup[key] || 0) + r.grossSales
    monthSet.add(month)
  })
  // Order months chronologically based on data
  const monthOrder = MONTHS.filter(m => monthSet.has(m))
  return { rows: monthOrder, cols: DAYS, lookup }
}

function buildWeekHourData(cells: HeatCell[]): { rows: string[]; cols: number[]; lookup: Record<string, number> } {
  // Group by weekday category: Weekdays (Mon-Fri) vs Weekend (Sat-Sun)
  const lookup: Record<string, number> = {}
  const weekdayLabels = ["Weekdays", "Weekend"]
  const weekdays = new Set(["Mon", "Tue", "Wed", "Thu", "Fri"])
  cells.forEach(c => {
    const group = weekdays.has(c.day) ? "Weekdays" : "Weekend"
    const key = `${group}-${c.hour}`
    lookup[key] = (lookup[key] || 0) + c.value
  })
  // Average weekdays by 5, weekend by 2
  Object.keys(lookup).forEach(key => {
    const group = key.split("-")[0]
    lookup[key] = lookup[key] / (group === "Weekdays" ? 5 : 2)
  })
  return { rows: weekdayLabels, cols: HOURS, lookup }
}

function HeatmapGrid({ cells, trend, view, palette }: {
  cells: HeatCell[]; trend?: TrendRow[]; view: HeatmapView; palette: HeatmapPalette
}) {
  const colors = PALETTE_COLORS[palette]

  if (view === "day-hour") {
    if (!cells.length) return (
      <div className="text-center py-8 text-muted-foreground text-sm">No hourly data available.</div>
    )
    const maxVal = Math.max(...cells.map(c => c.value), 1)
    const lookup: Record<string, number> = {}
    cells.forEach(c => { lookup[`${c.day}-${c.hour}`] = c.value })

    return (
      <div className="overflow-x-auto">
        <div style={{ minWidth: 500 }}>
          <div className="flex">
            <div className="w-10 flex-shrink-0" />
            {HOURS.map(h => (
              <div key={h} className="flex-1 text-center text-[10px] text-muted-foreground pb-1 min-w-[32px]">
                {h}h
              </div>
            ))}
          </div>
          {DAYS.map(day => (
            <div key={day} className="flex items-center mb-0.5">
              <div className="w-10 text-[11px] text-muted-foreground font-medium flex-shrink-0">{day}</div>
              {HOURS.map(h => {
                const val = lookup[`${day}-${h}`] || 0
                const pct = val / maxVal
                const level = pct === 0 ? 0 : pct < 0.25 ? 1 : pct < 0.5 ? 2 : pct < 0.75 ? 3 : 4
                const text = pct >= colors.textThreshold ? "text-white" : "text-foreground"
                return (
                  <div
                    key={h}
                    title={val > 0 ? `${day} ${h}:00 — ${formatCurrency(val)}` : undefined}
                    className={cn("flex-1 min-w-[32px] h-7 border rounded-sm flex items-center justify-center cursor-default", colors.levels[level])}
                  >
                    {val > 0 && <span className={cn("text-[9px] font-medium", text)}>{compactVal(val)}</span>}
                  </div>
                )
              })}
            </div>
          ))}
          <HeatmapLegend classes={colors.legendClasses} />
        </div>
      </div>
    )
  }

  if (view === "month-day") {
    if (!trend?.length) return (
      <div className="text-center py-8 text-muted-foreground text-sm">No monthly data available.</div>
    )
    const { rows, cols, lookup } = buildMonthDayData(trend)
    const maxVal = Math.max(...Object.values(lookup), 1)

    return (
      <div className="overflow-x-auto">
        <div style={{ minWidth: 400 }}>
          <div className="flex">
            <div className="w-12 flex-shrink-0" />
            {cols.map(col => (
              <div key={col} className="flex-1 text-center text-[10px] text-muted-foreground pb-1 min-w-[42px]">
                {col}
              </div>
            ))}
          </div>
          {rows.map(row => (
            <div key={row} className="flex items-center mb-0.5">
              <div className="w-12 text-[11px] text-muted-foreground font-medium flex-shrink-0">{row}</div>
              {cols.map(col => {
                const val = lookup[`${row}-${col}`] || 0
                const pct = val / maxVal
                const level = pct === 0 ? 0 : pct < 0.25 ? 1 : pct < 0.5 ? 2 : pct < 0.75 ? 3 : 4
                const text = pct >= colors.textThreshold ? "text-white" : "text-foreground"
                return (
                  <div
                    key={col}
                    title={val > 0 ? `${row} ${col} — ${formatCurrency(val)}` : undefined}
                    className={cn("flex-1 min-w-[42px] h-8 border rounded-sm flex items-center justify-center cursor-default", colors.levels[level])}
                  >
                    {val > 0 && <span className={cn("text-[9px] font-medium", text)}>{compactVal(val)}</span>}
                  </div>
                )
              })}
            </div>
          ))}
          <HeatmapLegend classes={colors.legendClasses} />
        </div>
      </div>
    )
  }

  if (view === "week-hour") {
    if (!cells.length) return (
      <div className="text-center py-8 text-muted-foreground text-sm">No hourly data available.</div>
    )
    const { rows, cols, lookup } = buildWeekHourData(cells)
    const maxVal = Math.max(...Object.values(lookup), 1)

    return (
      <div className="overflow-x-auto">
        <div style={{ minWidth: 500 }}>
          <div className="flex">
            <div className="w-20 flex-shrink-0" />
            {cols.map(h => (
              <div key={h} className="flex-1 text-center text-[10px] text-muted-foreground pb-1 min-w-[32px]">
                {h}h
              </div>
            ))}
          </div>
          {rows.map(row => (
            <div key={row} className="flex items-center mb-0.5">
              <div className="w-20 text-[11px] text-muted-foreground font-medium flex-shrink-0">{row}</div>
              {cols.map(h => {
                const val = lookup[`${row}-${h}`] || 0
                const pct = val / maxVal
                const level = pct === 0 ? 0 : pct < 0.25 ? 1 : pct < 0.5 ? 2 : pct < 0.75 ? 3 : 4
                const text = pct >= colors.textThreshold ? "text-white" : "text-foreground"
                return (
                  <div
                    key={h}
                    title={val > 0 ? `${row} ${h}:00 — ${formatCurrency(val)}` : undefined}
                    className={cn("flex-1 min-w-[32px] h-8 border rounded-sm flex items-center justify-center cursor-default", colors.levels[level])}
                  >
                    {val > 0 && <span className={cn("text-[9px] font-medium", text)}>{compactVal(val)}</span>}
                  </div>
                )
              })}
            </div>
          ))}
          <HeatmapLegend classes={colors.legendClasses} />
        </div>
      </div>
    )
  }

  return null
}

function HeatmapLegend({ classes }: { classes: string[] }) {
  return (
    <div className="flex items-center gap-2 mt-3 text-[10px] text-muted-foreground">
      <span>Low</span>
      {classes.map(c => (
        <div key={c} className={cn("h-3 w-6 rounded-sm", c)} />
      ))}
      <span>High</span>
    </div>
  )
}

// Custom tooltip for line chart
function SalesTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null
  return (
    <div className="bg-popover text-popover-foreground border rounded-lg shadow-lg p-3 text-sm space-y-1">
      <p className="font-semibold text-xs text-muted-foreground">{label}</p>
      {payload.map((p: any) => (
        <p key={p.dataKey} style={{ color: p.color }} className="flex items-center gap-2">
          <span className="inline-block h-2 w-2 rounded-full" style={{ background: p.color }} />
          {p.name}: <strong>{typeof p.value === "number" ? formatCurrency(p.value) : p.value}</strong>
        </p>
      ))}
    </div>
  )
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function TenantRevenuePage() {
  const { id } = useParams<{ id: string }>()
  const router  = useRouter()

  // Filters — dates are initialized after mount to avoid SSR/CSR timezone hydration mismatch.
  const [activePreset, setActivePreset] = React.useState<number>(3) // "30 Days" default
  const [startDate,    setStartDate]    = React.useState("")
  const [endDate,      setEndDate]      = React.useState("")
  const [customMode,   setCustomMode]   = React.useState(false)
  const [verifiedOnly, setVerifiedOnly] = React.useState(false)
  const [histPage,     setHistPage]     = React.useState(1)
  const [histLimit,    setHistLimit]    = React.useState(10)
  const [trendView,    setTrendView]    = React.useState<"gross" | "net" | "txns">("gross")
  const [showAvg,      setShowAvg]      = React.useState(true)
  const [heatmapView,    setHeatmapView]    = React.useState<HeatmapView>("day-hour")
  const [heatmapPalette, setHeatmapPalette] = React.useState<HeatmapPalette>("blue")

  // Data
  const [data,    setData]    = React.useState<APIData | null>(null)
  const [loading, setLoading] = React.useState(true)
  const [error,   setError]   = React.useState<string | null>(null)

  const fetchData = React.useCallback(async (sd: string, ed: string, page = 1, limit = histLimit) => {
    setLoading(true); setError(null)
    try {
      const params = new URLSearchParams({ startDate: sd, endDate: ed, page: String(page), limit: String(limit) })
      if (verifiedOnly) params.set("verified", "true")
      const res  = await fetch(`/api/tenants/${id}/pos-revenue?${params}`)
      const json = await res.json()
      if (!res.ok) { setError(json.error || "Failed"); return }
      setData(json.data)
      setHistPage(page)
    } finally {
      setLoading(false)
    }
  }, [id, verifiedOnly, histLimit])

  // Apply preset
  function applyPreset(idx: number) {
    setActivePreset(idx); setCustomMode(false)
    const p = PRESET_RANGES[idx] as any
    if (p.yesterday) {
      const y = daysAgo(1)
      setStartDate(y); setEndDate(y)
      fetchData(y, y)
    } else if (p.days === 0) {
      const t = today()
      setStartDate(t); setEndDate(t)
      fetchData(t, t)
    } else {
      const sd = daysAgo(p.days - 1), ed = today()
      setStartDate(sd); setEndDate(ed)
      fetchData(sd, ed)
    }
  }

  function applyCustom() {
    fetchData(startDate, endDate)
    setActivePreset(-1)
  }

  // Initialize dates on mount (client only) to avoid SSR/CSR hydration mismatch.
  React.useEffect(() => {
    const sd = daysAgo(29)
    const ed = today()
    setStartDate(sd)
    setEndDate(ed)
    fetchData(sd, ed)
  }, []) // initial load
  React.useEffect(() => { if (data && startDate && endDate) fetchData(startDate, endDate, histPage) }, [verifiedOnly]) // re-fetch on toggle

  const { tenantInfo, leaseInfo, posInfo, kpis, trend, heatmap, breakdown, history, empty } = data || {}
  const fname = tenantInfo?.businessName?.toLowerCase().replace(/\s+/g, "-") || "tenant"

  // Peak trend point for reference line
  const peakTrendPoint = trend?.length
    ? trend.reduce((best, r) => r.grossSales > best.grossSales ? r : best, trend[0])
    : null

  return (
    <div className="min-h-screen bg-muted/30">
      <div className="max-w-7xl mx-auto p-6 space-y-6">

        {/* ── Navigation breadcrumb ── */}
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Link href="/tenants" className="hover:text-foreground flex items-center gap-1">
            <ArrowLeft className="h-3.5 w-3.5" /> Tenants
          </Link>
          <span>/</span>
          {loading
            ? <Skeleton className="h-4 w-32" />
            : <Link href={`/tenants/${id}`} className="hover:text-foreground">{tenantInfo?.businessName}</Link>
          }
          <span>/</span>
          <span className="text-foreground font-medium">Revenue Intelligence</span>
        </div>

        {/* ── Page Header ── */}
        {loading && !data ? (
          <div className="flex items-start gap-4">
            <Skeleton className="h-14 w-14 rounded-xl" />
            <div className="space-y-2">
              <Skeleton className="h-7 w-48" />
              <Skeleton className="h-4 w-96" />
            </div>
          </div>
        ) : (
          <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
            <div className="flex items-start gap-4">
              {/* Brand avatar */}
              <div className="h-14 w-14 rounded-xl bg-primary/10 flex items-center justify-center text-2xl font-bold text-primary flex-shrink-0">
                {tenantInfo?.brandName?.charAt(0) || tenantInfo?.businessName?.charAt(0) || "?"}
              </div>
              <div>
                <div className="flex items-center gap-2 flex-wrap">
                  <h1 className="text-2xl font-bold">
                    {tenantInfo?.brandName || tenantInfo?.businessName}
                  </h1>
                  {tenantInfo?.brandName && tenantInfo.brandName !== tenantInfo.businessName && (
                    <span className="text-muted-foreground text-sm">({tenantInfo.businessName})</span>
                  )}
                  {tenantInfo?.category && (
                    <Badge variant="secondary" className="capitalize">
                      {CAT_LABELS[tenantInfo.category] || tenantInfo.category}
                    </Badge>
                  )}
                </div>
                <div className="flex items-center gap-3 mt-1 text-sm text-muted-foreground flex-wrap">
                  {leaseInfo && (
                    <span className="flex items-center gap-1">
                      <Building2 className="h-3.5 w-3.5" />
                      Unit {leaseInfo.unitNumber}
                      {leaseInfo.floor != null && `, Floor ${leaseInfo.floor}`}
                      {leaseInfo.zone && ` · ${leaseInfo.zone}`}
                    </span>
                  )}
                  {leaseInfo?.leaseType && (
                    <span className="flex items-center gap-1">
                      <IndianRupee className="h-3.5 w-3.5" />
                      {LEASE_TYPE_LABELS[leaseInfo.leaseType] || leaseInfo.leaseType}
                      {leaseInfo.baseRent && ` · ${formatCurrency(parseFloat(leaseInfo.baseRent))}/mo`}
                    </span>
                  )}
                  {posInfo ? (
                    <span className="flex items-center gap-1 text-green-600 dark:text-green-400">
                      <Wifi className="h-3.5 w-3.5" />
                      {posInfo.provider.replace(/_/g, " ")}
                      {posInfo.lastSyncAt && ` · ${format(new Date(posInfo.lastSyncAt), "dd MMM HH:mm")}`}
                    </span>
                  ) : (
                    <span className="flex items-center gap-1 text-muted-foreground">
                      <WifiOff className="h-3.5 w-3.5" /> No POS connected
                    </span>
                  )}
                </div>
              </div>
            </div>
            <div className="flex gap-2 flex-shrink-0">
              <Button variant="outline" size="sm" onClick={() => fetchData(startDate, endDate, histPage)} disabled={loading}>
                <RefreshCw className={cn("h-3.5 w-3.5 mr-1.5", loading && "animate-spin")} />
                Refresh
              </Button>
              <Link href={`/tenants/${id}`}>
                <Button variant="outline" size="sm">
                  <ExternalLink className="h-3.5 w-3.5 mr-1.5" /> Tenant Detail
                </Button>
              </Link>
            </div>
          </div>
        )}

        {/* ── Filter Bar ── */}
        <Card>
          <CardContent className="py-4">
            <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-center flex-wrap">
              {/* Preset pills */}
              <div className="flex gap-1 flex-wrap">
                {PRESET_RANGES.map((p, idx) => (
                  <button
                    key={p.label}
                    onClick={() => applyPreset(idx)}
                    className={cn(
                      "px-3 py-1 rounded-full text-xs font-medium border transition-colors",
                      activePreset === idx
                        ? "bg-primary text-primary-foreground border-primary"
                        : "bg-muted text-muted-foreground border-transparent hover:border-primary/30"
                    )}
                  >
                    {p.label}
                  </button>
                ))}
                <button
                  onClick={() => { setCustomMode(true); setActivePreset(-1) }}
                  className={cn(
                    "px-3 py-1 rounded-full text-xs font-medium border transition-colors",
                    customMode
                      ? "bg-primary text-primary-foreground border-primary"
                      : "bg-muted text-muted-foreground border-transparent hover:border-primary/30"
                  )}
                >
                  Custom
                </button>
              </div>

              {/* Custom date inputs */}
              {customMode && (
                <div className="flex items-center gap-2">
                  <Input type="date" value={startDate} onChange={e => setStartDate(e.target.value)} className="h-7 text-xs w-36" />
                  <span className="text-muted-foreground text-xs">to</span>
                  <Input type="date" value={endDate} onChange={e => setEndDate(e.target.value)} className="h-7 text-xs w-36" />
                  <Button size="sm" className="h-7 text-xs" onClick={applyCustom}>Apply</Button>
                </div>
              )}

              <Separator orientation="vertical" className="h-6 hidden sm:block" />

              {/* Verified toggle */}
              <div className="flex items-center gap-2">
                <Switch
                  id="verified-toggle"
                  checked={verifiedOnly}
                  onCheckedChange={setVerifiedOnly}
                  className="scale-75"
                />
                <Label htmlFor="verified-toggle" className="text-xs text-muted-foreground cursor-pointer">
                  Verified only
                </Label>
              </div>

              <div className="ml-auto text-xs text-muted-foreground">
                {startDate && endDate
                  ? startDate === endDate
                    ? format(new Date(startDate + "T00:00:00"), "dd MMM yyyy")
                    : `${format(new Date(startDate + "T00:00:00"), "dd MMM")} – ${format(new Date(endDate + "T00:00:00"), "dd MMM yyyy")}`
                  : null
                }
              </div>
            </div>
          </CardContent>
        </Card>

        {/* ── Empty / No POS state ── */}
        {!loading && empty && (
          <Card className="border-dashed">
            <CardContent className="flex flex-col items-center gap-4 py-16 text-center">
              <ShoppingCart className="h-16 w-16 text-muted-foreground/30" />
              <div>
                <p className="text-lg font-semibold">No POS Sales Data</p>
                <p className="text-muted-foreground text-sm mt-1 max-w-sm">
                  {posInfo
                    ? "No sales records found for this date range. Try a wider range or check the POS sync."
                    : "No POS integration is connected to this tenant. Use the POS Simulator to enter data."}
                </p>
              </div>
              {!posInfo && (
                <Link href="/pos-simulator">
                  <Button variant="outline" className="gap-2">
                    <Zap className="h-4 w-4" /> Open POS Simulator
                  </Button>
                </Link>
              )}
            </CardContent>
          </Card>
        )}

        {/* ── KPI Cards ── */}
        {(!empty || loading) && (
          <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-6 gap-4">
            <KpiCard
              label="Total Sales"
              value={kpis ? compactCurrency(kpis.totalSales) : "—"}
              sub={kpis ? `${kpis.days} days` : undefined}
              icon={IndianRupee} color="green" loading={loading && !kpis}
            />
            <KpiCard
              label="Avg Daily Sales"
              value={kpis ? compactCurrency(kpis.avgDailySales) : "—"}
              icon={TrendingUp} color="blue" loading={loading && !kpis}
            />
            <KpiCard
              label="Peak Day"
              value={kpis ? compactCurrency(kpis.highestSalesDay.amount) : "—"}
              sub={kpis ? format(new Date(kpis.highestSalesDay.date + "T00:00:00"), "dd MMM") : undefined}
              icon={Star} color="amber" loading={loading && !kpis}
            />
            <KpiCard
              label="Transactions"
              value={kpis ? kpis.transactionCount.toLocaleString("en-IN") : "—"}
              sub={kpis && kpis.transactionCount > 0 ? `Avg ${compactCurrency(kpis.avgTicketSize)}` : undefined}
              icon={Activity} color="purple" loading={loading && !kpis}
            />
            <KpiCard
              label="Rev-Share Due"
              value={kpis ? compactCurrency(kpis.revenueShareDue) : "—"}
              sub={leaseInfo?.revenueSharePercentage ? `${leaseInfo.revenueSharePercentage}% of sales` : "Fixed rent"}
              icon={BarChart3} color="pink" loading={loading && !kpis}
            />
            <KpiCard
              label="Sales vs Rent"
              value={kpis ? `${kpis.salesVsRentPct.toFixed(0)}%` : "—"}
              sub={kpis && kpis.salesVsRentPct > 0 ? (kpis.salesVsRentPct >= 100 ? "Above rent" : "Below rent") : undefined}
              icon={IndianRupee} color="indigo" loading={loading && !kpis}
            />
          </div>
        )}

        {/* ── Sales Trend Chart ── */}
        {(!empty || loading) && (
          <Card>
            <CardHeader className="pb-2">
              <div className="flex items-center justify-between flex-wrap gap-2">
                <div>
                  <CardTitle className="flex items-center gap-2">
                    <TrendingUp className="h-5 w-5 text-primary" /> Sales Trend
                  </CardTitle>
                  <CardDescription>Daily POS sales over the selected period</CardDescription>
                </div>
                <div className="flex items-center gap-2">
                  {/* View toggle */}
                  <div className="flex rounded-lg border overflow-hidden text-xs">
                    {(["gross", "net", "txns"] as const).map(v => (
                      <button
                        key={v}
                        onClick={() => setTrendView(v)}
                        className={cn(
                          "px-3 py-1.5 transition-colors",
                          trendView === v ? "bg-primary text-primary-foreground" : "bg-muted hover:bg-muted/80"
                        )}
                      >
                        {v === "gross" ? "Gross" : v === "net" ? "Net" : "Txns"}
                      </button>
                    ))}
                  </div>
                  <div className="flex items-center gap-1.5">
                    <Switch checked={showAvg} onCheckedChange={setShowAvg} className="scale-75" />
                    <span className="text-xs text-muted-foreground">
                      {customMode ? "Custom avg" : activePreset >= 0 ? `${PRESET_RANGES[activePreset].label} avg` : "Avg"}
                    </span>
                  </div>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              {loading
                ? <Skeleton className="h-64 w-full rounded-lg" />
                : trend && trend.length > 0 ? (
                  <ResponsiveContainer width="100%" height={260}>
                    <LineChart data={trend} margin={{ top: 5, right: 10, bottom: 0, left: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                      <XAxis
                        dataKey="date"
                        tickFormatter={d => format(new Date(d + "T00:00:00"), "dd MMM")}
                        tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} tickLine={false}
                        stroke="hsl(var(--border))"
                        interval={Math.max(0, Math.floor(trend.length / 8) - 1)}
                      />
                      <YAxis
                        tickFormatter={v => v >= 100000 ? `${(v/100000).toFixed(1)}L` : v >= 1000 ? `${(v/1000).toFixed(0)}K` : v}
                        tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} tickLine={false} axisLine={false} width={50}
                      />
                      <Tooltip content={<SalesTooltip />} />
                      <Legend wrapperStyle={{ fontSize: 12 }} />
                      {peakTrendPoint && (
                        <ReferenceLine
                          x={peakTrendPoint.date}
                          stroke="#f59e0b"
                          strokeDasharray="4 2"
                          label={{ value: "Peak", position: "top", fontSize: 10, fill: "#f59e0b" }}
                        />
                      )}
                      {trendView === "txns" ? (
                        <Line
                          type="monotone" dataKey="transactionCount" name="Transactions"
                          stroke="#8b5cf6" strokeWidth={2} dot={false} activeDot={{ r: 4 }}
                        />
                      ) : (
                        <Line
                          type="monotone"
                          dataKey={trendView === "gross" ? "grossSales" : "netSales"}
                          name={trendView === "gross" ? "Gross Sales" : "Net Sales"}
                          stroke="#22c55e" strokeWidth={2} dot={false} activeDot={{ r: 4 }}
                        />
                      )}
                      {showAvg && trendView !== "txns" && (
                        <Line
                          type="monotone" dataKey="rollingAvg"
                          name={customMode ? "Custom Avg" : activePreset >= 0 ? `${PRESET_RANGES[activePreset].label} Avg` : "Avg"}
                          stroke="#3b82f6" strokeWidth={1.5} strokeDasharray="5 3"
                          dot={false} activeDot={false}
                        />
                      )}
                    </LineChart>
                  </ResponsiveContainer>
                ) : (
                  <div className="h-64 flex items-center justify-center text-muted-foreground">No trend data</div>
                )
              }
            </CardContent>
          </Card>
        )}

        {/* ── Two-column: Heatmap + Revenue Share ── */}
        {(!empty || loading) && (
          <div className="grid lg:grid-cols-3 gap-4">
            {/* Configurable Heatmap (2/3 width) */}
            <Card className="lg:col-span-2">
              <CardHeader className="pb-2">
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                  <div>
                    <CardTitle className="flex items-center gap-2">
                      <Clock className="h-5 w-5 text-primary" /> Sales Heatmap
                    </CardTitle>
                    <CardDescription>
                      {heatmapView === "day-hour" && "Average sales by day of week and hour (9am–11pm)"}
                      {heatmapView === "month-day" && "Total sales by month and day of week"}
                      {heatmapView === "week-hour" && "Average sales: weekdays vs weekends by hour"}
                    </CardDescription>
                  </div>
                  <div className="flex items-center gap-2 flex-wrap">
                    <Select value={heatmapView} onValueChange={(v) => setHeatmapView(v as HeatmapView)}>
                      <SelectTrigger className="h-8 w-[140px] text-xs">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="day-hour">Day × Hour</SelectItem>
                        <SelectItem value="month-day">Month × Day</SelectItem>
                        <SelectItem value="week-hour">Weekday vs Weekend</SelectItem>
                      </SelectContent>
                    </Select>
                    <Select value={heatmapPalette} onValueChange={(v) => setHeatmapPalette(v as HeatmapPalette)}>
                      <SelectTrigger className="h-8 w-[100px] text-xs">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="blue">Blue</SelectItem>
                        <SelectItem value="green">Green</SelectItem>
                        <SelectItem value="purple">Purple</SelectItem>
                        <SelectItem value="orange">Orange</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                {loading
                  ? <Skeleton className="h-52 w-full rounded-lg" />
                  : <HeatmapGrid cells={heatmap || []} trend={trend} view={heatmapView} palette={heatmapPalette} />
                }
              </CardContent>
            </Card>

            {/* Revenue Share Panel (1/3 width) */}
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="flex items-center gap-2 text-base">
                  <IndianRupee className="h-4 w-4 text-primary" /> Revenue Share
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {loading
                  ? <Skeleton className="h-40 w-full rounded-lg" />
                  : !leaseInfo ? (
                    <p className="text-sm text-muted-foreground">No active lease.</p>
                  ) : (
                    <>
                      {[
                        { label: "Lease Type",    value: LEASE_TYPE_LABELS[leaseInfo.leaseType || ""] || leaseInfo.leaseType },
                        { label: "Base Rent",     value: formatCurrency(parseFloat(leaseInfo.baseRent || "0")) },
                        { label: "Rev-Share %",   value: leaseInfo.revenueSharePercentage ? `${leaseInfo.revenueSharePercentage}%` : "N/A" },
                        { label: "Min Guarantee", value: leaseInfo.monthlyMg && parseFloat(leaseInfo.monthlyMg) > 0 ? formatCurrency(parseFloat(leaseInfo.monthlyMg)) : "N/A" },
                        { label: "CAM Charges",   value: leaseInfo.camCharges ? formatCurrency(parseFloat(leaseInfo.camCharges)) : "N/A" },
                      ].map(({ label, value }) => (
                        <div key={label} className="flex items-center justify-between text-sm border-b pb-2 last:border-0 last:pb-0">
                          <span className="text-muted-foreground">{label}</span>
                          <span className="font-medium">{value || "—"}</span>
                        </div>
                      ))}
                      {kpis && kpis.revenueShareDue > 0 && (
                        <div className="rounded-lg bg-primary/5 border border-primary/20 p-3 mt-2">
                          <p className="text-xs text-muted-foreground">Due this period</p>
                          <p className="text-xl font-bold text-primary">{formatCurrency(kpis.revenueShareDue)}</p>
                          <p className="text-xs text-muted-foreground mt-0.5">
                            {leaseInfo.revenueSharePercentage}% × {formatCurrency(kpis.totalSales)}
                          </p>
                        </div>
                      )}
                    </>
                  )
                }
              </CardContent>
            </Card>
          </div>
        )}

        {/* ── Breakdown Charts ── */}
        {(!empty || loading) && (
          <div className="grid md:grid-cols-2 gap-4">
            {/* By Weekday */}
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base flex items-center gap-2">
                  <BarChart3 className="h-4 w-4 text-primary" /> Sales by Weekday
                </CardTitle>
              </CardHeader>
              <CardContent>
                {loading
                  ? <Skeleton className="h-48 w-full rounded-lg" />
                  : breakdown?.byWeekday.length ? (
                    <ResponsiveContainer width="100%" height={200}>
                      <BarChart data={breakdown.byWeekday} margin={{ top: 0, right: 0, left: 0, bottom: 0 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                        <XAxis dataKey="day" tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} tickLine={false} stroke="hsl(var(--border))" />
                        <YAxis
                          tickFormatter={v => v >= 1000 ? `${(v/1000).toFixed(0)}K` : v}
                          tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} tickLine={false} axisLine={false} width={44}
                        />
                        <Tooltip
                          formatter={(v: number) => formatCurrency(v)}
                          contentStyle={{ background: "hsl(var(--popover))", border: "1px solid hsl(var(--border))", borderRadius: 8, color: "hsl(var(--popover-foreground))" }}
                          labelStyle={{ color: "hsl(var(--muted-foreground))" }}
                          cursor={{ fill: "hsl(var(--muted))", opacity: 0.4 }}
                        />
                        <Bar dataKey="grossSales" name="Gross Sales" fill="#22c55e" radius={[3, 3, 0, 0]} />
                        <Bar dataKey="avgSales"   name="Avg Sales"   fill="#86efac" radius={[3, 3, 0, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  ) : <div className="h-48 flex items-center justify-center text-muted-foreground text-sm">No data</div>
                }
              </CardContent>
            </Card>

            {/* By Category */}
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base flex items-center gap-2">
                  <BarChart3 className="h-4 w-4 text-primary" /> Sales by Category
                </CardTitle>
              </CardHeader>
              <CardContent>
                {loading
                  ? <Skeleton className="h-48 w-full rounded-lg" />
                  : breakdown?.byCategory.length ? (
                    <ResponsiveContainer width="100%" height={200}>
                      <BarChart data={breakdown.byCategory} layout="vertical" margin={{ top: 0, right: 10, left: 0, bottom: 0 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" horizontal={false} />
                        <XAxis type="number"
                          tickFormatter={v => v >= 1000 ? `${(v/1000).toFixed(0)}K` : v}
                          tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} tickLine={false} axisLine={false}
                        />
                        <YAxis type="category" dataKey="category" tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }} tickLine={false} width={70}
                          stroke="hsl(var(--border))"
                          tickFormatter={c => CAT_LABELS[c] || c}
                        />
                        <Tooltip
                          formatter={(v: number) => formatCurrency(v)}
                          contentStyle={{ background: "hsl(var(--popover))", border: "1px solid hsl(var(--border))", borderRadius: 8, color: "hsl(var(--popover-foreground))" }}
                          labelStyle={{ color: "hsl(var(--muted-foreground))" }}
                          cursor={{ fill: "hsl(var(--muted))", opacity: 0.4 }}
                        />
                        <Bar dataKey="grossSales" name="Gross Sales" fill="#8b5cf6" radius={[0, 3, 3, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  ) : <div className="h-48 flex items-center justify-center text-muted-foreground text-sm">No category breakdown data</div>
                }
              </CardContent>
            </Card>
          </div>
        )}

        {/* ── Sales History Table ── */}
        {(!empty || loading) && (
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between flex-wrap gap-2">
                <div>
                  <CardTitle className="flex items-center gap-2">
                    <ShoppingCart className="h-5 w-5 text-primary" /> Sales History
                  </CardTitle>
                  {!loading && history && (
                    <CardDescription>{history.total.toLocaleString()} records · page {history.page} of {Math.ceil(history.total / history.limit)}</CardDescription>
                  )}
                </div>
                <div className="flex gap-2">
                  <Button
                    variant="outline" size="sm"
                    onClick={() => history && exportCSV(history.rows, `${fname}-sales.csv`)}
                    disabled={loading || !history?.rows.length}
                  >
                    <Download className="h-3.5 w-3.5 mr-1.5" /> CSV
                  </Button>
                  <Button
                    variant="outline" size="sm"
                    onClick={() => history && exportExcel(history.rows, `${fname}-sales.xlsx`)}
                    disabled={loading || !history?.rows.length}
                  >
                    <Download className="h-3.5 w-3.5 mr-1.5" /> Excel
                  </Button>
                </div>
              </div>
            </CardHeader>
            <CardContent className="p-0">
              {loading
                ? <div className="p-6 space-y-2">{[...Array(5)].map((_, i) => <Skeleton key={i} className="h-10 w-full rounded" />)}</div>
                : !history?.rows.length ? (
                  <div className="flex items-center justify-center py-12 text-muted-foreground text-sm">No history records.</div>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Date</TableHead>
                        <TableHead className="text-right">Gross Sales</TableHead>
                        <TableHead className="text-right">Net Sales</TableHead>
                        <TableHead className="text-right">Txns</TableHead>
                        <TableHead className="text-right">Avg Ticket</TableHead>
                        <TableHead>Provider</TableHead>
                        <TableHead>Verified</TableHead>
                        <TableHead className="text-right">Rev-Share</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {history.rows.map((row) => (
                        <TableRow key={row.id}>
                          <TableCell className="font-medium whitespace-nowrap">
                            {format(new Date(row.date + "T00:00:00"), "EEE, dd MMM yyyy")}
                          </TableCell>
                          <TableCell className="text-right font-semibold">{formatCurrency(row.grossSales)}</TableCell>
                          <TableCell className="text-right text-muted-foreground">{formatCurrency(row.netSales)}</TableCell>
                          <TableCell className="text-right">{row.transactionCount.toLocaleString("en-IN")}</TableCell>
                          <TableCell className="text-right">{row.avgTicketSize > 0 ? formatCurrency(row.avgTicketSize) : "—"}</TableCell>
                          <TableCell>
                            <Badge variant="outline" className="text-xs capitalize">{row.provider.replace(/_/g, " ")}</Badge>
                          </TableCell>
                          <TableCell>
                            {row.verified
                              ? <CheckCircle2 className="h-4 w-4 text-emerald-500" />
                              : <span className="text-xs text-muted-foreground">—</span>
                            }
                          </TableCell>
                          <TableCell className="text-right">
                            {row.revenueShareAmt > 0
                              ? <span className="text-emerald-700 dark:text-emerald-400 font-medium">{formatCurrency(row.revenueShareAmt)}</span>
                              : <span className="text-muted-foreground">—</span>
                            }
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )
              }
            </CardContent>

            {/* Pagination */}
            {history && history.total > 0 && (
              <div className="flex items-center justify-between px-6 py-3 border-t">
                <div className="flex items-center gap-4">
                  <p className="text-sm text-muted-foreground">
                    Showing {((history.page - 1) * history.limit) + 1}–{Math.min(history.page * history.limit, history.total)} of {history.total}
                  </p>
                  <div className="flex items-center gap-2">
                    <span className="text-sm text-muted-foreground">Rows per page</span>
                    <Select
                      value={String(histLimit)}
                      onValueChange={(val) => {
                        const newLimit = Number(val)
                        setHistLimit(newLimit)
                        setHistPage(1)
                        fetchData(startDate, endDate, 1, newLimit)
                      }}
                    >
                      <SelectTrigger className="h-8 w-[70px]">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {[10, 20, 30, 50, 100].map(n => (
                          <SelectItem key={n} value={String(n)}>{n}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Button
                    variant="outline" size="sm"
                    onClick={() => fetchData(startDate, endDate, history.page - 1)}
                    disabled={history.page <= 1 || loading}
                  >
                    <ChevronLeft className="h-3.5 w-3.5" />
                  </Button>
                  <span className="text-sm text-muted-foreground">
                    {history.page} / {Math.ceil(history.total / history.limit)}
                  </span>
                  <Button
                    variant="outline" size="sm"
                    onClick={() => fetchData(startDate, endDate, history.page + 1)}
                    disabled={history.page >= Math.ceil(history.total / history.limit) || loading}
                  >
                    <ChevronRight className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </div>
            )}
          </Card>
        )}

      </div>
    </div>
  )
}
