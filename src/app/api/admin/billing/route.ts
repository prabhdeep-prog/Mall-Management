/**
 * Admin Billing Analytics API
 * ─────────────────────────────
 * GET /api/admin/billing
 *
 * Returns MRR, ARR, churn, plan distribution, upcoming renewals, and failed payments
 * for the admin billing dashboard.
 *
 * Access: platform admins only (role = "admin" in JWT).
 *
 * This route uses serviceDb (bypasses per-org RLS) because it aggregates
 * across all organizations. Access is guarded at the application layer
 * by the role check below.
 */

import { NextRequest, NextResponse } from "next/server"
import { sql } from "drizzle-orm"
import { auth } from "@/lib/auth"
import { serviceDb } from "@/lib/db"
import { formatINR } from "@/lib/billing/plans"

export const dynamic = "force-dynamic"

export async function GET(_request: NextRequest) {
  // ── Auth: platform admin only ──────────────────────────────────────────────
  const session = await auth()
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }
  if (session.user.role !== "admin") {
    return NextResponse.json({ error: "Forbidden: admin access required" }, { status: 403 })
  }

  try {
    const [metrics, planBreakdown, upcoming, failing, trend] = await Promise.all([
      getCurrentMetrics(),
      getPlanBreakdown(),
      getUpcomingRenewals(),
      getFailedPayments(),
      getMrrTrend(),
    ])

    return NextResponse.json({
      // Key metrics
      mrr:          metrics.mrr_paise,
      arr:          metrics.mrr_paise * 12,
      mrrFormatted: formatINR(metrics.mrr_paise),
      arrFormatted: formatINR(metrics.mrr_paise * 12),

      // Subscription counts
      counts: {
        active:    metrics.active_count,
        trialing:  metrics.trialing_count,
        pastDue:   metrics.past_due_count,
        paused:    metrics.paused_count,
        cancelled: metrics.cancelled_count,
        total:     metrics.total_count,
      },

      // Plan breakdown
      plans: planBreakdown,

      // Operational
      upcomingRenewals: upcoming,
      failedPayments:   failing,

      // 30-day MRR trend
      mrrTrend: trend,
    })
  } catch (err) {
    console.error("[admin/billing] error:", err)
    return NextResponse.json(
      { error: "Failed to fetch billing metrics" },
      { status: 500 }
    )
  }
}

// ── Current snapshot metrics ──────────────────────────────────────────────────

interface MetricsRow {
  mrr_paise:      number
  active_count:   number
  trialing_count: number
  past_due_count: number
  paused_count:   number
  cancelled_count: number
  total_count:    number
}

async function getCurrentMetrics(): Promise<MetricsRow> {
  const result = await serviceDb.execute<MetricsRow>(sql`
    SELECT
      COALESCE(SUM(
        CASE
          WHEN s.status IN ('active', 'trialing') AND s.billing_cycle = 'monthly'
            THEN bp.amount_monthly
          WHEN s.status IN ('active', 'trialing') AND s.billing_cycle = 'yearly'
            THEN ROUND(bp.amount_yearly / 12.0)
          ELSE 0
        END
      ), 0)                                                     AS mrr_paise,

      COUNT(*) FILTER (WHERE s.status = 'active')              AS active_count,
      COUNT(*) FILTER (WHERE s.status = 'trialing')            AS trialing_count,
      COUNT(*) FILTER (WHERE s.status = 'past_due')            AS past_due_count,
      COUNT(*) FILTER (WHERE s.status = 'paused')              AS paused_count,
      COUNT(*) FILTER (WHERE s.status = 'cancelled')           AS cancelled_count,
      COUNT(*)                                                  AS total_count
    FROM subscriptions s
    JOIN billing_plans bp ON bp.id = s.plan_id
  `)

  const row = result.rows[0]
  return {
    mrr_paise:       Number(row?.mrr_paise      ?? 0),
    active_count:    Number(row?.active_count    ?? 0),
    trialing_count:  Number(row?.trialing_count  ?? 0),
    past_due_count:  Number(row?.past_due_count  ?? 0),
    paused_count:    Number(row?.paused_count    ?? 0),
    cancelled_count: Number(row?.cancelled_count ?? 0),
    total_count:     Number(row?.total_count     ?? 0),
  }
}

// ── Plan breakdown ────────────────────────────────────────────────────────────

interface PlanBreakdownRow {
  slug:          string
  name:          string
  active_count:  number
  trial_count:   number
  mrr_paise:     number
}

