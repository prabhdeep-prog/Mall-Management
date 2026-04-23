/**
 * Tenant Satisfaction Engine
 * ----------------------------------------------------------------------------
 * Computes a composite 0–100 satisfaction score per tenant from existing data.
 *
 * Weighted scoring:
 *   • On-time payment rate      → 40%  (last 90 days invoices)
 *   • Avg work order resolution → 25%  (completed work orders, hours to resolve)
 *   • Open complaints count     → 20%  (open/in_progress work orders)
 *   • Lease renewal status      → 15%  (renewed / recommended / not)
 *
 * Each component produces a 0–100 sub-score. The final score is the weighted sum.
 */
import { sql } from "drizzle-orm"
import { db } from "@/lib/db"
import { tenantSatisfaction, tenants } from "@/lib/db/schema"
import { eq, desc } from "drizzle-orm"

export type SatisfactionLevel = "high" | "medium" | "low"

export interface SatisfactionBreakdown {
  payment: number      // 0-100
  maintenance: number  // 0-100
  complaints: number   // 0-100
  renewal: number      // 0-100
}

export interface TenantSatisfactionResult {
  tenantId: string
  score: number                    // 0-100
  level: SatisfactionLevel
  breakdown: SatisfactionBreakdown
  calculatedAt: string
}

function levelFor(score: number): SatisfactionLevel {
  if (score >= 70) return "high"
  if (score >= 40) return "medium"
  return "low"
}

/**
 * Compute the payment sub-score (0–100).
 * 100 = all invoices paid on time, 0 = none paid on time.
 */
function computePaymentScore(totalInvoices: number, onTimeCount: number): number {
  if (totalInvoices === 0) return 100 // No invoices = no issues
  return Math.round((onTimeCount / totalInvoices) * 100)
}

/**
 * Compute the maintenance sub-score (0–100).
 * Based on average resolution time in hours.
 * ≤24h = 100, ≤48h = 80, ≤72h = 60, ≤120h = 40, >120h = 20
 * No completed work orders = 100 (no issues)
 */
function computeMaintenanceScore(avgResolutionHours: number | null): number {
  if (avgResolutionHours === null) return 100
  if (avgResolutionHours <= 24) return 100
  if (avgResolutionHours <= 48) return 80
  if (avgResolutionHours <= 72) return 60
  if (avgResolutionHours <= 120) return 40
  return 20
}

/**
 * Compute the complaints sub-score (0–100).
 * 0 open = 100, 1 = 80, 2 = 60, 3 = 40, 4 = 20, 5+ = 0
 */
function computeComplaintsScore(openCount: number): number {
  if (openCount === 0) return 100
  if (openCount === 1) return 80
  if (openCount === 2) return 60
  if (openCount === 3) return 40
  if (openCount === 4) return 20
  return 0
}

/**
 * Compute the renewal sub-score (0–100).
 * renewed/active = 100, recommended = 75, no status = 50, not_recommended = 0
 */
function computeRenewalScore(renewalStatus: string | null, leaseStatus: string | null): number {
  if (!leaseStatus) return 50 // No lease
  if (renewalStatus === "recommended") return 75
  if (renewalStatus === "not_recommended") return 0
  // Active lease with no renewal status = stable
  if (leaseStatus === "active") return 100
  if (leaseStatus === "expired") return 25
  return 50
}

interface TenantSignals {
  tenantId: string
  totalInvoices: number
  onTimeInvoices: number
  avgResolutionHours: number | null
  openComplaints: number
  renewalStatus: string | null
  leaseStatus: string | null
}

/**
 * Load all satisfaction signals for tenants in a single query.
 * organizationId is used to scope via property join.
 */
async function loadSignals(organizationId: string, tenantId?: string): Promise<TenantSignals[]> {
  const tenantFilter = tenantId
    ? sql`AND t.id = ${tenantId}::uuid`
    : sql``

  const rows = await db.execute<{
    tenant_id: string
    total_invoices: string
    on_time_invoices: string
    avg_resolution_hours: string | null
    open_complaints: string
    renewal_status: string | null
    lease_status: string | null
  }>(sql`
    WITH org_tenants AS (
      SELECT t.id AS tenant_id
      FROM tenants t
      JOIN properties p ON p.id = t.property_id
      WHERE p.organization_id = ${organizationId}::uuid
        ${tenantFilter}
    ),
    payment_stats AS (
      SELECT
        l.tenant_id,
        COUNT(*)::int AS total,
        COUNT(*) FILTER (
          WHERE i.status = 'paid'
            AND (i.paid_date IS NULL OR i.paid_date <= i.due_date)
        )::int AS on_time
      FROM invoices i
      JOIN leases l ON l.id = i.lease_id
      WHERE i.created_at >= CURRENT_DATE - INTERVAL '90 days'
      GROUP BY l.tenant_id
    ),
    resolution_stats AS (
      SELECT
        tenant_id,
        AVG(
          EXTRACT(EPOCH FROM (completed_at - created_at)) / 3600
        ) AS avg_hours
      FROM work_orders
      WHERE status = 'completed'
        AND completed_at IS NOT NULL
        AND created_at >= CURRENT_DATE - INTERVAL '90 days'
      GROUP BY tenant_id
    ),
    open_complaints AS (
      SELECT tenant_id, COUNT(*)::int AS n
      FROM work_orders
      WHERE status IN ('open', 'in_progress')
      GROUP BY tenant_id
    ),
    lease_info AS (
      SELECT DISTINCT ON (tenant_id)
        tenant_id,
        renewal_status,
        status
      FROM leases
      ORDER BY tenant_id, end_date DESC
    )
    SELECT
      ot.tenant_id,
      COALESCE(ps.total, 0)::text       AS total_invoices,
      COALESCE(ps.on_time, 0)::text     AS on_time_invoices,
      CASE WHEN rs.avg_hours IS NOT NULL
           THEN ROUND(rs.avg_hours::numeric, 1)::text
           ELSE NULL END                 AS avg_resolution_hours,
      COALESCE(oc.n, 0)::text           AS open_complaints,
      li.renewal_status,
      li.status                          AS lease_status
    FROM org_tenants ot
    LEFT JOIN payment_stats   ps ON ps.tenant_id = ot.tenant_id
    LEFT JOIN resolution_stats rs ON rs.tenant_id = ot.tenant_id
    LEFT JOIN open_complaints oc ON oc.tenant_id = ot.tenant_id
    LEFT JOIN lease_info      li ON li.tenant_id = ot.tenant_id
  `)

  return (rows as unknown as Array<any>).map((r) => ({
    tenantId: r.tenant_id,
    totalInvoices: Number(r.total_invoices) || 0,
    onTimeInvoices: Number(r.on_time_invoices) || 0,
    avgResolutionHours: r.avg_resolution_hours != null ? Number(r.avg_resolution_hours) : null,
    openComplaints: Number(r.open_complaints) || 0,
    renewalStatus: r.renewal_status,
    leaseStatus: r.lease_status,
  }))
}

