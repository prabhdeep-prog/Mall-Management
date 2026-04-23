/**
 * Tenant Risk Engine
 * ----------------------------------------------------------------------------
 * Computes a composite 0..100 risk score per tenant from existing signals.
 *
 * Scoring rules (per spec):
 *   • late payments > 2          → +20
 *   • POS sales drop > 15%       → +25  (last 30d vs prior 30d)
 *   • complaints > 5             → +15  (open/repair work orders + negative convos)
 *   • lease expiry < 60 days     → +10
 *
 * Max raw = 70. We clamp to 100. Recommended actions are derived from which
 * signals fired so the Tenant Relations Agent can present them as next steps.
 */
import { sql } from "drizzle-orm"
import { db } from "@/lib/db"

export const RISK_MODEL_VERSION = "rule-based-v1"

export type RiskLevel = "low" | "medium" | "high" | "critical"
export type RecommendedAction =
  | "offer_discount"
  | "extend_lease"
  | "schedule_meeting"
  | "send_payment_reminder"
  | "monitor"

export interface RiskSignals {
  latePaymentCount: number
  salesPctChange: number     // negative = drop
  complaintCount: number
  daysToLeaseExpiry: number | null
}

export interface TenantRiskScore {
  tenantId: string
  riskScore: number          // 0..100
  riskLevel: RiskLevel
  latePaymentPoints: number
  salesDropPoints: number
  complaintPoints: number
  leaseExpiryPoints: number
  signals: RiskSignals
  recommendedActions: RecommendedAction[]
  modelVersion: string
}

function levelFor(score: number): RiskLevel {
  if (score >= 60) return "critical"
  if (score >= 40) return "high"
  if (score >= 20) return "medium"
  return "low"
}

/**
 * Pull all per-tenant signals for an organization in one round-trip.
 * Caller must have already bound `app.current_organization_id` for RLS.
 */
async function loadSignals(organizationId: string): Promise<Map<string, RiskSignals>> {
  const rows = await db.execute<{
    tenant_id: string
    late_payment_count: string
    sales_last_30: string
    sales_prior_30: string
    complaint_count: string
    days_to_expiry: string | null
  }>(sql`
    WITH org_tenants AS (
      SELECT t.id AS tenant_id
      FROM tenants t
      JOIN properties p ON p.id = t.property_id
      WHERE p.organization_id = ${organizationId}::uuid
    ),
    late_pay AS (
      SELECT l.tenant_id, COUNT(*)::int AS n
      FROM invoices i
      JOIN leases l ON l.id = i.lease_id
      WHERE i.status = 'overdue'
         OR (i.status != 'paid' AND i.due_date < CURRENT_DATE)
         OR (i.paid_date IS NOT NULL AND i.paid_date > i.due_date)
      GROUP BY l.tenant_id
    ),
    sales_recent AS (
      SELECT tenant_id, COALESCE(SUM(gross_sales),0) AS s
      FROM pos_sales_data
      WHERE sales_date >= CURRENT_DATE - INTERVAL '30 days'
        AND sales_date <  CURRENT_DATE
      GROUP BY tenant_id
    ),
    sales_prior AS (
      SELECT tenant_id, COALESCE(SUM(gross_sales),0) AS s
      FROM pos_sales_data
      WHERE sales_date >= CURRENT_DATE - INTERVAL '60 days'
        AND sales_date <  CURRENT_DATE - INTERVAL '30 days'
      GROUP BY tenant_id
    ),
    complaints AS (
      -- "Complaints" = open/repair work orders + negative-sentiment conversations
      SELECT tenant_id, SUM(n)::int AS n FROM (
        SELECT tenant_id, COUNT(*) AS n
          FROM work_orders
         WHERE created_at >= CURRENT_DATE - INTERVAL '90 days'
           AND (type = 'repair' OR status IN ('open','in_progress'))
         GROUP BY tenant_id
        UNION ALL
        SELECT tenant_id, COUNT(*) AS n
          FROM conversations
         WHERE sentiment = 'negative'
           AND created_at >= CURRENT_DATE - INTERVAL '90 days'
         GROUP BY tenant_id
      ) u
      GROUP BY tenant_id
    ),
    next_expiry AS (
      SELECT tenant_id, MIN(end_date) AS end_date
      FROM leases
      WHERE status = 'active'
      GROUP BY tenant_id
    )
    SELECT
      ot.tenant_id,
      COALESCE(lp.n, 0)::text                                  AS late_payment_count,
      COALESCE(sr.s, 0)::text                                  AS sales_last_30,
      COALESCE(sp.s, 0)::text                                  AS sales_prior_30,
      COALESCE(c.n, 0)::text                                   AS complaint_count,
      CASE WHEN ne.end_date IS NULL THEN NULL
           ELSE (ne.end_date - CURRENT_DATE)::text END         AS days_to_expiry
    FROM org_tenants ot
    LEFT JOIN late_pay    lp ON lp.tenant_id = ot.tenant_id
    LEFT JOIN sales_recent sr ON sr.tenant_id = ot.tenant_id
    LEFT JOIN sales_prior  sp ON sp.tenant_id = ot.tenant_id
    LEFT JOIN complaints   c  ON c.tenant_id  = ot.tenant_id
    LEFT JOIN next_expiry  ne ON ne.tenant_id = ot.tenant_id
  `)

  const map = new Map<string, RiskSignals>()
  for (const r of rows as unknown as Array<any>) {
    const recent = Number(r.sales_last_30) || 0
    const prior  = Number(r.sales_prior_30) || 0
    const pctChange = prior > 0 ? ((recent - prior) / prior) * 100 : 0
    map.set(r.tenant_id, {
      latePaymentCount: Number(r.late_payment_count) || 0,
      salesPctChange: Math.round(pctChange * 10) / 10,
      complaintCount: Number(r.complaint_count) || 0,
      daysToLeaseExpiry: r.days_to_expiry == null ? null : Number(r.days_to_expiry),
    })
  }
  return map
}

