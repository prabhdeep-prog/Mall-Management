"use client"

import * as React from "react"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  TrendingUp,
  TrendingDown,
  Calendar,
  Download,
  RefreshCw,
  DollarSign,
  Building2,
  Footprints,
  Target,
  BarChart3,
  Users,
  FileText,
  Loader2,
} from "lucide-react"
import { cn, formatCurrency } from "@/lib/utils"
import { usePropertyStore } from "@/stores/property-store"
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts"

function EmptyChartState({ title, description }: { title: string; description: string }) {
  return (
    <div className="flex h-[300px] flex-col items-center justify-center text-center">
      <BarChart3 className="h-12 w-12 text-muted-foreground/30" />
      <p className="mt-4 text-sm font-medium text-muted-foreground">{title}</p>
      <p className="mt-1 max-w-[250px] text-xs text-muted-foreground/70">{description}</p>
    </div>
  )
}

function MetricCard({
  title,
  value,
  change,
  trend,
  icon: Icon,
  subtitle,
}: {
  title: string
  value: string
  change: string
  trend: "up" | "down" | "neutral"
  icon: React.ElementType
  subtitle?: string
}) {
  return (
    <Card>
      <CardContent className="p-6">
        <div className="flex items-center justify-between">
          <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-gradient-to-br from-emerald-500 to-teal-600 text-white shadow-lg">
            <Icon className="h-6 w-6" />
          </div>
          <Badge
            variant={trend === "up" ? "success" : trend === "down" ? "destructive" : "secondary"}
            className="gap-1"
          >
            {trend === "up" ? (
              <TrendingUp className="h-3 w-3" />
            ) : trend === "down" ? (
              <TrendingDown className="h-3 w-3" />
            ) : null}
            {change}
          </Badge>
        </div>
        <div className="mt-4">
          <p className="text-sm text-muted-foreground">{title}</p>
          <p className="text-2xl font-bold">{value}</p>
          {subtitle && <p className="text-xs text-muted-foreground">{subtitle}</p>}
        </div>
      </CardContent>
    </Card>
  )
}

const CATEGORY_COLORS: Record<string, string> = {
  fashion: "#ec4899",
  food_beverage: "#f97316",
  electronics: "#3b82f6",
  entertainment: "#a855f7",
  services: "#22c55e",
  health_beauty: "#14b8a6",
  home_lifestyle: "#eab308",
  jewelry: "#f43f5e",
  sports: "#6366f1",
  books_stationery: "#64748b",
}

const CATEGORY_LABELS: Record<string, string> = {
  fashion: "Fashion",
  food_beverage: "F&B",
  electronics: "Electronics",
  entertainment: "Entertainment",
  services: "Services",
  health_beauty: "Health & Beauty",
  home_lifestyle: "Home & Lifestyle",
  jewelry: "Jewelry",
  sports: "Sports",
  books_stationery: "Books",
}

const TIME_RANGE_TO_DAYS: Record<string, number> = {
  "7d": 7,
  "30d": 30,
  "3m": 90,
  "6m": 180,
  "1y": 365,
}

interface AnalyticsData {
  revenue: {
    total: number
    trend: number
    dailyChart: { date: string; grossSales: number; transactions: number }[]
  }
  tenants: {
    total: number
    byCategory: { category: string; count: number }[]
  }
  leases: {
    total: number
    active: number
    occupancyRate: number
  }
  posConnected: number
  totalTransactions: number
}

