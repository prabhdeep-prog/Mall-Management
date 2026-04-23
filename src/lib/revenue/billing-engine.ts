/**
 * Mall Revenue Billing Engine
 * ─────────────────────────────────────────────────────────────────────────────
 * Implements the legally correct MG (Minimum Guarantee) billing model used in
 * Indian shopping mall leases.
 *
 * Core formula:
 *   minimumGuarantee  = monthlyMG × (periodDays / 30)
 *   revShareBase      = max(0, grossSales - breakpoint)   [breakpoint optional]
 *   revShareAmount    = revShareBase × revSharePct / 100
 *   amountDue         = max(minimumGuarantee, revShareAmount)
 *   excessOverMG      = max(0, revShareAmount - minimumGuarantee)
 *
 * Responsibilities:
 *   1. Calculate billing for a tenant period
 *   2. Persist an immutable revenue_calculations snapshot
 *   3. Write an audit log entry for every calculation (and recalculation)
 *   4. Apply approved adjustments to produce the final invoice amount
 */

import { db, serviceDb } from "@/lib/db"
import { eq, and, between, sum, count, sql } from "drizzle-orm"
import {
  leases,
  tenants,
  posSalesData,
  posIntegrations,
} from "@/lib/db/schema"

// ── Types ─────────────────────────────────────────────────────────────────────

export interface BillingPeriod {
  startDate: Date   // inclusive
  endDate:   Date   // inclusive
}

export interface BillingInput {
  organizationId: string
  tenantId:       string
  leaseId:        string
  period:         BillingPeriod
  /** Override gross sales (e.g. from manual entry or after adjustment) */
  grossSalesOverride?: number
  calculatedBy?:  string   // user ID
}

export interface BillingResult {
  /** Input snapshot */
  organizationId:   string
  tenantId:         string
  leaseId:          string
  periodStart:      Date
  periodEnd:        Date
  periodDays:       number

  /** Raw sales data */
  grossSales:       number
  netSales:         number
  totalRefunds:     number
  totalDiscounts:   number
  transactionCount: number

  /** Lease parameters at calculation time */
  leaseRevSharePct: number
  leaseMonthlyMG:   number
  leaseBreakpoint:  number | null
  leaseAreaSqft:    number | null

  /** MG Calculation — THE core formula */
  minimumGuarantee: number   // monthlyMG × (days / 30)
  revShareBase:     number   // grossSales above breakpoint
  revShareAmount:   number   // revShareBase × pct / 100
  amountDue:        number   // max(MG, revShareAmount) ← what tenant owes
  excessOverMG:     number   // max(0, revShareAmount - MG) ← landlord upside

  /** KPIs */
  salesPerSqft:     number | null
  avgTicketSize:    number | null

  /** CAM */
  camCharged:       number
  camCapApplied:    boolean

  /** Meta */
  calcVersion:      number
  status:           "draft" | "confirmed" | "invoiced" | "disputed"
}

export interface PeriodSalesAggregate {
  grossSales:       number
  netSales:         number
  totalRefunds:     number
  totalDiscounts:   number
  transactionCount: number
}

// ── Date helpers ──────────────────────────────────────────────────────────────

export function daysBetween(start: Date, end: Date): number {
  const ms = end.getTime() - start.getTime() + 86_400_000 // inclusive
  return Math.round(ms / 86_400_000)
}

/** Returns YYYY-MM-DD string for SQL comparison */
function toDateStr(d: Date): string {
  return d.toISOString().slice(0, 10)
}

// ── Sales aggregation ─────────────────────────────────────────────────────────

/**
 * Aggregates POS sales data for a tenant over a date range.
 * Reads from pos_sales_data (the daily aggregate table).
 */
