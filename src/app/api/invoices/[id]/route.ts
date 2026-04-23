import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { db } from "@/lib/db"
import { invoices, leases, tenants } from "@/lib/db/schema"
import { eq } from "drizzle-orm"
import { invalidateEntityCache } from "@/lib/cache"
import { requirePermission, PERMISSIONS } from "@/lib/auth/rbac"
import { writeAuditLog, diffFields, extractRequestMeta } from "@/lib/audit/log"

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const session = await auth()
    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const invoice = await db.query.invoices.findFirst({
      where: eq(invoices.id, params.id),
    })

    if (!invoice) {
      return NextResponse.json({ error: "Invoice not found" }, { status: 404 })
    }

    // Get related lease and tenant info
    let lease = null
    let tenant = null
    if (invoice.leaseId) {
      lease = await db.query.leases.findFirst({
        where: eq(leases.id, invoice.leaseId),
      })
      if (lease?.tenantId) {
        tenant = await db.query.tenants.findFirst({
          where: eq(tenants.id, lease.tenantId),
        })
      }
    }

    return NextResponse.json({
      ...invoice,
      lease: lease ? { id: lease.id, unitNumber: lease.unitNumber } : null,
      tenant: tenant ? {
        id: tenant.id,
        businessName: tenant.businessName,
        contactPerson: tenant.contactPerson,
        email: tenant.email,
      } : null,
    })
  } catch (error) {
    console.error("Get invoice error:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const session = await auth()
    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const { authorized, error: permError } = await requirePermission(PERMISSIONS.INVOICES_EDIT)
    if (!authorized) return NextResponse.json({ error: permError }, { status: 403 })

    const body = await request.json()
    const { status, paidAmount, paidDate, notes, lifecycleStatus } = body

    // Check if invoice exists
    const existingInvoice = await db.query.invoices.findFirst({
      where: eq(invoices.id, params.id),
    })

    if (!existingInvoice) {
      return NextResponse.json({ error: "Invoice not found" }, { status: 404 })
    }

    // Service-layer immutability guard
    if (existingInvoice.lifecycleStatus === "posted") {
      if (lifecycleStatus !== undefined) {
        return NextResponse.json(
          { error: "Invoice locked after posting" },
          { status: 422 }
        )
      }
    }

    // Validate lifecycle transition (draft → posted or cancelled only)
    if (lifecycleStatus !== undefined) {
      const validTransitions: Record<string, string[]> = {
        draft: ["posted", "cancelled"],
        posted: [],
        cancelled: [],
      }
      const allowed = validTransitions[existingInvoice.lifecycleStatus ?? "draft"] ?? []
      if (!allowed.includes(lifecycleStatus)) {
        return NextResponse.json(
          { error: `Cannot transition invoice from '${existingInvoice.lifecycleStatus}' to '${lifecycleStatus}'` },
          { status: 422 }
        )
      }
    }

    // Build update object
    const updateData: Record<string, any> = { updatedAt: new Date() }
    if (status !== undefined) updateData.status = status
    if (paidAmount !== undefined) updateData.paidAmount = paidAmount
    if (paidDate !== undefined) updateData.paidDate = new Date(paidDate)
    if (notes !== undefined) updateData.notes = notes
    if (lifecycleStatus !== undefined) updateData.lifecycleStatus = lifecycleStatus

    const [updatedInvoice] = await db
      .update(invoices)
      .set(updateData)
      .where(eq(invoices.id, params.id))
      .returning()

    // ── Audit log ─────────────────────────────────────────────────────────────
    const beforeSnap = existingInvoice as unknown as Record<string, unknown>
    const afterSnap  = updatedInvoice  as unknown as Record<string, unknown>
    const action = lifecycleStatus === "posted" ? "invoice.post"
                 : lifecycleStatus === "cancelled" ? "invoice.cancel"
                 : "invoice.update"
    const meta = extractRequestMeta(request)
    void writeAuditLog({
      organizationId: session.user.organizationId,
      action,
      entity:        "invoice",
      entityId:      params.id,
      before:        beforeSnap,
      after:         afterSnap,
      changedFields: diffFields(beforeSnap, afterSnap),
      userId:        session.user.id,
      ...meta,
    })
    // ── End audit ─────────────────────────────────────────────────────────────

    // Invalidate cache
    if (existingInvoice.leaseId) {
      const lease = await db.query.leases.findFirst({
        where: eq(leases.id, existingInvoice.leaseId),
      })
      if (lease?.propertyId) {
        await invalidateEntityCache("invoice", params.id, lease.propertyId)
      }
    }

    return NextResponse.json(updatedInvoice)
  } catch (error) {
    console.error("Update invoice error:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const session = await auth()
    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const { authorized, error: permError } = await requirePermission(PERMISSIONS.INVOICES_DELETE)
    if (!authorized) return NextResponse.json({ error: permError }, { status: 403 })

    // Service-layer immutability guard
    const existingInvoice = await db.query.invoices.findFirst({
      where: eq(invoices.id, params.id),
    })

    if (!existingInvoice) {
      return NextResponse.json({ error: "Invoice not found" }, { status: 404 })
    }

    if (existingInvoice.lifecycleStatus === "posted") {
      return NextResponse.json(
        { error: "Invoice locked after posting" },
        { status: 422 }
      )
    }

    // Soft delete by setting status to cancelled
    await db
      .update(invoices)
      .set({ status: "cancelled", updatedAt: new Date() })
      .where(eq(invoices.id, params.id))

    // ── Audit log ─────────────────────────────────────────────────────────────
    const meta = extractRequestMeta(request)
    void writeAuditLog({
      organizationId: session.user.organizationId,
      action:        "invoice.cancel",
      entity:        "invoice",
      entityId:      params.id,
      before:        existingInvoice as unknown as Record<string, unknown>,
      after:         { ...existingInvoice, status: "cancelled" } as Record<string, unknown>,
      changedFields: { status: { from: existingInvoice.status, to: "cancelled" } },
      userId:        session.user.id,
      ...meta,
    })
    // ── End audit ─────────────────────────────────────────────────────────────

    return NextResponse.json({ message: "Invoice cancelled successfully" })
  } catch (error) {
    console.error("Delete invoice error:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
