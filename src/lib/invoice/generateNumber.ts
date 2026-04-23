import crypto from "crypto"

/**
 * Generate collision-resistant invoice numbers.
 * Format: PREFIX-YYYY-XXXXXXXX (8 hex chars from crypto.randomUUID)
 */
export function generateInvoiceNumber(prefix = "INV"): string {
  const year = new Date().getFullYear()
  const id = crypto.randomUUID().replace(/-/g, "").slice(0, 8).toUpperCase()
  return `${prefix}-${year}-${id}`
}