export async function aggregateSalesForPeriod(
  tenantId: string,
  startDate: Date,
  endDate: Date,
): Promise<PeriodSalesAggregate> {
  // Get all POS integration IDs for this tenant
  const integrations = await db
    .select({ id: posIntegrations.id })
    .from(posIntegrations)
    .where(eq(posIntegrations.tenantId, tenantId))

  if (integrations.length === 0) {
    return { grossSales: 0, netSales: 0, totalRefunds: 0, totalDiscounts: 0, transactionCount: 0 }
  }

  const integrationIds = integrations.map((i) => i.id)

  // Aggregate across all integrations for this tenant
  const rows = await db
    .select({
      grossSales:       sql<string>`COALESCE(SUM(${posSalesData.grossSales}), 0)`,
      netSales:         sql<string>`COALESCE(SUM(${posSalesData.netSales}), 0)`,
      totalRefunds:     sql<string>`COALESCE(SUM(${posSalesData.refunds}), 0)`,
      totalDiscounts:   sql<string>`COALESCE(SUM(${posSalesData.discounts}), 0)`,
      transactionCount: sql<string>`COALESCE(SUM(${posSalesData.transactionCount}), 0)`,
    })
    .from(posSalesData)
    .where(
      and(
        sql`${posSalesData.posIntegrationId} = ANY(ARRAY[${sql.join(integrationIds.map(id => sql`${id}::uuid`), sql`, `)}])`,
        sql`${posSalesData.salesDate} >= ${toDateStr(startDate)}::date`,
        sql`${posSalesData.salesDate} <= ${toDateStr(endDate)}::date`,
      )
    )

  const row = rows[0]
  return {
    grossSales:       parseFloat(row?.grossSales       ?? "0"),
    netSales:         parseFloat(row?.netSales         ?? "0"),
    totalRefunds:     parseFloat(row?.totalRefunds     ?? "0"),
    totalDiscounts:   parseFloat(row?.totalDiscounts   ?? "0"),
    transactionCount: parseInt(row?.transactionCount   ?? "0", 10),
  }
}

// ── MG Calculation ────────────────────────────────────────────────────────────

export interface MGCalculation {
  minimumGuarantee: number
  revShareBase:     number
  revShareAmount:   number
  amountDue:        number
  excessOverMG:     number
}

/**
 * Performs the core MG billing calculation.
 * Pure function — no side effects, fully testable.
 *
 * @param grossSales       Total gross sales for the period
 * @param monthlyMG        Monthly minimum guarantee from lease
 * @param revSharePct      Revenue share percentage (0–100)
 * @param periodDays       Number of days in the billing period
 * @param breakpoint       Optional: rev share only on sales above this amount
 */
export function calculateMGBilling(params: {
  grossSales:   number
  monthlyMG:    number
  revSharePct:  number
  periodDays:   number
  breakpoint?:  number | null
}): MGCalculation {
  const { grossSales, monthlyMG, revSharePct, periodDays, breakpoint } = params

  // Pro-rate MG for partial months (30-day month convention, standard in India)
  const minimumGuarantee = monthlyMG * (periodDays / 30)

  // Revenue share applies only on sales above the breakpoint (if any)
  const revShareBase = breakpoint != null
    ? Math.max(0, grossSales - breakpoint)
    : grossSales

  const revShareAmount = revShareBase * (revSharePct / 100)

  // Tenant pays the higher of MG and revenue share
  const amountDue = Math.max(minimumGuarantee, revShareAmount)

  // Landlord "upside" — how much above MG the rev share is
  const excessOverMG = Math.max(0, revShareAmount - minimumGuarantee)

  return {
    minimumGuarantee: round2(minimumGuarantee),
    revShareBase:     round2(revShareBase),
    revShareAmount:   round2(revShareAmount),
    amountDue:        round2(amountDue),
    excessOverMG:     round2(excessOverMG),
  }
}

function round2(n: number): number {
  return Math.round(n * 100) / 100
}

// ── CAM calculation ───────────────────────────────────────────────────────────

export interface CAMResult {
  estimated:   number
  cap:         number | null
  charged:     number
  capApplied:  boolean
}

export function calculateCAM(params: {
  monthlyCamFromLease: number      // flat monthly CAM from leases.camCharges
  areaSqft:            number | null
  camCapPerSqft:       number | null  // annual cap ₹/sqft
  periodDays:          number
}): CAMResult {
  const { monthlyCamFromLease, areaSqft, camCapPerSqft, periodDays } = params

  // Pro-rate monthly CAM to the period
  const estimated = monthlyCamFromLease * (periodDays / 30)

  // Annual cap pro-rated to period
  let cap: number | null = null
  if (camCapPerSqft != null && areaSqft != null) {
    const annualCap = camCapPerSqft * areaSqft
    cap = annualCap * (periodDays / 365)
  }

  const capApplied = cap != null && estimated > cap
  const charged    = capApplied ? cap! : estimated

  return {
    estimated: round2(estimated),
    cap:       cap != null ? round2(cap) : null,
    charged:   round2(charged),
    capApplied,
  }
}

