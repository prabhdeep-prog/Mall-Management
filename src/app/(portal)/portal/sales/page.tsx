"use client"

import * as React from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import {
  BarChart,
  Bar,
  PieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from "recharts"
import {
  BarChart2,
  TrendingUp,
  ShoppingCart,
  IndianRupee,
  Loader2,
  AlertCircle,
  RefreshCw,
  Calendar,
} from "lucide-react"
import { formatCurrency, formatDate } from "@/lib/utils/index"

// ── Types ────────────────────────────────────────────────────────────────────

interface DailyTotal {
  date: string
  grossAmount: number
  netAmount: number
  txCount: number
  avgTicket: number
}

interface PaymentMethodBreakdown {
  paymentMode: string
  grossAmount: number
  netAmount: number
  txCount: number
  avgTicket: number
}

interface SalesData {
  dailyTotals: DailyTotal[]
  transactionCount: number
  avgTicketSize: number
  paymentMethodBreakdown: PaymentMethodBreakdown[]
  filters: {
    from: string
    to: string
    paymentMode: string | null
    category: string | null
  }
}

// ── Constants ────────────────────────────────────────────────────────────────

const PIE_COLORS: Record<string, string> = {
  card:    "#6366f1",
  upi:     "#22c55e",
  cash:    "#f59e0b",
  wallet:  "#ec4899",
  unknown: "#94a3b8",
}

const METHOD_LABELS: Record<string, string> = {
  card: "Card", upi: "UPI", cash: "Cash", wallet: "Wallet", unknown: "Other",
}

const HOURS = Array.from({ length: 24 }, (_, i) => i)
const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]

function rangeDefaults(preset: string): { from: string; to: string } {
  const now = new Date()
  const to = now.toISOString().split("T")[0]
  const days = preset === "7d" ? 7 : preset === "90d" ? 90 : 30
  const from = new Date(now.getTime() - days * 24 * 60 * 60 * 1000)
    .toISOString().split("T")[0]
  return { from, to }
}

// ── Component ────────────────────────────────────────────────────────────────

