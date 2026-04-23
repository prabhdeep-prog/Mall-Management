import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { db } from "@/lib/db"
import { payments, invoices, leases, tenants } from "@/lib/db/schema"
import { eq, desc, and } from "drizzle-orm"
import { requirePermission, PERMISSIONS } from "@/lib/auth/rbac"

/**
 * GET /api/payments
 * List all payments joined with invoice + tenant info.
 * Query params: propertyId, tenantId, page (default 1), limit (default 50)
 */
export async function GET(request: NextRequest) {
  try {
    const session = await auth()
    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const { authorized, error } = await requirePermission(PERMISSIONS.INVOICES_VIEW)
    if (!authorized) {
      return NextResponse.json({ error }, { status: 403 })
    }

    const { searchParams } = new URL(request.url)
    const propertyId = searchParams.get("propertyId")
    const tenantId   = searchParams.get("tenantId")
    const page       = Math.max(1, parseInt(searchParams.get("page") ?? "1") || 1)
    const limit      = Math.min(100, Math.max(1, parseInt(searchParams.get("limit") ?? "50") || 50))
    const offset     = (page - 1) * limit

    const conditions = []
    if (propertyId) conditions.push(eq(leases.propertyId, propertyId))
    if (tenantId)   conditions.push(eq(tenants.id, tenantId))

    const rows = await db
      .select({
        payment: payments,
        invoice: {
          id:            invoices.id,
          invoiceNumber: invoices.invoiceNumber,
          invoiceType:   invoices.invoiceType,
          totalAmount:   invoices.totalAmount,
          status:        invoices.status,
        },
        lease: {
          id:         leases.id,
          unitNumber: leases.unitNumber,
          propertyId: leases.propertyId,
        },
        tenant: {
          id:           tenants.id,
          businessName: tenants.businessName,
          contactPerson: tenants.contactPerson,
        },
      })
      .from(payments)
      .leftJoin(invoices, eq(payments.invoiceId, invoices.id))
      .leftJoin(leases,   eq(invoices.leaseId,   leases.id))
      .leftJoin(tenants,  eq(leases.tenantId,     tenants.id))
      .where(conditions.length > 0 ? and(...conditions) : undefined)
      .orderBy(desc(payments.paymentDate), desc(payments.createdAt))
      .limit(limit)
      .offset(offset)

    const data = rows.map(({ payment, invoice, lease, tenant }) => ({
      id:              payment.id,
      amount:          payment.amount,
      paymentDate:     payment.paymentDate,
      paymentMethod:   payment.paymentMethod,
      referenceNumber: payment.referenceNumber,
      bankName:        payment.bankName,
      reconciled:      payment.reconciled,
      notes:           payment.notes,
      createdAt:       payment.createdAt,
      invoice:         invoice ?? null,
      lease:           lease ?? null,
      tenant:          tenant ?? null,
    }))

    return NextResponse.json({ success: true, data })
  } catch (err) {
    console.error("Payments list error:", err)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
