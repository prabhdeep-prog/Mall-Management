import { NextRequest, NextResponse } from "next/server"
import { requireTenantSession } from "@/lib/auth/tenant-session"
import { withTenantContext } from "@/lib/db/with-tenant-context"
import { sql } from "drizzle-orm"

const DEFAULT_PAGE = 1
const DEFAULT_LIMIT = 20
const MAX_LIMIT = 100

/**
 * GET /api/tenant/payments?page=1&limit=20
 *
 * Returns paginated payments for the authenticated tenant.
 * RLS enforced via current_setting('app.current_tenant_id').
 *
 * Each row:
 *   paymentDate, amount, paymentMethod, invoiceNumber, receiptUrl
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

  const page  = Math.max(1, parseInt(searchParams.get("page") ?? `${DEFAULT_PAGE}`, 10) || DEFAULT_PAGE)
  const limit = Math.min(MAX_LIMIT, Math.max(1, parseInt(searchParams.get("limit") ?? `${DEFAULT_LIMIT}`, 10) || DEFAULT_LIMIT))
  const offset = (page - 1) * limit

  try {
    const data = await withTenantContext(tenantId, async (tx) => {
      // Total count
      const [countRow] = await tx.execute<{ total: string }>(sql`
        SELECT COUNT(*) AS total
        FROM payments p
        INNER JOIN invoices i ON i.id = p.invoice_id
        INNER JOIN leases  l ON l.id = i.lease_id
        WHERE l.tenant_id = current_setting('app.current_tenant_id')::uuid
      `)

      const total = parseInt(countRow?.total ?? "0", 10)

      // Paginated payments with invoice reference and receipt URL
      const rows = await tx.execute<{
        id: string
        payment_date: string
        amount: string
        payment_method: string | null
        reference_number: string | null
        invoice_number: string
        invoice_id: string
        receipt_url: string | null
      }>(sql`
        SELECT
          p.id,
          p.payment_date,
          p.amount,
          p.payment_method,
          p.reference_number,
          i.invoice_number,
          i.id AS invoice_id,
          COALESCE(
            d.url,
            CASE WHEN p.metadata->>'receiptNumber' IS NOT NULL
              THEN '/api/tenant/payments/' || p.id || '/receipt'
            END
          ) AS receipt_url
        FROM payments p
        INNER JOIN invoices i ON i.id = p.invoice_id
        INNER JOIN leases   l ON l.id = i.lease_id
        LEFT JOIN LATERAL (
          SELECT doc.url
          FROM documents doc
          WHERE doc.type = 'payment_receipt'
            AND doc.tenant_id = l.tenant_id
            AND doc.metadata->>'payment_id' = p.id::text
          ORDER BY doc.created_at DESC
          LIMIT 1
        ) d ON true
        WHERE l.tenant_id = current_setting('app.current_tenant_id')::uuid
        ORDER BY p.payment_date DESC
        LIMIT ${limit}
        OFFSET ${offset}
      `)

      const payments = Array.isArray(rows) ? rows : []

      return {
        payments: payments.map((r) => ({
          id:              r.id,
          paymentDate:     r.payment_date,
          amount:          parseFloat(r.amount),
          paymentMethod:   r.payment_method,
          referenceNumber: r.reference_number,
          invoiceNumber:   r.invoice_number,
          invoiceId:       r.invoice_id,
          receiptUrl:      r.receipt_url,
        })),
        pagination: {
          page,
          limit,
          total,
          totalPages: Math.ceil(total / limit),
        },
      }
    })

    return NextResponse.json({ success: true, data })
  } catch (err) {
    console.error("Tenant payments error:", err)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
