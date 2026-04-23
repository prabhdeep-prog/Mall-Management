import { NextResponse } from "next/server"
import { requireTenantSession } from "@/lib/auth/tenant-session"
import { withTenantContext } from "@/lib/db/with-tenant-context"
import { getCachedOrFetch, CACHE_TTL } from "@/lib/cache"
import { sql } from "drizzle-orm"

/**
 * GET /api/tenant/dashboard
 *
 * Returns a single-row summary for the authenticated tenant:
 *   - totalOutstanding  — sum of unpaid invoice amounts
 *   - lastPaymentDate   — most recent payment date
 *   - lastPaymentAmount — most recent payment amount
 *   - currentMonthSales — net POS sales for the current calendar month
 *   - leaseEndDate      — end date of the active lease
 *   - daysToLeaseExpiry — days remaining until lease expires
 *   - invoiceCount      — total number of invoices
 *
 * All queries run inside withTenantContext which sets
 * `app.current_tenant_id` — RLS policies enforce row-level isolation.
 */
export async function GET() {
  let ctx
  try {
    ctx = await requireTenantSession()
  } catch (res) {
    return res as Response
  }

  const { tenantId } = ctx

  try {
    const cacheKey = `tenant:dashboard:${tenantId}`
    const data = await getCachedOrFetch(cacheKey, () => withTenantContext(tenantId, async (tx) => {
      // Single query: outstanding balance, last payment, current month sales, invoice count
      // RLS filters automatically via current_setting('app.current_tenant_id')
      const [summary] = await tx.execute<{
        outstanding: string | null
        last_payment_date: string | null
        last_payment_amount: string | null
        month_sales: string | null
        invoice_count: string | null
      }>(sql`
        SELECT
          (
            SELECT COALESCE(SUM(i.total_amount - COALESCE(i.paid_amount, 0)), 0)
            FROM invoices i
            INNER JOIN leases l ON l.id = i.lease_id
            WHERE l.tenant_id = current_setting('app.current_tenant_id')::uuid
              AND i.status IN ('pending', 'overdue')
          ) AS outstanding,
          (
            SELECT p.payment_date
            FROM payments p
            INNER JOIN invoices i ON i.id = p.invoice_id
            INNER JOIN leases l  ON l.id = i.lease_id
            WHERE l.tenant_id = current_setting('app.current_tenant_id')::uuid
            ORDER BY p.payment_date DESC
            LIMIT 1
          ) AS last_payment_date,
          (
            SELECT p.amount
            FROM payments p
            INNER JOIN invoices i ON i.id = p.invoice_id
            INNER JOIN leases l  ON l.id = i.lease_id
            WHERE l.tenant_id = current_setting('app.current_tenant_id')::uuid
            ORDER BY p.payment_date DESC
            LIMIT 1
          ) AS last_payment_amount,
          (
            SELECT COALESCE(SUM(s.net_sales), 0)
            FROM pos_sales_data s
            WHERE s.tenant_id = current_setting('app.current_tenant_id')::uuid
              AND s.sales_date >= date_trunc('month', CURRENT_DATE)
          ) AS month_sales,
          (
            SELECT COUNT(*)
            FROM invoices i
            INNER JOIN leases l ON l.id = i.lease_id
            WHERE l.tenant_id = current_setting('app.current_tenant_id')::uuid
          ) AS invoice_count
      `)

      // Lease expiry — separate lightweight query
      const [lease] = await tx.execute<{
        end_date: string | null
      }>(sql`
        SELECT end_date
        FROM leases
        WHERE tenant_id = current_setting('app.current_tenant_id')::uuid
          AND status = 'active'
        ORDER BY end_date DESC
        LIMIT 1
      `)

      const leaseEndDate = lease?.end_date ?? null
      const daysToLeaseExpiry = leaseEndDate
        ? Math.ceil(
            (new Date(leaseEndDate).getTime() - Date.now()) / (1000 * 60 * 60 * 24),
          )
        : null

      return {
        totalOutstanding:   parseFloat(summary?.outstanding ?? "0"),
        lastPaymentDate:    summary?.last_payment_date ?? null,
        lastPaymentAmount:  summary?.last_payment_amount
          ? parseFloat(summary.last_payment_amount)
          : null,
        currentMonthSales:  parseFloat(summary?.month_sales ?? "0"),
        leaseEndDate,
        daysToLeaseExpiry,
        invoiceCount:       parseInt(summary?.invoice_count ?? "0", 10),
      }
    }), CACHE_TTL.MEDIUM) // 5-minute cache

    return NextResponse.json({ success: true, data })
  } catch (err) {
    console.error("Tenant dashboard error:", err)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
