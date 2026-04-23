/**
 * Invoice PDF Generator
 * ─────────────────────────────────────────────────────────────────────────────
 * Generates a professional HTML-based invoice, converts to PDF-ready HTML,
 * stores the document record, and returns a hash for immutability verification.
 *
 * Architecture: We generate a self-contained HTML invoice that can be rendered
 * as a PDF by the client (via window.print / @media print CSS) or by a
 * server-side renderer (Puppeteer, wkhtmltopdf) if available.
 *
 * The HTML is stored in S3 alongside a SHA-256 hash for tamper detection.
 */

import crypto from "crypto"
import { serviceDb } from "@/lib/db"
import { documents, invoices } from "@/lib/db/schema"
import { eq, and, sql } from "drizzle-orm"
import { logger } from "@/lib/logger"

export interface InvoiceData {
  invoiceNumber: string
  invoiceDate: string
  dueDate: string
  periodStart: string
  periodEnd: string
  // Tenant info
  tenantName: string
  tenantAddress?: string
  tenantGstin?: string
  tenantPan?: string
  // Landlord info
  landlordName: string
  landlordAddress?: string
  landlordGstin?: string
  // Line items
  lineItems: Array<{
    description: string
    amount: number
    gstRate?: number
    gstAmount?: number
  }>
  // Totals
  subtotal: number
  gstAmount: number
  totalAmount: number
  amountInWords?: string
  // Notes
  notes?: string
  // Metadata
  propertyName?: string
  unitNumber?: string
}

/**
 * Convert a number to Indian words representation.
 */
function numberToWords(num: number): string {
  if (num === 0) return "Zero"
  const ones = ["", "One", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight", "Nine",
    "Ten", "Eleven", "Twelve", "Thirteen", "Fourteen", "Fifteen", "Sixteen", "Seventeen", "Eighteen", "Nineteen"]
  const tens = ["", "", "Twenty", "Thirty", "Forty", "Fifty", "Sixty", "Seventy", "Eighty", "Ninety"]

  function convert(n: number): string {
    if (n < 20) return ones[n]
    if (n < 100) return tens[Math.floor(n / 10)] + (n % 10 ? " " + ones[n % 10] : "")
    if (n < 1000) return ones[Math.floor(n / 100)] + " Hundred" + (n % 100 ? " and " + convert(n % 100) : "")
    if (n < 100000) return convert(Math.floor(n / 1000)) + " Thousand" + (n % 1000 ? " " + convert(n % 1000) : "")
    if (n < 10000000) return convert(Math.floor(n / 100000)) + " Lakh" + (n % 100000 ? " " + convert(n % 100000) : "")
    return convert(Math.floor(n / 10000000)) + " Crore" + (n % 10000000 ? " " + convert(n % 10000000) : "")
  }

  const rupees = Math.floor(num)
  const paise = Math.round((num - rupees) * 100)
  let result = "Rupees " + convert(rupees)
  if (paise > 0) result += " and " + convert(paise) + " Paise"
  return result + " Only"
}

/**
 * Format currency in INR.
 */
function formatINR(amount: number): string {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    minimumFractionDigits: 2,
  }).format(amount)
}

/**
 * Generate invoice HTML content.
 */
