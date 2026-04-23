/**
 * POS Transaction Aggregation Queries
 * ─────────────────────────────────────────────────────────────────────────────
 * Reusable query functions against the pos_transactions table.
 * All queries run inside the caller's transaction/context so RLS applies.
 */

import { sql, type SQL } from "drizzle-orm"
import type { PgTransaction } from "drizzle-orm/pg-core"

// ── Result types ─────────────────────────────────────────────────────────────

export interface PaymentMethodAggregate {
  paymentMethod: string
  txnCount:      number
  total:         number
}

// ── Raw row shapes (DB returns strings for numeric/count columns) ────────────

interface PaymentMethodRow extends Record<string, unknown> {
  payment_method: string | null
  txn_count:      string
  total:          string
}

// ── Queries ──────────────────────────────────────────────────────────────────

/**
 * Aggregate transactions by payment method for a tenant within a date range.
 *
 *   SELECT payment_method, COUNT(*), SUM(net_amount)
 *   FROM   pos_transactions
 *   WHERE  tenant_id = $1 AND transacted_at BETWEEN $2 AND $3
 *   GROUP  BY payment_method
 */
export async function aggregateByPaymentMethod(
  tx:       Pick<PgTransaction<any, any, any>, "execute">,
  tenantId: string,
  from:     string,   // YYYY-MM-DD inclusive
  to:       string,   // YYYY-MM-DD inclusive
): Promise<PaymentMethodAggregate[]> {
  const rows = await tx.execute<PaymentMethodRow>(sql`
    SELECT
      COALESCE(payment_method, 'unknown') AS payment_method,
      COUNT(*)                            AS txn_count,
      COALESCE(SUM(net_amount), 0)        AS total
    FROM pos_transactions
    WHERE tenant_id    = ${tenantId}::uuid
      AND transacted_at >= ${from}::date
      AND transacted_at  < (${to}::date + INTERVAL '1 day')
    GROUP BY payment_method
    ORDER BY total DESC
  `)

  return (Array.isArray(rows) ? rows : []).map((r) => ({
    paymentMethod: r.payment_method ?? "unknown",
    txnCount:      parseInt(r.txn_count, 10),
    total:         parseFloat(r.total),
  }))
}
