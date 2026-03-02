/**
 * POST /api/revenue-intelligence/calculate
 * ─────────────────────────────────────────────────────────────────────────────
 * Triggers a revenue calculation for a period.
 * Can target a single tenant or all active tenants in the organization.
 *
 * Body:
 *   { startDate, endDate, tenantId? }
 *   If tenantId is omitted → calculates all active tenants (month-end run)
 *
 * Authorization: super_admin, organization_admin, finance_manager
 */

import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import {
  calculateTenantRevenue,
  calculateAllTenantsRevenue,
} from "@/lib/revenue/billing-engine"

const ALLOWED_ROLES = new Set(["super_admin", "organization_admin", "finance_manager"])

export async function POST(req: NextRequest) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  if (!ALLOWED_ROLES.has(session.user.role ?? "")) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  const organizationId = session.user.organizationId
  if (!organizationId) return NextResponse.json({ error: "No organization" }, { status: 400 })

  const body = await req.json() as {
    startDate: string
    endDate:   string
    tenantId?: string
    leaseId?:  string
  }

  const { startDate, endDate, tenantId, leaseId } = body

  if (!startDate || !endDate) {
    return NextResponse.json({ error: "startDate and endDate are required" }, { status: 400 })
  }

  const period = {
    startDate: new Date(startDate),
    endDate:   new Date(endDate),
  }

  try {
    if (tenantId && leaseId) {
      // Single tenant calculation
      const result = await calculateTenantRevenue({
        organizationId,
        tenantId,
        leaseId,
        period,
        calculatedBy: session.user.id,
      })
      return NextResponse.json({ ok: true, result })
    } else {
      // Bulk calculation for all tenants
      const { results, errors } = await calculateAllTenantsRevenue(
        organizationId,
        period,
        session.user.id,
      )
      return NextResponse.json({
        ok:         true,
        calculated: results.length,
        errors:     errors.length,
        errorDetails: errors.length > 0 ? errors : undefined,
        summary: {
          totalAmountDue: results.reduce((s, r) => s + r.amountDue, 0),
          totalGrossSales: results.reduce((s, r) => s + r.grossSales, 0),
          tenantsAboveMG: results.filter((r) => r.excessOverMG > 0).length,
        },
      })
    }
  } catch (err) {
    console.error("[revenue/calculate]", err)
    return NextResponse.json({ error: "Calculation failed" }, { status: 500 })
  }
}
