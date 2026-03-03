"use client"

/**
 * Revenue Intelligence Dashboard
 * ─────────────────────────────────────────────────────────────────────────────
 * Displays mall-wide revenue KPIs with:
 *   • Summary cards (total sales, MG adherence, YoY trend, anomalies)
 *   • Heatmap calendar (daily sales intensity)
 *   • Tenant leaderboard (sales/sqft, above/below MG)
 *   • Zone/Floor breakdown
 *   • Date range picker
 */

import * as React from "react"
import { cn } from "@/lib/utils"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import {
  TrendingUp,
  TrendingDown,
  Minus,
  AlertTriangle,
  IndianRupee,
  Users,
  BarChart2,
  MapPin,
  Calendar,
  RefreshCw,
  CheckCircle,
} from "lucide-react"

// ── Types (subset of what the API returns) ────────────────────────────────────

interface CalendarDay {
  date:      string
  sales:     number
  intensity: number
}

interface TenantKPI {
  tenantId:         string
  tenantName:       string
  shopName:         string
  zone:             string | null
  floor:            string | null
  areaSqft:         number | null
  grossSales:       number
  netSales:         number
  transactionCount: number
  avgTicketSize:    number | null
  salesPerSqft:     number | null
  amountDue:        number
  minimumGuarantee: number
  excessOverMG:     number
  isAboveMG:        boolean
  grossSalesYoY:    number | null
  yoyGrowthPct:     number | null
  yoyTrend:         "up" | "down" | "flat" | "new"
  anomalyFlag:      string | null
}

interface ZoneKPI {
  zone:            string
  floor:           string | null
  tenantCount:     number
  grossSales:      number
  totalAreaSqft:   number | null
  salesPerSqft:    number | null
  topTenant:       string | null
  avgYoyGrowthPct: number | null
}

interface PageData {
  period:             { startDate: string; endDate: string }
  periodDays:         number
  totalGrossSales:    number
  totalNetSales:      number
  totalTransactions:  number
  totalAmountDue:     number
  totalExcessOverMG:  number
  tenantsAboveMG:     number
  tenantsBelowMG:     number
  totalFootfall:      number | null
  conversionRate:     number | null
  avgSalesPerSqft:    number | null
  totalOccupiedSqft:  number | null
  yoyGrowthPct:       number | null
  yoyGrossSalesPrior: number | null
  byTenant:           TenantKPI[]
  byZone:             ZoneKPI[]
  anomalyCount:       number
  anomalies:          Array<{ tenantId: string; tenantName: string; flag: string }>
  heatmap?:           CalendarDay[]
  _tenantCount?:      number
}

// ── Formatters ────────────────────────────────────────────────────────────────

const fmtCompact = new Intl.NumberFormat("en-IN", {
  notation:           "compact",
  style:              "currency",
  currency:           "INR",
  maximumFractionDigits: 1,
})
const fmtNum  = (n: number) => new Intl.NumberFormat("en-IN").format(Math.round(n))
const fmtCmpct = (n: number) => fmtCompact.format(n)
const fmtPct  = (n: number | null) =>
  n == null ? "—" : `${n > 0 ? "+" : ""}${n.toFixed(1)}%`

// ── Preset ranges ─────────────────────────────────────────────────────────────

function thisMonth() {
  const d = new Date()
  const y = d.getFullYear(), m = String(d.getMonth() + 1).padStart(2, "0")
  const end = new Date(); end.setDate(end.getDate() - 1)
  return { startDate: `${y}-${m}-01`, endDate: end.toISOString().slice(0, 10) }
}
function lastMonth() {
  const d = new Date(); d.setDate(1); d.setMonth(d.getMonth() - 1)
  const y = d.getFullYear(), m = String(d.getMonth() + 1).padStart(2, "0")
  const last = new Date(y, d.getMonth() + 1, 0)
  return { startDate: `${y}-${m}-01`, endDate: last.toISOString().slice(0, 10) }
}
function lastNDays(n: number) {
  const end = new Date(); end.setDate(end.getDate() - 1)
  const start = new Date(); start.setDate(start.getDate() - n)
  return { startDate: start.toISOString().slice(0, 10), endDate: end.toISOString().slice(0, 10) }
}

// ── Heatmap component ─────────────────────────────────────────────────────────

const INTENSITY = [
  "bg-muted",
  "bg-emerald-100 dark:bg-emerald-900/30",
  "bg-emerald-200 dark:bg-emerald-800/50",
  "bg-emerald-400 dark:bg-emerald-600",
  "bg-emerald-600 dark:bg-emerald-400",
]

