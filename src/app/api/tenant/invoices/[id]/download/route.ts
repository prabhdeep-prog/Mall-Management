import { NextRequest, NextResponse } from "next/server"
import { requireTenantSession } from "@/lib/auth/tenant-session"
import { withTenantContext } from "@/lib/db/with-tenant-context"
import { invoices, leases } from "@/lib/db/schema"
import { eq, and } from "drizzle-orm"

export async function GET(
  _req: NextRequest,
  { params }: { params: { id: string } },
) {
  let ctx
  try {
    ctx = await requireTenantSession()
  } catch (res) {
    return res as Response
  }

  const { tenantId } = ctx
  const { id } = params

  try {
    const rows = await withTenantContext(tenantId, async (tx) => {
      return tx
        .select({ id: invoices.id, invoiceNumber: invoices.invoiceNumber })
        .from(invoices)
        .innerJoin(leases, eq(invoices.leaseId, leases.id))
        .where(and(eq(invoices.id, id), eq(leases.tenantId, tenantId)))
        .limit(1)
    })

    if (!rows.length) {
      return NextResponse.json({ error: "Not found" }, { status: 404 })
    }

    // In production, generate/stream a real PDF here.
    // For now, return a plain-text placeholder so the download link is functional.
    const { invoiceNumber } = rows[0]
    const body = `Invoice: ${invoiceNumber}\nGenerated: ${new Date().toISOString()}\n\n[PDF generation not yet implemented]`

    return new Response(body, {
      headers: {
        "Content-Type":        "application/pdf",
        "Content-Disposition": `attachment; filename="${invoiceNumber}.pdf"`,
      },
    })
  } catch (err) {
    console.error("Invoice download error:", err)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
