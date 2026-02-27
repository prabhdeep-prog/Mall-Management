import { z } from "zod"

export const invoiceSchema = z.object({
  tenantId: z
    .string()
    .min(1, "Please select a tenant"),
  leaseId: z.string().optional(),
  invoiceType: z.enum(["rent", "utilities", "maintenance", "cam", "deposit", "other"], {
    errorMap: () => ({ message: "Please select a valid invoice type" }),
  }),
  amount: z
    .string()
    .refine(
      (val) => parseFloat(val) > 0 && parseFloat(val) <= 100000000,
      "Amount must be between ₹1 and ₹10,00,00,000"
    ),
  taxAmount: z
    .string()
    .refine(
      (val) => !val || val.length === 0 || (parseFloat(val) >= 0 && parseFloat(val) <= 100000000),
      "Tax amount must be between ₹0 and ₹10,00,00,000"
    )
    .optional(),
  dueDate: z
    .string()
    .min(1, "Please select a due date"),
  billingPeriodStart: z.string().optional(),
  billingPeriodEnd: z.string().optional(),
  description: z
    .string()
    .max(500, "Description must be less than 500 characters")
    .optional(),
  notes: z
    .string()
    .max(1000, "Notes must be less than 1000 characters")
    .optional(),
})

export type InvoiceFormData = z.infer<typeof invoiceSchema>

export const invoiceUpdateSchema = invoiceSchema.partial()

export type InvoiceUpdateFormData = z.infer<typeof invoiceUpdateSchema>

// Payment schema
export const paymentSchema = z.object({
  amount: z
    .string()
    .refine(
      (val) => parseFloat(val) > 0 && parseFloat(val) <= 100000000,
      "Amount must be between ₹1 and ₹10,00,00,000"
    ),
  paymentMethod: z.enum(["cash", "cheque", "bank_transfer", "upi", "card", "other"], {
    errorMap: () => ({ message: "Please select a payment method" }),
  }),
  paymentDate: z.string().optional(),
  referenceNumber: z
    .string()
    .max(50, "Reference number must be less than 50 characters")
    .optional(),
  notes: z
    .string()
    .max(500, "Notes must be less than 500 characters")
    .optional(),
})

export type PaymentFormData = z.infer<typeof paymentSchema>

