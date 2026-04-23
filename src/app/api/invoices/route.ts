import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { db, serviceDb } from "@/lib/db"
import { invoices, leases, tenants, notifications } from "@/lib/db/schema"
import { eq, desc, and, sql } from "drizzle-orm"
import { getCachedOrFetch, CACHE_TTL, deleteCache } from "@/lib/cache"
import { requirePermission, PERMISSIONS } from "@/lib/auth/rbac"
import { validatePositiveAmount, AmountValidationError } from "@/lib/validation/amount"
import { generateInvoiceNumber } from "@/lib/invoice/generateNumber"
import { onInvoiceCreated } from "@/lib/notifications/dispatcher"

export async function GET(request: NextRequest) {
  try {
    const session = await auth()

    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const { searchParams } = new URL(request.url)
    const status = searchParams.get("status")
    const propertyId = searchParams.get("propertyId")
    const tenantId = searchParams.get("tenantId")
    const refresh = searchParams.get("refresh") === "true"

    // Cache key based on filters
    const cacheKey = `invoices:list:${propertyId || "all"}:${tenantId || "all"}:${status || "all"}`

    // Invalidate cache if refresh requested
    if (refresh) {
      await deleteCache(cacheKey)
    }

    const result = await getCachedOrFetch(
      cacheKey,
      async () => {
        // Build where conditions
        const conditions = []
        if (status) conditions.push(eq(invoices.status, status))
        if (tenantId) conditions.push(eq(tenants.id, tenantId))
        if (propertyId) conditions.push(eq(leases.propertyId, propertyId))

        const invoicesWithDetails = await db
          .select({
            invoice: invoices,
            lease: leases,
            tenant: tenants,
          })
          .from(invoices)
          .leftJoin(leases, eq(invoices.leaseId, leases.id))
          .leftJoin(tenants, eq(leases.tenantId, tenants.id))
          .where(conditions.length > 0 ? and(...conditions) : undefined)
          .orderBy(desc(invoices.createdAt))

        return invoicesWithDetails.map(({ invoice, lease, tenant }) => ({
          ...invoice,
          lease: lease
            ? {
                id: lease.id,
                unitNumber: lease.unitNumber,
              }
            : null,
          tenant: tenant
            ? {
                id: tenant.id,
                businessName: tenant.businessName,
                contactPerson: tenant.contactPerson,
                email: tenant.email,
              }
            : null,
        }))
      },
      CACHE_TTL.MEDIUM // 5 minutes
    )

    return NextResponse.json({ success: true, data: result })
  } catch (error) {
    console.error("Get invoices error:", error)
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    )
  }
}

export async function POST(request: NextRequest) {
  try {
    const session = await auth()

    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const { authorized, error: permError } = await requirePermission(PERMISSIONS.INVOICES_CREATE)
    if (!authorized) return NextResponse.json({ error: permError }, { status: 403 })

    const body = await request.json()
    const {
      leaseId,
      invoiceType,
      periodStart,
      periodEnd,
      amount,
      gstAmount,
      dueDate,
    } = body

    if (!leaseId || !invoiceType || !amount || !dueDate) {
      return NextResponse.json(
        { error: "Missing required fields" },
        { status: 400 }
      )
    }

    // Validate financial amounts
    let parsedAmount: number
    let parsedGst: number
    try {
      parsedAmount = validatePositiveAmount(amount, "amount")
      parsedGst = gstAmount ? validatePositiveAmount(gstAmount, "gstAmount") : 0
    } catch (e) {
      if (e instanceof AmountValidationError) {
        return NextResponse.json({ error: e.message }, { status: 400 })
      }
      throw e
    }

    const invoiceId = crypto.randomUUID()
    const invoiceNumber = generateInvoiceNumber("INV")

    const totalAmount = parsedAmount + parsedGst

    await db.insert(invoices).values({
      id: invoiceId,
      leaseId,
      invoiceNumber,
      invoiceType,
      periodStart,
      periodEnd,
      amount,
      gstAmount: gstAmount || "0",
      totalAmount: totalAmount.toString(),
      dueDate,
      status: "pending",
      createdBy: session.user.id,
    })

    const newInvoice = await db.query.invoices.findFirst({
      where: eq(invoices.id, invoiceId),
    })

    // Invalidate invoice list cache
    await deleteCache(`invoices:list:all:all`)
    await deleteCache(`invoices:list:all:pending`)

    // Notify tenant (fire-and-forget)
    ;(async () => {
      try {
        const leaseRow = await db.query.leases.findFirst({ where: eq(leases.id, leaseId) })
        if (!leaseRow?.tenantId) return
        const tenantRow = await db.query.tenants.findFirst({ where: eq(tenants.id, leaseRow.tenantId) })
        if (!tenantRow) return

        const formattedAmount = `₹${totalAmount.toLocaleString("en-IN")}`
        const formattedDue = new Date(dueDate).toLocaleDateString("en-IN", {
          day: "numeric", month: "short", year: "numeric",
        })

        // In-app notification for tenant portal
        await serviceDb.insert(notifications).values({
          recipientId: tenantRow.id,
          recipientType: "tenant",
          type: "invoice_created",
          channel: "in_app",
          title: `Invoice ${invoiceNumber} generated – ${formattedAmount}`,
          content: `A new invoice of ${formattedAmount} has been generated, due on ${formattedDue}.`,
          status: "sent",
          sentAt: new Date(),
          autoGenerated: true,
          metadata: { invoiceId, invoiceNumber },
        })

        // Email/SMS via templates (if org has templates configured)
        const orgId = session.user?.organizationId
        if (orgId) {
          await onInvoiceCreated({
            organizationId: orgId,
            tenantId: tenantRow.id,
            tenantEmail: tenantRow.email ?? undefined,
            data: {
              tenant_name: tenantRow.businessName,
              property_name: "your property",
              invoice_number: invoiceNumber,
              invoice_amount: formattedAmount,
              due_date: formattedDue,
            },
          })
        }
      } catch {}
    })()

    return NextResponse.json({ success: true, data: newInvoice }, { status: 201 })
  } catch (error) {
    console.error("Create invoice error:", error)
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    )
  }
}

