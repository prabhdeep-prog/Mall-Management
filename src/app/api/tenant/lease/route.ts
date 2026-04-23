import { NextResponse } from "next/server"
import { requireTenantSession } from "@/lib/auth/tenant-session"
import { withTenantContext } from "@/lib/db/with-tenant-context"
import { sql } from "drizzle-orm"

/**
 * GET /api/tenant/lease
 *
 * Returns the active lease for the authenticated tenant.
 * RLS enforced via current_setting('app.current_tenant_id').
 *
 * Response:
 *   startDate, endDate, monthlyMg, revenueSharePercentage,
 *   escalation terms, billingCycle, plus unit/property context.
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
    const data = await withTenantContext(tenantId, async (tx) => {
      const [row] = await tx.execute<{
        id: string
        start_date: string
        end_date: string
        status: string
        lease_type: string | null
        monthly_mg: string | null
        revenue_share_percentage: string | null
        rev_share_breakpoint: string | null
        base_rent: string | null
        cam_charges: string | null
        cam_cap_per_sqft: string | null
        security_deposit: string | null
        rent_escalation_percentage: string | null
        escalation_frequency_months: number | null
        lock_in_period_months: number | null
        notice_period_months: number | null
        billing_cycle: string | null
        payment_terms: Record<string, unknown> | null
        clauses: unknown[] | null
        unit_number: string
        floor: number | null
        zone: string | null
        area_sqft: string | null
        property_name: string | null
        property_city: string | null
      }>(sql`
        SELECT
          l.id,
          l.start_date,
          l.end_date,
          l.status,
          l.lease_type,
          l.monthly_mg,
          l.revenue_share_percentage,
          l.rev_share_breakpoint,
          l.base_rent,
          l.cam_charges,
          l.cam_cap_per_sqft,
          l.security_deposit,
          l.rent_escalation_percentage,
          l.escalation_frequency_months,
          l.lock_in_period_months,
          l.notice_period_months,
          l.payment_terms->>'billingCycle'  AS billing_cycle,
          l.payment_terms,
          l.clauses,
          l.unit_number,
          l.floor,
          l.zone,
          l.area_sqft,
          p.name       AS property_name,
          p.city       AS property_city
        FROM leases l
        LEFT JOIN properties p ON p.id = l.property_id
        WHERE l.tenant_id = current_setting('app.current_tenant_id')::uuid
          AND l.status = 'active'
        ORDER BY l.start_date DESC
        LIMIT 1
      `)

      if (!row) return null

      return {
        id:        row.id,
        startDate: row.start_date,
        endDate:   row.end_date,
        status:    row.status,
        leaseType: row.lease_type,

        // Financial terms
        minimumGuarantee:       row.monthly_mg ? parseFloat(row.monthly_mg) : null,
        revenueSharePercentage: row.revenue_share_percentage
          ? parseFloat(row.revenue_share_percentage)
          : null,
        revShareBreakpoint:     row.rev_share_breakpoint
          ? parseFloat(row.rev_share_breakpoint)
          : null,
        baseRent:               row.base_rent ? parseFloat(row.base_rent) : null,
        camCharges:             row.cam_charges ? parseFloat(row.cam_charges) : null,
        camCapPerSqft:          row.cam_cap_per_sqft ? parseFloat(row.cam_cap_per_sqft) : null,
        securityDeposit:        row.security_deposit ? parseFloat(row.security_deposit) : null,

        // Escalation terms
        escalation: {
          percentage:      row.rent_escalation_percentage
            ? parseFloat(row.rent_escalation_percentage)
            : null,
          frequencyMonths: row.escalation_frequency_months,
        },

        // Billing cycle from payment_terms jsonb
        billingCycle:  row.billing_cycle ?? "monthly",
        paymentTerms:  row.payment_terms,

        // Lock-in & notice
        lockInPeriodMonths:  row.lock_in_period_months,
        noticePeriodMonths:  row.notice_period_months,

        // Clauses
        clauses: row.clauses,

        // Unit & property context
        unit: {
          unitNumber: row.unit_number,
          floor:      row.floor,
          zone:       row.zone,
          areaSqft:   row.area_sqft ? parseFloat(row.area_sqft) : null,
        },
        property: row.property_name
          ? { name: row.property_name, city: row.property_city ?? "" }
          : null,
      }
    })

    if (!data) {
      return NextResponse.json({ error: "No active lease found" }, { status: 404 })
    }

    return NextResponse.json({ success: true, data })
  } catch (err) {
    console.error("Tenant lease error:", err)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
