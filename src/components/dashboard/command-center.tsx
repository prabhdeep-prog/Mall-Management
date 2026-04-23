"use client"

import * as React from "react"
import { KPICard } from "./kpi-card"
import { AgentActivityFeed } from "@/components/agents/agent-activity-feed"
import { AnomalyAlerts } from "./anomaly-alerts"
import { QuickActions } from "./quick-actions"
import { RevenueForecastWidget } from "./revenue-forecast-widget"
import {
  Building2,
  CreditCard,
  Wrench,
  ThumbsUp,
} from "lucide-react"

interface DashboardData {
  summary: {
    tenants: { occupancyRate: number; total: number; active: number }
    financials: { collectionRate: number; totalInvoices: number; paid: number; overdue: number }
    workOrders: { open: number; inProgress: number; critical: number }
    agents: { total: number; pending: number }
    currentPropertyId?: string
  }
}

export function CommandCenter() {
  const [data, setData] = React.useState<DashboardData | null>(null)
  const [loading, setLoading] = React.useState(true)
  const [error, setError] = React.useState(false)

  React.useEffect(() => {
    async function fetchDashboard() {
      try {
        setLoading(true)
        setError(false)
        const res = await fetch("/api/dashboard")
        if (!res.ok) throw new Error("Failed to fetch dashboard data")
        const json = await res.json()
        if (json.success && json.data) {
          setData(json.data)
        }
      } catch {
        setError(true)
      } finally {
        setLoading(false)
      }
    }
    fetchDashboard()
  }, [])

  const summary = data?.summary

  const occupancyValue = summary ? summary.tenants.occupancyRate : "\u2014"
  const collectionValue = summary ? summary.financials.collectionRate : "\u2014"
  const activeWorkOrders = summary
    ? summary.workOrders.open + summary.workOrders.inProgress
    : "\u2014"
  const tenantTotal = summary ? summary.tenants.total : "\u2014"

  // Derive status from real data
  const hasOverdue = summary ? summary.financials.overdue > 0 : false
  const hasCritical = summary ? summary.workOrders.critical > 0 : false

  let statusLabel = "No data available"
  let statusBg = "bg-gray-50"
  let statusText = "text-gray-600"
  let statusDot = "bg-gray-400"

  if (loading) {
    statusLabel = "Loading\u2026"
  } else if (error) {
    statusLabel = "Unable to load status"
    statusBg = "bg-red-50"
    statusText = "text-red-700"
    statusDot = "bg-red-500"
  } else if (summary) {
    if (hasCritical) {
      statusLabel = `${summary.workOrders.critical} critical work order${summary.workOrders.critical !== 1 ? "s" : ""}`
      statusBg = "bg-red-50"
      statusText = "text-red-700"
      statusDot = "bg-red-500"
    } else if (hasOverdue) {
      statusLabel = `${summary.financials.overdue} overdue invoice${summary.financials.overdue !== 1 ? "s" : ""}`
      statusBg = "bg-amber-50"
      statusText = "text-amber-700"
      statusDot = "bg-amber-500"
    } else {
      statusLabel = "All systems normal"
      statusBg = "bg-green-50"
      statusText = "text-green-700"
      statusDot = "bg-green-500"
    }
  }

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Command Center</h1>
          <p className="text-muted-foreground">
            AI-powered operations hub for Metro Mall
          </p>
        </div>
        <div className={`flex items-center gap-2 rounded-lg border px-3 py-1.5 ${statusBg} ${statusText}`}>
          <div className={`h-2 w-2 rounded-full ${statusDot} ${loading ? "animate-pulse" : ""}`} />
          <span className="text-sm font-medium">{statusLabel}</span>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-4">
        <KPICard
          label="Occupancy Rate"
          value={occupancyValue}
          suffix={typeof occupancyValue === "number" ? "%" : ""}
          icon={Building2}
        />
        <KPICard
          label="Collection Rate"
          value={collectionValue}
          suffix={typeof collectionValue === "number" ? "%" : ""}
          icon={CreditCard}
        />
        <KPICard
          label="Active Work Orders"
          value={activeWorkOrders}
          icon={Wrench}
        />
        <KPICard
          label="Total Tenants"
          value={tenantTotal}
          icon={ThumbsUp}
        />
      </div>

      {/* Revenue Forecast — renders once the dashboard API exposes currentPropertyId */}
      {summary?.currentPropertyId && (
        <RevenueForecastWidget mallId={summary.currentPropertyId} />
      )}

      {/* Main Content Grid */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        {/* Agent Activity Feed - Takes 2 columns */}
        <div className="lg:col-span-2">
          <AgentActivityFeed />
        </div>

        {/* Right Column - Alerts and Quick Actions */}
        <div className="space-y-6">
          <AnomalyAlerts />
          <QuickActions />
        </div>
      </div>
    </div>
  )
}

