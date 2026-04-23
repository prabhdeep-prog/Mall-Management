import { NextRequest, NextResponse } from "next/server"
import { requireTenantSession } from "@/lib/auth/tenant-session"
import { withTenantContext } from "@/lib/db/with-tenant-context"
import { sql } from "drizzle-orm"

/**
 * GET /api/tenant/sales
 *
 * Query params:
 *   from           — start date inclusive (YYYY-MM-DD, default: 30 days ago)
 *   to             — end date inclusive   (YYYY-MM-DD, default: today)
 *   payment_mode   — filter by payment mode ('card','upi','cash','wallet')
 *   category       — filter by transaction type / merchant category
 *
 * Response:
 *   dailyTotals          — per-day breakdown (date, grossAmount, netAmount, txCount, avgTicket)
 *   transactionCount     — total transactions in range
 *   avgTicketSize        — overall average net_amount per transaction
 *   paymentMethodBreakdown — per-payment_mode aggregates
 */
export async function GET(request: NextRequest) {
  let ctx
  try {
    ctx = await requireTenantSession()
  } catch (res) {
    return res as Response
  }

  const { tenantId } = ctx
  const { searchParams } = request.nextUrl

  // ── Date range defaults: last 30 days ──────────────────────────────────────
  const now = new Date()
  const defaultFrom = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000)
    .toISOString().split("T")[0]
  const defaultTo = now.toISOString().split("T")[0]

  const from = searchParams.get("from") ?? defaultFrom
  const to   = searchParams.get("to")   ?? defaultTo

  // ── Optional filters ───────────────────────────────────────────────────────
  const paymentMode = searchParams.get("payment_mode")
  const category    = searchParams.get("category")

  // Build optional WHERE fragments (safe: parameterized via drizzle sql``)
  const modeFilter     = paymentMode ? sql`AND t.payment_mode = ${paymentMode}` : sql``
  const categoryFilter = category    ? sql`AND t.category     = ${category}`    : sql``

  try {
    const data = await withTenantContext(tenantId, async (tx) => {
      const tenantFilter = sql`
        t.tenant_id = current_setting('app.current_tenant_id')::uuid
        AND t.transaction_date >= ${from}::date
        AND t.transaction_date <= ${to}::date
        ${modeFilter}
        ${categoryFilter}
      `

      // 1. Daily totals
      const dailyTotals = await tx.execute<{
        date: string
        gross_amount: string
        net_amount: string
        tx_count: string
        avg_ticket: string
      }>(sql`
        SELECT
          t.transaction_date                              AS date,
          SUM(t.gross_amount)                             AS gross_amount,
          SUM(t.net_amount)                               AS net_amount,
          COUNT(*)                                        AS tx_count,
          ROUND(AVG(t.net_amount), 2)                     AS avg_ticket
        FROM pos_transactions t
        WHERE ${tenantFilter}
        GROUP BY t.transaction_date
        ORDER BY t.transaction_date DESC
      `)

      // 2. Overall aggregates
      const [totals] = await tx.execute<{
        transaction_count: string
        avg_ticket_size: string
      }>(sql`
        SELECT
          COUNT(*)                   AS transaction_count,
          ROUND(AVG(t.net_amount), 2) AS avg_ticket_size
        FROM pos_transactions t
        WHERE ${tenantFilter}
      `)

      // 3. Payment method breakdown
      const methodBreakdown = await tx.execute<{
        payment_mode: string | null
        gross_amount: string
        net_amount: string
        tx_count: string
        avg_ticket: string
      }>(sql`
        SELECT
          COALESCE(t.payment_mode, 'unknown')             AS payment_mode,
          SUM(t.gross_amount)                             AS gross_amount,
          SUM(t.net_amount)                               AS net_amount,
          COUNT(*)                                        AS tx_count,
          ROUND(AVG(t.net_amount), 2)                     AS avg_ticket
        FROM pos_transactions t
        WHERE ${tenantFilter}
        GROUP BY t.payment_mode
        ORDER BY net_amount DESC
      `)

      const toRows = (rows: unknown) => (Array.isArray(rows) ? rows : []) as Record<string, string>[]

      return {
        dailyTotals: toRows(dailyTotals).map((r) => ({
          date:        r.date,
          grossAmount: parseFloat(r.gross_amount),
          netAmount:   parseFloat(r.net_amount),
          txCount:     parseInt(r.tx_count, 10),
          avgTicket:   parseFloat(r.avg_ticket),
        })),
        transactionCount: parseInt(totals?.transaction_count ?? "0", 10),
        avgTicketSize:    parseFloat(totals?.avg_ticket_size ?? "0"),
        paymentMethodBreakdown: toRows(methodBreakdown).map((r) => ({
          paymentMode: r.payment_mode,
          grossAmount: parseFloat(r.gross_amount),
          netAmount:   parseFloat(r.net_amount),
          txCount:     parseInt(r.tx_count, 10),
          avgTicket:   parseFloat(r.avg_ticket),
        })),
        filters: { from, to, paymentMode, category },
      }
    })

    return NextResponse.json({ success: true, data })
  } catch (err) {
    console.error("Tenant sales error:", err)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
