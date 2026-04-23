"use client"

import * as React from "react"

interface RiskScore {
  tenantId: string
  riskScore: number
  riskLevel: "low" | "medium" | "high" | "critical"
  latePaymentPoints: number
  salesDropPoints: number
  complaintPoints: number
  leaseExpiryPoints: number
  signals: {
    latePaymentCount: number
    salesPctChange: number
    complaintCount: number
    daysToLeaseExpiry: number | null
  }
  recommendedActions: string[]
}

interface ApiResponse {
  success: boolean
  data: { modelVersion: string; scores: RiskScore[] }
}

const LEVEL_COLOR: Record<RiskScore["riskLevel"], string> = {
  low:      "bg-emerald-500",
  medium:   "bg-amber-400",
  high:     "bg-orange-500",
  critical: "bg-red-600",
}

const LEVEL_BADGE: Record<RiskScore["riskLevel"], string> = {
  low:      "bg-emerald-50 text-emerald-700 ring-emerald-200",
  medium:   "bg-amber-50  text-amber-700  ring-amber-200",
  high:     "bg-orange-50 text-orange-700 ring-orange-200",
  critical: "bg-red-50    text-red-700    ring-red-200",
}

/**
 * Tenant Risk Heatmap
 * --------------------
 * Renders two views from /api/tenants/risk:
 *   1. A grid heatmap — one square per tenant, colour-coded by risk level
 *   2. A high-risk list — all tenants with riskScore ≥ 40, sorted desc
 */
export function TenantRiskHeatmap() {
  const [data, setData] = React.useState<RiskScore[] | null>(null)
  const [error, setError] = React.useState<string | null>(null)
  const [loading, setLoading] = React.useState(true)

  React.useEffect(() => {
    let cancelled = false
    async function load() {
      try {
        const res = await fetch("/api/tenants/risk")
        if (!res.ok) throw new Error(`HTTP ${res.status}`)
        const json: ApiResponse = await res.json()
        if (!cancelled) setData(json.data.scores)
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : "Failed to load")
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    load()
    return () => { cancelled = true }
  }, [])

  if (loading) return <div className="rounded-lg border p-6 text-sm text-muted-foreground">Loading risk scores…</div>
  if (error)   return <div className="rounded-lg border p-6 text-sm text-red-600">Error: {error}</div>
  if (!data || data.length === 0) {
    return <div className="rounded-lg border p-6 text-sm text-muted-foreground">No tenants found.</div>
  }

  const highRisk = data.filter((s) => s.riskScore >= 40)
  const counts = data.reduce<Record<string, number>>((acc, s) => {
    acc[s.riskLevel] = (acc[s.riskLevel] ?? 0) + 1
    return acc
  }, {})

  return (
    <div className="space-y-6">
      {/* ── Heatmap ─────────────────────────────────────────────────────── */}
      <div className="rounded-lg border bg-card p-4">
        <div className="mb-3 flex items-center justify-between">
          <div>
            <h3 className="text-base font-semibold">Tenant Risk Heatmap</h3>
            <p className="text-xs text-muted-foreground">
              {data.length} tenants · low {counts.low ?? 0} · medium {counts.medium ?? 0} · high {counts.high ?? 0} · critical {counts.critical ?? 0}
            </p>
          </div>
          <div className="flex items-center gap-3 text-xs">
            {(["low", "medium", "high", "critical"] as const).map((lvl) => (
              <div key={lvl} className="flex items-center gap-1">
                <span className={`inline-block h-3 w-3 rounded-sm ${LEVEL_COLOR[lvl]}`} />
                <span className="capitalize">{lvl}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-12 gap-1 sm:grid-cols-16 md:grid-cols-20">
          {data.map((s) => (
            <div
              key={s.tenantId}
              title={`Tenant ${s.tenantId.slice(0, 8)} — score ${s.riskScore} (${s.riskLevel})`}
              className={`aspect-square rounded-sm ${LEVEL_COLOR[s.riskLevel]} opacity-80 hover:opacity-100 hover:ring-2 hover:ring-offset-1 hover:ring-slate-400`}
            />
          ))}
        </div>
      </div>

      {/* ── High-risk list ─────────────────────────────────────────────── */}
      <div className="rounded-lg border bg-card">
        <div className="border-b px-4 py-3">
          <h3 className="text-base font-semibold">High-Risk Tenants</h3>
          <p className="text-xs text-muted-foreground">
            {highRisk.length} tenant{highRisk.length === 1 ? "" : "s"} with score ≥ 40
          </p>
        </div>

        {highRisk.length === 0 ? (
          <p className="px-4 py-6 text-sm text-muted-foreground">No high-risk tenants right now.</p>
        ) : (
          <table className="w-full text-sm">
            <thead className="text-xs uppercase text-muted-foreground">
              <tr className="border-b">
                <th className="px-4 py-2 text-left">Tenant</th>
                <th className="px-4 py-2 text-left">Score</th>
                <th className="px-4 py-2 text-left">Level</th>
                <th className="px-4 py-2 text-left">Late Pay</th>
                <th className="px-4 py-2 text-left">Sales Δ</th>
                <th className="px-4 py-2 text-left">Complaints</th>
                <th className="px-4 py-2 text-left">Lease Days</th>
                <th className="px-4 py-2 text-left">Recommended Actions</th>
              </tr>
            </thead>
            <tbody>
              {highRisk.map((s) => (
                <tr key={s.tenantId} className="border-b last:border-0">
                  <td className="px-4 py-2 font-mono text-xs">{s.tenantId.slice(0, 8)}…</td>
                  <td className="px-4 py-2 font-semibold">{s.riskScore}</td>
                  <td className="px-4 py-2">
                    <span className={`rounded px-2 py-0.5 text-xs ring-1 ${LEVEL_BADGE[s.riskLevel]}`}>
                      {s.riskLevel}
                    </span>
                  </td>
                  <td className="px-4 py-2">{s.signals.latePaymentCount}</td>
                  <td className={`px-4 py-2 ${s.signals.salesPctChange < -15 ? "text-red-600" : ""}`}>
                    {s.signals.salesPctChange > 0 ? "+" : ""}{s.signals.salesPctChange}%
                  </td>
                  <td className="px-4 py-2">{s.signals.complaintCount}</td>
                  <td className="px-4 py-2">
                    {s.signals.daysToLeaseExpiry == null ? "—" : `${s.signals.daysToLeaseExpiry}d`}
                  </td>
                  <td className="px-4 py-2 text-xs">
                    {s.recommendedActions.join(", ")}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}
