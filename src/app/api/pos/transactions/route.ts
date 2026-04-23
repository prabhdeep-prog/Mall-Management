import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { db } from "@/lib/db"
import { sql } from "drizzle-orm"
import { requirePermission, PERMISSIONS } from "@/lib/auth/rbac"

const DEFAULT_PAGE = 1
const DEFAULT_LIMIT = 20
const MAX_LIMIT = 100

/**
 * GET /api/pos/transactions
 *
 * Query params:
 *   tenantId          — required, UUID
 *   from              — start date inclusive (YYYY-MM-DD, default: 30 days ago)
 *   to                — end date inclusive   (YYYY-MM-DD, default: today)
 *   paymentMethod     — optional filter ('card','upi','cash','wallet','mixed')
 *   transactionType   — optional filter ('sale','refund','void','partial_payment')
 *   page              — 1-based (default: 1)
 *   limit             — max 100 (default: 20)
 *
 * Response:
 *   transactions[]    — paginated list
 *   totals            — aggregate sums across the full filtered set
 *   pagination        — { page, limit, total, totalPages }
 */
export async function GET(request: NextRequest) {
  const session = await auth()
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }
  const { authorized, error: permError } = await requirePermission(PERMISSIONS.POS_VIEW)
  if (!authorized) return NextResponse.json({ error: permError }, { status: 403 })

  const { searchParams } = request.nextUrl

  // ── Required ────────────────────────────────────────────────────────────
  const tenantId = searchParams.get("tenantId")
  if (!tenantId) {
    return NextResponse.json(
      { success: false, error: "tenantId is required" },
      { status: 400 },
    )
  }

  // ── Date range (default: last 30 days) ─────────────────────────────────
  const now = new Date()
  const defaultFrom = new Date(now.getTime() - 30 * 86_400_000)
    .toISOString()
    .slice(0, 10)
  const defaultTo = now.toISOString().slice(0, 10)

  const from = searchParams.get("from") ?? defaultFrom
  const to   = searchParams.get("to")   ?? defaultTo

  // ── Optional filters ───────────────────────────────────────────────────
  const paymentMethod   = searchParams.get("paymentMethod")
  const transactionType = searchParams.get("transactionType")

  // ── Pagination ─────────────────────────────────────────────────────────
  const page   = Math.max(1, parseInt(searchParams.get("page") ?? `${DEFAULT_PAGE}`, 10) || DEFAULT_PAGE)
  const limit  = Math.min(MAX_LIMIT, Math.max(1, parseInt(searchParams.get("limit") ?? `${DEFAULT_LIMIT}`, 10) || DEFAULT_LIMIT))
  const offset = (page - 1) * limit

  // ── Build WHERE fragments ──────────────────────────────────────────────
  const paymentMethodFilter   = paymentMethod   ? sql`AND payment_method = ${paymentMethod}`       : sql``
  const transactionTypeFilter = transactionType ? sql`AND transaction_type = ${transactionType}`   : sql``

  const whereClause = sql`
    tenant_id = ${tenantId}::uuid
    AND transacted_at >= ${from}::date
    AND transacted_at <  (${to}::date + INTERVAL '1 day')
    ${paymentMethodFilter}
    ${transactionTypeFilter}
  `

  try {
    // ── 1. Total count ──────────────────────────────────────────────────
    const [countRow] = await db.execute<{ total: string }>(sql`
      SELECT COUNT(*) AS total
      FROM pos_transactions
      WHERE ${whereClause}
    `)
    const total = parseInt(countRow?.total ?? "0", 10)

    // ── 2. Totals across full filtered set ──────────────────────────────
    const [totalsRow] = await db.execute<{
      txn_count:       string
      gross_total:     string
      net_total:       string
      discount_total:  string
      tax_total:       string
      refund_total:    string
    }>(sql`
      SELECT
        COUNT(*)                            AS txn_count,
        COALESCE(SUM(gross_amount),  0)     AS gross_total,
        COALESCE(SUM(net_amount),    0)     AS net_total,
        COALESCE(SUM(discount_amount), 0)   AS discount_total,
        COALESCE(SUM(tax_amount),    0)     AS tax_total,
        COALESCE(SUM(refund_amount), 0)     AS refund_total
      FROM pos_transactions
      WHERE ${whereClause}
    `)

    // ── 3. Paginated rows ───────────────────────────────────────────────
    const rows = await db.execute<{
      id:               string
      external_id:      string
      gross_amount:     string
      net_amount:       string
      discount_amount:  string
      tax_amount:       string
      refund_amount:    string
      transaction_type: string
      payment_method:   string | null
      status:           string
      currency:         string
      terminal_id:      string | null
      transacted_at:    string
    }>(sql`
      SELECT
        id, external_id,
        gross_amount, net_amount, discount_amount, tax_amount, refund_amount,
        transaction_type, payment_method, status, currency,
        terminal_id, transacted_at
      FROM pos_transactions
      WHERE ${whereClause}
      ORDER BY transacted_at DESC
      LIMIT ${limit}
      OFFSET ${offset}
    `)

    const transactions = (Array.isArray(rows) ? rows : []).map((r) => ({
      id:              r.id,
      externalId:      r.external_id,
      grossAmount:     parseFloat(r.gross_amount),
      netAmount:       parseFloat(r.net_amount),
      discountAmount:  parseFloat(r.discount_amount),
      taxAmount:       parseFloat(r.tax_amount),
      refundAmount:    parseFloat(r.refund_amount),
      transactionType: r.transaction_type,
      paymentMethod:   r.payment_method,
      status:          r.status,
      currency:        r.currency,
      terminalId:      r.terminal_id,
      transactedAt:    r.transacted_at,
    }))

    return NextResponse.json({
      success: true,
      data: {
        transactions,
        totals: {
          txnCount:      parseInt(totalsRow?.txn_count ?? "0", 10),
          grossTotal:    parseFloat(totalsRow?.gross_total ?? "0"),
          netTotal:      parseFloat(totalsRow?.net_total ?? "0"),
          discountTotal: parseFloat(totalsRow?.discount_total ?? "0"),
          taxTotal:      parseFloat(totalsRow?.tax_total ?? "0"),
          refundTotal:   parseFloat(totalsRow?.refund_total ?? "0"),
        },
        pagination: {
          page,
          limit,
          total,
          totalPages: Math.ceil(total / limit),
        },
      },
    })
  } catch (error) {
    console.error("Error fetching POS transactions:", error)
    return NextResponse.json(
      { success: false, error: "Failed to fetch transactions" },
      { status: 500 },
    )
  }
}
