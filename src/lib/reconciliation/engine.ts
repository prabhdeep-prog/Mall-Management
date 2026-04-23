/**
 * POS ↔ Invoice Reconciliation Engine
 * ─────────────────────────────────────────────────────────────────────────────
 * Compares POS-reported net sales against billed amount_due for a
 * tenant/period and persists the result.
 *
 * reconcileTenant(tenantId, periodStart, periodEnd)
 *   1. Fetch POS total          — SUM(net_amount) from pos_transactions
 *   2. Fetch invoice total      — SUM(amount_due) from revenue_calculations
 *   3. Calculate variance       — posTotal − invoiceTotal
 *   4. Upsert reconciliation    — full upsert (all fields updated on conflict)
 *   5. Flag transition guard    — adjustment invoice only on non-flagged → flagged
 *   6. Duplicate protection     — check for existing adjustment invoice before create
 */

import { serviceDb } from "@/lib/db"
import { sql } from "drizzle-orm"

// ── Types ────────────────────────────────────────────────────────────────────

export interface ReconciliationResult {
  id:              string
  tenantId:        string
  leaseId:         string | null
  periodStart:     string
  periodEnd:       string
  posTotal:        number
  invoiceTotal:    number
  variance:        number
  status:          string
  previousStatus:  string | null   // null when record is newly created
  adjustmentId:    string | null
}

// ── Configuration ────────────────────────────────────────────────────────────

const VARIANCE_THRESHOLD = parseFloat(process.env.RECON_VARIANCE_THRESHOLD ?? "1000")

// ── Raw row shapes ───────────────────────────────────────────────────────────

interface SumRow extends Record<string, unknown> {
  total: string
}

interface LeaseRow extends Record<string, unknown> {
  lease_id:        string
  organization_id: string
  property_id:     string
}

interface UpsertedRow extends Record<string, unknown> {
  id:              string
  previous_status: string | null   // null → this was a fresh INSERT (no prior row)
}

interface ExistingInvoiceRow extends Record<string, unknown> {
  id: string
}

// ── Engine ───────────────────────────────────────────────────────────────────

