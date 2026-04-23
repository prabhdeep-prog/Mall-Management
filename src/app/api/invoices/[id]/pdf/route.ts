import { NextRequest, NextResponse } from "next/server"
import { serviceDb } from "@/lib/db"
import { invoices, leases, tenants, properties, organizations } from "@/lib/db/schema"
import { eq } from "drizzle-orm"
import { PERMISSIONS, requirePermission } from "@/lib/auth/rbac"
import { generateAndStoreInvoicePDF, generateInvoiceHTML, type InvoiceData } from "@/lib/invoice/generate-pdf"

/**
 * GET /api/invoices/[id]/pdf
 * Generates and returns the invoice as HTML (suitable for print-to-PDF).
 * Also stores a document record with SHA-256 hash for immutability.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } },
) {
  const { authorized, error } = await requirePermission(PERMISSIONS.INVOICES_VIEW)
  if (!authorized) {
    return NextResponse.json({ error }, { status: 403 })
  }

  try {
    const invoiceId = params.id
    const orgId = request.headers.get("x-org-id")

    // Fetch invoice with related data
    const [invoice] = await serviceDb
      .select()
      .from(invoices)
      .where(eq(invoices.id, invoiceId))
      .limit(1)

    if (!invoice) {
      return NextResponse.json({ error: "Invoice not found" }, { status: 404 })
    }

    // Fetch lease, tenant, property, org in parallel
    const [leaseRow, orgRow] = await Promise.all([
      invoice.leaseId
        ? serviceDb
            .select({
              lease: leases,
              tenant: tenants,
              property: properties,
            })
            .from(leases)
            .leftJoin(tenants, eq(leases.tenantId, tenants.id))
            .leftJoin(properties, eq(leases.propertyId, properties.id))
            .where(eq(leases.id, invoice.leaseId))
            .limit(1)
            .then(r => r[0])
        : null,
      orgId
        ? serviceDb.select().from(organizations).where(eq(organizations.id, orgId)).limit(1).then(r => r[0])
        : null,
    ])

    const tenant = leaseRow?.tenant
    const property = leaseRow?.property
    const lease = leaseRow?.lease

    // Build line items from invoice metadata or defaults
    const meta = invoice.metadata as Record<string, unknown> ?? {}
    const existingLineItems = meta.lineItems as Array<{ description: string; amount: number; gstRate?: number; gstAmount?: number }> | undefined

    const amount = parseFloat(String(invoice.amount ?? 0))
    const gstAmount = parseFloat(String(invoice.gstAmount ?? 0))
    const totalAmount = parseFloat(String(invoice.totalAmount ?? 0))

    const lineItems = existingLineItems?.length
      ? existingLineItems
      : [{
          description: `${invoice.invoiceType === "cam" ? "CAM Charges" : invoice.invoiceType === "late_fee" ? "Late Fee" : "Rent"} — ${invoice.periodStart} to ${invoice.periodEnd}`,
          amount,
          gstRate: amount > 0 ? Math.round((gstAmount / amount) * 100) : 18,
          gstAmount,
        }]

    const invoiceData: InvoiceData = {
      invoiceNumber: invoice.invoiceNumber,
      invoiceDate: invoice.createdAt.toISOString().slice(0, 10),
      dueDate: invoice.dueDate,
      periodStart: invoice.periodStart,
      periodEnd: invoice.periodEnd,
      tenantName: tenant?.businessName ?? "Tenant",
      tenantAddress: tenant?.metadata ? (tenant.metadata as Record<string, unknown>)?.address as string : undefined,
      tenantGstin: tenant?.gstin ?? undefined,
      tenantPan: tenant?.pan ?? undefined,
      landlordName: orgRow?.name ?? "Mall Management",
      landlordAddress: (orgRow?.settings as Record<string, unknown>)?.address as string ?? undefined,
      landlordGstin: (orgRow?.settings as Record<string, unknown>)?.gstin as string ?? undefined,
      lineItems,
      subtotal: amount,
      gstAmount,
      totalAmount,
      notes: invoice.notes ?? undefined,
      propertyName: property?.name ?? undefined,
      unitNumber: lease?.unitNumber ?? undefined,
    }

    // Check if we should generate & store, or just return HTML
    const format = request.nextUrl.searchParams.get("format") ?? "html"

    if (format === "store") {
      // Generate, hash, and store
      const result = await generateAndStoreInvoicePDF({
        invoiceId,
        organizationId: orgId ?? "",
        invoiceData,
        tenantId: tenant?.id,
        propertyId: property?.id,
        leaseId: lease?.id,
      })

      return NextResponse.json({
        success: true,
        documentId: result.documentId,
        hash: result.hash,
      })
    }

    // Default: return HTML for print/download
    const html = generateInvoiceHTML(invoiceData)

    return new NextResponse(html, {
      headers: {
        "Content-Type": "text/html; charset=utf-8",
        "Content-Disposition": `inline; filename="Invoice-${invoice.invoiceNumber}.html"`,
        "Cache-Control": "private, no-cache",
      },
    })
  } catch (err) {
    console.error("Invoice PDF generation error:", err)
    return NextResponse.json({ error: "Failed to generate invoice PDF" }, { status: 500 })
  }
}
