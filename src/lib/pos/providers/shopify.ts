// ============================================================================
// Shopify POS Provider — Production-Ready Skeleton
// ============================================================================
// Real Shopify Admin API integration structure.
// Ready to be activated with actual API credentials.

import type { POSProvider, POSProviderConfig, POSSalesRecord, POSConnectionTestResult } from "../types"
import { logger } from "@/lib/logger"
import { withCircuitBreaker } from "../circuit-breaker"

export class ShopifyPOSProvider implements POSProvider {
  private apiKey: string
  private storeId: string

  constructor(config: POSProviderConfig) {
    this.apiKey = config.apiKey
    this.storeId = config.storeId ?? ""
  }

  private getBaseUrl(): string {
    return `https://${this.storeId}.myshopify.com/admin/api/2024-01`
  }

  private getHeaders(): Record<string, string> {
    return {
      "X-Shopify-Access-Token": this.apiKey,
      "Content-Type": "application/json",
    }
  }

  async testConnection(): Promise<POSConnectionTestResult> {
    try {
      const baseUrl = this.getBaseUrl()
      const response = await fetch(`${baseUrl}/shop.json`, {
        headers: this.getHeaders(),
      })

      if (!response.ok) {
        return {
          ok: false,
          error: `Connection failed: ${response.status} ${response.statusText}`,
        }
      }

      const data = await response.json() as { shop: { name: string } }
      return {
        ok: true,
        // message: `Connected to Shopify store: ${data.shop.name}`,
      }
    } catch (error) {
      return {
        ok: false,
        error: `Connection error: ${error instanceof Error ? error.message : "Unknown error"}`,
      }
    }
  }

  async fetchDailySales(date: Date): Promise<POSSalesRecord> {
    const records = await this.fetchSalesRange(date, date)
    return records[0] || this.emptyRecord(date)
  }

  async fetchSalesRange(
    startDate: Date,
    endDate: Date,
  ): Promise<POSSalesRecord[]> {
    const startStr = toDateStr(startDate)
    const endStr = toDateStr(endDate)

    return withCircuitBreaker("shopify", async () => {
      try {
        const baseUrl = this.getBaseUrl()

        // Fetch orders for the date range
        const response = await fetch(
          `${baseUrl}/orders.json?status=any&created_at_min=${startStr}T00:00:00Z&created_at_max=${endStr}T23:59:59Z&limit=250`,
          { headers: this.getHeaders() }
        )

        if (!response.ok) {
          throw new Error(`Shopify API error: ${response.status}`)
        }

        const data = await response.json() as {
          orders: Array<{
            created_at: string
            total_price: string
            subtotal_price: string
            total_discounts: string
            refunds: Array<{ transactions: Array<{ amount: string }> }>
            line_items: Array<{ product_type: string; price: string; quantity: number }>
          }>
        }

        // Aggregate orders by date
        const dailyMap = new Map<string, POSSalesRecord>()

        for (const order of data.orders) {
          const orderDateStr = order.created_at.split("T")[0]
          const orderDate = new Date(orderDateStr)
          const existing = dailyMap.get(orderDateStr) || this.emptyRecord(orderDate)

          const totalPrice = parseFloat(order.total_price)
          const subtotalPrice = parseFloat(order.subtotal_price)
          const totalDiscounts = parseFloat(order.total_discounts)
          const orderRefunds = order.refunds?.reduce((sum, r) =>
            sum + r.transactions.reduce((ts, t) => ts + parseFloat(t.amount), 0), 0) || 0

          existing.grossSales += totalPrice
          existing.discounts += totalDiscounts
          existing.refunds += orderRefunds
          existing.netSales += (subtotalPrice - orderRefunds)
          existing.transactionCount += 1

          // Category breakdown from line items
          for (const item of order.line_items) {
            const category = item.product_type || "Other"
            existing.categoryBreakdown[category] = (existing.categoryBreakdown[category] || 0) +
              (parseFloat(item.price) * item.quantity)
          }

          // Hourly breakdown
          const hour = new Date(order.created_at).getHours()
          existing.hourlyBreakdown[hour] = (existing.hourlyBreakdown[hour] || 0) + totalPrice

          dailyMap.set(orderDateStr, existing)
        }

        // Calculate averages and round values
        const records: POSSalesRecord[] = []
        const current = new Date(startDate)
        const end = new Date(endDate)

        while (current <= end) {
          const dateStr = toDateStr(current)
          const record = dailyMap.get(dateStr) || this.emptyRecord(new Date(current))
          record.avgTransactionValue = record.transactionCount > 0
            ? Math.round((record.grossSales / record.transactionCount) * 100) / 100
            : 0
          record.grossSales = Math.round(record.grossSales * 100) / 100
          record.netSales = Math.round(record.netSales * 100) / 100
          record.refunds = Math.round(record.refunds * 100) / 100
          record.discounts = Math.round(record.discounts * 100) / 100
          records.push(record)
          current.setDate(current.getDate() + 1)
        }

        return records
      } catch (error) {
        logger.error("pos-ingest-error", {
          provider:    "shopify",
          error,
        })
        throw error
      }
    })
  }

  async disconnect(): Promise<void> {
    // Shopify: Revoke access token would go here
  }

  private emptyRecord(date: Date): POSSalesRecord {
    return {
      date,
      grossSales: 0,
      netSales: 0,
      refunds: 0,
      discounts: 0,
      transactionCount: 0,
      avgTransactionValue: 0,
      categoryBreakdown: {},
      hourlyBreakdown: {},
    }
  }
}

function toDateStr(d: Date): string {
  return d.toISOString().slice(0, 10)
}

