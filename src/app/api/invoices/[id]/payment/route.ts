import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { db } from "@/lib/db"
import { invoices, payments, leases } from "@/lib/db/schema"
import { eq } from "drizzle-orm"
import { invalidateEntityCache } from "@/lib/cache"
import { requirePermission, PERMISSIONS } from "@/lib/auth/rbac"
import { validatePositiveAmount, AmountValidationError } from "@/lib/validation/amount"
import { generateInvoiceNumber } from "@/lib/invoice/generateNumber"
import { writeAuditLog, extractRequestMeta } from "@/lib/audit/log"

export async function POST(
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
    const { amount, paymentDate, paymentMethod, referenceNumber, notes } = body

    if (!amount || !paymentDate) {
      return NextResponse.json({ error: "Amount and payment date are required" }, { status: 400 })
    }

    // Validate amount
    let parsedAmount: number
    try {
      parsedAmount = validatePositiveAmount(amount, "Payment amount")
    } catch (e) {
      if (e instanceof AmountValidationError) {
        return NextResponse.json({ error: e.message }, { status: 400 })
      }
      throw e
    }

    // Check if invoice exists
    const invoice = await db.query.invoices.findFirst({
      where: eq(invoices.id, params.id),
    })

    if (!invoice) {
      return NextResponse.json({ error: "Invoice not found" }, { status: 404 })
    }

    if (invoice.status === "paid") {
      return NextResponse.json({ error: "Invoice is already paid" }, { status: 400 })
    }

    if (invoice.status === "cancelled") {
      return NextResponse.json({ error: "Cannot record payment for cancelled invoice" }, { status: 400 })
    }

    // Validate payment does not exceed invoice total
    const existingPaid = parseFloat(invoice.paidAmount || "0")
    const newPaid = existingPaid + parsedAmount
    const totalAmount = parseFloat(invoice.totalAmount)

    if (newPaid > totalAmount) {
      return NextResponse.json(
        { error: `Payment of ${parsedAmount} would exceed invoice total (${totalAmount - existingPaid} remaining)` },
        { status: 400 }
      )
    }

    const receiptNumber = generateInvoiceNumber("RCP")
    const newStatus = newPaid >= totalAmount ? "paid" : "partially_paid"

    // Wrap payment + invoice update in a single transaction
    await db.transaction(async (tx) => {
      await tx.insert(payments).values({
        invoiceId: params.id,
        amount: parsedAmount.toString(),
        paymentDate,
        paymentMethod: paymentMethod || "bank_transfer",
        referenceNumber,
        notes,
        metadata: {
          receiptNumber,
          processedBy: session.user.id,
        },
      })

      await tx
        .update(invoices)
        .set({
          paidAmount: newPaid.toString(),
          paidDate: paymentDate,
          status: newStatus,
        })
        .where(eq(invoices.id, params.id))
    })

    // Invalidate cache (outside transaction)
    if (invoice.leaseId) {
      const lease = await db.query.leases.findFirst({
        where: eq(leases.id, invoice.leaseId),
      })
      if (lease?.propertyId) {
        await invalidateEntityCache("invoice", params.id, lease.propertyId)
      }
    }

    // ── Audit log ─────────────────────────────────────────────────────────────
    const meta = extractRequestMeta(request)
    void writeAuditLog({
      organizationId: session.user.organizationId,
      action:        "payment.create",
      entity:        "invoice",
      entityId:      params.id,
      before: {
        paidAmount: invoice.paidAmount,
        status:     invoice.status,
      },
      after: {
        paidAmount:    newPaid.toString(),
        status:        newStatus,
        receiptNumber,
        paymentMethod: paymentMethod || "bank_transfer",
        paymentAmount: parsedAmount.toString(),
      },
      changedFields: {
        paidAmount: { from: invoice.paidAmount, to: newPaid.toString() },
        status:     { from: invoice.status,     to: newStatus },
      },
      userId:    session.user.id,
      ...meta,
    })
    // ── End audit ─────────────────────────────────────────────────────────────

    return NextResponse.json({
      success: true,
      message: "Payment recorded successfully",
      receiptNumber,
      newStatus,
    })
  } catch (error) {
    console.error("Record payment error:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}