function SalesHeatmap({ days }: { days: CalendarDay[] }) {
  if (!days.length) {
    return (
      <p className="text-sm text-muted-foreground py-6 text-center">
        No daily sales data for this period
      </p>
    )
  }
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-1">
        {days.map((d) => (
          <div
            key={d.date}
            title={`${d.date}: ${fmtCompact.format(d.sales)}`}
            className={cn("h-5 w-5 rounded-sm", INTENSITY[d.intensity] ?? INTENSITY[0])}
          />
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

// ── KPI card ──────────────────────────────────────────────────────────────────

function KPICard({
  title, value, sub, trend, icon: Icon, accent,
}: {
  title:   string
  value:   string
  sub?:    string
  trend?:  "up" | "down" | "flat" | null
  icon:    React.ElementType
  accent?: "amber" | "emerald" | "default"
}) {
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <CardTitle className="text-sm font-medium text-muted-foreground">{title}</CardTitle>
        <Icon className={cn(
          "h-4 w-4",
          accent === "amber"   ? "text-amber-500" :
          accent === "emerald" ? "text-emerald-500" :
          "text-muted-foreground",
        )} />
      </CardHeader>
      <CardContent>
        <div className="text-2xl font-bold">{value}</div>
        {sub && (
          <p className={cn(
            "mt-1 text-xs flex items-center gap-1",
            trend === "up"   ? "text-emerald-600 dark:text-emerald-400" :
            trend === "down" ? "text-red-600 dark:text-red-400" :
            "text-muted-foreground",
          )}>
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

// ── Main page ─────────────────────────────────────────────────────────────────

export default function RevenueIntelligencePage() {
  const [range,   setRange]   = React.useState(lastMonth)
  const [preset,  setPreset]  = React.useState("lastMonth")
  const [data,    setData]    = React.useState<PageData | null>(null)
  const [loading, setLoading] = React.useState(true)
  const [error,   setError]   = React.useState<string | null>(null)

  const fetchData = React.useCallback(async () => {
    setLoading(true); setError(null)
    try {
      const params = new URLSearchParams({
        startDate: range.startDate,
        endDate:   range.endDate,
        heatmap:   "true",
      })
      const res = await fetch(`/api/revenue-intelligence?${params}`)
      if (!res.ok) throw new Error(await res.text())
      setData(await res.json() as PageData)
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load")
    } finally {
      setLoading(false)
    }
  }, [range])

  React.useEffect(() => { void fetchData() }, [fetchData])

  function applyPreset(p: string) {
    setPreset(p)
    setRange(
      p === "lastMonth" ? lastMonth() :
      p === "last7"     ? lastNDays(7) :
      p === "last30"    ? lastNDays(30) :
      p === "last90"    ? lastNDays(90) :
      thisMonth()
    )
  }

  const yoyTrend: "up" | "down" | "flat" | null = data?.yoyGrowthPct != null
    ? data.yoyGrowthPct > 2 ? "up" : data.yoyGrowthPct < -2 ? "down" : "flat"
    : null

  return (
    <div className="space-y-6">

      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Revenue Intelligence</h1>
          <p className="text-sm text-muted-foreground">
            MG billing · YoY comparisons · Anomaly detection
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Select value={preset} onValueChange={applyPreset}>
            <SelectTrigger className="h-8 w-36 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="thisMonth">This month</SelectItem>
              <SelectItem value="lastMonth">Last month</SelectItem>
              <SelectItem value="last7">Last 7 days</SelectItem>
              <SelectItem value="last30">Last 30 days</SelectItem>
              <SelectItem value="last90">Last 90 days</SelectItem>
            </SelectContent>
          </Select>

          <input
            type="date"
            value={range.startDate}
            onChange={(e) => setRange((r) => ({ ...r, startDate: e.target.value }))}
            className="h-8 rounded-md border bg-background px-2 text-xs"
          />
          <span className="text-xs text-muted-foreground">to</span>
          <input
            type="date"
            value={range.endDate}
            onChange={(e) => setRange((r) => ({ ...r, endDate: e.target.value }))}
            className="h-8 rounded-md border bg-background px-2 text-xs"
          />

          <Button
            variant="outline"
            size="sm"
            onClick={fetchData}
            disabled={loading}
            className="h-8 w-8 p-0"
          >
            <RefreshCw className={cn("h-3.5 w-3.5", loading && "animate-spin")} />
          </Button>
        </div>
      </div>

      {/* ── Error ──────────────────────────────────────────────────────────── */}
      {error && (
        <div className="rounded-lg border border-destructive/30 bg-destructive/10 p-4 text-sm text-destructive">
          {error}
        </div>
      )}

      {/* ── KPI cards ──────────────────────────────────────────────────────── */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <KPICard
          title="Total Gross Sales"
          value={data ? fmtCmpct(data.totalGrossSales) : "—"}
          sub={data?.yoyGrowthPct != null ? `${fmtPct(data.yoyGrowthPct)} vs last year` : undefined}
          trend={yoyTrend}
          icon={IndianRupee}
        />
        <KPICard
          title="MG Billing (Amount Due)"
          value={data ? fmtCmpct(data.totalAmountDue) : "—"}
          sub={data ? `${data.tenantsAboveMG} tenants above MG floor` : undefined}
          icon={CheckCircle}
          accent="emerald"
        />
        <KPICard
          title="Avg Sales / sqft"
          value={data?.avgSalesPerSqft != null ? `₹${fmtNum(data.avgSalesPerSqft)}` : "—"}
          sub={data?.totalOccupiedSqft ? `${fmtNum(data.totalOccupiedSqft)} sqft GLA` : undefined}
          icon={BarChart2}
        />
        <KPICard
          title={data?.anomalyCount ? "Anomalies Detected" : "Data Quality"}
          value={loading ? "…" : data?.anomalyCount ? String(data.anomalyCount) : "Clean"}
          sub={data?.anomalyCount ? "Review flagged tenants below" : "All POS feeds reporting"}
          icon={AlertTriangle}
          accent={data?.anomalyCount ? "amber" : "emerald"}
        />
      </div>

      {/* ── Secondary stats ─────────────────────────────────────────────────── */}
      <div className="grid gap-4 sm:grid-cols-3">
        <Card>
          <CardContent className="pt-4 space-y-2">
            {[
              ["Transactions",      data ? fmtNum(data.totalTransactions) : "—"],
              ["Footfall",          data?.totalFootfall ? fmtNum(data.totalFootfall) : "—"],
              ["Conversion Rate",   data?.conversionRate ? `${data.conversionRate.toFixed(1)}%` : "—"],
            ].map(([label, val]) => (
              <div key={label} className="flex justify-between text-sm">
                <span className="text-muted-foreground">{label}</span>
                <span className="font-medium">{val}</span>
              </div>
            ))}
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-4 space-y-2">
            {[
              ["Excess Over MG",     data ? fmtCmpct(data.totalExcessOverMG) : "—"],
              ["Above MG",           data ? `${data.tenantsAboveMG} tenants` : "—"],
              ["At MG Floor",        data ? `${data.tenantsBelowMG} tenants` : "—"],
            ].map(([label, val]) => (
              <div key={label} className="flex justify-between text-sm">
                <span className="text-muted-foreground">{label}</span>
                <span className="font-medium">{val}</span>
              </div>
            ))}
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-4 space-y-2">
            {[
              ["Period",             data ? `${data.periodDays} days` : "—"],
              ["YoY Growth",         data ? fmtPct(data.yoyGrowthPct) : "—"],
              ["Prior Year Sales",   data?.yoyGrossSalesPrior ? fmtCmpct(data.yoyGrossSalesPrior) : "—"],
            ].map(([label, val]) => (
              <div key={label} className="flex justify-between text-sm">
                <span className="text-muted-foreground">{label}</span>
                <span className="font-medium">{val}</span>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>

      {/* ── Anomaly banner ─────────────────────────────────────────────────── */}
      {(data?.anomalies?.length ?? 0) > 0 && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 dark:bg-amber-950/20 p-4">
          <div className="flex items-center gap-2 mb-2">
            <AlertTriangle className="h-4 w-4 text-amber-600" />
            <span className="text-sm font-semibold text-amber-800 dark:text-amber-400">
              {data!.anomalyCount} anomal{data!.anomalyCount === 1 ? "y" : "ies"} detected
            </span>
          </div>
          <ul className="space-y-1">
            {data!.anomalies.slice(0, 5).map((a) => (
              <li key={a.tenantId} className="text-xs text-amber-700 dark:text-amber-300">
                <span className="font-medium">{a.tenantName}:</span> {a.flag}
              </li>
            ))}
            {data!.anomalies.length > 5 && (
              <li className="text-xs text-amber-600">+{data!.anomalies.length - 5} more</li>
            )}
          </ul>
        </div>
      )}

      {/* ── Tabs ───────────────────────────────────────────────────────────── */}
      <Tabs defaultValue="tenants">
        <TabsList>
          <TabsTrigger value="heatmap">
            <Calendar className="mr-1.5 h-3.5 w-3.5" />
            Heatmap
          </TabsTrigger>
          <TabsTrigger value="tenants">
            <Users className="mr-1.5 h-3.5 w-3.5" />
            Tenants
          </TabsTrigger>
          <TabsTrigger value="zones">
            <MapPin className="mr-1.5 h-3.5 w-3.5" />
            Zones
          </TabsTrigger>
        </TabsList>

        {/* Heatmap */}
        <TabsContent value="heatmap" className="mt-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Daily Sales Calendar</CardTitle>
            </CardHeader>
            <CardContent>
              {loading
                ? <div className="flex h-24 items-center justify-center"><RefreshCw className="h-5 w-5 animate-spin text-muted-foreground" /></div>
                : <SalesHeatmap days={data?.heatmap ?? []} />
              }
            </CardContent>
          </Card>
        </TabsContent>

        {/* Tenant leaderboard */}
        <TabsContent value="tenants" className="mt-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">
                Tenant Leaderboard
                {(data?._tenantCount ?? 0) > 50 && (
                  <span className="ml-2 text-xs font-normal text-muted-foreground">
                    top 50 of {data!._tenantCount}
                  </span>
                )}
              </CardTitle>
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
                    <TableRow><TableCell colSpan={7} className="py-12 text-center">
                      <RefreshCw className="h-5 w-5 animate-spin mx-auto text-muted-foreground" />
                    </TableCell></TableRow>
                  ) : !(data?.byTenant?.length) ? (
                    <TableRow><TableCell colSpan={7} className="py-12 text-center text-muted-foreground">
                      No tenant data for this period
                    </TableCell></TableRow>
                  ) : data.byTenant.map((t) => (
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
                      <TableCell className="text-right font-mono text-sm">{fmtCmpct(t.grossSales)}</TableCell>
                      <TableCell className="text-right text-sm">
                        {t.salesPerSqft != null ? `₹${fmtNum(t.salesPerSqft)}` : "—"}
                      </TableCell>
                      <TableCell className="text-right font-mono text-sm">{fmtCmpct(t.amountDue)}</TableCell>
                      <TableCell className="text-right">
                        {t.isAboveMG
                          ? <Badge className="bg-emerald-100 text-emerald-700 border-emerald-200 text-xs">Above MG</Badge>
                          : <Badge variant="outline" className="text-muted-foreground text-xs">MG Floor</Badge>
                        }
                      </TableCell>
                      <TableCell className="text-right">
                        {t.yoyTrend === "new"
                          ? <span className="text-xs text-muted-foreground">New</span>
                          : <span className={cn(
                              "text-xs flex items-center justify-end gap-0.5",
                              t.yoyTrend === "up"   ? "text-emerald-600" :
                              t.yoyTrend === "down" ? "text-red-600" : "text-muted-foreground"
                            )}>
                              {t.yoyTrend === "up"   && <TrendingUp   className="h-3 w-3" />}
                              {t.yoyTrend === "down" && <TrendingDown  className="h-3 w-3" />}
                              {t.yoyTrend === "flat" && <Minus         className="h-3 w-3" />}
                              {fmtPct(t.yoyGrowthPct)}
                            </span>
                        }
                      </TableCell>
                      <TableCell className="text-right">
                        {t.anomalyFlag
                          ? <span title={t.anomalyFlag}><AlertTriangle className="h-3.5 w-3.5 text-amber-500 ml-auto" /></span>
                          : <CheckCircle   className="h-3.5 w-3.5 text-emerald-500 ml-auto" />
                        }
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Zone breakdown */}
        <TabsContent value="zones" className="mt-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Zone & Floor Performance</CardTitle>
            </CardHeader>
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
                    <TableRow><TableCell colSpan={7} className="py-12 text-center">
                      <RefreshCw className="h-5 w-5 animate-spin mx-auto text-muted-foreground" />
                    </TableCell></TableRow>
                  ) : !(data?.byZone?.length) ? (
                    <TableRow><TableCell colSpan={7} className="py-12 text-center text-muted-foreground">
                      No zone data. Assign zones to tenants in Properties.
                    </TableCell></TableRow>
                  ) : data.byZone.map((z, i) => (
                    <TableRow key={i} className="hover:bg-muted/50">
                      <TableCell className="font-medium text-sm capitalize">{z.zone}</TableCell>
                      <TableCell className="text-sm text-muted-foreground uppercase">{z.floor ?? "All"}</TableCell>
                      <TableCell className="text-right text-sm">{z.tenantCount}</TableCell>
                      <TableCell className="text-right font-mono text-sm">{fmtCmpct(z.grossSales)}</TableCell>
                      <TableCell className="text-right text-sm">
                        {z.salesPerSqft != null ? `₹${fmtNum(z.salesPerSqft)}` : "—"}
                      </TableCell>
                      <TableCell className="text-right text-sm">
                        {z.avgYoyGrowthPct != null
                          ? <span className={cn(z.avgYoyGrowthPct > 0 ? "text-emerald-600" : "text-red-600")}>
                              {fmtPct(z.avgYoyGrowthPct)}
                            </span>
                          : "—"
                        }
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

      {/* ── Formula reference ──────────────────────────────────────────────── */}
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