// ── Main billing calculation ──────────────────────────────────────────────────

/**
 * Calculates revenue billing for a tenant period and persists a snapshot.
 * Idempotent — recalculating increments calc_version, never overwrites.
 */
export async function calculateTenantRevenue(input: BillingInput): Promise<BillingResult> {
  const { organizationId, tenantId, leaseId, period, calculatedBy } = input

  const periodDays = daysBetween(period.startDate, period.endDate)

  // ── 1. Fetch lease ──────────────────────────────────────────────────────────
  const leaseRows = await db
    .select()
    .from(leases)
    .where(and(eq(leases.id, leaseId), eq(leases.tenantId, tenantId)))
    .limit(1)

  if (leaseRows.length === 0) {
    throw new Error(`Lease ${leaseId} not found for tenant ${tenantId}`)
  }
  const lease = leaseRows[0]

  // ── 2. Aggregate sales ──────────────────────────────────────────────────────
  let sales: PeriodSalesAggregate

  if (input.grossSalesOverride != null) {
    // Manual override (used for adjustments or test)
    sales = {
      grossSales:       input.grossSalesOverride,
      netSales:         input.grossSalesOverride,
      totalRefunds:     0,
      totalDiscounts:   0,
      transactionCount: 0,
    }
  } else {
    sales = await aggregateSalesForPeriod(tenantId, period.startDate, period.endDate)
  }

  // ── 3. Billing by lease type ────────────────────────────────────────────────
  const monthlyMG   = parseFloat(String(lease.monthlyMg ?? 0))
  const revSharePct = parseFloat(String(lease.revenueSharePercentage ?? 0))
  const breakpoint  = lease.revShareBreakpoint ? parseFloat(String(lease.revShareBreakpoint)) : null
  const areaSqft    = lease.areaSqft ? parseFloat(String(lease.areaSqft)) : null
  const baseRent    = parseFloat(String(lease.baseRent ?? 0))
  const leaseType   = lease.leaseType ?? "fixed_rent"

  // Apply rent escalation if applicable
  let effectiveBaseRent = baseRent
  let effectiveMonthlyMG = monthlyMG
  if (lease.rentEscalationPercentage && lease.escalationFrequencyMonths) {
    const escalationPct = parseFloat(String(lease.rentEscalationPercentage))
    const escalationMonths = lease.escalationFrequencyMonths
    const leaseStartDate = new Date(lease.startDate)
    const monthsSinceStart = Math.floor((period.startDate.getTime() - leaseStartDate.getTime()) / (30 * 86400000))
    const escalations = Math.floor(monthsSinceStart / escalationMonths)
    if (escalations > 0) {
      const factor = Math.pow(1 + escalationPct / 100, escalations)
      effectiveBaseRent = round2(baseRent * factor)
      effectiveMonthlyMG = round2(monthlyMG * factor)
    }
  }

  let mg: MGCalculation
  if (leaseType === "fixed_rent") {
    // Fixed rent: pro-rate the base rent, no revenue share
    const proratedRent = round2(effectiveBaseRent * (periodDays / 30))
    mg = {
      minimumGuarantee: proratedRent,
      revShareBase: 0,
      revShareAmount: 0,
      amountDue: proratedRent,
      excessOverMG: 0,
    }
  } else if (leaseType === "revenue_share") {
    // Pure revenue share: percentage of sales, no minimum guarantee
    mg = calculateMGBilling({
      grossSales:  sales.grossSales,
      monthlyMG:   0,
      revSharePct,
      periodDays,
      breakpoint,
    })
  } else {
    // Hybrid (default): max(MG, revenue share) — standard Indian mall model
    mg = calculateMGBilling({
      grossSales:  sales.grossSales,
      monthlyMG:   effectiveMonthlyMG,
      revSharePct,
      periodDays,
      breakpoint,
    })
  }

  // ── 4. CAM calculation ──────────────────────────────────────────────────────
  const monthlyCam     = parseFloat(String(lease.camCharges ?? 0))
  const camCapPerSqft  = lease.camCapPerSqft ? parseFloat(String(lease.camCapPerSqft)) : null

  const cam = calculateCAM({
    monthlyCamFromLease: monthlyCam,
    areaSqft,
    camCapPerSqft,
    periodDays,
  })

  // ── 5. KPIs ─────────────────────────────────────────────────────────────────
  const salesPerSqft = areaSqft && areaSqft > 0
    ? round2(sales.grossSales / areaSqft)
    : null
  const avgTicketSize = sales.transactionCount > 0
    ? round2(sales.grossSales / sales.transactionCount)
    : null

  // ── 6. Determine calc_version (for recalculations) ──────────────────────────
  // We use raw SQL via serviceDb to bypass RLS for this write
  const existingVersions = await serviceDb.execute<{ max_version: string }>(
    sql`
      SELECT COALESCE(MAX(calc_version), 0) AS max_version
      FROM revenue_calculations
      WHERE tenant_id = ${tenantId}::uuid
        AND period_start = ${toDateStr(period.startDate)}::date
        AND period_end   = ${toDateStr(period.endDate)}::date
    `
  )
  const calcVersion = parseInt(String(existingVersions[0]?.max_version ?? "0"), 10) + 1

  // ── 7. Persist snapshot ─────────────────────────────────────────────────────
  await serviceDb.execute(sql`
    INSERT INTO revenue_calculations (
      organization_id, tenant_id, lease_id,
      period_start, period_end,
      gross_sales, net_sales, total_refunds, total_discounts, transaction_count,
      lease_rev_share_pct, lease_monthly_mg, lease_breakpoint, lease_area_sqft,
      minimum_guarantee, rev_share_base, rev_share_amount, amount_due, excess_over_mg,
      sales_per_sqft, avg_ticket_size,
      cam_charged, cam_cap_applied,
      calc_version, status,
      calculated_by, calculated_at
    ) VALUES (
      ${organizationId}::uuid, ${tenantId}::uuid, ${leaseId}::uuid,
      ${toDateStr(period.startDate)}::date, ${toDateStr(period.endDate)}::date,
      ${sales.grossSales}, ${sales.netSales}, ${sales.totalRefunds},
      ${sales.totalDiscounts}, ${sales.transactionCount},
      ${revSharePct}, ${monthlyMG}, ${breakpoint ?? null},
      ${areaSqft ?? null},
      ${mg.minimumGuarantee}, ${mg.revShareBase}, ${mg.revShareAmount},
      ${mg.amountDue}, ${mg.excessOverMG},
      ${salesPerSqft ?? null}, ${avgTicketSize ?? null},
      ${cam.charged}, ${cam.capApplied},
      ${calcVersion}, 'draft',
      ${calculatedBy ?? null}::uuid, NOW()
    )
  `)

  // ── 8. Write audit log ──────────────────────────────────────────────────────
  await serviceDb.execute(sql`
    INSERT INTO revenue_audit_log (
      organization_id, entity_type, entity_id,
      action, actor_id,
      new_values, occurred_at
    )
    SELECT
      ${organizationId}::uuid,
      'revenue_calculation',
      id,
      ${calcVersion === 1 ? "created" : "recalculated"},
      ${calculatedBy ?? null}::uuid,
      jsonb_build_object(
        'amount_due',           ${mg.amountDue},
        'minimum_guarantee',    ${mg.minimumGuarantee},
        'rev_share_amount',     ${mg.revShareAmount},
        'gross_sales',          ${sales.grossSales},
        'calc_version',         ${calcVersion}
      ),
      NOW()
    FROM revenue_calculations
    WHERE tenant_id = ${tenantId}::uuid
      AND period_start = ${toDateStr(period.startDate)}::date
      AND period_end   = ${toDateStr(period.endDate)}::date
      AND calc_version = ${calcVersion}
  `)

  return {
    organizationId,
    tenantId,
    leaseId,
    periodStart:      period.startDate,
    periodEnd:        period.endDate,
    periodDays,
    grossSales:       sales.grossSales,
    netSales:         sales.netSales,
    totalRefunds:     sales.totalRefunds,
    totalDiscounts:   sales.totalDiscounts,
    transactionCount: sales.transactionCount,
    leaseRevSharePct: revSharePct,
    leaseMonthlyMG:   monthlyMG,
    leaseBreakpoint:  breakpoint,
    leaseAreaSqft:    areaSqft,
    minimumGuarantee: mg.minimumGuarantee,
    revShareBase:     mg.revShareBase,
    revShareAmount:   mg.revShareAmount,
    amountDue:        mg.amountDue,
    excessOverMG:     mg.excessOverMG,
    salesPerSqft,
    avgTicketSize,
    camCharged:       cam.charged,
    camCapApplied:    cam.capApplied,
    calcVersion,
    status:           "draft",
  }
}

