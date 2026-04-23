// ============================================================================
// Mock Data Generator — Realistic POS Sales Data for Demo
// ============================================================================
// Generates 90 days of realistic daily sales data per tenant category.
// Includes: weekend spikes, seasonal patterns, anomalies for demo.

import type { POSSalesRecord } from "./types"

// Category-specific daily sales ranges (in INR)
const CATEGORY_RANGES: Record<string, { min: number; max: number; avgTxn: number }> = {
  fashion: { min: 80000, max: 500000, avgTxn: 3500 },
  food_beverage: { min: 50000, max: 250000, avgTxn: 450 },
  electronics: { min: 100000, max: 1000000, avgTxn: 12000 },
  entertainment: { min: 30000, max: 200000, avgTxn: 800 },
  services: { min: 20000, max: 100000, avgTxn: 1500 },
  health_beauty: { min: 40000, max: 300000, avgTxn: 2200 },
  home_lifestyle: { min: 60000, max: 400000, avgTxn: 4500 },
  jewelry: { min: 150000, max: 1500000, avgTxn: 25000 },
  sports: { min: 30000, max: 200000, avgTxn: 3000 },
  books_stationery: { min: 15000, max: 80000, avgTxn: 350 },
}

const PRODUCT_CATEGORIES: Record<string, string[]> = {
  fashion: ["Men's Wear", "Women's Wear", "Kids", "Accessories", "Footwear"],
  food_beverage: ["Dine-in", "Takeaway", "Beverages", "Desserts"],
  electronics: ["Smartphones", "Laptops", "Accessories", "Audio", "Wearables"],
  entertainment: ["Tickets", "F&B", "Merchandise", "Premium"],
  services: ["Haircut", "Spa", "Grooming", "Packages"],
  health_beauty: ["Skincare", "Makeup", "Wellness", "Fragrance"],
  home_lifestyle: ["Furniture", "Decor", "Kitchen", "Bedding"],
  jewelry: ["Gold", "Diamond", "Silver", "Fashion Jewelry"],
  sports: ["Equipment", "Apparel", "Footwear", "Supplements"],
  books_stationery: ["Books", "Stationery", "Gifts", "Art Supplies"],
}

// Seeded random for consistent demo data
function seededRandom(seed: number): number {
  const x = Math.sin(seed * 9301 + 49297) * 49297
  return x - Math.floor(x)
}

function getDayOfWeek(dateStr: string): number {
  return new Date(dateStr).getDay() // 0=Sunday, 6=Saturday
}

function isWeekend(dateStr: string): boolean {
  const day = getDayOfWeek(dateStr)
  return day === 0 || day === 6
}

function getMonthDay(dateStr: string): number {
  return new Date(dateStr).getDate()
}

/**
 * Generate a single day's sales record with realistic patterns
 */