export function scoreFromSignals(tenantId: string, s: RiskSignals): TenantRiskScore {
  const latePaymentPoints = s.latePaymentCount > 2 ? 20 : 0
  const salesDropPoints   = s.salesPctChange < -15 ? 25 : 0
  const complaintPoints   = s.complaintCount > 5 ? 15 : 0
  const leaseExpiryPoints =
    s.daysToLeaseExpiry !== null && s.daysToLeaseExpiry < 60 && s.daysToLeaseExpiry >= 0 ? 10 : 0

  const raw = latePaymentPoints + salesDropPoints + complaintPoints + leaseExpiryPoints
  const riskScore = Math.min(100, raw)

  const recommendedActions: RecommendedAction[] = []
  if (salesDropPoints)   recommendedActions.push("offer_discount")
  if (leaseExpiryPoints) recommendedActions.push("extend_lease")
  if (complaintPoints)   recommendedActions.push("schedule_meeting")
  if (latePaymentPoints) recommendedActions.push("send_payment_reminder")
  if (recommendedActions.length === 0) recommendedActions.push("monitor")

  return {
    tenantId,
    riskScore,
    riskLevel: levelFor(riskScore),
    latePaymentPoints,
    salesDropPoints,
    complaintPoints,
    leaseExpiryPoints,
    signals: s,
    recommendedActions,
    modelVersion: RISK_MODEL_VERSION,
  }
}

export async function computeRiskForOrganization(organizationId: string): Promise<TenantRiskScore[]> {
  const signals = await loadSignals(organizationId)
  const out: TenantRiskScore[] = []
  for (const [tenantId, s] of signals) out.push(scoreFromSignals(tenantId, s))
  return out.sort((a, b) => b.riskScore - a.riskScore)
}

export async function computeRiskForTenant(
  organizationId: string,
  tenantId: string,
): Promise<TenantRiskScore | null> {
  const all = await loadSignals(organizationId)
  const s = all.get(tenantId)
  if (!s) return null
  return scoreFromSignals(tenantId, s)
}