// ── Adjustment application ────────────────────────────────────────────────────

export interface AdjustedInvoice {
  baseAmountDue:     number
  totalAdjustments:  number
  finalAmountDue:    number
  adjustments:       Array<{ id: string; type: string; amount: number; reason: string }>
}

/**
 * Applies all approved adjustments to a revenue calculation to produce
 * the final invoice amount. Adjustments are NOT baked into the snapshot —
 * they remain a separate audit trail.
 *
 * @param calcId  The revenue_calculations.id to apply adjustments to
 */
export async function applyAdjustments(calcId: string): Promise<AdjustedInvoice> {
  // Fetch the base calculation
  const calcs = await serviceDb.execute<{
    amount_due: string
  }>(sql`
    SELECT amount_due FROM revenue_calculations WHERE id = ${calcId}::uuid
  `)

  if (calcs.length === 0) throw new Error(`Revenue calculation ${calcId} not found`)
  const baseAmountDue = parseFloat(calcs[0].amount_due)

  // Fetch all approved adjustments
  const adjRows = await serviceDb.execute<{
    id: string; adjustment_type: string; amount: string; reason: string
  }>(sql`
    SELECT id, adjustment_type, amount, reason
    FROM revenue_adjustments
    WHERE revenue_calc_id = ${calcId}::uuid
      AND status = 'approved'
  `)

  const adjustments = Array.from(adjRows).map((r) => ({
    id:     r.id,
    type:   r.adjustment_type,
    amount: parseFloat(r.amount),
    reason: r.reason,
  }))

  const totalAdjustments = adjustments.reduce((sum, a) => sum + a.amount, 0)
  const finalAmountDue   = round2(Math.max(0, baseAmountDue - totalAdjustments))

  return {
    baseAmountDue,
    totalAdjustments: round2(totalAdjustments),
    finalAmountDue,
    adjustments,
  }
}