const WEIGHTS = {
  payment: 0.40,
  maintenance: 0.25,
  complaints: 0.20,
  renewal: 0.15,
}

export function scoreFromSignals(signals: TenantSignals): TenantSatisfactionResult {
  const breakdown: SatisfactionBreakdown = {
    payment: computePaymentScore(signals.totalInvoices, signals.onTimeInvoices),
    maintenance: computeMaintenanceScore(signals.avgResolutionHours),
    complaints: computeComplaintsScore(signals.openComplaints),
    renewal: computeRenewalScore(signals.renewalStatus, signals.leaseStatus),
  }

  const score = Math.round(
    breakdown.payment * WEIGHTS.payment +
    breakdown.maintenance * WEIGHTS.maintenance +
    breakdown.complaints * WEIGHTS.complaints +
    breakdown.renewal * WEIGHTS.renewal
  )

  return {
    tenantId: signals.tenantId,
    score,
    level: levelFor(score),
    breakdown,
    calculatedAt: new Date().toISOString(),
  }
}

/**
 * Calculate and persist satisfaction for a single tenant.
 */
export async function calculateTenantSatisfaction(
  organizationId: string,
  tenantId: string,
): Promise<TenantSatisfactionResult | null> {
  const signals = await loadSignals(organizationId, tenantId)
  if (signals.length === 0) return null

  const result = scoreFromSignals(signals[0])
  await updateTenantScore(tenantId, result.score)
  // Persist to history table (non-fatal if table doesn't exist yet)
  try { await persistScore(result) } catch { /* migration may not have run */ }
  return result
}

/**
 * Calculate and persist satisfaction for all tenants in an organization.
 */
export async function calculateAllSatisfaction(
  organizationId: string,
): Promise<TenantSatisfactionResult[]> {
  const allSignals = await loadSignals(organizationId)
  const results: TenantSatisfactionResult[] = []

  for (const signals of allSignals) {
    const result = scoreFromSignals(signals)
    results.push(result)
  }

  if (results.length > 0) {
    // Update satisfaction_score on each tenant (normalized to 0-5 scale for existing column)
    for (const r of results) {
      await updateTenantScore(r.tenantId, r.score)
    }

    // Persist to history table (non-fatal if table doesn't exist yet)
    try {
      await db.insert(tenantSatisfaction).values(
        results.map((r) => ({
          tenantId: r.tenantId,
          score: r.score,
          level: r.level,
          breakdown: r.breakdown,
          source: "calculated" as const,
        }))
      )
    } catch {
      /* migration may not have run yet */
    }
  }

  return results.sort((a, b) => a.score - b.score)
}

/**
 * Get the latest satisfaction score for a tenant from the database.
 */
export async function getLatestSatisfaction(
  tenantId: string,
): Promise<TenantSatisfactionResult | null> {
  const rows = await db
    .select()
    .from(tenantSatisfaction)
    .where(eq(tenantSatisfaction.tenantId, tenantId))
    .orderBy(desc(tenantSatisfaction.calculatedAt))
    .limit(1)

  if (rows.length === 0) return null

  const row = rows[0]
  return {
    tenantId: row.tenantId,
    score: row.score,
    level: row.level as SatisfactionLevel,
    breakdown: row.breakdown as SatisfactionBreakdown,
    calculatedAt: row.calculatedAt.toISOString(),
  }
}

async function persistScore(result: TenantSatisfactionResult): Promise<void> {
  await db.insert(tenantSatisfaction).values({
    tenantId: result.tenantId,
    score: result.score,
    level: result.level,
    breakdown: result.breakdown,
    source: "calculated",
  })
}

async function updateTenantScore(tenantId: string, score: number): Promise<void> {
  // Convert 0-100 to 0-5 scale for the existing satisfactionScore column
  const normalized = ((score / 100) * 5).toFixed(2)
  await db
    .update(tenants)
    .set({ satisfactionScore: normalized })
    .where(eq(tenants.id, tenantId))
}
