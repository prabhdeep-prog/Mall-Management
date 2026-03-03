/**
 * POSist Provider (Enterprise Restaurant/Retail POS)
 * ─────────────────────────────────────────────────────────────────────────────
 * POSist (now Restroworks) serves enterprise F&B and retail chains.
 * Popular in premium mall food courts (McDonald's, KFC, etc. use POSist).
 *
 * Integration model: BOTH polling + webhooks
 *   • Polling: daily via /v1/reports/sales endpoint (reliable, used as source of truth)
 *   • Webhooks: real-time per-transaction (supplement polling, lower latency)
 *
 * Auth: API key + client ID in header
 * Rate limit: 60 req/min
 */

import type { POSProvider, POSSalesRecord, POSProviderConfig } from "../types"
import { createHmac, timingSafeEqual } from "crypto"

const POSIST_BASE_URL = "https://api.posist.com/v1"
const TIMEOUT_MS      = 20_000

// ── API response types ─────────────────────────────────────────────────────────

interface POSistSalesReport {
  date:               string       // "YYYY-MM-DD"
  restaurant_id:      string
  gross_sales:        number       // INR
  discount:           number
  tax:                number
  net_sales:          number
  refunds:            number
  voids:              number
  transaction_count:  number
  covers:             number       // guest count
  avg_check:          number       // avg transaction value
  payment_breakdown: Array<{
    mode:   string
    amount: number
  }>
  category_breakdown: Array<{
    category: string
    amount:   number
    count:    number
  }>
  hour_breakdown: Array<{
    hour:   number   // 0–23
    amount: number
    count:  number
  }>
}

interface POSistApiResponse<T> {
  success: boolean
  data:    T
  meta?:   { total: number; page: number }
}

// ── Provider ──────────────────────────────────────────────────────────────────

export class POSistProvider implements POSProvider {
  private apiKey:       string
  private clientId:     string
  private restaurantId: string

  constructor(config: POSProviderConfig) {
    this.apiKey       = config.apiKey
    this.clientId     = config.clientId     ?? ""
    this.restaurantId = config.merchantId   ?? ""
  }

  async testConnection(): Promise<{ ok: boolean; error?: string }> {
    try {
      const r = await this.request<{ restaurant_name: string }>(
        `/restaurants/${this.restaurantId}`
      )
      return { ok: !!r.restaurant_name }
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : String(err) }
    }
  }

  async fetchDailySales(date: Date): Promise<POSSalesRecord> {
    const dateStr = toDateStr(date)
    const raw = await this.request<POSistSalesReport>(
      `/reports/sales?restaurant_id=${this.restaurantId}&date=${dateStr}`
    )
    return this.mapReport(raw)
  }

  async fetchSalesRange(startDate: Date, endDate: Date): Promise<POSSalesRecord[]> {
    // POSist allows max 30-day range per request
    const chunks = splitDateRange(startDate, endDate, 30)
    const results: POSSalesRecord[] = []

    for (const [from, to] of chunks) {
      const raw = await this.request<POSistSalesReport[]>(
        `/reports/sales/range?restaurant_id=${this.restaurantId}&from=${toDateStr(from)}&to=${toDateStr(to)}`
      )
      results.push(...raw.map((r) => this.mapReport(r)))
    }

    return results
  }

  async disconnect(): Promise<void> {
    // Revoke OAuth token / deregister webhook on POSist dashboard
  }

  // ── Mapping ──────────────────────────────────────────────────────────────────

  private mapReport(raw: POSistSalesReport): POSSalesRecord {
    const categoryBreakdown: Record<string, number> = {}
    for (const c of raw.category_breakdown ?? []) {
      categoryBreakdown[c.category] = c.amount
    }

    const hourlyBreakdown: Record<number, number> = {}
    for (const h of raw.hour_breakdown ?? []) {
      hourlyBreakdown[h.hour] = h.amount
    }

    return {
      date:                new Date(raw.date),
      grossSales:          raw.gross_sales,
      netSales:            raw.net_sales,
      refunds:             raw.refunds,
      discounts:           raw.discount,
      transactionCount:    raw.transaction_count,
      avgTransactionValue: raw.avg_check,
      categoryBreakdown,
      hourlyBreakdown,
    }
  }

  // ── HTTP ──────────────────────────────────────────────────────────────────────

  private async request<T>(path: string): Promise<T> {
    const url = path.startsWith("http") ? path : `${POSIST_BASE_URL}${path}`
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS)

    try {
      const res = await fetch(url, {
        headers: {
          "X-Api-Key":   this.apiKey,
          "X-Client-Id": this.clientId,
          "Accept":      "application/json",
        },
        signal: controller.signal,
      })
      clearTimeout(timer)

      if (!res.ok) {
        throw new Error(`POSist API ${res.status}: ${await res.text()}`)
      }

      const json = (await res.json()) as POSistApiResponse<T>
      if (!json.success) throw new Error(`POSist API error: ${JSON.stringify(json)}`)
      return json.data
    } catch (err) {
      clearTimeout(timer)
      if ((err as Error).name === "AbortError") {
        throw new Error(`POSist timeout after ${TIMEOUT_MS}ms`)
      }
      throw err
    }
  }
}

// ── Webhook types & parser ────────────────────────────────────────────────────

export interface POSistWebhookPayload {
  event_type:     "order.closed" | "order.voided" | "order.refunded"
  restaurant_id:  string
  order_id:       string
  order_date:     string   // "YYYY-MM-DD"
  order_time:     string   // ISO 8601
  gross_amount:   number
  discount:       number
  tax:            number
  net_amount:     number
  refund_amount:  number
  payment_mode:   string
  category:       string
  hmac_sha256:    string   // signature in payload body
}

export function parsePOSistWebhook(payload: POSistWebhookPayload) {
  return {
    eventType:       payload.event_type,
    providerTxId:    payload.order_id,
    transactionDate: new Date(payload.order_date),
    transactionTime: payload.order_time ? new Date(payload.order_time) : null,
    grossAmount:     payload.gross_amount,
    refundAmount:    payload.event_type === "order.refunded" ? payload.refund_amount : 0,
    discountAmount:  payload.discount,
    paymentMode:     payload.payment_mode,
    category:        payload.category,
    rawPayload:      payload,
    isBillable:      payload.event_type === "order.closed",
  }
}

export function verifyPOSistSignature(
  rawBody:   string,
  signature: string,  // from payload.hmac_sha256
  secret:    string,
): boolean {
  const expected = createHmac("sha256", secret).update(rawBody).digest("hex")
  const a = Buffer.from(signature, "hex")
  const b = Buffer.from(expected,  "hex")
  if (a.length !== b.length) return false
  return timingSafeEqual(a, b)
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function toDateStr(d: Date): string {
  return d.toISOString().slice(0, 10)
}

function splitDateRange(start: Date, end: Date, maxDays: number): [Date, Date][] {
  const chunks: [Date, Date][] = []
  let current = new Date(start)
  while (current <= end) {
    const chunkEnd = new Date(current)
    chunkEnd.setDate(chunkEnd.getDate() + maxDays - 1)
    chunks.push([new Date(current), chunkEnd <= end ? chunkEnd : new Date(end)])
    current.setDate(current.getDate() + maxDays)
  }
  return chunks
}
