"use client"

import * as React from "react"
import {
  Line,
  LineChart,
  CartesianGrid,
  XAxis,
  YAxis,
  Tooltip,
  ReferenceDot,
  ResponsiveContainer,
  Legend,
} from "recharts"

interface ForecastPoint {
  date: string
  predictedRevenue: number
  confidenceScore: number
}
interface HistoryPoint {
  date: string
  revenue: number
  isAnomaly?: boolean
}
interface ForecastResponse {
  success: boolean
  data: {
    modelVersion: string
    history: HistoryPoint[]
    forecast: ForecastPoint[]
    meta: { rolling7dAvg: number; weekendUplift: number; sampleSize: number }
  }
}

interface RevenueForecastWidgetProps {
  mallId: string
  zoneId?: string
}

/**
 * Dashboard widget — fetches /api/forecast/revenue and renders a single line
 * chart of actual (last 90 days) vs predicted (next 30 days). Historical
 * points flagged as anomalies are highlighted with a red dot.
 */
export function RevenueForecastWidget({ mallId, zoneId }: RevenueForecastWidgetProps) {
  const [data, setData] = React.useState<ForecastResponse["data"] | null>(null)
  const [error, setError] = React.useState<string | null>(null)
  const [loading, setLoading] = React.useState(true)

  React.useEffect(() => {
    let cancelled = false
    async function load() {
      setLoading(true)
      try {
        const params = new URLSearchParams({ mallId })
        if (zoneId) params.set("zoneId", zoneId)
        const res = await fetch(`/api/forecast/revenue?${params.toString()}`)
        if (!res.ok) throw new Error(`HTTP ${res.status}`)
        const json: ForecastResponse = await res.json()
        if (!cancelled) setData(json.data)
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : "Failed to load")
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    load()
    return () => { cancelled = true }
  }, [mallId, zoneId])

  if (loading) return <div className="rounded-lg border p-6 text-sm text-muted-foreground">Loading forecast…</div>
  if (error)   return <div className="rounded-lg border p-6 text-sm text-red-600">Forecast error: {error}</div>
  if (!data)   return null

  // Merge history + forecast into one series so the line is continuous.
  const merged = [
    ...data.history.map((h) => ({ date: h.date, actual: h.revenue, predicted: null as number | null, isAnomaly: h.isAnomaly })),
    ...data.forecast.map((f) => ({ date: f.date, actual: null as number | null, predicted: f.predictedRevenue, isAnomaly: false })),
  ]

  const anomalies = data.history.filter((h) => h.isAnomaly)

  return (
    <div className="rounded-lg border bg-card p-4">
      <div className="mb-3 flex items-center justify-between">
        <div>
          <h3 className="text-base font-semibold">Revenue Forecast (next 30 days)</h3>
          <p className="text-xs text-muted-foreground">
            Model {data.modelVersion} · {data.meta.sampleSize} days history · weekend uplift ×{data.meta.weekendUplift}
          </p>
        </div>
      </div>

      <ResponsiveContainer width="100%" height={300}>
        <LineChart data={merged} margin={{ top: 8, right: 16, left: 0, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
          <XAxis dataKey="date" tick={{ fontSize: 10 }} minTickGap={24} />
          <YAxis tick={{ fontSize: 10 }} />
          <Tooltip
            formatter={(v: number | null) => (v == null ? "—" : `₹${Number(v).toLocaleString()}`)}
            labelClassName="text-xs"
          />
          <Legend wrapperStyle={{ fontSize: 12 }} />
          <Line type="monotone" dataKey="actual"    name="Actual"    stroke="#3b82f6" dot={false} strokeWidth={2} connectNulls={false} />
          <Line type="monotone" dataKey="predicted" name="Predicted" stroke="#f59e0b" dot={false} strokeWidth={2} strokeDasharray="5 4" connectNulls={false} />
          {anomalies.map((a) => (
            <ReferenceDot key={a.date} x={a.date} y={a.revenue} r={5} fill="#ef4444" stroke="white" />
          ))}
        </LineChart>
      </ResponsiveContainer>

      {anomalies.length > 0 && (
        <p className="mt-2 text-xs text-red-600">
          {anomalies.length} historical anomal{anomalies.length === 1 ? "y" : "ies"} flagged (&gt;2σ from mean)
        </p>
      )}
    </div>
  )
}
