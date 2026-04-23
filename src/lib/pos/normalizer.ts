import type { POSProviderKey } from "./types"
import { z } from "zod"
import { logger } from "@/lib/logger"
import { metrics } from "@/lib/monitoring/metrics"

// ============================================================================
// Errors & Validation Middleware
// ============================================================================

export class POSValidationError extends Error {
  constructor(public provider: string, public errors: z.ZodError) {
    super(`Invalid ${provider} payload: ${errors.message}`)
    this.name = "POSValidationError"
  }
}

/**
 * Validation helper to be used across normalizers
 * Logs error and increments metrics on failure
 */
function validateWebhookPayload<T>(
  provider: string,
  schema: z.ZodSchema<T>,
  payload: unknown
): T {
  const result = schema.safeParse(payload)
  if (!result.success) {
    logger.error(`pos-validation-error`, {
      provider,
      errors: result.error.format(),
      // payload, // avoid logging sensitive payload if needed, but helpful for debug
    })
    
    metrics.increment("pos_invalid_payload", 1)
    throw new POSValidationError(provider, result.error)
  }
  return result.data
}

// ============================================================================
// Normalized POS Transaction — maps directly to pos_transactions table columns
// ============================================================================

export interface NormalizedTransaction {
  externalId:      string
  tenantId:        string
  propertyId:      string
  organizationId:  string
  grossAmount:     number
  netAmount:       number
  discountAmount:  number
  taxAmount:       number
  refundAmount:    number
  transactionType: "sale" | "refund" | "void" | "partial_payment"
  paymentMethod:   string | null
  status:          "completed" | "refunded" | "voided" | "pending"
  currency:        string
  terminalId:      string | null
  transactedAt:    Date
  rawPayload:      unknown
}

// ============================================================================
// Context passed alongside the raw provider payload
// ============================================================================

export interface TransactionContext {
  tenantId:       string
  propertyId:     string
  organizationId: string
}

// ============================================================================
// Provider-specific normalizers
// ============================================================================

const toINR = (paise: number) => Math.round(paise) / 100

export const PineLabsSchema = z.object({
  transaction_id:   z.string().min(1),
  transaction_date: z.string(), // ISO or YYYY-MM-DD
  gross_amount:    z.number().positive().finite(),
  net_amount:      z.number().finite(),
  refund_amount:   z.number().min(0).finite().default(0),
  discount_amount: z.number().min(0).finite().default(0),
  payment_mode:    z.enum(["card", "upi", "cash", "wallet", "netbanking", "other", "EMI", "DEBIT_CARD", "CREDIT_CARD"]).or(z.string()),
  terminal_id:     z.string().optional().nullable(),
  event_type:      z.string().optional().nullable(),
  items:           z.array(z.any()).optional().nullable(),
}).passthrough()

function normalizePineLabs(
  rawPayload: Record<string, unknown>,
  ctx: TransactionContext,
): NormalizedTransaction {
  const p = validateWebhookPayload("pine_labs", PineLabsSchema, rawPayload)

  const isRefund    = (p.refund_amount ?? 0) > 0
  const refundAmt   = toINR(p.refund_amount ?? 0)
  const grossAmt    = toINR(p.gross_amount)
  const discountAmt = toINR(p.discount_amount ?? 0)

  return {
    externalId:      p.transaction_id,
    tenantId:        ctx.tenantId,
    propertyId:      ctx.propertyId,
    organizationId:  ctx.organizationId,
    grossAmount:     grossAmt,
    netAmount:       isRefund ? -refundAmt : toINR(p.net_amount),
    discountAmount:  discountAmt,
    taxAmount:       0,
    refundAmount:    refundAmt,
    transactionType: isRefund ? "refund" : "sale",
    paymentMethod:   p.payment_mode ?? null,
    status:          isRefund ? "refunded" : "completed",
    currency:        "INR",
    terminalId:      p.terminal_id ?? null,
    transactedAt:    new Date(p.transaction_date),
    rawPayload:      rawPayload,
  }
}