export function generateInvoiceHTML(data: InvoiceData): string {
  const amountInWords = data.amountInWords || numberToWords(data.totalAmount)

  const lineItemsHTML = data.lineItems.map((item, idx) => `
    <tr>
      <td style="padding:8px;border-bottom:1px solid #e5e7eb">${idx + 1}</td>
      <td style="padding:8px;border-bottom:1px solid #e5e7eb">${escapeHtml(item.description)}</td>
      <td style="padding:8px;border-bottom:1px solid #e5e7eb;text-align:right">${formatINR(item.amount)}</td>
      <td style="padding:8px;border-bottom:1px solid #e5e7eb;text-align:right">${item.gstRate ? item.gstRate + "%" : "-"}</td>
      <td style="padding:8px;border-bottom:1px solid #e5e7eb;text-align:right">${item.gstAmount ? formatINR(item.gstAmount) : "-"}</td>
      <td style="padding:8px;border-bottom:1px solid #e5e7eb;text-align:right;font-weight:600">${formatINR(item.amount + (item.gstAmount ?? 0))}</td>
    </tr>
  `).join("")

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>Invoice ${escapeHtml(data.invoiceNumber)}</title>
  <style>
    @media print { body { margin: 0; } }
    body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; color: #1f2937; max-width: 800px; margin: 0 auto; padding: 40px; }
    .header { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 30px; border-bottom: 3px solid #3b82f6; padding-bottom: 20px; }
    .invoice-title { font-size: 28px; font-weight: 700; color: #1e40af; }
    .invoice-meta { text-align: right; font-size: 13px; color: #6b7280; }
    .invoice-meta strong { color: #1f2937; }
    .parties { display: flex; justify-content: space-between; margin-bottom: 30px; }
    .party { width: 48%; }
    .party-label { font-size: 11px; text-transform: uppercase; letter-spacing: 1px; color: #6b7280; margin-bottom: 4px; }
    .party-name { font-size: 16px; font-weight: 600; margin-bottom: 4px; }
    .party-detail { font-size: 13px; color: #4b5563; line-height: 1.5; }
    table { width: 100%; border-collapse: collapse; margin-bottom: 20px; }
    thead th { padding: 10px 8px; text-align: left; background: #f3f4f6; font-size: 12px; text-transform: uppercase; letter-spacing: 0.5px; color: #374151; border-bottom: 2px solid #d1d5db; }
    .totals { display: flex; justify-content: flex-end; margin-bottom: 20px; }
    .totals-table { width: 300px; }
    .totals-table tr td { padding: 6px 8px; font-size: 14px; }
    .totals-table tr:last-child td { font-weight: 700; font-size: 16px; border-top: 2px solid #1e40af; color: #1e40af; }
    .amount-words { background: #f0f4ff; padding: 12px 16px; border-radius: 6px; font-size: 13px; color: #1e40af; margin-bottom: 20px; }
    .footer { font-size: 11px; color: #9ca3af; text-align: center; margin-top: 40px; border-top: 1px solid #e5e7eb; padding-top: 16px; }
  </style>
</head>
<body>
  <div class="header">
    <div>
      <div class="invoice-title">TAX INVOICE</div>
      ${data.propertyName ? `<div style="color:#6b7280;font-size:14px">${escapeHtml(data.propertyName)}${data.unitNumber ? ` — Unit ${escapeHtml(data.unitNumber)}` : ""}</div>` : ""}
    </div>
    <div class="invoice-meta">
      <div><strong>Invoice #:</strong> ${escapeHtml(data.invoiceNumber)}</div>
      <div><strong>Date:</strong> ${escapeHtml(data.invoiceDate)}</div>
      <div><strong>Due Date:</strong> ${escapeHtml(data.dueDate)}</div>
      <div><strong>Period:</strong> ${escapeHtml(data.periodStart)} to ${escapeHtml(data.periodEnd)}</div>
    </div>
  </div>

  <div class="parties">
    <div class="party">
      <div class="party-label">From</div>
      <div class="party-name">${escapeHtml(data.landlordName)}</div>
      ${data.landlordAddress ? `<div class="party-detail">${escapeHtml(data.landlordAddress)}</div>` : ""}
      ${data.landlordGstin ? `<div class="party-detail">GSTIN: ${escapeHtml(data.landlordGstin)}</div>` : ""}
    </div>
    <div class="party">
      <div class="party-label">Bill To</div>
      <div class="party-name">${escapeHtml(data.tenantName)}</div>
      ${data.tenantAddress ? `<div class="party-detail">${escapeHtml(data.tenantAddress)}</div>` : ""}
      ${data.tenantGstin ? `<div class="party-detail">GSTIN: ${escapeHtml(data.tenantGstin)}</div>` : ""}
      ${data.tenantPan ? `<div class="party-detail">PAN: ${escapeHtml(data.tenantPan)}</div>` : ""}
    </div>
  </div>

  <table>
    <thead>
      <tr>
        <th style="width:40px">#</th>
        <th>Description</th>
        <th style="text-align:right;width:120px">Amount</th>
        <th style="text-align:right;width:80px">GST %</th>
        <th style="text-align:right;width:100px">GST Amt</th>
        <th style="text-align:right;width:120px">Total</th>
      </tr>
    </thead>
    <tbody>
      ${lineItemsHTML}
    </tbody>
  </table>

  <div class="totals">
    <table class="totals-table">
      <tr><td>Subtotal</td><td style="text-align:right">${formatINR(data.subtotal)}</td></tr>
      <tr><td>GST</td><td style="text-align:right">${formatINR(data.gstAmount)}</td></tr>
      <tr><td>Total</td><td style="text-align:right">${formatINR(data.totalAmount)}</td></tr>
    </table>
  </div>

  <div class="amount-words">
    <strong>Amount in Words:</strong> ${escapeHtml(amountInWords)}
  </div>

  ${data.notes ? `<div style="font-size:13px;color:#6b7280;margin-bottom:20px"><strong>Notes:</strong> ${escapeHtml(data.notes)}</div>` : ""}

  <div class="footer">
    This is a computer-generated invoice. No signature is required.<br>
    Generated on ${new Date().toISOString().slice(0, 10)}
  </div>
</body>
</html>`
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;")
}

/**
 * Generate invoice HTML, compute SHA-256 hash, and store in documents table.
 */
export async function generateAndStoreInvoicePDF(params: {
  invoiceId: string
  organizationId: string
  invoiceData: InvoiceData
  tenantId?: string
  propertyId?: string
  leaseId?: string
}): Promise<{ html: string; hash: string; documentId: string }> {
  const { invoiceId, organizationId, invoiceData, tenantId, propertyId, leaseId } = params

  const html = generateInvoiceHTML(invoiceData)
  const hash = crypto.createHash("sha256").update(html).digest("hex")

  // Store the HTML as a document record
  const [doc] = await serviceDb
    .insert(documents)
    .values({
      organizationId,
      tenantId: tenantId ?? null,
      propertyId: propertyId ?? null,
      leaseId: leaseId ?? null,
      name: `Invoice-${invoiceData.invoiceNumber}.html`,
      documentType: "invoice",
      category: "financial",
      description: `Generated invoice PDF for ${invoiceData.invoiceNumber}`,
      fileUrl: `invoice://${invoiceId}`, // Internal reference
      mimeType: "text/html",
      fileSize: Buffer.byteLength(html, "utf8"),
      version: 1,
      isActive: true,
      metadata: { invoiceId, hash, generatedAt: new Date().toISOString() },
    })
    .returning({ id: documents.id })

  // Update invoice metadata with document reference and hash
  await serviceDb
    .update(invoices)
    .set({
      metadata: sql`jsonb_set(
        jsonb_set(COALESCE(metadata, '{}'), '{pdfDocumentId}', ${JSON.stringify(doc.id)}::jsonb),
        '{pdfHash}', ${JSON.stringify(hash)}::jsonb
      )`,
      updatedAt: new Date(),
    })
    .where(eq(invoices.id, invoiceId))

  logger.info("invoice-pdf: generated", { invoiceId, documentId: doc.id, hash: hash.slice(0, 16) })

  return { html, hash, documentId: doc.id }
}