export default function TenantSalesPage() {
  const [data, setData]             = React.useState<SalesData | null>(null)
  const [isLoading, setIsLoading]   = React.useState(true)
  const [rangePreset, setRangePreset] = React.useState("30d")
  const [methodFilter, setMethodFilter] = React.useState("all")
  const [categoryFilter, setCategoryFilter] = React.useState("")

  const load = React.useCallback(() => {
    setIsLoading(true)
    const { from, to } = rangeDefaults(rangePreset)
    const params = new URLSearchParams({ from, to })
    if (methodFilter !== "all") params.set("payment_mode", methodFilter)
    if (categoryFilter) params.set("category", categoryFilter)

    fetch(`/api/tenant/sales?${params}`)
      .then((r) => r.json())
      .then((res) => setData(res.data ?? null))
      .finally(() => setIsLoading(false))
  }, [rangePreset, methodFilter, categoryFilter])

  React.useEffect(() => { load() }, [load])

  const daily     = data?.dailyTotals ?? []
  const totalGross = daily.reduce((s, d) => s + d.grossAmount, 0)
  const totalNet   = daily.reduce((s, d) => s + d.netAmount, 0)
  const totalTxns  = data?.transactionCount ?? 0
  const avgTicket  = data?.avgTicketSize ?? 0

  const chartData = [...daily]
    .sort((a, b) => a.date.localeCompare(b.date))
    .map((d) => ({
      date:  new Date(d.date).toLocaleDateString("en-IN", { day: "2-digit", month: "short" }),
      gross: d.grossAmount,
      net:   d.netAmount,
    }))

  // Heatmap: build from daily totals (date → dayOfWeek + distribute across hours as approximation)
  const heatmapData = React.useMemo(() => {
    const grid: number[][] = DAYS.map(() => HOURS.map(() => 0))
    for (const d of daily) {
      const dow = new Date(d.date).getDay()
      const dayIdx = dow === 0 ? 6 : dow - 1 // Mon=0..Sun=6
      // Distribute transactions evenly across business hours (10-22) as approximation
      const hoursActive = 12
      const perHour = d.txCount / hoursActive
      for (let h = 10; h < 22; h++) {
        grid[dayIdx][h] += perHour
      }
    }
    return grid
  }, [daily])

  const maxHeat = React.useMemo(
    () => Math.max(1, ...heatmapData.flat()),
    [heatmapData],
  )

  return (
    <div className="space-y-6">
      {/* Header + filters */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Sales Analytics</h1>
          <p className="text-sm text-muted-foreground mt-1">POS transaction insights</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Select value={rangePreset} onValueChange={setRangePreset}>
            <SelectTrigger className="w-36">
              <Calendar className="mr-2 h-3.5 w-3.5" />
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="7d">Last 7 days</SelectItem>
              <SelectItem value="30d">Last 30 days</SelectItem>
              <SelectItem value="90d">Last 90 days</SelectItem>
            </SelectContent>
          </Select>
          <Select value={methodFilter} onValueChange={setMethodFilter}>
            <SelectTrigger className="w-32">
              <SelectValue placeholder="Method" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All methods</SelectItem>
              <SelectItem value="card">Card</SelectItem>
              <SelectItem value="upi">UPI</SelectItem>
              <SelectItem value="cash">Cash</SelectItem>
              <SelectItem value="wallet">Wallet</SelectItem>
            </SelectContent>
          </Select>
          <Input
            placeholder="Category…"
            className="w-32"
            value={categoryFilter}
            onChange={(e) => setCategoryFilter(e.target.value)}
          />
          <Button variant="outline" size="icon" onClick={load} disabled={isLoading}>
            <RefreshCw className={`h-4 w-4 ${isLoading ? "animate-spin" : ""}`} />
          </Button>
        </div>
      </div>

      {/* KPI cards */}
      <div className="grid grid-cols-2 gap-4 xl:grid-cols-4">
        {[
          { label: "Gross Sales",  value: formatCurrency(totalGross), icon: IndianRupee  },
          { label: "Net Sales",    value: formatCurrency(totalNet),   icon: TrendingUp   },
          { label: "Transactions", value: totalTxns.toLocaleString(), icon: ShoppingCart },
          { label: "Avg Ticket",   value: formatCurrency(avgTicket),  icon: BarChart2    },
        ].map(({ label, value, icon: Icon }) => (
          <Card key={label}>
            <CardHeader className="flex flex-row items-center justify-between pb-1">
              <CardTitle className="text-xs font-medium text-muted-foreground uppercase tracking-wide">{label}</CardTitle>
              <Icon className="h-3.5 w-3.5 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <p className="text-xl font-bold">{isLoading ? "—" : value}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Charts row: Daily sales + Payment method pie */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        {/* Daily sales bar chart */}
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="text-base font-semibold">Daily Sales Trend</CardTitle>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="flex h-56 items-center justify-center">
                <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
              </div>
            ) : chartData.length === 0 ? (
              <div className="flex h-56 flex-col items-center justify-center text-muted-foreground">
                <BarChart2 className="h-8 w-8 mb-2 opacity-40" />
                <p className="text-sm">No sales data for this period</p>
              </div>
            ) : (
              <ResponsiveContainer width="100%" height={240}>
                <BarChart data={chartData} margin={{ top: 0, right: 0, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis
                    dataKey="date"
                    tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }}
                    tickLine={false} axisLine={false} interval="preserveStartEnd"
                  />
                  <YAxis
                    tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }}
                    tickLine={false} axisLine={false}
                    tickFormatter={(v) => `₹${(v / 1000).toFixed(0)}k`}
                  />
                  <Tooltip
                    formatter={(value: number) => [formatCurrency(value), ""]}
                    contentStyle={{
                      background: "hsl(var(--background))",
                      border: "1px solid hsl(var(--border))",
                      borderRadius: "6px", fontSize: 12,
                    }}
                  />
                  <Bar dataKey="gross" name="Gross" fill="hsl(var(--primary))" opacity={0.3} radius={[2, 2, 0, 0]} />
                  <Bar dataKey="net"   name="Net"   fill="hsl(var(--primary))"              radius={[2, 2, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>

        {/* Payment method pie */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base font-semibold">Payment Methods</CardTitle>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="flex h-56 items-center justify-center">
                <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
              </div>
            ) : !data?.paymentMethodBreakdown?.length ? (
              <div className="flex h-56 flex-col items-center justify-center text-muted-foreground">
                <AlertCircle className="h-6 w-6 mb-2 opacity-40" />
                <p className="text-sm">No data</p>
              </div>
            ) : (
              <ResponsiveContainer width="100%" height={240}>
                <PieChart>
                  <Pie
                    data={data.paymentMethodBreakdown}
                    dataKey="netAmount"
                    nameKey="paymentMode"
                    cx="50%" cy="50%"
                    outerRadius={80} innerRadius={45}
                    paddingAngle={2}
                  >
                    {data.paymentMethodBreakdown.map((entry) => (
                      <Cell key={entry.paymentMode} fill={PIE_COLORS[entry.paymentMode] ?? PIE_COLORS.unknown} />
                    ))}
                  </Pie>
                  <Tooltip
                    formatter={(value: number, name: string) => [
                      formatCurrency(value),
                      METHOD_LABELS[name] ?? name,
                    ]}
                    contentStyle={{
                      background: "hsl(var(--background))",
                      border: "1px solid hsl(var(--border))",
                      borderRadius: "6px", fontSize: 12,
                    }}
                  />
                  <Legend
                    formatter={(value: string) => (
                      <span className="text-xs text-muted-foreground">
                        {METHOD_LABELS[value] ?? value}
                      </span>
                    )}
                  />
                </PieChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Hourly heatmap */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base font-semibold">Hourly Activity Heatmap</CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex h-48 items-center justify-center">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          ) : daily.length === 0 ? (
            <div className="flex h-48 flex-col items-center justify-center text-muted-foreground">
              <BarChart2 className="h-6 w-6 mb-2 opacity-40" />
              <p className="text-sm">No data to display</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <div className="min-w-[600px]">
                {/* Hour labels */}
                <div className="flex">
                  <div className="w-10 flex-shrink-0" />
                  {HOURS.map((h) => (
                    <div key={h} className="flex-1 text-center text-[10px] text-muted-foreground pb-1">
                      {h % 3 === 0 ? `${h}:00` : ""}
                    </div>
                  ))}
                </div>
                {/* Grid */}
                {DAYS.map((day, di) => (
                  <div key={day} className="flex items-center">
                    <div className="w-10 flex-shrink-0 text-xs text-muted-foreground pr-2 text-right">{day}</div>
                    {HOURS.map((h) => {
                      const intensity = heatmapData[di][h] / maxHeat
                      return (
                        <div
                          key={h}
                          className="flex-1 aspect-square m-[1px] rounded-sm"
                          style={{
                            backgroundColor: intensity > 0
                              ? `rgba(34, 197, 94, ${0.1 + intensity * 0.8})`
                              : "hsl(var(--muted))",
                          }}
                          title={`${day} ${h}:00 — ~${Math.round(heatmapData[di][h])} txns`}
                        />
                      )
                    })}
                  </div>
                ))}
                {/* Legend */}
                <div className="flex items-center justify-end gap-1 mt-2">
                  <span className="text-[10px] text-muted-foreground mr-1">Low</span>
                  {[0.1, 0.3, 0.5, 0.7, 0.9].map((o) => (
                    <div
                      key={o}
                      className="h-3 w-3 rounded-sm"
                      style={{ backgroundColor: `rgba(34, 197, 94, ${o})` }}
                    />
                  ))}
                  <span className="text-[10px] text-muted-foreground ml-1">High</span>
                </div>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Daily breakdown table */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base font-semibold">Daily Breakdown</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="flex h-32 items-center justify-center">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          ) : daily.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-10 text-muted-foreground">
              <AlertCircle className="h-6 w-6 mb-2 opacity-40" />
              <p className="text-sm">No data</p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead className="text-right">Gross</TableHead>
                  <TableHead className="text-right">Net</TableHead>
                  <TableHead className="text-right">Txns</TableHead>
                  <TableHead className="text-right">Avg Ticket</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {[...daily]
                  .sort((a, b) => b.date.localeCompare(a.date))
                  .map((d) => (
                    <TableRow key={d.date}>
                      <TableCell className="text-sm">{formatDate(d.date)}</TableCell>
                      <TableCell className="text-right text-sm">{formatCurrency(d.grossAmount)}</TableCell>
                      <TableCell className="text-right font-medium">{formatCurrency(d.netAmount)}</TableCell>
                      <TableCell className="text-right text-sm text-muted-foreground">{d.txCount}</TableCell>
                      <TableCell className="text-right text-sm text-muted-foreground">{formatCurrency(d.avgTicket)}</TableCell>
                    </TableRow>
                  ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
