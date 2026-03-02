"use client"

import * as React from "react"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"

// ── Types ──────────────────────────────────────────────────────────────────────

interface PlanBreakdown {
  slug:         string
  name:         string
  active_count: number
  trial_count:  number
  mrr_paise:    number
}

interface RenewalRow {
  organization_id: string
  org_name:        string
  plan_name:       string
  billing_cycle:   string
  renewal_date:    string
  amount_paise:    number
}

interface FailingRow {
  organization_id:       string
  org_name:              string
  plan_name:             string
  status:                string
  payment_failed_at:     string | null
  payment_failure_count: number
  grace_period_ends_at:  string | null
}

interface TrendRow {
  snapshot_date:  string
  mrr_paise:      number
  active_count:   number
  trialing_count: number
}

interface BillingMetrics {
  mrr:             number
  arr:             number
  mrrFormatted:    string
  arrFormatted:    string
  counts: {
    active:    number
    trialing:  number
    pastDue:   number
    paused:    number
    cancelled: number
    total:     number
  }
  plans:            PlanBreakdown[]
  upcomingRenewals: RenewalRow[]
  failedPayments:   FailingRow[]
  mrrTrend:         TrendRow[]
}

// ── Helpers ────────────────────────────────────────────────────────────────────

function formatINR(paise: number): string {
  return new Intl.NumberFormat("en-IN", {
    style:    "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  }).format(paise / 100)
}

function formatDate(iso: string | null): string {
  if (!iso) return "—"
  return new Date(iso).toLocaleDateString("en-IN", {
    day: "numeric", month: "short", year: "numeric",
  })
}

function statusBadge(status: string) {
  const variants: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
    active:    "default",
    trialing:  "secondary",
    past_due:  "destructive",
    paused:    "outline",
    cancelled: "outline",
  }
  return (
    <Badge variant={variants[status] ?? "outline"}>
      {status.replace("_", " ")}
    </Badge>
  )
}

// ── Mini bar chart (no external lib) ─────────────────────────────────────────

function MrrTrendChart({ data }: { data: TrendRow[] }) {
  if (data.length === 0) {
    return (
      <div className="flex items-center justify-center h-32 text-muted-foreground text-sm">
        No snapshot data yet. Snapshots are recorded daily.
      </div>
    )
  }

  const maxMrr = Math.max(...data.map((d) => d.mrr_paise), 1)

  return (
    <div className="flex items-end gap-1 h-32 w-full">
      {data.map((row) => {
        const pct = (row.mrr_paise / maxMrr) * 100
        return (
          <div
            key={row.snapshot_date}
            className="flex-1 flex flex-col items-center gap-1"
            title={`${row.snapshot_date}: ${formatINR(row.mrr_paise)}`}
          >
            <div
              className="w-full bg-primary rounded-t transition-all"
              style={{ height: `${Math.max(pct, 2)}%` }}
            />
          </div>
        )
      })}
    </div>
  )
}

// ── Page ───────────────────────────────────────────────────────────────────────

export default function AdminBillingPage() {
  const [data, setData]       = React.useState<BillingMetrics | null>(null)
  const [loading, setLoading] = React.useState(true)
  const [error, setError]     = React.useState<string | null>(null)

  React.useEffect(() => {
    fetch("/api/admin/billing")
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`)
        return r.json() as Promise<BillingMetrics>
      })
      .then(setData)
      .catch((e: Error) => setError(e.message))
      .finally(() => setLoading(false))
  }, [])

  if (loading) {
    return (
      <div className="p-8 text-muted-foreground">Loading billing metrics…</div>
    )
  }

  if (error) {
    return (
      <div className="p-8 text-destructive">
        Failed to load billing metrics: {error}
        <br />
        <span className="text-sm text-muted-foreground">
          Ensure you are logged in as a platform admin.
        </span>
      </div>
    )
  }

  if (!data) return null

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Billing Dashboard</h1>
        <p className="text-muted-foreground text-sm">
          Platform-wide subscription metrics and revenue overview
        </p>
      </div>

      {/* ── Key metrics ─────────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <Card>
          <CardHeader className="pb-1">
            <CardDescription>MRR</CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">{data.mrrFormatted}</p>
            <p className="text-xs text-muted-foreground">Monthly recurring revenue</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-1">
            <CardDescription>ARR</CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">{data.arrFormatted}</p>
            <p className="text-xs text-muted-foreground">Annualised revenue</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-1">
            <CardDescription>Active</CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">{data.counts.active}</p>
            <p className="text-xs text-muted-foreground">
              + {data.counts.trialing} trialing
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-1">
            <CardDescription>Attention needed</CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold text-destructive">
              {data.counts.pastDue + data.counts.paused}
            </p>
            <p className="text-xs text-muted-foreground">
              {data.counts.pastDue} past-due · {data.counts.paused} paused
            </p>
          </CardContent>
        </Card>
      </div>

      {/* ── MRR trend + plan breakdown ───────────────────────────────────── */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>MRR Trend (last 30 days)</CardTitle>
            <CardDescription>Daily snapshots from the mrr_snapshots table</CardDescription>
          </CardHeader>
          <CardContent>
            <MrrTrendChart data={data.mrrTrend} />
            {data.mrrTrend.length > 0 && (
              <p className="text-xs text-muted-foreground mt-2">
                Latest: {formatINR(data.mrrTrend[data.mrrTrend.length - 1]?.mrr_paise ?? 0)}
                {" on "}
                {data.mrrTrend[data.mrrTrend.length - 1]?.snapshot_date}
              </p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Plan Distribution</CardTitle>
            <CardDescription>Active and trialing subscriptions by plan</CardDescription>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Plan</TableHead>
                  <TableHead className="text-right">Active</TableHead>
                  <TableHead className="text-right">Trial</TableHead>
                  <TableHead className="text-right">MRR</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.plans.map((plan) => (
                  <TableRow key={plan.slug}>
                    <TableCell className="font-medium">{plan.name}</TableCell>
                    <TableCell className="text-right">{plan.active_count}</TableCell>
                    <TableCell className="text-right">{plan.trial_count}</TableCell>
                    <TableCell className="text-right">{formatINR(plan.mrr_paise)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>

      {/* ── Upcoming renewals ────────────────────────────────────────────── */}
      <Card>
        <CardHeader>
          <CardTitle>Upcoming Renewals</CardTitle>
          <CardDescription>Active subscriptions renewing in the next 30 days</CardDescription>
        </CardHeader>
        <CardContent>
          {data.upcomingRenewals.length === 0 ? (
            <p className="text-sm text-muted-foreground">No renewals in the next 30 days.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Organisation</TableHead>
                  <TableHead>Plan</TableHead>
                  <TableHead>Cycle</TableHead>
                  <TableHead>Renewal date</TableHead>
                  <TableHead className="text-right">Amount</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.upcomingRenewals.map((r) => (
                  <TableRow key={r.organization_id}>
                    <TableCell className="font-medium">{r.org_name}</TableCell>
                    <TableCell>{r.plan_name}</TableCell>
                    <TableCell className="capitalize">{r.billing_cycle}</TableCell>
                    <TableCell>{formatDate(r.renewal_date)}</TableCell>
                    <TableCell className="text-right">{formatINR(r.amount_paise)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* ── Failed / at-risk ─────────────────────────────────────────────── */}
      <Card>
        <CardHeader>
          <CardTitle>Failed Payments</CardTitle>
          <CardDescription>
            Subscriptions in past-due or paused state — dunning is in progress
          </CardDescription>
        </CardHeader>
        <CardContent>
          {data.failedPayments.length === 0 ? (
            <p className="text-sm text-muted-foreground">No failed payments. 🎉</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Organisation</TableHead>
                  <TableHead>Plan</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Failed at</TableHead>
                  <TableHead className="text-right">Failures</TableHead>
                  <TableHead>Grace ends</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.failedPayments.map((r) => (
                  <TableRow key={r.organization_id}>
                    <TableCell className="font-medium">{r.org_name}</TableCell>
                    <TableCell>{r.plan_name}</TableCell>
                    <TableCell>{statusBadge(r.status)}</TableCell>
                    <TableCell>{formatDate(r.payment_failed_at)}</TableCell>
                    <TableCell className="text-right">{r.payment_failure_count}</TableCell>
                    <TableCell>{formatDate(r.grace_period_ends_at)}</TableCell>
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