function generateDaySales(
  date: string,
  category: string,
  tenantSeed: number,
  anomalyMode: "none" | "underreport" | "flat" = "none"
): POSSalesRecord {
  const range = CATEGORY_RANGES[category] || CATEGORY_RANGES.fashion
  const categories = PRODUCT_CATEGORIES[category] || PRODUCT_CATEGORIES.fashion
  const dayNum = Math.floor(new Date(date).getTime() / 86400000)
  const seed = tenantSeed + dayNum

  // Base sales amount within range
  let baseSales = range.min + seededRandom(seed) * (range.max - range.min)

  // Weekend multiplier (1.3x to 1.8x for most categories)
  if (isWeekend(date)) {
    const weekendMultiplier = 1.3 + seededRandom(seed + 1) * 0.5
    baseSales *= weekendMultiplier
  }

  // Month-end salary spending spike (25th-30th)
  const monthDay = getMonthDay(date)
  if (monthDay >= 25) {
    baseSales *= 1.15 + seededRandom(seed + 2) * 0.15
  }

  // Seasonal patterns — festive season boost (Oct-Nov = Diwali, Dec = Christmas)
  const month = new Date(date).getMonth()
  if (month === 9 || month === 10) baseSales *= 1.4 // October-November (Diwali)
  if (month === 11) baseSales *= 1.25 // December (Christmas/New Year)
  if (month === 0) baseSales *= 1.15 // January (New Year sales)

  // Random daily variation (+/- 15%)
  baseSales *= 0.85 + seededRandom(seed + 3) * 0.30

  // Apply anomaly patterns for suspicious tenants
  if (anomalyMode === "underreport") {
    // Suspiciously low numbers — 40-60% of expected (simulating under-reporting)
    baseSales *= 0.4 + seededRandom(seed + 4) * 0.2
  } else if (anomalyMode === "flat") {
    // Flat-line reporting — same-ish amount every day (looks manually entered)
    baseSales = range.min * 1.2 + seededRandom(seed + 5) * range.min * 0.05
  }

  const grossSales = Math.round(baseSales * 100) / 100
  const refundRate = 0.02 + seededRandom(seed + 6) * 0.03 // 2-5% refunds
  const discountRate = 0.05 + seededRandom(seed + 7) * 0.10 // 5-15% discounts
  const refunds = Math.round(grossSales * refundRate * 100) / 100
  const discounts = Math.round(grossSales * discountRate * 100) / 100
  const netSales = Math.round((grossSales - refunds - discounts) * 100) / 100

  const transactionCount = Math.round(grossSales / range.avgTxn)
  const avgTransactionValue = transactionCount > 0
    ? Math.round((grossSales / transactionCount) * 100) / 100
    : 0

  // Generate category breakdown
  const categoryBreakdown: Record<string, number> = {}
  let remaining = grossSales
  categories.forEach((cat, i) => {
    if (i === categories.length - 1) {
      categoryBreakdown[cat] = Math.round(remaining * 100) / 100
    } else {
      const share = (0.15 + seededRandom(seed + 10 + i) * 0.25)
      const amount = Math.round(grossSales * share * 100) / 100
      categoryBreakdown[cat] = Math.min(amount, remaining)
      remaining -= categoryBreakdown[cat]
    }
  })

  // Generate hourly breakdown (mall hours: 10am-10pm)
  const hourlyBreakdown: Record<string, number> = {}
  const hours = [10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21]
  // Peak hours: 12-2pm lunch, 6-9pm evening
  const hourWeights: Record<number, number> = {
    10: 0.04, 11: 0.06, 12: 0.10, 13: 0.11, 14: 0.08,
    15: 0.07, 16: 0.08, 17: 0.09, 18: 0.12, 19: 0.11,
    20: 0.09, 21: 0.05,
  }
  let hourRemaining = grossSales
  hours.forEach((hour, i) => {
    const weight = hourWeights[hour] || 0.08
    const variance = 1 + (seededRandom(seed + 20 + i) - 0.5) * 0.3
    if (i === hours.length - 1) {
      hourlyBreakdown[String(hour)] = Math.round(hourRemaining * 100) / 100
    } else {
      const amount = Math.round(grossSales * weight * variance * 100) / 100
      hourlyBreakdown[String(hour)] = Math.min(amount, hourRemaining)
      hourRemaining -= hourlyBreakdown[String(hour)]
    }
  })

  return {
    date: new Date(date),
    grossSales,
    netSales,
    refunds,
    discounts,
    transactionCount,
    avgTransactionValue,
    categoryBreakdown,
    hourlyBreakdown: Object.fromEntries(
      Object.entries(hourlyBreakdown).map(([h, v]) => [parseInt(h, 10), v])
    ),
  }
}


/**
 * Generate N days of realistic POS sales data for a tenant
 */
export function generateMockSalesData(params: {
  startDate: string // YYYY-MM-DD
  endDate: string // YYYY-MM-DD
  tenantCategory: string
  tenantSeed?: number // Unique seed per tenant for consistent data
  anomalyMode?: "none" | "underreport" | "flat"
}): POSSalesRecord[] {
  const {
    startDate,
    endDate,
    tenantCategory,
    tenantSeed = Math.floor(Math.random() * 10000),
    anomalyMode = "none",
  } = params

  const records: POSSalesRecord[] = []
  const start = new Date(startDate)
  const end = new Date(endDate)

  const current = new Date(start)
  while (current <= end) {
    const dateStr = current.toISOString().split("T")[0]
    records.push(generateDaySales(dateStr, tenantCategory, tenantSeed, anomalyMode))
    current.setDate(current.getDate() + 1)
  }

  return records
}

/**
 * Generate demo dataset — multiple tenants with varied patterns
 * Returns a map of tenantId → sales records
 */
export function generateDemoDataset(tenants: Array<{
  id: string
  category: string
  anomaly?: "none" | "underreport" | "flat"
}>, days: number = 90): Map<string, POSSalesRecord[]> {
  const dataset = new Map<string, POSSalesRecord[]>()
  const endDate = new Date()
  const startDate = new Date()
  startDate.setDate(startDate.getDate() - days)

  tenants.forEach((tenant, index) => {
    const records = generateMockSalesData({
      startDate: startDate.toISOString().split("T")[0],
      endDate: endDate.toISOString().split("T")[0],
      tenantCategory: tenant.category,
      tenantSeed: index * 1000 + 42,
      anomalyMode: tenant.anomaly || "none",
    })
    dataset.set(tenant.id, records)
  })

  return dataset
}
