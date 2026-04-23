/**
 * GET  /api/leases/:id  — lease detail with tenant + property + invoices + POS snapshot
 * PATCH /api/leases/:id — update mutable lease fields (status, renewalStatus, paymentTerms)
 */

import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { db } from "@/lib/db"
import { leases, tenants, properties, invoices, posSalesData } from "@/lib/db/schema"
import { eq, desc, and, gte } from "drizzle-orm"
import { requirePermission, PERMISSIONS } from "@/lib/auth/rbac"
import { writeAuditLog, extractRequestMeta } from "@/lib/audit/log"

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const { authorized, error } = await requirePermission(PERMISSIONS.LEASES_VIEW)
    if (!authorized) return NextResponse.json({ error }, { status: 403 })

    const leaseId = params.id
    if (!UUID_RE.test(leaseId)) {
      return NextResponse.json({ error: "Invalid lease ID" }, { status: 400 })
    }

    // Lease + tenant + property in one JOIN
    const rows = await db
      .select({ lease: leases, tenant: tenants, property: properties })
      .from(leases)
      .leftJoin(tenants,    eq(leases.tenantId,   tenants.id))
      .leftJoin(properties, eq(leases.propertyId, properties.id))
      .where(eq(leases.id, leaseId))
      .limit(1)

    if (!rows.length) {
      return NextResponse.json({ error: "Lease not found" }, { status: 404 })
    }

    const { lease, tenant, property } = rows[0]

    // Invoices for this lease (latest 20)
    const leaseInvoices = await db
      .select()
      .from(invoices)
      .where(eq(invoices.leaseId, leaseId))
      .orderBy(desc(invoices.createdAt))
      .limit(20)

    // Invoice financial summary
    const totalInvoiced = leaseInvoices.reduce((s, i) => s + parseFloat(i.totalAmount || "0"), 0)
    const totalPaid     = leaseInvoices.filter(i => i.status === "paid").reduce((s, i) => s + parseFloat(i.totalAmount || "0"), 0)
    const totalPending  = leaseInvoices.filter(i => i.status === "pending" || i.status === "overdue").reduce((s, i) => s + parseFloat(i.totalAmount || "0"), 0)

    // POS revenue snapshot — last 30 days of pos_transactions for this tenant/lease
    let posSnapshot: {
      totalGross: number
      totalNet: number
      totalTransactions: number
      days: number
    } | null = null

    if (lease.tenantId) {
      try {
        const since = new Date()
        since.setDate(since.getDate() - 30)
        const sinceDateStr = since.toISOString().slice(0, 10)
        const salesRows = await db
          .select()
          .from(posSalesData)
          .where(
            and(
              eq(posSalesData.tenantId, lease.tenantId),
              gte(posSalesData.salesDate, sinceDateStr)
            )
          )
          .orderBy(desc(posSalesData.salesDate))
          .limit(90)

        if (salesRows.length > 0) {
          const gross  = salesRows.reduce((s, r) => s + parseFloat(r.grossSales || "0"), 0)
          const net    = salesRows.reduce((s, r) => s + parseFloat(r.netSales   || "0"), 0)
          const txnCnt = salesRows.reduce((s, r) => s + (r.transactionCount || 0), 0)
          posSnapshot = { totalGross: gross, totalNet: net, totalTransactions: txnCnt, days: salesRows.length }
        }
      } catch {
        // POS data is non-critical — silently skip
      }
    }

    // Tenant portal status
    const portalStatus = tenant?.status === "active" ? "active" : "inactive"

    return NextResponse.json({
      success: true,
      data: {
        // Full lease row
        ...lease,
        // Enriched relations
        property: property
          ? { id: property.id, name: property.name, code: property.code, city: property.city, state: property.state, address: property.address }
          : null,
        tenant: tenant
          ? {
              id:               tenant.id,
              businessName:     tenant.businessName,
              brandName:        tenant.brandName,
              category:         tenant.category,
              subcategory:      tenant.subcategory,
              contactPerson:    tenant.contactPerson,
              email:            tenant.email,
              phone:            tenant.phone,
              riskScore:        tenant.riskScore,
              satisfactionScore: tenant.satisfactionScore,
              sentimentScore:   tenant.sentimentScore,
              targetOpeningDate: tenant.targetOpeningDate,
              onboardingStatus: tenant.onboardingStatus,
              status:           tenant.status,
              portalStatus,
            }
          : null,
        // Billing
        invoices: leaseInvoices,
        billingSummary: {
          totalInvoiced,
          totalPaid,
          totalPending,
          collectionRate: totalInvoiced > 0 ? ((totalPaid / totalInvoiced) * 100).toFixed(1) : "0",
          invoiceCount: leaseInvoices.length,
        },
        // POS
        posSnapshot,
      },
    })
  } catch (err) {
    console.error("GET /api/leases/[id] error:", err)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const { authorized, error } = await requirePermission(PERMISSIONS.LEASES_EDIT)
    if (!authorized) return NextResponse.json({ error }, { status: 403 })

    const leaseId = params.id
    if (!UUID_RE.test(leaseId)) {
      return NextResponse.json({ error: "Invalid lease ID" }, { status: 400 })
    }

    const body = await request.json()

    // Only mutable fields — financial terms are immutable once active
    const allowed: Record<string, unknown> = { updatedAt: new Date() }
    if (body.status           !== undefined) allowed.status                    = body.status
    if (body.renewalStatus    !== undefined) allowed.renewalStatus             = body.renewalStatus
    if (body.renewalRecommendationReason !== undefined) allowed.renewalRecommendationReason = body.renewalRecommendationReason
    if (body.paymentTerms     !== undefined) allowed.paymentTerms              = body.paymentTerms
    if (body.metadata         !== undefined) allowed.metadata                  = body.metadata

    const existing = await db.query.leases.findFirst({ where: eq(leases.id, leaseId) })
    if (!existing) return NextResponse.json({ error: "Lease not found" }, { status: 404 })

    const [updated] = await db.update(leases).set(allowed as any).where(eq(leases.id, leaseId)).returning()

    const session = await auth()
    const meta    = extractRequestMeta(request)
    void writeAuditLog({
      organizationId: session?.user?.organizationId ?? "",
      action:    "lease.update",
      entity:    "lease",
      entityId:  leaseId,
      before:    existing as unknown as Record<string, unknown>,
      after:     updated  as unknown as Record<string, unknown>,
      changedFields: null,
      userId:    session?.user?.id,
      ...meta,
    })

    return NextResponse.json({ success: true, data: updated })
  } catch (err) {
    console.error("PATCH /api/leases/[id] error:", err)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
