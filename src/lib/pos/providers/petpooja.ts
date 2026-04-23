/**
 * Petpooja POS Provider (F&B — Food Court Tenants)
 * ─────────────────────────────────────────────────────────────────────────────
 * Petpooja is India's leading restaurant POS system.
 * Used primarily for food court tenants in malls.
 *
 * Integration model: PUSH (Petpooja calls our webhook on every order)
 * No polling API available — we receive events, aggregate internally.
 *
 * Webhook events we handle:
 *   order.placed    — new order created
 *   order.completed — order paid & closed (the billable event)
 *   order.refunded  — full or partial refund
 *   order.voided    — order cancelled before payment
 */

import type { POSProvider, POSSalesRecord, POSProviderConfig } from "../types"
import { createHmac, timingSafeEqual } from "crypto"
import { serviceDb } from "@/lib/db"
import { sql } from "drizzle-orm"
import { withRetry, isRetryableHttpError } from "@/lib/utils/retry"
import { withCircuitBreaker } from "../circuit-breaker"

const TIMEOUT_MS = 8_000

// ── Webhook payload types ─────────────────────────────────────────────────────

export interface PetpoojaOrderItem {
  item_id:    string
  item_name:  string
  quantity:   number
  unit_price: number   // INR
  category:   string
  tax_amount: number
}

export interface PetpoojaWebhookPayload {
  event:           "order.placed" | "order.completed" | "order.refunded" | "order.voided"
  restaurant_id:   string
  outlet_id:       string
  order_id:        string
  order_time:      string   // ISO 8601
  bill_date:       string   // "YYYY-MM-DD"
  order_type:      "dine_in" | "takeaway" | "delivery"

  // Financial — all in INR
  gross_total:     number
  discount_total:  number
  tax_total:       number
  net_total:       number   // gross - discount (before tax, but tax included in gross)
  refund_amount:   number
  payment_mode:    "cash" | "card" | "upi" | "online"
  payment_status:  "paid" | "pending" | "refunded"

  items:           PetpoojaOrderItem[]
  metadata:        Record<string, unknown>
}

// ── Provider implementation ───────────────────────────────────────────────────

export class PetpoojaProvider implements POSProvider {
  private apiKey:       string
  private restaurantId: string
  private outletId:     string

  constructor(config: POSProviderConfig) {
    this.apiKey       = config.apiKey
    this.restaurantId = config.merchantId ?? ""
    this.outletId     = config.outletId   ?? ""
  }

