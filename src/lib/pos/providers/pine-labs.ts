/**
 * Pine Labs POS Provider
 * ─────────────────────────────────────────────────────────────────────────────
 * Pine Labs is India's largest POS network. Integration uses their REST API.
 *
 * Auth:   Bearer token (API key + merchant ID)
 * Docs:   Pine Labs Partner API v2
 * Limits: 100 req/min per merchant
 *
 * Pine Labs sends webhooks on every transaction + daily settlement.
 * This adapter handles:
 *   1. Polling daily sales summary (fallback if webhook missed)
 *   2. Fetching transaction range for backfill
 *   3. Parsing webhook payloads (see webhook route)
 */

import type { POSProvider, POSSalesRecord, POSProviderConfig } from "../types"

const PINE_LABS_BASE_URL = "https://api.pinelabs.com/partner/v2"
const DEFAULT_TIMEOUT_MS = 15_000

// ── Type definitions ──────────────────────────────────────────────────────────

interface PineLabsSettlementRecord {
  merchant_id:       string
  terminal_id:       string
  settlement_date:   string   // "YYYY-MM-DD"
  gross_amount:      number   // in paise
  net_amount:        number
  refund_amount:     number
  discount_amount:   number
  transaction_count: number
  payment_modes: Array<{
    mode:   string   // "card" | "upi" | "wallet" | "emi"
    amount: number
    count:  number
  }>
  category_breakdown: Record<string, number>
  hourly_breakdown:   Record<string, number>   // "09": 150000
}

interface PineLabsApiResponse<T> {
  status:   "success" | "error"
  code:     number
  message:  string
  data:     T
}

// ── Adapter ───────────────────────────────────────────────────────────────────

export class PineLabsProvider implements POSProvider {
  private apiKey:     string
  private merchantId: string
  private baseUrl:    string

  constructor(config: POSProviderConfig) {
    this.apiKey     = config.apiKey
    this.merchantId = config.merchantId ?? ""
    this.baseUrl    = PINE_LABS_BASE_URL
  }

  async testConnection(): Promise<{ ok: boolean; error?: string }> {
    try {
      const res = await this.request<{ merchant_name: string }>(
        `GET`,
        `/merchants/${this.merchantId}/profile`,
      )
      return { ok: !!res.merchant_name }
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : String(err) }
    }
  }

  async fetchDailySales(date: Date): Promise<POSSalesRecord> {
    const dateStr = toDateStr(date)

    const raw = await this.request<PineLabsSettlementRecord>(
      "GET",
      `/merchants/${this.merchantId}/settlements/${dateStr}`,
    )

    return this.mapSettlement(raw)
  }

  async fetchSalesRange(startDate: Date, endDate: Date): Promise<POSSalesRecord[]> {
    // Pine Labs paginates: max 31 days per call
    const chunks = splitDateRange(startDate, endDate, 31)
    const results: POSSalesRecord[] = []

    for (const [from, to] of chunks) {
      const raw = await this.request<PineLabsSettlementRecord[]>(
        "GET",
        `/merchants/${this.merchantId}/settlements`,
        { from: toDateStr(from), to: toDateStr(to) },
      )
      results.push(...raw.map((r) => this.mapSettlement(r)))
    }

    return results
  }

  async disconnect(): Promise<void> {
    // Pine Labs doesn't have an explicit disconnect — revoke in portal
  }

  // ── Mapping ─────────────────────────────────────────────────────────────────

  private mapSettlement(raw: PineLabsSettlementRecord): POSSalesRecord {
    // Pine Labs stores amounts in paise (1/100 INR) — convert to INR
    const toINR = (paise: number) => Math.round(paise) / 100

    const grossSales  = toINR(raw.gross_amount)
    const netSales    = toINR(raw.net_amount)
    const refunds     = toINR(raw.refund_amount)
    const discounts   = toINR(raw.discount_amount)
    const txCount     = raw.transaction_count

    // Hourly breakdown: keys are "09", "14" etc.
    const hourlyBreakdown: Record<number, number> = {}
    for (const [hour, amount] of Object.entries(raw.hourly_breakdown ?? {})) {
      hourlyBreakdown[parseInt(hour, 10)] = toINR(amount)
    }

    return {
      date:                new Date(raw.settlement_date),
      grossSales,
      netSales,
      refunds,
      discounts,
      transactionCount:    txCount,
      avgTransactionValue: txCount > 0 ? Math.round((grossSales / txCount) * 100) / 100 : 0,
      categoryBreakdown:   raw.category_breakdown ?? {},
      hourlyBreakdown,
    }
  }

  // ── HTTP client ──────────────────────────────────────────────────────────────

  private async request<T>(
    method: string,
    path: string,
    params?: Record<string, string>,
  ): Promise<T> {
    const url = new URL(`${this.baseUrl}${path}`)
    if (params && method === "GET") {
      for (const [k, v] of Object.entries(params)) {
        url.searchParams.set(k, v)
      }
    }

    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), DEFAULT_TIMEOUT_MS)

    try {
      const res = await fetch(url.toString(), {
        method,
        headers: {
          "Authorization": `Bearer ${this.apiKey}`,
          "X-Merchant-ID": this.merchantId,
          "Content-Type":  "application/json",
          "Accept":        "application/json",
        },
        signal: controller.signal,
      })

      clearTimeout(timer)

      if (!res.ok) {
        const body = await res.text()
        throw new Error(`Pine Labs API ${res.status}: ${body.slice(0, 200)}`)
      }

      const json = (await res.json()) as PineLabsApiResponse<T>

      if (json.status === "error") {
        throw new Error(`Pine Labs API error ${json.code}: ${json.message}`)
      }

      return json.data
    } catch (err) {
      clearTimeout(timer)
      if ((err as Error).name === "AbortError") {
        throw new Error(`Pine Labs API timeout after ${DEFAULT_TIMEOUT_MS}ms`)
      }
      throw err
    }
  }
}

// ── Webhook payload parser (used by webhook route) ────────────────────────────

export interface PineLabsWebhookPayload {
  event_type:      string   // "transaction.completed" | "settlement.ready"
  merchant_id:     string
  terminal_id:     string
  transaction_id:  string
  transaction_date: string
  gross_amount:    number   // paise
  net_amount:      number
  refund_amount:   number
  discount_amount: number
  payment_mode:    string
  category:        string
  raw_metadata:    Record<string, unknown>
}

export function parsePineLabsWebhook(payload: PineLabsWebhookPayload) {
  const toINR = (paise: number) => Math.round(paise) / 100

  return {
    providerTxId:    payload.transaction_id,
    transactionDate: new Date(payload.transaction_date),
    grossAmount:     toINR(payload.gross_amount),
    netAmount:       toINR(payload.net_amount),
    refundAmount:    toINR(payload.refund_amount),
    discountAmount:  toINR(payload.discount_amount),
    paymentMode:     payload.payment_mode,
    category:        payload.category,
    rawPayload:      payload,
  }
}

// ── HMAC signature verification ───────────────────────────────────────────────

import { createHmac, timingSafeEqual } from "crypto"

export function verifyPineLabsSignature(
  rawBody:   string,
  signature: string,
  secret:    string,
): boolean {
  const expected = createHmac("sha256", secret)
    .update(rawBody)
    .digest("hex")
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