async function getPlanBreakdown(): Promise<PlanBreakdownRow[]> {
  const result = await serviceDb.execute<PlanBreakdownRow>(sql`
    SELECT
      bp.slug,
      bp.name,
      COUNT(*) FILTER (WHERE s.status = 'active')              AS active_count,
      COUNT(*) FILTER (WHERE s.status = 'trialing')            AS trial_count,
      COALESCE(SUM(
        CASE
          WHEN s.status IN ('active', 'trialing') AND s.billing_cycle = 'monthly'
            THEN bp.amount_monthly
          WHEN s.status IN ('active', 'trialing') AND s.billing_cycle = 'yearly'
            THEN ROUND(bp.amount_yearly / 12.0)
          ELSE 0
        END
      ), 0)                                                     AS mrr_paise
    FROM billing_plans bp
    LEFT JOIN subscriptions s ON s.plan_id = bp.id
      AND s.status NOT IN ('cancelled', 'expired')
    GROUP BY bp.id, bp.slug, bp.name
    ORDER BY bp.sort_order
  `)

  return result.rows.map((r) => ({
    slug:         r.slug,
    name:         r.name,
    active_count: Number(r.active_count),
    trial_count:  Number(r.trial_count),
    mrr_paise:    Number(r.mrr_paise),
  }))
}

// ── Upcoming renewals (next 30 days) ─────────────────────────────────────────

interface RenewalRow {
  organization_id:  string
  org_name:         string
  plan_name:        string
  billing_cycle:    string
  renewal_date:     string
  amount_paise:     number
}

async function getUpcomingRenewals(): Promise<RenewalRow[]> {
  const result = await serviceDb.execute<RenewalRow>(sql`
    SELECT
      o.id              AS organization_id,
      o.name            AS org_name,
      bp.name           AS plan_name,
      s.billing_cycle,
      s.current_period_end::text AS renewal_date,
      CASE
        WHEN s.billing_cycle = 'monthly' THEN bp.amount_monthly
        ELSE COALESCE(bp.amount_yearly, bp.amount_monthly * 12)
      END               AS amount_paise
    FROM subscriptions s
    JOIN organizations  o  ON o.id  = s.organization_id
    JOIN billing_plans  bp ON bp.id = s.plan_id
    WHERE s.status = 'active'
      AND s.current_period_end BETWEEN now() AND now() + INTERVAL '30 days'
      AND s.cancel_at IS NULL   -- Exclude already-cancelling subs
    ORDER BY s.current_period_end ASC
    LIMIT 50
  `)

  return result.rows.map((r) => ({
    organization_id: r.organization_id,
    org_name:        r.org_name,
    plan_name:       r.plan_name,
    billing_cycle:   r.billing_cycle,
    renewal_date:    r.renewal_date,
    amount_paise:    Number(r.amount_paise),
  }))
}

// ── Failed / past-due subscriptions ──────────────────────────────────────────

interface FailingRow {
  organization_id:       string
  org_name:              string
  plan_name:             string
  status:                string
  payment_failed_at:     string | null
  payment_failure_count: number
  grace_period_ends_at:  string | null
}

async function getFailedPayments(): Promise<FailingRow[]> {
  const result = await serviceDb.execute<FailingRow>(sql`
    SELECT
      o.id              AS organization_id,
      o.name            AS org_name,
      bp.name           AS plan_name,
      s.status,
      s.payment_failed_at::text,
      s.payment_failure_count,
      s.grace_period_ends_at::text
    FROM subscriptions s
    JOIN organizations  o  ON o.id  = s.organization_id
    JOIN billing_plans  bp ON bp.id = s.plan_id
    WHERE s.status IN ('past_due', 'paused')
    ORDER BY s.payment_failed_at ASC NULLS LAST
    LIMIT 50
  `)

  return result.rows.map((r) => ({
    organization_id:       r.organization_id,
    org_name:              r.org_name,
    plan_name:             r.plan_name,
    status:                r.status,
    payment_failed_at:     r.payment_failed_at,
    payment_failure_count: Number(r.payment_failure_count),
    grace_period_ends_at:  r.grace_period_ends_at,
  }))
}

// ── 30-day MRR trend ─────────────────────────────────────────────────────────

interface TrendRow {
  snapshot_date: string
  mrr_paise:     number
  active_count:  number
  trialing_count: number
}

async function getMrrTrend(): Promise<TrendRow[]> {
  // Use stored snapshots if available (populated by a daily cron)
  const result = await serviceDb.execute<TrendRow>(sql`
    SELECT
      snapshot_date::text,
      mrr_paise,
      active_count,
      trialing_count
    FROM mrr_snapshots
    ORDER BY snapshot_date DESC
    LIMIT 30
  `)

  return result.rows
    .map((r) => ({
      snapshot_date:  r.snapshot_date,
      mrr_paise:      Number(r.mrr_paise),
      active_count:   Number(r.active_count),
      trialing_count: Number(r.trialing_count),
    }))
    .reverse()  // Ascending chronological order for charts
}