// ── Bulk calculation (for month-end runs) ────────────────────────────────────

/**
 * Calculates revenue for ALL active tenants in an organization for a period.
 * Returns results + any per-tenant errors (non-fatal).
 */
export async function calculateAllTenantsRevenue(
  organizationId: string,
  period: BillingPeriod,
  calculatedBy?: string,
): Promise<{
  results: BillingResult[]
  errors:  Array<{ tenantId: string; error: string }>
}> {
  // Find all tenants with active leases in this period
  const activeTenants = await serviceDb.execute<{
    tenant_id: string; lease_id: string
  }>(sql`
    SELECT t.id AS tenant_id, l.id AS lease_id
    FROM tenants t
    JOIN leases l ON l.tenant_id = t.id
    WHERE t.organization_id = ${organizationId}::uuid
      AND l.status = 'active'
      AND l.start_date <= ${toDateStr(period.endDate)}::date
      AND (l.end_date IS NULL OR l.end_date >= ${toDateStr(period.startDate)}::date)
  `)

  const results: BillingResult[] = []
  const errors: Array<{ tenantId: string; error: string }> = []

  // Process sequentially to avoid overwhelming DB
  for (const row of activeTenants) {
    try {
      const result = await calculateTenantRevenue({
        organizationId,
        tenantId: row.tenant_id,
        leaseId:  row.lease_id,
        period,
        calculatedBy,
      })
      results.push(result)
    } catch (err) {
      errors.push({
        tenantId: row.tenant_id,
        error:    err instanceof Error ? err.message : String(err),
      })
    }
  }

  return { results, errors }
}