export const RazorpaySchema = z.object({
  event: z.enum(["payment.captured", "refund.processed"]),
  payload: z.object({
    payment: z.object({
      entity: z.object({
        id: z.string().min(1),
        amount: z.number().positive().finite(),
        method: z.string(),
        created_at: z.number(),
        notes: z.record(z.string()).optional(),
      })
    }).optional(),
    refund: z.object({
      entity: z.object({
        id: z.string().min(1),
        amount: z.number().positive().finite(),
        payment_id: z.string().min(1),
        created_at: z.number(),
      })
    }).optional(),
  }).passthrough(),
}).passthrough()

function normalizeRazorpay(
  rawPayload: Record<string, unknown>,
  ctx: TransactionContext,
): NormalizedTransaction {
  const p = validateWebhookPayload("razorpay_pos", RazorpaySchema, rawPayload)

  if (p.event === "refund.processed" && p.payload.refund) {
    const r = p.payload.refund.entity
    const refundAmt = toINR(r.amount)
    return {
      externalId:      `${r.payment_id}_refund_${r.id}`,
      tenantId:        ctx.tenantId,
      propertyId:      ctx.propertyId,
      organizationId:  ctx.organizationId,
      grossAmount:     0,
      netAmount:       -refundAmt,
      discountAmount:  0,
      taxAmount:       0,
      refundAmount:    refundAmt,
      transactionType: "refund",
      paymentMethod:   "refund",
      status:          "refunded",
      currency:        "INR",
      terminalId:      null,
      transactedAt:    new Date(r.created_at * 1000),
      rawPayload:      rawPayload,
    }
  }

  // payment.captured (default)
  const pay = p.payload.payment!.entity
  return {
    externalId:      pay.id,
    tenantId:        ctx.tenantId,
    propertyId:      ctx.propertyId,
    organizationId:  ctx.organizationId,
    grossAmount:     toINR(pay.amount),
    netAmount:       toINR(pay.amount),
    discountAmount:  0,
    taxAmount:       0,
    refundAmount:    0,
    transactionType: "sale",
    paymentMethod:   pay.method ?? null,
    status:          "completed",
    currency:        "INR",
    terminalId:      null,
    transactedAt:    new Date(pay.created_at * 1000),
    rawPayload:      rawPayload,
  }
}

export const PetpoojaSchema = z.object({
  event:          z.string(),
  order_id:       z.string().min(1),
  order_time:     z.string().optional().nullable(),
  bill_date:      z.string(), // YYYY-MM-DD
  gross_total:    z.number().positive().finite(),
  discount_total: z.number().min(0).finite().default(0),
  tax_total:      z.number().min(0).finite().default(0),
  net_total:      z.number().finite(),
  refund_amount:  z.number().min(0).finite().default(0),
  payment_mode:   z.string(),
  payment_status: z.string(),
  items:          z.array(z.any()).optional().nullable(),
}).passthrough()

function normalizePetpooja(
  rawPayload: Record<string, unknown>,
  ctx: TransactionContext,
): NormalizedTransaction {
  const p = validateWebhookPayload("petpooja", PetpoojaSchema, rawPayload)

  const isRefund = p.event === "order.refunded"
  const isVoid   = p.event === "order.voided"

  let transactionType: NormalizedTransaction["transactionType"] = "sale"
  let status: NormalizedTransaction["status"] = "completed"

  if (isRefund) {
    transactionType = "refund"
    status = "refunded"
  } else if (isVoid) {
    transactionType = "void"
    status = "voided"
  } else if (p.payment_status === "pending") {
    status = "pending"
  }

  const refundAmt = isRefund ? (p.refund_amount || p.gross_total) : 0
  const refundTs  = isRefund
    ? Math.floor((p.order_time ? new Date(p.order_time).getTime() : new Date(p.bill_date).getTime()) / 1000)
    : 0

  return {
    externalId:      isRefund ? `${p.order_id}_refund_${refundTs}` : p.order_id,
    tenantId:        ctx.tenantId,
    propertyId:      ctx.propertyId,
    organizationId:  ctx.organizationId,
    grossAmount:     isRefund ? 0 : p.gross_total,
    netAmount:       isRefund ? -refundAmt : p.net_total,
    discountAmount:  p.discount_total ?? 0,
    taxAmount:       p.tax_total ?? 0,
    refundAmount:    refundAmt,
    transactionType,
    paymentMethod:   p.payment_mode ?? null,
    status,
    currency:        "INR",
    terminalId:      null,
    transactedAt:    p.order_time ? new Date(p.order_time) : new Date(p.bill_date),
    rawPayload:      rawPayload,
  }
}

