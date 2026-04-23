// ============================================================================
// Mock POS Provider — For Demo & Development
// ============================================================================
// Generates realistic sales data without hitting any real API.
// Uses the mock data generator for category-aware, pattern-rich data.

import type {
  POSProvider,
  POSProviderConfig,
  POSProviderKey,
  POSSalesRecord,
  POSConnectionTestResult,
} from "../types"
import { generateMockSalesData } from "../mock-data-generator"

// Provider-specific Store ID format requirements
const STORE_ID_FORMATS: Record<string, { prefix: string; hint: string; minLength: number }> = {
  pine_labs: { prefix: "PL-", hint: "Pine Labs Store ID must start with 'PL-' (e.g., PL-MUM-4821)", minLength: 6 },
  razorpay_pos: { prefix: "rzp_", hint: "Razorpay Store ID must start with 'rzp_' (e.g., rzp_store_Kx9n2Bq)", minLength: 8 },
  petpooja: { prefix: "PP", hint: "Petpooja Store ID must start with 'PP' (e.g., PP78234)", minLength: 6 },
  posist: { prefix: "PST-", hint: "POSist Store ID must start with 'PST-' (e.g., PST-DEL-0091)", minLength: 6 },
  shopify: { prefix: "", hint: "Shopify Store ID should be your myshopify.com subdomain (e.g., my-store-name)", minLength: 4 },
  square: { prefix: "sq_", hint: "Square Location ID must start with 'sq_' (e.g., sq_loc_ABC123)", minLength: 8 },
  lightspeed: { prefix: "LS", hint: "Lightspeed Account ID must start with 'LS' (e.g., LS482910)", minLength: 6 },
  vend: { prefix: "", hint: "Vend Store ID should be your store domain prefix (e.g., mystore)", minLength: 4 },
}

// Provider display names for error messages
const PROVIDER_DISPLAY_NAMES: Record<string, string> = {
  pine_labs: "Pine Labs",
  razorpay_pos: "Razorpay POS",
  petpooja: "Petpooja",
  posist: "POSist",
  shopify: "Shopify POS",
  square: "Square",
  lightspeed: "Lightspeed",
  vend: "Vend",
}

export class MockPOSProvider implements POSProvider {
  private config: POSProviderConfig
  private providerKey: POSProviderKey

  constructor(config: POSProviderConfig = { apiKey: "mock" }, providerKey: POSProviderKey = "pine_labs") {
    this.config = config
    this.providerKey = providerKey
  }

  async testConnection(): Promise<POSConnectionTestResult> {
    // Simulate realistic network delay (800ms-1.5s)
    await new Promise((resolve) => setTimeout(resolve, 800 + Math.random() * 700))

    const providerName = PROVIDER_DISPLAY_NAMES[this.providerKey] || this.providerKey

    // Success — return realistic provider info
    const storeNames: Record<string, string> = {
      pine_labs: `${providerName} Terminal — ${this.config.storeId || "DEMO"}`,
      razorpay_pos: `Razorpay POS — ${(this.config.storeId || "DEMO").replace("rzp_store_", "")}`,
      petpooja: `Petpooja Outlet — ${this.config.storeId || "DEMO"}`,
      posist: `POSist Restaurant — ${this.config.storeId || "DEMO"}`,
      shopify: `${this.config.storeId || "demo"}.myshopify.com`,
      square: `Square Location — ${this.config.storeId || "DEMO"}`,
      lightspeed: `Lightspeed Retail — ${this.config.storeId || "DEMO"}`,
      vend: `Vend Store — ${this.config.storeId || "DEMO"}`,
    }

    return {
      ok: true,
    }
  }

  async fetchDailySales(date: Date): Promise<POSSalesRecord> {
    await new Promise((resolve) => setTimeout(resolve, 300))

    const dateStr = date.toISOString().slice(0, 10)
    const records = generateMockSalesData({
      startDate: dateStr,
      endDate: dateStr,
      tenantCategory: (this.config.extra?.tenantCategory as string) || "fashion",
      tenantSeed: hashCode(this.config.storeId || "default"),
    })

    return records[0]
  }

  async fetchSalesRange(
    startDate: Date,
    endDate: Date,
  ): Promise<POSSalesRecord[]> {
    await new Promise((resolve) => setTimeout(resolve, 500))

    return generateMockSalesData({
      startDate: startDate.toISOString().slice(0, 10),
      endDate: endDate.toISOString().slice(0, 10),
      tenantCategory: (this.config.extra?.tenantCategory as string) || "fashion",
      tenantSeed: hashCode(this.config.storeId || "default"),
      anomalyMode: (this.config.extra?.anomalyMode as "none" | "underreport" | "flat") || "none",
    })
  }

  async disconnect(): Promise<void> {
    await new Promise((resolve) => setTimeout(resolve, 200))
  }
}


function hashCode(str: string): number {
  let hash = 0
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i)
    hash = ((hash << 5) - hash) + char
    hash |= 0 // Convert to 32bit integer
  }
  return Math.abs(hash)
}
