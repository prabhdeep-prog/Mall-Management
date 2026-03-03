/**
 * Razorpay POS Provider
 * ─────────────────────────────────────────────────────────────────────────────
 * Razorpay POS (part of Razorpay's offline payments suite) is used by
 * modern retail stores in malls — fashion, electronics, lifestyle.
 *
 * Integration model:
 *   • Webhooks on every payment + refund (primary)
 *   • REST API polling for settlement reports (reconciliation)
 *
 * Auth: key_id + key_secret (Basic Auth)
 * Docs: Razorpay POS API v1
 */

import type { POSProvider, POSSalesRecord, POSProviderConfig } from "../types"
import { createHmac, timingSafeEqual } from "crypto"

const RAZORPAY_BASE_URL = "https://api.razorpay.com/v1"
const TIMEOUT_MS        = 15_000

// ── API types ─────────────────────────────────────────────────────────────────

interface RazorpaySettlement {
  id:                string
  entity:            "settlement"
  merchant_id:       string
  created_at:        number   // unix timestamp
  processed_at:      number
  amount:            number   // in paise
  fees:              number
  tax:               number
  deduction_summary: Array<{ description: string; amount: number }>
  utr:               string
}

interface RazorpayPayment {
  id:          string
  entity:      "payment"
  amount:      number      // paise
  amount_refunded: number  // paise
  status:      "captured" | "refunded" | "failed"
  method:      string      // "card" | "upi" | "netbanking" | "wallet"
  created_at:  number
  description: string
  notes:       Record<string, string>
}

interface RazorpayCursor<T> {
  entity:   "collection"
  count:    number
  items:    T[]
  next_cursor?: string
}

// ── Provider ──────────────────────────────────────────────────────────────────

export class RazorpayPOSProvider implements POSProvider {
  private keyId:    string
  private keySecret: string
  private authHeader: string

  constructor(config: POSProviderConfig) {
    this.keyId     = config.apiKey
    this.keySecret = config.apiSecret ?? ""
    this.authHeader = "Basic " + Buffer.from(`${this.keyId}:${this.keySecret}`).toString("base64")
  }

  async testConnection(): Promise<{ ok: boolean; error?: string }> {
    try {
      await this.request<{ id: string }>("/payments?count=1")
      return { ok: true }
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : String(err) }
    }
  }

  async fetchDailySales(date: Date): Promise<POSSalesRecord> {
    const from = Math.floor(startOfDay(date).getTime() / 1000)
    const to   = Math.floor(endOfDay(date).getTime()   / 1000)

    const payments = await this.fetchAllPayments(from, to)
    return this.aggregatePayments(payments, date)
  }

  async fetchSalesRange(startDate: Date, endDate: Date): Promise<POSSalesRecord[]> {
    const results: POSSalesRecord[] = []
    const current = new Date(startDate)

    while (current <= endDate) {
      results.push(await this.fetchDailySales(new Date(current)))
      current.setDate(current.getDate() + 1)
    }

    return results
  }

  async disconnect(): Promise<void> {
    // Deactivate webhooks in Razorpay Dashboard
  }

  // ── Internals ─────────────────────────────────────────────────────────────────

  private async fetchAllPayments(from: number, to: number): Promise<RazorpayPayment[]> {
    const payments: RazorpayPayment[] = []
    let cursor: string | undefined

    do {
      const path = `/payments?from=${from}&to=${to}&count=100${cursor ? `&cursor=${cursor}` : ""}`
      const page = await this.request<RazorpayCursor<RazorpayPayment>>(path)
      payments.push(...(page.items ?? []))
      cursor = page.next_cursor
    } while (cursor)

    return payments
  }

  private aggregatePayments(payments: RazorpayPayment[], date: Date): POSSalesRecord {
    const toINR = (paise: number) => paise / 100

    const captured  = payments.filter((p) => p.status === "captured")
    const refunded  = payments.filter((p) => p.amount_refunded > 0)

    const grossSales  = captured.reduce((s, p) => s + toINR(p.amount), 0)
    const totalRefunds = refunded.reduce((s, p) => s + toINR(p.amount_refunded), 0)
    const txCount     = captured.length

    // Payment method breakdown
    const methodBreakdown: Record<string, number> = {}
    for (const p of captured) {
      const m = p.method || "other"
      methodBreakdown[m] = (methodBreakdown[m] ?? 0) + toINR(p.amount)
    }

    // Hourly breakdown
    const hourlyBreakdown: Record<number, number> = {}
    for (const p of captured) {
      const h = new Date(p.created_at * 1000).getHours()
      hourlyBreakdown[h] = (hourlyBreakdown[h] ?? 0) + toINR(p.amount)
    }

    return {
      date,
      grossSales:          Math.round(grossSales * 100) / 100,
      netSales:            Math.round((grossSales - totalRefunds) * 100) / 100,
      refunds:             Math.round(totalRefunds * 100) / 100,
      discounts:           0,   // Razorpay doesn't track discounts at POS level
      transactionCount:    txCount,
      avgTransactionValue: txCount > 0 ? Math.round((grossSales / txCount) * 100) / 100 : 0,
      categoryBreakdown:   methodBreakdown,
      hourlyBreakdown,
    }
  }

  private async request<T>(path: string): Promise<T> {
    const url = `${RAZORPAY_BASE_URL}${path}`
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS)

    try {
      const res = await fetch(url, {
        headers: {
          "Authorization": this.authHeader,
          "Content-Type":  "application/json",
        },
        signal: controller.signal,
      })
      clearTimeout(timer)

      if (!res.ok) {
        const body = await res.json() as { error?: { description: string } }
        throw new Error(`Razorpay API ${res.status}: ${body.error?.description ?? "Unknown"}`)
      }

      return res.json() as Promise<T>
    } catch (err) {
      clearTimeout(timer)
      if ((err as Error).name === "AbortError") throw new Error(`Razorpay timeout after ${TIMEOUT_MS}ms`)
      throw err
    }
  }
}