const POSistSchema = z.object({
  event_type:    z.string(),
  order_id:      z.string().min(1),
  order_date:    z.string(),
  order_time:    z.string().optional().nullable(),
  gross_amount:  z.number().positive().finite(),
  discount:      z.number().min(0).finite().default(0),
  tax:           z.number().min(0).finite().default(0),
  net_amount:    z.number().finite(),
  refund_amount: z.number().min(0).finite().default(0),
  payment_mode:  z.string(),
  items:         z.array(z.any()).optional().nullable(),
}).passthrough()

function normalizePOSist(
  rawPayload: Record<string, unknown>,
  ctx: TransactionContext,
): NormalizedTransaction {
  const p = validateWebhookPayload("posist", POSistSchema, rawPayload)

  const isRefund = p.event_type === "order.refunded"
  const isVoid   = p.event_type === "order.voided"

  let transactionType: NormalizedTransaction["transactionType"] = "sale"
  let status: NormalizedTransaction["status"] = "completed"

  if (isRefund) {
    transactionType = "refund"
    status = "refunded"
  } else if (isVoid) {
    transactionType = "void"
    status = "voided"
  }

  const refundAmt = isRefund ? (p.refund_amount || p.gross_amount) : 0
  const refundTs  = isRefund
    ? Math.floor((p.order_time ? new Date(p.order_time).getTime() : new Date(p.order_date).getTime()) / 1000)
    : 0

  return {
    externalId:      isRefund ? `${p.order_id}_refund_${refundTs}` : p.order_id,
    tenantId:        ctx.tenantId,
    propertyId:      ctx.propertyId,
    organizationId:  ctx.organizationId,
    grossAmount:     isRefund ? 0 : p.gross_amount,
    netAmount:       isRefund ? -refundAmt : p.net_amount,
    discountAmount:  p.discount ?? 0,
    taxAmount:       p.tax ?? 0,
    refundAmount:    refundAmt,
    transactionType,
    paymentMethod:   p.payment_mode ?? null,
    status,
    currency:        "INR",
    terminalId:      null,
    transactedAt:    p.order_time ? new Date(p.order_time) : new Date(p.order_date),
    rawPayload:      rawPayload,
  }
}


// ============================================================================
// Main entry point
// ============================================================================

export function validateProviderPayload(provider: POSProviderKey, payload: unknown) {
  const schemaMap: Record<string, z.ZodSchema> = {
    pine_labs:    PineLabsSchema,
    razorpay_pos: RazorpaySchema,
    petpooja:    PetpoojaSchema,
    posist:      POSistSchema,
  }
  const schema = schemaMap[provider]
  if (!schema) return // Skip if no schema defined for this provider
  validateWebhookPayload(provider, schema, payload)
}

const normalizers: Record<string, (payload: Record<string, unknown>, ctx: TransactionContext) => NormalizedTransaction> = {
  pine_labs:    normalizePineLabs,
  razorpay_pos: normalizeRazorpay,
  petpooja:    normalizePetpooja,
  posist:      normalizePOSist,
}

export function normalizeTransaction(
  provider: POSProviderKey,
  payload:  Record<string, unknown>,
  ctx:      TransactionContext,
): NormalizedTransaction {
  const normalize = normalizers[provider]
  if (!normalize) {
    throw new Error(`Unsupported POS provider: ${provider}`)
  }
  return normalize(payload, ctx)
}
