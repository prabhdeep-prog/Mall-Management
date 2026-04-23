import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { serviceDb } from "@/lib/db"
import { sql } from "drizzle-orm"

interface ReconRow extends Record<string, unknown> {
  id:              string
  tenant_id:       string
  lease_id:        string | null
  business_name:   string | null
  period_start:    string
  period_end:      string
  pos_total:       string
  invoice_total:   string
  variance:        string
  status:          string
  created_at:      string
}

interface TotalsRow extends Record<string, unknown> {
  total_count:    string
  total_variance: string
  flagged_count:  string
  matched_count:  string
}

/**
 * GET /api/reconciliation
 *
 * Query params:
 *   propertyId  — optional filter
 *   status      — optional: 'matched','flagged','resolved','pending'
 *   from        — period_start >= (YYYY-MM-DD)
 *   to          — period_end <= (YYYY-MM-DD)
 *   page        — 1-based (default: 1)
 *   limit       — max 100 (default: 20)
 *
 * Returns:
 *   records[]    — reconciliation list with tenant name
 *   summary      — totalVariance, flaggedCount, matchedCount
 *   pagination   — { page, limit, total, totalPages }
 */
export async function GET(request: NextRequest) {
  const session = await auth()
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const { searchParams } = request.nextUrl
  const propertyId = searchParams.get("propertyId")
  const status     = searchParams.get("status")
  const from       = searchParams.get("from")
  const to         = searchParams.get("to")

  const page   = Math.max(1, parseInt(searchParams.get("page") ?? "1", 10) || 1)
  const limit  = Math.min(100, Math.max(1, parseInt(searchParams.get("limit") ?? "20", 10) || 20))
  const offset = (page - 1) * limit

  const propertyFilter = propertyId ? sql`AND l.property_id = ${propertyId}::uuid`   : sql``
  const statusFilter   = status     ? sql`AND r.status = ${status}`                   : sql``
  const fromFilter     = from       ? sql`AND r.period_start >= ${from}::date`        : sql``
  const toFilter       = to         ? sql`AND r.period_end <= ${to}::date`            : sql``

  const filters = sql`
    1 = 1
    ${propertyFilter}
    ${statusFilter}
    ${fromFilter}
    ${toFilter}
  `

  try {
    // Summary totals (across full filtered set)
    const [totals] = await serviceDb.execute<TotalsRow>(sql`
      SELECT
        COUNT(*)                                           AS total_count,
        COALESCE(SUM(r.variance), 0)                       AS total_variance,
        COUNT(*) FILTER (WHERE r.status = 'flagged')       AS flagged_count,
        COUNT(*) FILTER (WHERE r.status = 'matched')       AS matched_count
      FROM pos_reconciliation r
      LEFT JOIN leases l ON l.id = r.lease_id
      WHERE ${filters}
    `)

    const total = parseInt(totals?.total_count ?? "0", 10)

    // Paginated records with tenant name
    const rows = await serviceDb.execute<ReconRow>(sql`
      SELECT
        r.id, r.tenant_id, r.lease_id,
        t.business_name,
        r.period_start, r.period_end,
        r.pos_total, r.invoice_total, r.variance,
        r.status, r.created_at
      FROM pos_reconciliation r
      LEFT JOIN tenants t ON t.id = r.tenant_id
      LEFT JOIN leases l ON l.id = r.lease_id
      WHERE ${filters}
      ORDER BY r.created_at DESC
      LIMIT ${limit}
      OFFSET ${offset}
    `)

    const records = (Array.isArray(rows) ? rows : []).map((r) => ({
      id:           r.id,
      tenantId:     r.tenant_id,
      leaseId:      r.lease_id,
      tenantName:   r.business_name ?? "Unknown",
      periodStart:  r.period_start,
      periodEnd:    r.period_end,
      posTotal:     parseFloat(r.pos_total),
      invoiceTotal: parseFloat(r.invoice_total),
      variance:     parseFloat(r.variance),
      status:       r.status,
      createdAt:    r.created_at,
    }))

    return NextResponse.json({
      success: true,
      data: {
        records,
        summary: {
          totalVariance: parseFloat(totals?.total_variance ?? "0"),
          flaggedCount:  parseInt(totals?.flagged_count ?? "0", 10),
          matchedCount:  parseInt(totals?.matched_count ?? "0", 10),
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
    console.error("Reconciliation list error:", error)
    return NextResponse.json(
      { success: false, error: "Failed to fetch reconciliation records" },
      { status: 500 },
    )
  }
}