  async testConnection(): Promise<{ ok: boolean; error?: string }> {
    // Petpooja is webhook-only — validate credentials via their OAuth endpoint
    try {
      await withCircuitBreaker("petpooja", () => 
        withRetry(
          () => this.doTestRequest(),
          { attempts: 3, initialDelay: 1_000, isRetryable: isRetryableHttpError },
        )
      )
      return { ok: true }
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : String(err) }
    }
  }

  private async doTestRequest(): Promise<void> {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS)

    try {
      const res = await fetch("https://api.petpooja.com/v2/restaurants/validate", {
        method: "POST",
        headers: {
          "Content-Type":  "application/json",
          "Authorization": `Bearer ${this.apiKey}`,
        },
        body:   JSON.stringify({ restaurant_id: this.restaurantId }),
        signal: controller.signal,
      })
      clearTimeout(timer)

      if (!res.ok) {
        const body = await res.text()
        throw new Error(`Petpooja API ${res.status}: ${body.slice(0, 200)}`)
      }

      const data = await res.json() as { status: string }
      if (data.status !== "success") {
        throw new Error(`Petpooja API ${res.status}: validation returned status=${data.status}`)
      }
    } catch (err) {
      clearTimeout(timer)
      if ((err as Error).name === "AbortError") {
        throw new Error(`Petpooja API timeout after ${TIMEOUT_MS}ms`)
      }
      throw err
    }
  }

  /**
   * Petpooja is push-only — no polling API.
   * fetchDailySales reads from our pos_transactions table (already ingested by webhook).
   */
  async fetchDailySales(date: Date): Promise<POSSalesRecord> {
    const dateStr = date.toISOString().slice(0, 10)

    const rows = await serviceDb.execute<{
      gross_sales:       string
      net_sales:         string
      total_refunds:     string
      total_discounts:   string
      transaction_count: string
    }>(sql`
      SELECT
        COALESCE(SUM(gross_amount),    0) AS gross_sales,
        COALESCE(SUM(net_amount),      0) AS net_sales,
        COALESCE(SUM(refund_amount),   0) AS total_refunds,
        COALESCE(SUM(discount_amount), 0) AS total_discounts,
        COUNT(*)                          AS transaction_count
      FROM pos_transactions
      WHERE pos_integration_id = (
        SELECT id FROM pos_integrations WHERE provider_key = 'petpooja'
          AND metadata->>'restaurant_id' = ${this.restaurantId}
        LIMIT 1
      )
      AND transaction_date = ${dateStr}::date
      AND refund_amount = 0   -- exclude pure refund rows
    `)

    const row = rows[0]
    const gross     = parseFloat(row?.gross_sales       ?? "0")
    const txCount   = parseInt(row?.transaction_count   ?? "0", 10)

    return {
      date,
      grossSales:          gross,
      netSales:            parseFloat(row?.net_sales         ?? "0"),
      refunds:             parseFloat(row?.total_refunds     ?? "0"),
      discounts:           parseFloat(row?.total_discounts   ?? "0"),
      transactionCount:    txCount,
      avgTransactionValue: txCount > 0 ? Math.round((gross / txCount) * 100) / 100 : 0,
      categoryBreakdown:   {},
      hourlyBreakdown:     {},
    }
  }

  async fetchSalesRange(startDate: Date, endDate: Date): Promise<POSSalesRecord[]> {
    // Aggregate from stored transactions
    const results: POSSalesRecord[] = []
    const current = new Date(startDate)

    while (current <= endDate) {
      results.push(await this.fetchDailySales(new Date(current)))
      current.setDate(current.getDate() + 1)
    }

    return results
  }

  async disconnect(): Promise<void> {
    // Deregister webhook on Petpooja portal
  }
}

// ── Webhook signature verification ────────────────────────────────────────────

/**
 * Petpooja signs webhooks with HMAC-SHA256 over the raw body.
 * Header: X-Petpooja-Signature: sha256=<hex_digest>
 */
export function verifyPetpoojaSignature(
  rawBody:   string,
  header:    string,   // "sha256=abcdef..."
  secret:    string,
): boolean {
  if (!header.startsWith("sha256=")) return false
  const received = header.slice(7)

  const expected = createHmac("sha256", secret)
    .update(rawBody, "utf8")
    .digest("hex")

  const a = Buffer.from(received, "hex")
  const b = Buffer.from(expected, "hex")
  if (a.length !== b.length) return false
  return timingSafeEqual(a, b)
}

// ── Webhook payload parser ────────────────────────────────────────────────────

export function parsePetpoojaWebhook(payload: PetpoojaWebhookPayload) {
  // Extract category breakdown from items
  const categoryBreakdown: Record<string, number> = {}
  for (const item of payload.items ?? []) {
    const cat = item.category || "other"
    categoryBreakdown[cat] = (categoryBreakdown[cat] ?? 0) + item.unit_price * item.quantity
  }

  // Determine hour from order_time
  const orderTime = payload.order_time ? new Date(payload.order_time) : null
  const hour      = orderTime ? orderTime.getHours() : null

  return {
    eventType:       payload.event,
    providerTxId:    payload.order_id,
    transactionDate: new Date(payload.bill_date),
    transactionTime: orderTime,
    grossAmount:     payload.gross_total,
    refundAmount:    payload.event === "order.refunded" ? payload.refund_amount : 0,
    discountAmount:  payload.discount_total,
    paymentMode:     payload.payment_mode,
    category:        "food_beverage",
    categoryBreakdown,
    hour,
    rawPayload:      payload,
    // Mark as billable only for completed orders with payment
    isBillable:      payload.event === "order.completed" && payload.payment_status === "paid",
  }
}
