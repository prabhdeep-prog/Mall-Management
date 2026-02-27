import * as dotenv from "dotenv"
// Load env vars BEFORE any other imports
dotenv.config({ path: ".env.local" })

import { drizzle } from "drizzle-orm/postgres-js"
import postgres from "postgres"
import * as schema from "../src/lib/db/schema"
import bcrypt from "bcryptjs"

const {
  organizations,
  properties,
  tenants,
  leases,
  users,
  agents,
  workOrders,
  invoices,
  dailyMetrics,
  posIntegrations,
  posSalesData,
} = schema

const client = postgres(process.env.DATABASE_URL!)
const db = drizzle(client, { schema })

// ============================================================================
// MOCK DATA GENERATOR (inline for seeding — same logic as lib/pos/mock-data-generator)
// ============================================================================

const CATEGORY_RANGES: Record<string, { min: number; max: number; avgTxn: number }> = {
  fashion: { min: 80000, max: 500000, avgTxn: 3500 },
  food_beverage: { min: 50000, max: 250000, avgTxn: 450 },
  electronics: { min: 100000, max: 1000000, avgTxn: 12000 },
  entertainment: { min: 30000, max: 200000, avgTxn: 800 },
  health_beauty: { min: 40000, max: 300000, avgTxn: 2200 },
  home_lifestyle: { min: 60000, max: 400000, avgTxn: 4500 },
  jewelry: { min: 150000, max: 1500000, avgTxn: 25000 },
  sports: { min: 30000, max: 200000, avgTxn: 3000 },
  books_stationery: { min: 15000, max: 80000, avgTxn: 350 },
}

function seededRandom(seed: number): number {
  const x = Math.sin(seed * 9301 + 49297) * 49297
  return x - Math.floor(x)
}

function generateDaySales(
  date: string,
  category: string,
  tenantSeed: number,
  anomalyMode: "none" | "underreport" | "flat" = "none"
) {
  const range = CATEGORY_RANGES[category] || CATEGORY_RANGES.fashion
  const dayNum = Math.floor(new Date(date).getTime() / 86400000)
  const seed = tenantSeed + dayNum

  let baseSales = range.min + seededRandom(seed) * (range.max - range.min)

  // Weekend multiplier
  const dayOfWeek = new Date(date).getDay()
  if (dayOfWeek === 0 || dayOfWeek === 6) {
    baseSales *= 1.3 + seededRandom(seed + 1) * 0.5
  }

  // Month-end salary spike
  const monthDay = new Date(date).getDate()
  if (monthDay >= 25) baseSales *= 1.15 + seededRandom(seed + 2) * 0.15

  // Seasonal patterns
  const month = new Date(date).getMonth()
  if (month === 9 || month === 10) baseSales *= 1.4
  if (month === 11) baseSales *= 1.25
  if (month === 0) baseSales *= 1.15

  // Random daily variation
  baseSales *= 0.85 + seededRandom(seed + 3) * 0.30

  // Anomaly patterns
  if (anomalyMode === "underreport") {
    baseSales *= 0.4 + seededRandom(seed + 4) * 0.2
  } else if (anomalyMode === "flat") {
    baseSales = range.min * 1.2 + seededRandom(seed + 5) * range.min * 0.05
  }

  const grossSales = Math.round(baseSales * 100) / 100
  const refunds = Math.round(grossSales * (0.02 + seededRandom(seed + 6) * 0.03) * 100) / 100
  const discounts = Math.round(grossSales * (0.05 + seededRandom(seed + 7) * 0.10) * 100) / 100
  const netSales = Math.round((grossSales - refunds - discounts) * 100) / 100
  const transactionCount = Math.max(1, Math.round(grossSales / range.avgTxn))
  const avgTransactionValue = Math.round((grossSales / transactionCount) * 100) / 100

  return { grossSales, netSales, refunds, discounts, transactionCount, avgTransactionValue }
}

// ============================================================================
// SEED FUNCTION
// ============================================================================