// ── Webhook types ─────────────────────────────────────────────────────────────

export interface RazorpayPOSWebhookPayload {
  entity:  string
  event:   "payment.captured" | "payment.failed" | "refund.processed"
  payload: {
    payment?: {
      entity: RazorpayPayment
    }
    refund?: {
      entity: {
        id:         string
        amount:     number   // paise
        payment_id: string
        created_at: number
      }
    }
  }
  created_at: number
}

export function parseRazorpayPOSWebhook(payload: RazorpayPOSWebhookPayload) {
  const toINR = (p: number) => p / 100

  if (payload.event === "payment.captured") {
    const p = payload.payload.payment!.entity
    const txDate = new Date(p.created_at * 1000)
    return {
      eventType:       "payment.captured" as const,
      providerTxId:    p.id,
      transactionDate: new Date(txDate.toISOString().slice(0, 10)),
      transactionTime: txDate,
      grossAmount:     toINR(p.amount),
      refundAmount:    0,
      discountAmount:  0,
      paymentMode:     p.method,
      category:        p.notes?.category ?? "retail",
      rawPayload:      payload,
      isBillable:      true,
    }
  }

  if (payload.event === "refund.processed") {
    const r = payload.payload.refund!.entity
    const txDate = new Date(r.created_at * 1000)
    return {
      eventType:       "refund.processed" as const,
      providerTxId:    `${r.payment_id}_refund_${r.id}`,
      transactionDate: new Date(txDate.toISOString().slice(0, 10)),
      transactionTime: txDate,
      grossAmount:     0,
      refundAmount:    toINR(r.amount),
      discountAmount:  0,
      paymentMode:     "refund",
      category:        "retail",
      rawPayload:      payload,
      isBillable:      false,
    }
  }

  return null
}

// ── Signature verification ────────────────────────────────────────────────────

/**
 * Razorpay signs webhooks with HMAC-SHA256 over the raw body.
 * Header: X-Razorpay-Signature
 */
export function verifyRazorpayPOSSignature(
  rawBody:   string,
  signature: string,
  secret:    string,
): boolean {
  const expected = createHmac("sha256", secret).update(rawBody).digest("hex")
  const a = Buffer.from(signature, "hex")
  const b = Buffer.from(expected,  "hex")
  if (a.length !== b.length) return false
  return timingSafeEqual(a, b)
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function startOfDay(d: Date): Date {
  const r = new Date(d)
  r.setHours(0, 0, 0, 0)
  return r
}

function endOfDay(d: Date): Date {
  const r = new Date(d)
  r.setHours(23, 59, 59, 999)
  return r
}