export default function AnalyticsPage() {
  const [timeRange, setTimeRange] = React.useState("30d")
  const [isLoading, setIsLoading] = React.useState(true)
  const [data, setData] = React.useState<AnalyticsData | null>(null)
  const { selectedProperty } = usePropertyStore()

  const fetchData = React.useCallback(async () => {
    setIsLoading(true)
    try {
      const days = TIME_RANGE_TO_DAYS[timeRange] || 30
      const endDate = new Date(); endDate.setDate(endDate.getDate() - 1)
      const startDate = new Date(); startDate.setDate(startDate.getDate() - days)
      const startStr = startDate.toISOString().slice(0, 10)
      const endStr = endDate.toISOString().slice(0, 10)
      const propParam = selectedProperty ? `&propertyId=${selectedProperty.id}` : ""

      const [revRes, tenantsRes, leasesRes] = await Promise.all([
        fetch(`/api/analytics/revenue?startDate=${startStr}&endDate=${endStr}&period=day${propParam}`),
        fetch(`/api/tenants${selectedProperty ? `?propertyId=${selectedProperty.id}` : ""}`),
        fetch(`/api/leases${selectedProperty ? `?propertyId=${selectedProperty.id}` : ""}`),
      ])

      const revJson = revRes.ok ? await revRes.json() : null
      const tenantsData = tenantsRes.ok ? await tenantsRes.json() : null
      const leasesData = leasesRes.ok ? await leasesRes.json() : null

      const tenantsList = tenantsData?.data || tenantsData || []
      const leasesList = leasesData?.data || leasesData || []
      const activeLeases = leasesList.filter((l: any) => l.status === "active")

      // Category distribution from tenants
      const catMap: Record<string, number> = {}
      tenantsList.forEach((t: any) => {
        const cat = t.category || "other"
        catMap[cat] = (catMap[cat] || 0) + 1
      })
      const byCategory = Object.entries(catMap).map(([category, count]) => ({ category, count }))

      // /api/analytics/revenue returns { success: true, data: { kpis, trend, tenants, topTenants, ... } }
      const revData = revJson?.data
      const kpis = revData?.kpis
      const totalRevenue = kpis?.totalRevenue || 0
      const totalTxn = kpis?.totalTransactions || 0
      // Count tenants that actually have POS revenue
      const connectedStores = (revData?.tenants || []).filter((t: any) => t.revenue > 0).length

      // Map trend array { period, revenue, transactions } → dailyChart format
      const dailyChart = (revData?.trend || []).map((t: any) => ({
        date: t.period,
        grossSales: t.revenue,
        transactions: t.transactions,
      }))

      // Trend % comparing first-half vs second-half of the period
      let revTrend = 0
      if (dailyChart.length >= 4) {
        const mid = Math.floor(dailyChart.length / 2)
        const firstHalf = dailyChart.slice(0, mid).reduce((s: number, t: any) => s + t.grossSales, 0)
        const secondHalf = dailyChart.slice(mid).reduce((s: number, t: any) => s + t.grossSales, 0)
        if (firstHalf > 0) revTrend = Math.round(((secondHalf - firstHalf) / firstHalf) * 100)
      }

      setData({
        revenue: { total: totalRevenue, trend: revTrend, dailyChart },
        tenants: { total: tenantsList.length, byCategory },
        leases: {
          total: leasesList.length,
          active: activeLeases.length,
          occupancyRate: leasesList.length > 0 ? Math.round((activeLeases.length / leasesList.length) * 100) : 0,
        },
        posConnected: connectedStores,
        totalTransactions: totalTxn,
        // Store top tenants for Revenue by Tenant section
        _tenantRevenue: revData?.topTenants || [],
      } as any)
    } catch (error) {
      console.error("Error fetching analytics:", error)
    } finally {
      setIsLoading(false)
    }
  }, [timeRange, selectedProperty])

  React.useEffect(() => {
    fetchData()
  }, [fetchData])

  const revTrend = data?.revenue.trend || 0
  const revTrendDir: "up" | "down" | "neutral" = revTrend > 0 ? "up" : revTrend < 0 ? "down" : "neutral"

  return (
    <div className="space-y-6 p-6">
      {/* Header */}
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Analytics</h1>
          <p className="text-muted-foreground">
            Comprehensive insights across your properties
          </p>
        </div>
        <div className="flex items-center gap-3">
          <Select value={timeRange} onValueChange={setTimeRange}>
            <SelectTrigger className="w-[150px]">
              <Calendar className="mr-2 h-4 w-4" />
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="7d">Last 7 days</SelectItem>
              <SelectItem value="30d">Last 30 days</SelectItem>
              <SelectItem value="3m">Last 3 months</SelectItem>
              <SelectItem value="6m">Last 6 months</SelectItem>
              <SelectItem value="1y">Last year</SelectItem>
            </SelectContent>
          </Select>
          <Button variant="outline" className="gap-2" onClick={fetchData} disabled={isLoading}>
            <RefreshCw className={cn("h-4 w-4", isLoading && "animate-spin")} />
            Refresh
          </Button>
          <Button variant="outline" className="gap-2">
            <Download className="h-4 w-4" />
            Export
          </Button>
        </div>
      </div>

      {isLoading && !data ? (
        <div className="flex h-[400px] items-center justify-center">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      ) : (
        <>
          {/* Summary Cards */}
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
            <MetricCard
              title="Total POS Revenue"
              value={data ? formatCurrency(data.revenue.total) : "--"}
              change={data ? `${revTrend > 0 ? "+" : ""}${revTrend}%` : "--"}
              trend={revTrendDir}
              icon={DollarSign}
              subtitle={data ? `${data.posConnected} POS connected` : ""}
            />
            <MetricCard
              title="Active Leases"
              value={data ? `${data.leases.active}` : "--"}
              change={data ? `${data.leases.occupancyRate}%` : "--"}
              trend={data && data.leases.occupancyRate > 70 ? "up" : "neutral"}
              icon={Building2}
              subtitle={data ? `${data.leases.total} total leases` : ""}
            />
            <MetricCard
              title="Tenants"
              value={data ? `${data.tenants.total}` : "--"}
              change={data ? `${data.tenants.byCategory.length} categories` : "--"}
              trend="neutral"
              icon={Users}
              subtitle={selectedProperty ? selectedProperty.name : "All properties"}
            />
            <MetricCard
              title="Transactions"
              value={data ? `${data.totalTransactions.toLocaleString()}` : "--"}
              change={data && data.totalTransactions > 0 ? "Live" : "--"}
              trend={data && data.totalTransactions > 0 ? "up" : "neutral"}
              icon={Target}
              subtitle="POS verified"
            />
          </div>

          {/* Charts Row 1 */}
          <div className="grid gap-6 lg:grid-cols-2">
            {/* Revenue Trend */}
            <Card>
              <CardHeader>
                <CardTitle>Revenue Trend</CardTitle>
                <CardDescription>Daily POS-verified gross sales</CardDescription>
              </CardHeader>
              <CardContent>
                {data && data.revenue.dailyChart.length > 0 ? (
                  <ResponsiveContainer width="100%" height={300}>
                    <AreaChart data={data.revenue.dailyChart}>
                      <defs>
                        <linearGradient id="revenueGradient" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="#10b981" stopOpacity={0.3} />
                          <stop offset="95%" stopColor="#10b981" stopOpacity={0} />
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                      <XAxis
                        dataKey="date"
                        tickFormatter={(d) => {
                          const date = new Date(d)
                          return `${date.getDate()}/${date.getMonth() + 1}`
                        }}
                        className="text-xs"
                      />
                      <YAxis
                        tickFormatter={(v) => `${(v / 1000).toFixed(0)}k`}
                        className="text-xs"
                      />
                      <Tooltip
                        formatter={(value: number) => [formatCurrency(value), "Revenue"]}
                        labelFormatter={(d) => new Date(d).toLocaleDateString()}
                      />
                      <Area
                        type="monotone"
                        dataKey="grossSales"
                        stroke="#10b981"
                        strokeWidth={2}
                        fill="url(#revenueGradient)"
                      />
                    </AreaChart>
                  </ResponsiveContainer>
                ) : (
                  <EmptyChartState
                    title="No revenue data yet"
                    description="Connect tenants and POS systems to see revenue trends here"
                  />
                )}
              </CardContent>
            </Card>

            {/* Transactions Trend */}
            <Card>
              <CardHeader>
                <CardTitle>Daily Transactions</CardTitle>
                <CardDescription>POS transaction volume over time</CardDescription>
              </CardHeader>
              <CardContent>
                {data && data.revenue.dailyChart.length > 0 ? (
                  <ResponsiveContainer width="100%" height={300}>
                    <BarChart data={data.revenue.dailyChart}>
                      <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                      <XAxis
                        dataKey="date"
                        tickFormatter={(d) => {
                          const date = new Date(d)
                          return `${date.getDate()}/${date.getMonth() + 1}`
                        }}
                        className="text-xs"
                      />
                      <YAxis className="text-xs" />
                      <Tooltip
                        formatter={(value: number) => [value, "Transactions"]}
                        labelFormatter={(d) => new Date(d).toLocaleDateString()}
                      />
                      <Bar dataKey="transactions" fill="#6366f1" radius={[4, 4, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                ) : (
                  <EmptyChartState
                    title="No transaction data yet"
                    description="Add properties and leases to track transactions over time"
                  />
                )}
              </CardContent>
            </Card>
          </div>

          {/* Charts Row 2 */}
          <div className="grid gap-6 lg:grid-cols-3">
            {/* Revenue by Tenant */}
            <Card className="lg:col-span-2">
              <CardHeader>
                <CardTitle>Revenue by Tenant</CardTitle>
                <CardDescription>POS-verified revenue per connected tenant</CardDescription>
              </CardHeader>
              <CardContent>
                {data && data.revenue.total > 0 ? (
                  <div className="space-y-3">
                    {(data as any)._tenantRevenue?.map((t: any, i: number) => (
                      <div key={i} className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          <div className="h-3 w-3 rounded-full" style={{ backgroundColor: Object.values(CATEGORY_COLORS)[i % Object.values(CATEGORY_COLORS).length] }} />
                          <span className="text-sm font-medium">{t.name}</span>
                        </div>
                        <span className="text-sm font-bold">{formatCurrency(t.revenue ?? t.grossSales ?? 0)}</span>
                      </div>
                    )) || (
                      <p className="text-sm text-muted-foreground">Revenue data available on Revenue Intelligence page</p>
                    )}
                  </div>
                ) : (
                  <EmptyChartState
                    title="No revenue data yet"
                    description="Connect POS systems to see revenue breakdown by tenant"
                  />
                )}
              </CardContent>
            </Card>

            {/* Tenant Distribution */}
            <Card>
              <CardHeader>
                <CardTitle>Tenant Categories</CardTitle>
                <CardDescription>Distribution by business type</CardDescription>
              </CardHeader>
              <CardContent>
                {data && data.tenants.byCategory.length > 0 ? (
                  <div className="flex flex-col items-center">
                    <ResponsiveContainer width="100%" height={200}>
                      <PieChart>
                        <Pie
                          data={data.tenants.byCategory}
                          dataKey="count"
                          nameKey="category"
                          cx="50%"
                          cy="50%"
                          outerRadius={80}
                          innerRadius={40}
                        >
                          {data.tenants.byCategory.map((entry, i) => (
                            <Cell
                              key={entry.category}
                              fill={CATEGORY_COLORS[entry.category] || "#94a3b8"}
                            />
                          ))}
                        </Pie>
                        <Tooltip
                          formatter={(value: number, name: string) => [
                            value,
                            CATEGORY_LABELS[name] || name,
                          ]}
                        />
                      </PieChart>
                    </ResponsiveContainer>
                    <div className="mt-2 flex flex-wrap justify-center gap-2">
                      {data.tenants.byCategory.map((entry) => (
                        <div key={entry.category} className="flex items-center gap-1 text-xs">
                          <div
                            className="h-2 w-2 rounded-full"
                            style={{ backgroundColor: CATEGORY_COLORS[entry.category] || "#94a3b8" }}
                          />
                          <span>{CATEGORY_LABELS[entry.category] || entry.category}</span>
                          <span className="text-muted-foreground">({entry.count})</span>
                        </div>
                      ))}
                    </div>
                  </div>
                ) : (
                  <EmptyChartState
                    title="No tenant data yet"
                    description="Add tenants and assign categories to see distribution"
                  />
                )}
              </CardContent>
            </Card>
          </div>

          {/* Summary Row */}
          <div className="grid gap-6 lg:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle>Lease Overview</CardTitle>
                <CardDescription>Current lease status breakdown</CardDescription>
              </CardHeader>
              <CardContent>
                {data && data.leases.total > 0 ? (
                  <div className="space-y-4">
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-muted-foreground">Active Leases</span>
                      <span className="text-lg font-bold text-emerald-600">{data.leases.active}</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-muted-foreground">Total Leases</span>
                      <span className="text-lg font-bold">{data.leases.total}</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-muted-foreground">Occupancy Rate</span>
                      <span className="text-lg font-bold">{data.leases.occupancyRate}%</span>
                    </div>
                    <div className="mt-2 h-3 w-full overflow-hidden rounded-full bg-gray-100">
                      <div
                        className="h-full rounded-full bg-gradient-to-r from-emerald-500 to-teal-500 transition-all"
                        style={{ width: `${data.leases.occupancyRate}%` }}
                      />
                    </div>
                  </div>
                ) : (
                  <EmptyChartState
                    title="No lease data yet"
                    description="Create leases to see occupancy metrics"
                  />
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>POS Integration Status</CardTitle>
                <CardDescription>Point of Sale system connections</CardDescription>
              </CardHeader>
              <CardContent>
                {data ? (
                  <div className="space-y-4">
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-muted-foreground">Connected Stores</span>
                      <span className="text-lg font-bold text-emerald-600">{data.posConnected}</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-muted-foreground">Total POS Revenue</span>
                      <span className="text-lg font-bold">{formatCurrency(data.revenue.total)}</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-muted-foreground">Total Transactions</span>
                      <span className="text-lg font-bold">{data.totalTransactions.toLocaleString()}</span>
                    </div>
                    {data.posConnected > 0 && (
                      <Badge variant="success" className="mt-2">
                        Live POS Data
                      </Badge>
                    )}
                  </div>
                ) : (
                  <EmptyChartState
                    title="No POS data yet"
                    description="Connect POS systems to see integration status"
                  />
                )}
              </CardContent>
            </Card>
          </div>
        </>
      )}
    </div>
  )
}