export async function reconcileTenant(
  tenantId:    string,
  periodStart: string,   // YYYY-MM-DD
  periodEnd:   string,   // YYYY-MM-DD
): Promise<ReconciliationResult> {
  // ── 0. Resolve lease + org for this tenant ────────────────────────────
  const leaseRows = await serviceDb.execute<LeaseRow>(sql`
    SELECT l.id AS lease_id, t.organization_id, l.property_id
    FROM tenants t
    JOIN leases l ON l.tenant_id = t.id AND l.status = 'active'
    WHERE t.id = ${tenantId}::uuid
    ORDER BY l.start_date DESC
    LIMIT 1
  `)

  const leaseId        = leaseRows[0]?.lease_id        ?? null
  const organizationId = leaseRows[0]?.organization_id ?? null

  // ── 1. Fetch POS total ────────────────────────────────────────────────
  const [posRow] = await serviceDb.execute<SumRow>(sql`
    SELECT COALESCE(SUM(net_amount), 0) AS total
    FROM pos_transactions
    WHERE tenant_id      = ${tenantId}::uuid
      AND transacted_at >= ${periodStart}::date
      AND transacted_at <  (${periodEnd}::date + INTERVAL '1 day')
  `)
  const posTotal = parseFloat(posRow?.total ?? "0")

  // ── 2. Fetch invoice total ────────────────────────────────────────────
  const [invRow] = await serviceDb.execute<SumRow>(sql`
    SELECT COALESCE(SUM(rc.amount_due), 0) AS total
    FROM revenue_calculations rc
    INNER JOIN (
      SELECT tenant_id, period_start, period_end, MAX(calc_version) AS max_ver
      FROM revenue_calculations
      WHERE tenant_id    = ${tenantId}::uuid
        AND period_start >= ${periodStart}::date
        AND period_end   <= ${periodEnd}::date
      GROUP BY tenant_id, period_start, period_end
    ) latest
      ON  rc.tenant_id    = latest.tenant_id
      AND rc.period_start  = latest.period_start
      AND rc.period_end    = latest.period_end
      AND rc.calc_version  = latest.max_ver
  `)
  const invoiceTotal = parseFloat(invRow?.total ?? "0")

  // ── 3. Calculate variance + status ───────────────────────────────────
  const variance    = round2(posTotal - invoiceTotal)
  const absVariance = Math.abs(variance)

  const newStatus: string = absVariance > VARIANCE_THRESHOLD ? "flagged" : "matched"

  // ── 4. Upsert — CTE captures previous status before the write ─────────
  //
  // The CTE "prev" reads the existing row (if any) before the INSERT/UPDATE
  // so we can detect status transitions without a separate SELECT round-trip.
  //
  // All financial fields are updated on conflict so that:
  //   • A flagged record becomes matched when the variance closes
  //   • The displayed totals always reflect the latest recalculation
  //
  const [upserted] = await serviceDb.execute<UpsertedRow>(sql`
    WITH prev AS (
      SELECT status
      FROM pos_reconciliation
      WHERE tenant_id   = ${tenantId}::uuid
        AND period_start = ${periodStart}::date
        AND period_end   = ${periodEnd}::date
    ),
    upserted AS (
      INSERT INTO pos_reconciliation (
        tenant_id, lease_id, organization_id,
        period_start, period_end,
        pos_total, invoice_total, variance,
        status
      ) VALUES (
        ${tenantId}::uuid,
        ${leaseId}::uuid,
        ${organizationId}::uuid,
        ${periodStart}::date,
        ${periodEnd}::date,
        ${posTotal},
        ${invoiceTotal},
        ${variance},
        ${newStatus}
      )
      ON CONFLICT (tenant_id, period_start, period_end) DO UPDATE SET
        pos_total     = EXCLUDED.pos_total,
        invoice_total = EXCLUDED.invoice_total,
        variance      = EXCLUDED.variance,
        status        = EXCLUDED.status,
        updated_at    = NOW()
      RETURNING id
    )
    SELECT u.id, p.status AS previous_status
    FROM upserted u
    LEFT JOIN prev p ON true
  `)

  const previousStatus = upserted.previous_status ?? null

  // ── 5. Adjustment invoice — only on non-flagged → flagged transition ──
  //
  // Three states where we must NOT create an invoice:
  //   a) Status didn't change:   was already flagged, still flagged
  //   b) Resolving:              was flagged, now matched
  //   c) New record matched:     first run, variance within threshold
  //
  // We only act when the record is newly flagged: previousStatus !== 'flagged'
  // AND newStatus === 'flagged'.
  //
  let adjustmentId: string | null = null

  const isFreshFlag = newStatus === "flagged" && previousStatus !== "flagged"

  if (isFreshFlag && leaseId && organizationId) {
    // ── 5a. Duplicate protection ────────────────────────────────────────
    //    A crashed cron or race condition could reach here twice. Guard with
    //    a SELECT before INSERT so we never create two adjustment invoices
    //    for the same period.
    const existing = await serviceDb.execute<ExistingInvoiceRow>(sql`
      SELECT id
      FROM invoices
      WHERE lease_id       = ${leaseId}::uuid
        AND period_start   = ${periodStart}::date
        AND period_end     = ${periodEnd}::date
        AND invoice_type   = 'adjustment'
      LIMIT 1
    `)

    if (existing.length === 0) {
      // ── 5b. In-app notification ─────────────────────────────────────
      await serviceDb.execute(sql`
        INSERT INTO notifications (
          recipient_id, recipient_type,
          type, channel,
          title, content,
          auto_generated,
          metadata
        ) VALUES (
          ${organizationId}::uuid, 'organization',
          'reconciliation_variance', 'in_app',
          ${'POS reconciliation variance detected'},
          ${`Tenant ${tenantId} period ${periodStart}–${periodEnd}: POS ₹${posTotal.toLocaleString("en-IN")} vs billed ₹${invoiceTotal.toLocaleString("en-IN")} (variance ₹${variance.toLocaleString("en-IN")})`},
          true,
          ${JSON.stringify({
            reconciliationId: upserted.id,
            tenantId,
            leaseId,
            posTotal,
            invoiceTotal,
            variance,
            periodStart,
            periodEnd,
          })}::jsonb
        )
      `)

      // ── 5c. Create adjustment invoice ───────────────────────────────
      adjustmentId = await createAdjustmentInvoice({
        leaseId,
        reconciliationId: upserted.id,
        amount:           variance,
        periodStart,
        periodEnd,
      })
    }
  }

  return {
    id:            upserted.id,
    tenantId,
    leaseId,
    periodStart,
    periodEnd,
    posTotal:      round2(posTotal),
    invoiceTotal:  round2(invoiceTotal),
    variance,
    status:        newStatus,
    previousStatus,
    adjustmentId,
  }
}

// ── Adjustment invoice helper ────────────────────────────────────────────────

interface AdjustmentInput {
  leaseId:          string
  reconciliationId: string
  amount:           number
  periodStart:      string
  periodEnd:        string
}

interface InsertedRow extends Record<string, unknown> {
  id: string
}

async function createAdjustmentInvoice(input: AdjustmentInput): Promise<string> {
  const invoiceNumber = `ADJ-${new Date().getFullYear()}-${Math.floor(Math.random() * 100000).toString().padStart(6, "0")}`
  const dueDate = new Date()
  dueDate.setDate(dueDate.getDate() + 30)

  const [row] = await serviceDb.execute<InsertedRow>(sql`
    INSERT INTO invoices (
      lease_id, invoice_number, invoice_type,
      period_start, period_end,
      amount, gst_amount, total_amount,
      due_date, status, notes,
      metadata
    ) VALUES (
      ${input.leaseId}::uuid,
      ${invoiceNumber},
      'adjustment',
      ${input.periodStart}::date,
      ${input.periodEnd}::date,
      ${Math.abs(input.amount)},
      ${'0'},
      ${Math.abs(input.amount)},
      ${dueDate.toISOString().slice(0, 10)}::date,
      'pending',
      ${`Auto-generated reconciliation adjustment (variance ₹${input.amount.toLocaleString("en-IN")})`},
      ${JSON.stringify({
        type:             "reconciliation_adjustment",
        reconciliationId: input.reconciliationId,
        variance:         input.amount,
      })}::jsonb
    )
    RETURNING id
  `)

  return row.id
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function round2(n: number): number {
  return Math.round(n * 100) / 100
}
