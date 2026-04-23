import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { serviceDb } from "@/lib/db"
import { sql } from "drizzle-orm"
import { deleteCache } from "@/lib/cache"

interface InsertedRow extends Record<string, unknown> {
  id: string
  invoice_number: string
}

/**
 * POST /api/invoices/create-adjustment
 *
 * Body:
 *   reconciliationId  — UUID of the pos_reconciliation record
 *   leaseId           — UUID of the lease
 *   amount            — variance amount (signed: positive = tenant owes more)
 *   periodStart       — YYYY-MM-DD
 *   periodEnd         — YYYY-MM-DD
 *
 * Creates an adjustment invoice linked to the reconciliation record.
 */
export async function POST(request: NextRequest) {
  const session = await auth()
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const body = await request.json()
  const { reconciliationId, leaseId, amount, periodStart, periodEnd } = body

  if (!reconciliationId || !leaseId || amount == null || !periodStart || !periodEnd) {
    return NextResponse.json(
      { success: false, error: "reconciliationId, leaseId, amount, periodStart, and periodEnd are required" },
      { status: 400 },
    )
  }

  const parsedAmount = parseFloat(amount)
  if (isNaN(parsedAmount) || parsedAmount === 0) {
    return NextResponse.json(
      { success: false, error: "amount must be a non-zero number" },
      { status: 400 },
    )
  }

  try {
    const invoiceNumber = `ADJ-${new Date().getFullYear()}-${Math.floor(Math.random() * 100000).toString().padStart(6, "0")}`
    const dueDate = new Date()
    dueDate.setDate(dueDate.getDate() + 30)

    const [inserted] = await serviceDb.execute<InsertedRow>(sql`
      INSERT INTO invoices (
        lease_id, invoice_number, invoice_type,
        period_start, period_end,
        amount, gst_amount, total_amount,
        due_date, status, notes,
        metadata, created_by
      ) VALUES (
        ${leaseId}::uuid,
        ${invoiceNumber},
        'adjustment',
        ${periodStart}::date,
        ${periodEnd}::date,
        ${Math.abs(parsedAmount)},
        ${'0'},
        ${Math.abs(parsedAmount)},
        ${dueDate.toISOString().slice(0, 10)}::date,
        'pending',
        ${`Reconciliation adjustment (variance ₹${parsedAmount.toLocaleString("en-IN")})`},
        ${JSON.stringify({
          type: "reconciliation_adjustment",
          reconciliationId,
          variance: parsedAmount,
        })}::jsonb,
        ${session.user.id}::uuid
      )
      RETURNING id, invoice_number
    `)

    // Update the reconciliation record to link the adjustment
    await serviceDb.execute(sql`
      UPDATE pos_reconciliation
      SET status = 'resolved'
      WHERE id = ${reconciliationId}::uuid
    `)

    // Invalidate invoice list caches
    await deleteCache("invoices:list:all:all:all")

    return NextResponse.json({
      success: true,
      data: {
        invoiceId:     inserted.id,
        invoiceNumber: inserted.invoice_number,
        amount:        Math.abs(parsedAmount),
        type:          "adjustment",
        reconciliationId,
      },
    }, { status: 201 })
  } catch (error) {
    console.error("Create adjustment invoice error:", error)
    return NextResponse.json(
      { success: false, error: "Failed to create adjustment invoice" },
      { status: 500 },
    )
  }
}
