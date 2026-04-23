import { NextRequest, NextResponse } from "next/server"
import { requireTenantSession } from "@/lib/auth/tenant-session"
import { withTenantContext } from "@/lib/db/with-tenant-context"
import { sql } from "drizzle-orm"

const DEFAULT_PAGE = 1
const DEFAULT_LIMIT = 20
const MAX_LIMIT = 100

/**
 * GET /api/tenant/invoices?page=1&limit=20
 *
 * Returns paginated invoices for the authenticated tenant.
 * RLS enforced via current_setting('app.current_tenant_id').
 *
 * Each row:
 *   invoiceNumber, periodStart, periodEnd, totalAmount,
 *   paidAmount, dueDate, status, pdfUrl
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
      // Total count for pagination metadata
      const [countRow] = await tx.execute<{ total: string }>(sql`
        SELECT COUNT(*) AS total
        FROM invoices i
        INNER JOIN leases l ON l.id = i.lease_id
        WHERE l.tenant_id = current_setting('app.current_tenant_id')::uuid
      `)

      const total = parseInt(countRow?.total ?? "0", 10)

      // Paginated invoices with optional PDF url from documents table
      const rows = await tx.execute<{
        id: string
        invoice_number: string
        period_start: string
        period_end: string
        total_amount: string
        paid_amount: string | null
        due_date: string
        status: string
        pdf_url: string | null
      }>(sql`
        SELECT
          i.id,
          i.invoice_number,
          i.period_start,
          i.period_end,
          i.total_amount,
          COALESCE(i.paid_amount, '0') AS paid_amount,
          i.due_date,
          i.status,
          d.url AS pdf_url
        FROM invoices i
        INNER JOIN leases l ON l.id = i.lease_id
        LEFT JOIN LATERAL (
          SELECT url
          FROM documents doc
          WHERE doc.type = 'invoice_pdf'
            AND doc.tenant_id = l.tenant_id
            AND (
              doc.metadata->>'invoice_id' = i.id::text
              OR (doc.lease_id = l.id AND doc.name ILIKE '%' || i.invoice_number || '%')
            )
          ORDER BY doc.created_at DESC
          LIMIT 1
        ) d ON true
        WHERE l.tenant_id = current_setting('app.current_tenant_id')::uuid
        ORDER BY i.created_at DESC
        LIMIT ${limit}
        OFFSET ${offset}
      `)

      const invoices = Array.isArray(rows) ? rows : []

      return {
        invoices: invoices.map((r) => ({
          id:            r.id,
          invoiceNumber: r.invoice_number,
          periodStart:   r.period_start,
          periodEnd:     r.period_end,
          totalAmount:   parseFloat(r.total_amount),
          paidAmount:    parseFloat(r.paid_amount ?? "0"),
          dueDate:       r.due_date,
          status:        r.status,
          pdfUrl:        r.pdf_url,
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
    console.error("Tenant invoices error:", err)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