async function seed() {
  console.log("🌱 Starting database seed...")

  // Clean up existing data (in reverse order of dependencies)
  console.log("🧹 Cleaning up existing data...")
  await db.delete(posSalesData)
  await db.delete(posIntegrations)
  await db.delete(dailyMetrics)
  await db.delete(invoices)
  await db.delete(workOrders)
  await db.delete(agents)
  await db.delete(leases)
  await db.delete(tenants)
  await db.delete(users)
  await db.delete(properties)
  await db.delete(organizations)
  console.log("✅ Cleanup complete")

  // ======== ORGANIZATION ========
  const orgId = crypto.randomUUID()
  await db.insert(organizations).values({
    id: orgId,
    name: "Metro Properties Group",
    code: "MPG001",
    type: "corporate",
    settings: {
      currency: "INR",
      timezone: "Asia/Kolkata",
      fiscalYearStart: "04-01",
    },
  })
  console.log("✅ Organization created")

  // ======== PROPERTIES ========
  const propertyId = crypto.randomUUID()
  const property2Id = crypto.randomUUID()
  await db.insert(properties).values([
    {
      id: propertyId,
      organizationId: orgId,
      name: "Metro Mall — Gurgaon",
      code: "MM-GGN",
      type: "shopping_mall",
      address: "Plot No. 45, Sector 29",
      city: "Gurgaon",
      state: "Haryana",
      country: "India",
      pincode: "122001",
      totalAreaSqft: "350000",
      leasableAreaSqft: "250000",
      floors: 4,
      status: "active",
      operatingHours: { weekdays: "10:00-22:00", weekends: "10:00-23:00" },
      amenities: ["Parking", "Food Court", "Multiplex", "Kids Zone", "VIP Lounge"],
      metadata: { parkingSpaces: 800, maintenanceDay: "Monday" },
    },
    {
      id: property2Id,
      organizationId: orgId,
      name: "Metro Mall — Noida",
      code: "MM-NOI",
      type: "shopping_mall",
      address: "Sector 18, Atta Market",
      city: "Noida",
      state: "Uttar Pradesh",
      country: "India",
      pincode: "201301",
      totalAreaSqft: "200000",
      leasableAreaSqft: "140000",
      floors: 3,
      status: "active",
      operatingHours: { weekdays: "10:00-22:00", weekends: "10:00-23:00" },
      amenities: ["Parking", "Food Court", "Gaming Zone"],
      metadata: { parkingSpaces: 400, maintenanceDay: "Tuesday" },
    },
  ])
  console.log("✅ Properties created (2 malls)")

  // ======== USERS ========
  const adminId = crypto.randomUUID()
  const managerId = crypto.randomUUID()
  const financeId = crypto.randomUUID()
  const hashedPassword = await bcrypt.hash("demo123456", 10)

  await db.insert(users).values([
    {
      id: adminId,
      organizationId: orgId,
      email: "admin@metromall.com",
      name: "Rohit Sadhu",
      password: hashedPassword,
      status: "active",
    },
    {
      id: managerId,
      organizationId: orgId,
      email: "manager@metromall.com",
      name: "Priya Mehta",
      password: hashedPassword,
      status: "active",
    },
    {
      id: financeId,
      organizationId: orgId,
      email: "finance@metromall.com",
      name: "Ankit Sharma",
      password: hashedPassword,
      status: "active",
    },
  ])
  console.log("✅ Users created (3)")

  // ======== TENANTS — Mix of Revenue Share & Fixed Rent ========
  const now = new Date()
  const oneYearAgo = new Date(now.getFullYear() - 1, now.getMonth(), now.getDate())
  const twoYearsFromNow = new Date(now.getFullYear() + 2, now.getMonth(), now.getDate())
  const threeMonthsFromNow = new Date(now.getFullYear(), now.getMonth() + 3, now.getDate())
  const sixMonthsFromNow = new Date(now.getFullYear(), now.getMonth() + 6, now.getDate())

  // ---- Revenue Share Tenants (POS-integrated) ----
  const t_zara = crypto.randomUUID()
  const t_haldirams = crypto.randomUUID()
  const t_croma = crypto.randomUUID()
  const t_pvr = crypto.randomUUID()
  const t_lakme = crypto.randomUUID()
  const t_tanishq = crypto.randomUUID()
  const t_nike = crypto.randomUUID()
  const t_fabindia = crypto.randomUUID()

  // ---- Not-Connected Revenue Share Tenants ----
  const t_crossword = crypto.randomUUID()
  const t_bata = crypto.randomUUID()

  // ---- Fixed Rent Tenants ----
  const t_lifestyle = crypto.randomUUID()
  const t_ccd = crypto.randomUUID()
  const t_techworld = crypto.randomUUID()

  const allTenants = [
    // Revenue Share — Connected POS
    { id: t_zara, propertyId, businessName: "Zara Fashion", legalEntityName: "Inditex India Pvt Ltd", category: "fashion", contactPerson: "Deepak Verma", email: "deepak@zara.in", phone: "+91-9876543201", gstin: "06AABCI1234A1ZA", status: "active" },
    { id: t_haldirams, propertyId, businessName: "Haldiram's", legalEntityName: "Haldiram Snacks Pvt Ltd", category: "food_beverage", contactPerson: "Rakesh Agarwal", email: "rakesh@haldirams.com", phone: "+91-9876543202", gstin: "06AABCH5678B1ZB", status: "active" },
    { id: t_croma, propertyId, businessName: "Croma Electronics", legalEntityName: "Infiniti Retail Ltd", category: "electronics", contactPerson: "Sunil Kumar", email: "sunil@croma.com", phone: "+91-9876543203", gstin: "06AABCC9012C1ZC", status: "active" },
    { id: t_pvr, propertyId, businessName: "PVR Cinemas", legalEntityName: "PVR INOX Ltd", category: "entertainment", contactPerson: "Kavita Singh", email: "kavita@pvr.com", phone: "+91-9876543204", gstin: "06AABCP3456D1ZD", status: "active" },
    { id: t_lakme, propertyId, businessName: "Lakme Salon", legalEntityName: "Hindustan Unilever Ltd", category: "health_beauty", contactPerson: "Anjali Desai", email: "anjali@lakme.com", phone: "+91-9876543205", gstin: "06AABCL7890E1ZE", status: "active" },
    { id: t_tanishq, propertyId, businessName: "Tanishq", legalEntityName: "Titan Company Ltd", category: "jewelry", contactPerson: "Rajesh Iyer", email: "rajesh@tanishq.co.in", phone: "+91-9876543206", gstin: "06AABCT1234F1ZF", status: "active" },
    { id: t_nike, propertyId, businessName: "Nike", legalEntityName: "Nike India Pvt Ltd", category: "sports", contactPerson: "Arjun Nair", email: "arjun@nike.in", phone: "+91-9876543207", gstin: "06AABCN5678G1ZG", status: "active" },
    { id: t_fabindia, propertyId, businessName: "FabIndia", legalEntityName: "Fabindia Overseas Pvt Ltd", category: "home_lifestyle", contactPerson: "Meera Joshi", email: "meera@fabindia.com", phone: "+91-9876543208", gstin: "06AABCF9012H1ZH", status: "active" },
    // Revenue Share — Not Connected
    { id: t_crossword, propertyId, businessName: "Crossword Books", legalEntityName: "Crossword Bookstores Ltd", category: "books_stationery", contactPerson: "Vikram Rao", email: "vikram@crossword.in", phone: "+91-9876543209", gstin: "06AABCX3456I1ZI", status: "active" },
    { id: t_bata, propertyId, businessName: "Bata Shoes", legalEntityName: "Bata India Ltd", category: "fashion", contactPerson: "Neha Gupta", email: "neha@bata.in", phone: "+91-9876543210", gstin: "06AABCB7890J1ZJ", status: "active" },
    // Fixed Rent
    { id: t_lifestyle, propertyId, businessName: "Lifestyle Fashion", legalEntityName: "Lifestyle International Pvt Ltd", category: "fashion", contactPerson: "Rahul Sharma", email: "rahul@lifestyle.com", phone: "+91-9876543211", gstin: "06AABCL1234K1ZK", status: "active" },
    { id: t_ccd, propertyId, businessName: "Café Coffee Day", legalEntityName: "Coffee Day Enterprises Ltd", category: "food_beverage", contactPerson: "Priya Patel", email: "priya@ccd.com", phone: "+91-9876543212", gstin: "06AABCC5678L1ZL", status: "active" },
    { id: t_techworld, propertyId, businessName: "Tech World Electronics", legalEntityName: "Tech World Retail Pvt Ltd", category: "electronics", contactPerson: "Amit Kumar", email: "amit@techworld.com", phone: "+91-9876543213", gstin: "06AABCT9012M1ZM", status: "active" },
  ]

  await db.insert(tenants).values(allTenants)
  console.log(`✅ Tenants created (${allTenants.length})`)

  // ======== LEASES — Revenue Share + Fixed Rent ========
  const l_zara = crypto.randomUUID()
  const l_haldirams = crypto.randomUUID()
  const l_croma = crypto.randomUUID()
  const l_pvr = crypto.randomUUID()
  const l_lakme = crypto.randomUUID()
  const l_tanishq = crypto.randomUUID()
  const l_nike = crypto.randomUUID()
  const l_fabindia = crypto.randomUUID()
  const l_crossword = crypto.randomUUID()
  const l_bata = crypto.randomUUID()
  const l_lifestyle = crypto.randomUUID()
  const l_ccd = crypto.randomUUID()
  const l_techworld = crypto.randomUUID()

  const d = (dt: Date) => dt.toISOString().split("T")[0]

  const allLeases = [
    // ---- Revenue Share Leases (POS connected) ----
    { id: l_zara, propertyId, tenantId: t_zara, unitNumber: "G-12", floor: 0, areaSqft: "2200", leaseType: "revenue_share", baseRent: "0", revenueSharePercentage: "8", camCharges: "25000", securityDeposit: "1500000", startDate: d(oneYearAgo), endDate: d(twoYearsFromNow), status: "active", rentEscalationPercentage: "5", escalationFrequencyMonths: 12 },
    { id: l_haldirams, propertyId, tenantId: t_haldirams, unitNumber: "G-05", floor: 0, areaSqft: "1500", leaseType: "revenue_share", baseRent: "0", revenueSharePercentage: "12", camCharges: "18000", securityDeposit: "900000", startDate: d(oneYearAgo), endDate: d(twoYearsFromNow), status: "active", rentEscalationPercentage: "5", escalationFrequencyMonths: 12 },
    { id: l_croma, propertyId, tenantId: t_croma, unitNumber: "1-01", floor: 1, areaSqft: "3000", leaseType: "revenue_share", baseRent: "0", revenueSharePercentage: "6", camCharges: "35000", securityDeposit: "2000000", startDate: d(oneYearAgo), endDate: d(twoYearsFromNow), status: "active", rentEscalationPercentage: "5", escalationFrequencyMonths: 12 },
    { id: l_pvr, propertyId, tenantId: t_pvr, unitNumber: "3-01", floor: 3, areaSqft: "8000", leaseType: "revenue_share", baseRent: "0", revenueSharePercentage: "15", camCharges: "50000", securityDeposit: "5000000", startDate: d(oneYearAgo), endDate: d(twoYearsFromNow), status: "active", rentEscalationPercentage: "5", escalationFrequencyMonths: 12 },
    { id: l_lakme, propertyId, tenantId: t_lakme, unitNumber: "1-08", floor: 1, areaSqft: "800", leaseType: "revenue_share", baseRent: "0", revenueSharePercentage: "10", camCharges: "12000", securityDeposit: "500000", startDate: d(oneYearAgo), endDate: d(twoYearsFromNow), status: "active", rentEscalationPercentage: "5", escalationFrequencyMonths: 12 },
    { id: l_tanishq, propertyId, tenantId: t_tanishq, unitNumber: "G-20", floor: 0, areaSqft: "1800", leaseType: "revenue_share", baseRent: "0", revenueSharePercentage: "5", camCharges: "22000", securityDeposit: "3000000", startDate: d(oneYearAgo), endDate: d(twoYearsFromNow), status: "active", rentEscalationPercentage: "5", escalationFrequencyMonths: 12 },
    { id: l_nike, propertyId, tenantId: t_nike, unitNumber: "2-03", floor: 2, areaSqft: "1200", leaseType: "revenue_share", baseRent: "0", revenueSharePercentage: "7", camCharges: "15000", securityDeposit: "800000", startDate: d(oneYearAgo), endDate: d(sixMonthsFromNow), status: "active", rentEscalationPercentage: "5", escalationFrequencyMonths: 12 },
    { id: l_fabindia, propertyId, tenantId: t_fabindia, unitNumber: "2-10", floor: 2, areaSqft: "1600", leaseType: "revenue_share", baseRent: "0", revenueSharePercentage: "9", camCharges: "18000", securityDeposit: "1000000", startDate: d(oneYearAgo), endDate: d(twoYearsFromNow), status: "active", rentEscalationPercentage: "5", escalationFrequencyMonths: 12 },
    // ---- Revenue Share — Not Connected ----
    { id: l_crossword, propertyId, tenantId: t_crossword, unitNumber: "1-15", floor: 1, areaSqft: "900", leaseType: "revenue_share", baseRent: "0", revenueSharePercentage: "11", camCharges: "10000", securityDeposit: "400000", startDate: d(oneYearAgo), endDate: d(twoYearsFromNow), status: "active", rentEscalationPercentage: "5", escalationFrequencyMonths: 12 },
    { id: l_bata, propertyId, tenantId: t_bata, unitNumber: "G-18", floor: 0, areaSqft: "1000", leaseType: "revenue_share", baseRent: "0", revenueSharePercentage: "7", camCharges: "12000", securityDeposit: "600000", startDate: d(oneYearAgo), endDate: d(twoYearsFromNow), status: "active", rentEscalationPercentage: "5", escalationFrequencyMonths: 12 },
    // ---- Fixed Rent Leases ----
    { id: l_lifestyle, propertyId, tenantId: t_lifestyle, unitNumber: "2-03A", floor: 2, areaSqft: "1200", leaseType: "fixed_rent", baseRent: "150000", camCharges: "15000", securityDeposit: "900000", startDate: d(oneYearAgo), endDate: d(twoYearsFromNow), status: "active", rentEscalationPercentage: "5", escalationFrequencyMonths: 12 },
    { id: l_ccd, propertyId, tenantId: t_ccd, unitNumber: "G-15", floor: 0, areaSqft: "800", leaseType: "fixed_rent", baseRent: "120000", camCharges: "10000", securityDeposit: "720000", startDate: d(oneYearAgo), endDate: d(twoYearsFromNow), status: "active", rentEscalationPercentage: "5", escalationFrequencyMonths: 12 },
    { id: l_techworld, propertyId, tenantId: t_techworld, unitNumber: "1-05", floor: 1, areaSqft: "1500", leaseType: "fixed_rent", baseRent: "100000", camCharges: "12000", securityDeposit: "600000", startDate: d(oneYearAgo), endDate: d(threeMonthsFromNow), status: "active", rentEscalationPercentage: "5", escalationFrequencyMonths: 12 },
  ]

  await db.insert(leases).values(allLeases)
  console.log(`✅ Leases created (${allLeases.length}) — ${allLeases.filter(l => l.leaseType === "revenue_share").length} revenue share, ${allLeases.filter(l => l.leaseType === "fixed_rent").length} fixed rent`)

  // ======== POS INTEGRATIONS (for connected rev-share tenants) ========
  const posConfigs = [
    { id: crypto.randomUUID(), tenantId: t_zara, propertyId, leaseId: l_zara, provider: "pine_labs", storeId: "PL-ZAR-GGN-012", syncFrequency: "daily", status: "connected" },
    { id: crypto.randomUUID(), tenantId: t_haldirams, propertyId, leaseId: l_haldirams, provider: "petpooja", storeId: "PP-HAL-GGN-005", syncFrequency: "daily", status: "connected" },
    { id: crypto.randomUUID(), tenantId: t_croma, propertyId, leaseId: l_croma, provider: "pine_labs", storeId: "PL-CRO-GGN-101", syncFrequency: "daily", status: "connected" },
    { id: crypto.randomUUID(), tenantId: t_pvr, propertyId, leaseId: l_pvr, provider: "razorpay_pos", storeId: "RP-PVR-GGN-301", syncFrequency: "hourly", status: "connected" },
    { id: crypto.randomUUID(), tenantId: t_lakme, propertyId, leaseId: l_lakme, provider: "square", storeId: "SQ-LAK-GGN-108", syncFrequency: "daily", status: "connected" },
    { id: crypto.randomUUID(), tenantId: t_tanishq, propertyId, leaseId: l_tanishq, provider: "shopify", storeId: "SH-TAN-GGN-020", syncFrequency: "daily", status: "connected" },
    { id: crypto.randomUUID(), tenantId: t_nike, propertyId, leaseId: l_nike, provider: "lightspeed", storeId: "LS-NIK-GGN-203", syncFrequency: "daily", status: "connected" },
    { id: crypto.randomUUID(), tenantId: t_fabindia, propertyId, leaseId: l_fabindia, provider: "vend", storeId: "VN-FAB-GGN-210", syncFrequency: "daily", status: "connected" },
  ]

  const posInsertValues = posConfigs.map((p) => ({
    id: p.id,
    tenantId: p.tenantId,
    propertyId: p.propertyId,
    leaseId: p.leaseId,
    provider: p.provider,
    storeId: p.storeId,
    apiKeyEncrypted: `enc_${p.provider}_${Math.random().toString(36).slice(2, 10)}`,
    syncFrequency: p.syncFrequency,
    status: p.status,
    lastSyncAt: new Date(),
    lastSyncStatus: "success",
    totalTransactionsSynced: Math.floor(Math.random() * 50000) + 10000,
    config: { autoSync: true },
    metadata: {},
  }))

  await db.insert(posIntegrations).values(posInsertValues)
  console.log(`✅ POS Integrations created (${posConfigs.length} connected)`)

  // ======== POS SALES DATA — 90 days of real data per connected tenant ========
  console.log("📊 Generating 90 days of POS sales data...")

  const tenantMeta = [
    { tenantId: t_zara, leaseId: l_zara, category: "fashion", seed: 42, anomaly: "none" as const },
    { tenantId: t_haldirams, leaseId: l_haldirams, category: "food_beverage", seed: 1042, anomaly: "none" as const },
    { tenantId: t_croma, leaseId: l_croma, category: "electronics", seed: 2042, anomaly: "none" as const },
    { tenantId: t_pvr, leaseId: l_pvr, category: "entertainment", seed: 3042, anomaly: "none" as const },
    { tenantId: t_lakme, leaseId: l_lakme, category: "health_beauty", seed: 4042, anomaly: "none" as const },
    { tenantId: t_tanishq, leaseId: l_tanishq, category: "jewelry", seed: 5042, anomaly: "underreport" as const },
    { tenantId: t_nike, leaseId: l_nike, category: "sports", seed: 6042, anomaly: "none" as const },
    { tenantId: t_fabindia, leaseId: l_fabindia, category: "home_lifestyle", seed: 7042, anomaly: "flat" as const },
  ]

  const posIdMap: Record<string, string> = {}
  posConfigs.forEach((p) => { posIdMap[p.tenantId] = p.id })

  const endDate = new Date()
  const startDate = new Date()
  startDate.setDate(startDate.getDate() - 90)

  let totalSalesRecords = 0

  for (const tm of tenantMeta) {
    const records = []
    const current = new Date(startDate)

    while (current <= endDate) {
      const dateStr = current.toISOString().split("T")[0]
      const sales = generateDaySales(dateStr, tm.category, tm.seed, tm.anomaly)

      records.push({
        id: crypto.randomUUID(),
        posIntegrationId: posIdMap[tm.tenantId],
        tenantId: tm.tenantId,
        propertyId,
        leaseId: tm.leaseId,
        salesDate: dateStr,
        grossSales: String(sales.grossSales),
        netSales: String(sales.netSales),
        refunds: String(sales.refunds),
        discounts: String(sales.discounts),
        transactionCount: sales.transactionCount,
        avgTransactionValue: String(sales.avgTransactionValue),
        categoryBreakdown: {},
        hourlyBreakdown: {},
        source: "pos_api",
        verified: true,
        metadata: {},
      })

      current.setDate(current.getDate() + 1)
    }

    // Insert in batches of 30 to avoid query size limits
    for (let i = 0; i < records.length; i += 30) {
      const batch = records.slice(i, i + 30)
      await db.insert(posSalesData).values(batch)
    }

    totalSalesRecords += records.length
    console.log(`   ✅ ${allTenants.find(t => t.id === tm.tenantId)?.businessName}: ${records.length} days seeded`)
  }

  console.log(`✅ POS Sales Data seeded (${totalSalesRecords} total daily records)`)

  // ======== AI AGENTS ========
  const agentIds = {
    tenantRelations: crypto.randomUUID(),
    operations: crypto.randomUUID(),
    financial: crypto.randomUUID(),
    maintenance: crypto.randomUUID(),
  }

  await db.insert(agents).values([
    {
      id: agentIds.tenantRelations,
      type: "tenant_relations",
      name: "Tenant Relations Manager",
      description: "Handles tenant communications, support requests, and relationship management",
      status: "active",
      model: "claude-sonnet-4-5-20250929",
      systemPrompt: "You are the Tenant Relations Manager AI Agent for Metro Mall.",
      capabilities: ["search_tenant_history", "get_tenant_info", "create_work_order", "send_communication"],
      config: { temperature: 0.7, maxTokens: 4096 },
    },
    {
      id: agentIds.operations,
      type: "operations_commander",
      name: "Operations Commander",
      description: "Oversees daily mall operations and identifies anomalies",
      status: "active",
      model: "claude-sonnet-4-5-20250929",
      systemPrompt: "You are the Operations Commander AI Agent for Metro Mall.",
      capabilities: ["analyze_metrics", "coordinate_teams", "detect_anomalies", "generate_reports"],
      config: { temperature: 0.5, maxTokens: 4096 },
    },
    {
      id: agentIds.financial,
      type: "financial_analyst",
      name: "Financial Analyst",
      description: "Manages financial operations and provides financial insights",
      status: "active",
      model: "claude-sonnet-4-5-20250929",
      systemPrompt: "You are the Financial Analyst AI Agent for Metro Mall.",
      capabilities: ["analyze_payments", "predict_collections", "generate_financial_reports", "send_reminders"],
      config: { temperature: 0.3, maxTokens: 4096 },
    },
    {
      id: agentIds.maintenance,
      type: "maintenance_coordinator",
      name: "Maintenance Coordinator",
      description: "Coordinates maintenance activities and predicts equipment failures",
      status: "active",
      model: "claude-sonnet-4-5-20250929",
      systemPrompt: "You are the Maintenance Coordinator AI Agent for Metro Mall.",
      capabilities: ["schedule_maintenance", "predict_failures", "assign_technicians", "track_equipment"],
      config: { temperature: 0.5, maxTokens: 4096 },
    },
  ])
  console.log("✅ AI Agents created (4)")

  // ======== WORK ORDERS ========
  await db.insert(workOrders).values([
    {
      id: crypto.randomUUID(),
      propertyId,
      tenantId: t_zara,
      workOrderNumber: "WO-2025-0847",
      type: "repair",
      category: "hvac",
      priority: "high",
      title: "AC not cooling properly in Zara store",
      description: "The air conditioning unit in Unit G-12 is not cooling effectively.",
      location: "Unit G-12, Ground Floor",
      status: "in_progress",
      createdBy: adminId,
    },
    {
      id: crypto.randomUUID(),
      propertyId,
      tenantId: t_haldirams,
      workOrderNumber: "WO-2025-0846",
      type: "repair",
      category: "plumbing",
      priority: "medium",
      title: "Water pressure issue at Haldiram's",
      description: "Low water pressure in the kitchen area affecting operations.",
      location: "Unit G-05, Ground Floor",
      status: "open",
      createdBy: managerId,
    },
    {
      id: crypto.randomUUID(),
      propertyId,
      tenantId: t_pvr,
      workOrderNumber: "WO-2025-0848",
      type: "maintenance",
      category: "electrical",
      priority: "critical",
      title: "Emergency lighting check — PVR auditorium",
      description: "Annual fire safety compliance check for emergency lighting in all 5 auditoriums.",
      location: "3rd Floor, PVR Cinemas",
      status: "open",
      createdBy: adminId,
    },
  ])
  console.log("✅ Work orders created (3)")

  // ======== INVOICES ========
  const periodStart = new Date(now.getFullYear(), now.getMonth(), 1)
  const periodEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0)

  await db.insert(invoices).values([
    // Fixed rent invoices
    {
      id: crypto.randomUUID(),
      leaseId: l_lifestyle,
      invoiceNumber: "INV-2025-001234",
      invoiceType: "rent",
      periodStart: d(periodStart),
      periodEnd: d(periodEnd),
      amount: "165000",
      gstAmount: "29700",
      totalAmount: "194700",
      dueDate: d(new Date(Date.now() + 5 * 86400000)),
      status: "pending",
    },
    {
      id: crypto.randomUUID(),
      leaseId: l_ccd,
      invoiceNumber: "INV-2025-001235",
      invoiceType: "rent",
      periodStart: d(periodStart),
      periodEnd: d(periodEnd),
      amount: "130000",
      gstAmount: "23400",
      totalAmount: "153400",
      dueDate: d(new Date(Date.now() - 5 * 86400000)),
      status: "overdue",
    },
    // Revenue share invoices (generated from POS data)
    {
      id: crypto.randomUUID(),
      leaseId: l_zara,
      invoiceNumber: "INV-2025-RS-001",
      invoiceType: "revenue_share",
      periodStart: d(periodStart),
      periodEnd: d(periodEnd),
      amount: "620000",
      gstAmount: "111600",
      totalAmount: "731600",
      dueDate: d(new Date(Date.now() + 10 * 86400000)),
      status: "pending",
      metadata: { source: "pos_calculated", posVerified: true },
    },
    {
      id: crypto.randomUUID(),
      leaseId: l_haldirams,
      invoiceNumber: "INV-2025-RS-002",
      invoiceType: "revenue_share",
      periodStart: d(periodStart),
      periodEnd: d(periodEnd),
      amount: "480000",
      gstAmount: "86400",
      totalAmount: "566400",
      dueDate: d(new Date(Date.now() + 10 * 86400000)),
      status: "paid",
      paidAmount: "566400",
      paidDate: d(new Date(Date.now() - 2 * 86400000)),
      paymentMethod: "neft",
      metadata: { source: "pos_calculated", posVerified: true },
    },
    {
      id: crypto.randomUUID(),
      leaseId: l_croma,
      invoiceNumber: "INV-2025-RS-003",
      invoiceType: "revenue_share",
      periodStart: d(periodStart),
      periodEnd: d(periodEnd),
      amount: "850000",
      gstAmount: "153000",
      totalAmount: "1003000",
      dueDate: d(new Date(Date.now() - 3 * 86400000)),
      status: "overdue",
      metadata: { source: "pos_calculated", posVerified: true },
    },
  ])
  console.log("✅ Invoices created (5 — mix of rent & revenue share)")

  // ======== DAILY METRICS ========
  const metricsDate = new Date()
  metricsDate.setHours(0, 0, 0, 0)

  await db.insert(dailyMetrics).values({
    id: crypto.randomUUID(),
    propertyId,
    metricDate: d(metricsDate),
    occupancyRate: "94.5",
    collectionRate: "87.2",
    tenantSatisfaction: "4.2",
    maintenanceTickets: 12,
    maintenanceResolved: 8,
    agentActionsTaken: 25,
    agentActionsApproved: 22,
    revenue: "4500000",
    expenses: "1200000",
    footTraffic: 12500,
    metadata: { peakHour: "18:00", topCategory: "fashion" },
  })
  console.log("✅ Daily metrics created")

  console.log("\n🎉 Database seeded successfully!")
  console.log("\n📝 Demo credentials:")
  console.log("   Email: admin@metromall.com")
  console.log("   Password: demo123456")
  console.log("\n📊 Data summary:")
  console.log("   2 properties (Gurgaon + Noida)")
  console.log("   13 tenants (10 revenue share, 3 fixed rent)")
  console.log("   8 POS integrations (connected)")
  console.log("   2 revenue share tenants not yet connected (Crossword, Bata)")
  console.log(`   ${totalSalesRecords} daily POS sales records (90 days × 8 tenants)`)
  console.log("   5 invoices (2 rent, 3 revenue share)")
  console.log("   3 work orders")
  console.log("   4 AI agents")
}

seed()
  .catch((error) => {
    console.error("❌ Seed failed:", error)
    process.exit(1)
  })
  .finally(() => {
    process.exit(0)
  })
