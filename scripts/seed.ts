import * as dotenv from "dotenv"
// Load env vars BEFORE any other imports
dotenv.config({ path: ".env.local" })

import { drizzle } from "drizzle-orm/postgres-js"
import { eq } from "drizzle-orm"
import postgres from "postgres"
import * as schema from "../src/lib/db/schema"
import bcrypt from "bcryptjs"

const {
  organizations,
  properties,
  tenants,
  leases,
  users,
  roles,
  agents,
  workOrders,
  invoices,
  dailyMetrics,
  posIntegrations,
  posSalesData,
  tenantUsers,
  tenantSessions,
  documents,
  payments,
  vendors,
  equipment,
  posReconciliation,
  notificationTemplates,
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
  await db.delete(tenantSessions)
  await db.delete(tenantUsers)
  await db.delete(documents)
  await db.delete(payments)
  await db.delete(posReconciliation)
  await db.delete(posSalesData)
  await db.delete(posIntegrations)
  await db.delete(dailyMetrics)
  await db.delete(invoices)
  await db.delete(workOrders)
  await db.delete(equipment)
  await db.delete(notificationTemplates)
  await db.delete(agents)
  await db.delete(leases)
  await db.delete(tenants)
  await db.delete(users)
  await db.delete(roles)
  await db.delete(vendors)
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

  // ======== ROLES ========
  const orgAdminRoleId = crypto.randomUUID()
  const propManagerRoleId = crypto.randomUUID()
  const financeManagerRoleId = crypto.randomUUID()

  await db.insert(roles).values([
    {
      id: orgAdminRoleId,
      name: "organization_admin",
      description: "Full access to all organization resources",
      permissions: ["*"],
    },
    {
      id: propManagerRoleId,
      name: "property_manager",
      description: "Manage properties, tenants, leases, and maintenance",
      permissions: ["properties.*", "tenants.*", "leases.*", "work_orders.*"],
    },
    {
      id: financeManagerRoleId,
      name: "finance_manager",
      description: "Manage financials, invoices, and revenue",
      permissions: ["financials.*", "invoices.*", "revenue.*"],
    },
  ])
  console.log("✅ Roles created (3)")

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
      roleId: orgAdminRoleId,
      status: "active",
    },
    {
      id: managerId,
      organizationId: orgId,
      email: "manager@metromall.com",
      name: "Priya Mehta",
      password: hashedPassword,
      roleId: propManagerRoleId,
      status: "active",
    },
    {
      id: financeId,
      organizationId: orgId,
      email: "finance@metromall.com",
      name: "Ankit Sharma",
      password: hashedPassword,
      roleId: financeManagerRoleId,
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
  const t_adidas = "b6cd81ef-a42f-4024-ac16-fb473581f3b4" // fixed UUID for demo
  const t_hm = crypto.randomUUID()
  const t_starbucks = crypto.randomUUID()

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
    { id: t_adidas, propertyId, businessName: "Adidas", legalEntityName: "Adidas India Marketing Pvt Ltd", category: "sports", contactPerson: "Karan Malhotra", email: "karan@adidas.in", phone: "+91-9876543214", gstin: "06AABCA2345N1ZN", status: "active" },
    { id: t_hm, propertyId, businessName: "H&M", legalEntityName: "H&M Hennes & Mauritz Retail Pvt Ltd", category: "fashion", contactPerson: "Sneha Reddy", email: "sneha@hm.com", phone: "+91-9876543215", gstin: "06AABCH3456O1ZO", status: "active" },
    { id: t_starbucks, propertyId, businessName: "Starbucks", legalEntityName: "Tata Starbucks Pvt Ltd", category: "food_beverage", contactPerson: "Rohit Bhandari", email: "rohit@starbucks.in", phone: "+91-9876543216", gstin: "06AABCS4567P1ZP", status: "active" },
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
  const l_adidas = crypto.randomUUID()
  const l_hm = crypto.randomUUID()
  const l_starbucks = crypto.randomUUID()
  const l_crossword = crypto.randomUUID()
  const l_bata = crypto.randomUUID()
  const l_lifestyle = crypto.randomUUID()
  const l_ccd = crypto.randomUUID()
  const l_techworld = crypto.randomUUID()

  const d = (dt: Date) => dt.toISOString().split("T")[0]

  const allLeases = [
    // ---- Revenue Share Leases (POS connected) — higher rent ↔ lower rev share ----
    { id: l_zara, propertyId, tenantId: t_zara, unitNumber: "G-12", floor: 0, areaSqft: "2200", leaseType: "revenue_share", baseRent: "175000", revenueSharePercentage: "6", camCharges: "25000", securityDeposit: "1500000", startDate: d(oneYearAgo), endDate: d(twoYearsFromNow), status: "active", rentEscalationPercentage: "5", escalationFrequencyMonths: 12 },
    { id: l_haldirams, propertyId, tenantId: t_haldirams, unitNumber: "G-05", floor: 0, areaSqft: "1500", leaseType: "revenue_share", baseRent: "65000", revenueSharePercentage: "15", camCharges: "18000", securityDeposit: "900000", startDate: d(oneYearAgo), endDate: d(twoYearsFromNow), status: "active", rentEscalationPercentage: "5", escalationFrequencyMonths: 12 },
    { id: l_croma, propertyId, tenantId: t_croma, unitNumber: "1-01", floor: 1, areaSqft: "3000", leaseType: "revenue_share", baseRent: "200000", revenueSharePercentage: "5", camCharges: "35000", securityDeposit: "2000000", startDate: d(oneYearAgo), endDate: d(twoYearsFromNow), status: "active", rentEscalationPercentage: "5", escalationFrequencyMonths: 12 },
    { id: l_pvr, propertyId, tenantId: t_pvr, unitNumber: "3-01", floor: 3, areaSqft: "8000", leaseType: "revenue_share", baseRent: "150000", revenueSharePercentage: "12", camCharges: "50000", securityDeposit: "5000000", startDate: d(oneYearAgo), endDate: d(twoYearsFromNow), status: "active", rentEscalationPercentage: "5", escalationFrequencyMonths: 12 },
    { id: l_lakme, propertyId, tenantId: t_lakme, unitNumber: "1-08", floor: 1, areaSqft: "800", leaseType: "revenue_share", baseRent: "55000", revenueSharePercentage: "18", camCharges: "12000", securityDeposit: "500000", startDate: d(oneYearAgo), endDate: d(twoYearsFromNow), status: "active", rentEscalationPercentage: "5", escalationFrequencyMonths: 12 },
    { id: l_tanishq, propertyId, tenantId: t_tanishq, unitNumber: "G-20", floor: 0, areaSqft: "1800", leaseType: "revenue_share", baseRent: "185000", revenueSharePercentage: "5", camCharges: "22000", securityDeposit: "3000000", startDate: d(oneYearAgo), endDate: d(twoYearsFromNow), status: "active", rentEscalationPercentage: "5", escalationFrequencyMonths: 12 },
    { id: l_nike, propertyId, tenantId: t_nike, unitNumber: "2-03", floor: 2, areaSqft: "1200", leaseType: "revenue_share", baseRent: "120000", revenueSharePercentage: "9", camCharges: "15000", securityDeposit: "800000", startDate: d(oneYearAgo), endDate: d(sixMonthsFromNow), status: "active", rentEscalationPercentage: "5", escalationFrequencyMonths: 12 },
    { id: l_fabindia, propertyId, tenantId: t_fabindia, unitNumber: "2-10", floor: 2, areaSqft: "1600", leaseType: "revenue_share", baseRent: "95000", revenueSharePercentage: "11", camCharges: "18000", securityDeposit: "1000000", startDate: d(oneYearAgo), endDate: d(twoYearsFromNow), status: "active", rentEscalationPercentage: "5", escalationFrequencyMonths: 12 },
    { id: l_adidas, propertyId, tenantId: t_adidas, unitNumber: "G-22", floor: 0, areaSqft: "2000", leaseType: "revenue_share", baseRent: "130000", revenueSharePercentage: "8", camCharges: "22000", securityDeposit: "1200000", startDate: d(oneYearAgo), endDate: d(twoYearsFromNow), status: "active", rentEscalationPercentage: "5", escalationFrequencyMonths: 12 },
    { id: l_hm, propertyId, tenantId: t_hm, unitNumber: "1-03", floor: 1, areaSqft: "2500", leaseType: "revenue_share", baseRent: "165000", revenueSharePercentage: "7", camCharges: "28000", securityDeposit: "1500000", startDate: d(oneYearAgo), endDate: d(twoYearsFromNow), status: "active", rentEscalationPercentage: "5", escalationFrequencyMonths: 12 },
    { id: l_starbucks, propertyId, tenantId: t_starbucks, unitNumber: "G-08", floor: 0, areaSqft: "1000", leaseType: "revenue_share", baseRent: "70000", revenueSharePercentage: "16", camCharges: "15000", securityDeposit: "800000", startDate: d(oneYearAgo), endDate: d(twoYearsFromNow), status: "active", rentEscalationPercentage: "5", escalationFrequencyMonths: 12 },
    // ---- Revenue Share — Not Connected ----
    { id: l_crossword, propertyId, tenantId: t_crossword, unitNumber: "1-15", floor: 1, areaSqft: "900", leaseType: "revenue_share", baseRent: "50000", revenueSharePercentage: "20", camCharges: "10000", securityDeposit: "400000", startDate: d(oneYearAgo), endDate: d(twoYearsFromNow), status: "active", rentEscalationPercentage: "5", escalationFrequencyMonths: 12 },
    { id: l_bata, propertyId, tenantId: t_bata, unitNumber: "G-18", floor: 0, areaSqft: "1000", leaseType: "revenue_share", baseRent: "60000", revenueSharePercentage: "14", camCharges: "12000", securityDeposit: "600000", startDate: d(oneYearAgo), endDate: d(twoYearsFromNow), status: "active", rentEscalationPercentage: "5", escalationFrequencyMonths: 12 },
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
    { id: crypto.randomUUID(), tenantId: t_adidas, propertyId, leaseId: l_adidas, provider: "pine_labs", storeId: "PL-ADI-GGN-022", syncFrequency: "daily", status: "connected" },
    { id: crypto.randomUUID(), tenantId: t_hm, propertyId, leaseId: l_hm, provider: "shopify", storeId: "SH-HM-GGN-103", syncFrequency: "daily", status: "connected" },
    { id: crypto.randomUUID(), tenantId: t_starbucks, propertyId, leaseId: l_starbucks, provider: "petpooja", storeId: "PP-SBX-GGN-008", syncFrequency: "hourly", status: "connected" },
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
    { tenantId: t_adidas, leaseId: l_adidas, category: "sports", seed: 8042, anomaly: "none" as const },
    { tenantId: t_hm, leaseId: l_hm, category: "fashion", seed: 9042, anomaly: "none" as const },
    { tenantId: t_starbucks, leaseId: l_starbucks, category: "food_beverage", seed: 10042, anomaly: "none" as const },
  ]

  const posIdMap: Record<string, string> = {}
  posConfigs.forEach((p) => { posIdMap[p.tenantId] = p.id })

  const endDate = new Date()
  const startDate = new Date()
  startDate.setDate(startDate.getDate() - 90)

  let totalSalesRecords = 0

  // Track monthly POS gross totals per tenant for reconciliation
  const monthlyPosTotals: Record<string, Record<string, number>> = {}

  for (const tm of tenantMeta) {
    const records = []
    const current = new Date(startDate)
    monthlyPosTotals[tm.tenantId] = {}

    while (current <= endDate) {
      const dateStr = current.toISOString().split("T")[0]
      const sales = generateDaySales(dateStr, tm.category, tm.seed, tm.anomaly)

      const ymKey = dateStr.slice(0, 7) // YYYY-MM
      monthlyPosTotals[tm.tenantId][ymKey] = (monthlyPosTotals[tm.tenantId][ymKey] || 0) + sales.grossSales

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

  // ======== POS RECONCILIATION ========
  // For each connected tenant, build monthly reconciliation rows comparing
  // POS gross totals vs. the invoiced revenue-share for that month.
  const leaseIdByTenant: Record<string, string> = {}
  allLeases.forEach((l) => { leaseIdByTenant[l.tenantId] = l.id })
  const revSharePctByTenant: Record<string, number> = {}
  allLeases.forEach((l) => {
    if (l.revenueSharePercentage) revSharePctByTenant[l.tenantId] = parseFloat(l.revenueSharePercentage)
  })

  const reconRows: typeof posReconciliation.$inferInsert[] = []
  for (const tm of tenantMeta) {
    const monthTotals = monthlyPosTotals[tm.tenantId] || {}
    const months = Object.keys(monthTotals).sort() // ascending
    // Reconcile the last 3 full months we have data for (skip the current, likely partial)
    const eligible = months.slice(-4, -1)

    for (const ym of eligible) {
      const [yy, mm] = ym.split("-").map(Number)
      const periodStart = `${ym}-01`
      const daysInMonth = new Date(yy, mm, 0).getDate()
      const periodEnd = `${ym}-${String(daysInMonth).padStart(2, "0")}`

      const posTotal = monthTotals[ym]
      const sharePct = revSharePctByTenant[tm.tenantId] || 0
      const expected = Math.round(posTotal * (sharePct / 100) * 100) / 100

      // Simulate an invoice total that roughly matches expected, with small tolerance
      // and larger variance for "underreport"/"flat" anomaly tenants.
      let invoiceTotal: number
      let status: "matched" | "flagged" | "resolved" | "pending"

      if (tm.anomaly === "underreport") {
        // Tenant under-reported POS → invoice much lower than what POS now shows
        invoiceTotal = Math.round(expected * (0.55 + seededRandom(tm.seed + yy + mm) * 0.1) * 100) / 100
        status = "flagged"
      } else if (tm.anomaly === "flat") {
        invoiceTotal = Math.round(expected * (0.85 + seededRandom(tm.seed + yy + mm) * 0.05) * 100) / 100
        status = "flagged"
      } else {
        // Small natural drift ±1.5%
        const drift = 0.985 + seededRandom(tm.seed + yy + mm) * 0.03
        invoiceTotal = Math.round(expected * drift * 100) / 100
        const variancePct = Math.abs(invoiceTotal - expected) / Math.max(expected, 1)
        status = variancePct < 0.01 ? "matched" : variancePct < 0.02 ? "resolved" : "flagged"
      }

      const variance = Math.round((posTotal - (invoiceTotal / (sharePct / 100 || 1))) * 100) / 100

      reconRows.push({
        tenantId: tm.tenantId,
        leaseId: leaseIdByTenant[tm.tenantId],
        organizationId: orgId,
        periodStart,
        periodEnd,
        posTotal: String(Math.round(posTotal * 100) / 100),
        invoiceTotal: String(invoiceTotal),
        variance: String(variance),
        status,
      })
    }
  }

  if (reconRows.length > 0) {
    await db.insert(posReconciliation).values(reconRows)
  }
  console.log(`✅ POS Reconciliation created (${reconRows.length} monthly rows across ${tenantMeta.length} tenants)`)

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

  // ======== VENDORS ========
  const v_hvac     = crypto.randomUUID()
  const v_elec     = crypto.randomUUID()
  const v_plumb    = crypto.randomUUID()
  const v_clean    = crypto.randomUUID()
  const v_security = crypto.randomUUID()
  const v_it       = crypto.randomUUID()

  await db.insert(vendors).values([
    {
      id: v_hvac,
      name: "ArcticCool HVAC Services",
      type: "hvac",
      contactPerson: "Suresh Nair",
      email: "ops@arcticcool.in",
      phone: "+91-98100-11001",
      address: "Plot 12, Industrial Area Phase 1, Gurgaon",
      gstin: "06AABCA1234B1Z5",
      pan: "AABCA1234B",
      rating: "4.5",
      performanceScore: "0.88",
      totalJobs: 0,
      completedJobs: 0,
      cancelledJobs: 0,
      status: "active",
      metadata: {
        contractExpiry: new Date(Date.now() + 365 * 86400000).toISOString().slice(0, 10),
      },
    },
    {
      id: v_elec,
      name: "PowerGrid Electricals",
      type: "electrical",
      contactPerson: "Ramesh Kumar",
      email: "service@powergrid.co.in",
      phone: "+91-98200-22002",
      address: "Sector 44, Gurgaon",
      gstin: "06BBBPG5678C1Z3",
      pan: "BBBPG5678C",
      rating: "4.7",
      performanceScore: "0.92",
      totalJobs: 0,
      completedJobs: 0,
      cancelledJobs: 0,
      status: "active",
      metadata: {
        contractExpiry: new Date(Date.now() + 180 * 86400000).toISOString().slice(0, 10),
      },
    },
    {
      id: v_plumb,
      name: "FlowMaster Plumbing",
      type: "plumbing",
      contactPerson: "Ajay Singh",
      email: "contact@flowmaster.in",
      phone: "+91-98300-33003",
      address: "Sector 10, Gurgaon",
      gstin: "06CCCFM9012D1Z1",
      pan: "CCCFM9012D",
      rating: "4.3",
      performanceScore: "0.81",
      totalJobs: 0,
      completedJobs: 0,
      cancelledJobs: 0,
      status: "active",
      metadata: {
        contractExpiry: new Date(Date.now() + 270 * 86400000).toISOString().slice(0, 10),
      },
    },
    {
      id: v_clean,
      name: "SparkShine Facility Services",
      type: "cleaning",
      contactPerson: "Meena Devi",
      email: "admin@sparkshine.in",
      phone: "+91-98400-44004",
      address: "DLF Phase 2, Gurgaon",
      gstin: "06DDDSS3456E1Z9",
      pan: "DDDSS3456E",
      rating: "4.6",
      performanceScore: "0.90",
      totalJobs: 0,
      completedJobs: 0,
      cancelledJobs: 0,
      status: "active",
      metadata: {
        contractExpiry: new Date(Date.now() + 365 * 86400000).toISOString().slice(0, 10),
      },
    },
    {
      id: v_security,
      name: "Guardian Security Systems",
      type: "security",
      contactPerson: "Col. Vikram Sharma (Retd.)",
      email: "ops@guardiansecurity.in",
      phone: "+91-98500-55005",
      address: "Cyber City, Gurgaon",
      gstin: "06EEEGSS7890F1Z7",
      pan: "EEEGSS7890F",
      rating: "4.8",
      performanceScore: "0.95",
      totalJobs: 0,
      completedJobs: 0,
      cancelledJobs: 0,
      status: "active",
      metadata: {
        contractExpiry: new Date(Date.now() + 400 * 86400000).toISOString().slice(0, 10),
      },
    },
    {
      id: v_it,
      name: "TechNest IT Infrastructure",
      type: "it_services",
      contactPerson: "Priya Kapoor",
      email: "support@technest.io",
      phone: "+91-98600-66006",
      address: "Unitech Trade Centre, Gurgaon",
      gstin: "06FFFTN1234G1Z5",
      pan: "FFFTN1234G",
      rating: "4.4",
      performanceScore: "0.85",
      totalJobs: 0,
      completedJobs: 0,
      cancelledJobs: 0,
      status: "active",
      metadata: {
        contractExpiry: new Date(Date.now() + 200 * 86400000).toISOString().slice(0, 10),
      },
    },
  ])
  console.log("✅ Vendors created (6)")

  // ======== EQUIPMENT ========
  const eq_hvac_g12      = crypto.randomUUID()
  const eq_hvac_common   = crypto.randomUUID()
  const eq_elevator_main = crypto.randomUUID()
  const eq_elevator_svc  = crypto.randomUUID()
  const eq_escalator_e1  = crypto.randomUUID()
  const eq_escalator_e2  = crypto.randomUUID()
  const eq_dg_genset     = crypto.randomUUID()
  const eq_fire_panel    = crypto.randomUUID()
  const eq_chiller       = crypto.randomUUID()
  const eq_cctv_nvr      = crypto.randomUUID()

  const today = new Date()
  const daysFromNow = (n: number) => new Date(today.getTime() + n * 86400000).toISOString().slice(0, 10)
  const daysAgo = (n: number) => new Date(today.getTime() - n * 86400000).toISOString().slice(0, 10)

  await db.insert(equipment).values([
    {
      id: eq_hvac_g12,
      propertyId,
      name: "HVAC Unit — Ground Floor G-12 (Zara)",
      type: "hvac",
      make: "Daikin",
      model: "FXFQ100AVEB",
      serialNumber: "DK-2022-08-441",
      location: "Unit G-12 ceiling void",
      installationDate: "2022-03-15",
      warrantyExpiry: "2027-03-15",
      maintenanceFrequencyDays: 90,
      lastMaintenanceDate: daysAgo(104),
      nextMaintenanceDate: daysAgo(14),
      predictedFailureDate: daysFromNow(120),
      predictionConfidence: "0.72",
      healthScore: "0.68",
      status: "maintenance",
      specifications: { capacityTR: 10, refrigerant: "R-410A", powerKW: 11.2 },
      maintenanceHistory: [
        { date: daysAgo(104), type: "filter_replacement", vendorId: v_hvac, notes: "Filters replaced; coil cleaned." },
        { date: daysAgo(195), type: "quarterly_service", vendorId: v_hvac, notes: "Routine service OK." },
      ],
    },
    {
      id: eq_hvac_common,
      propertyId,
      name: "HVAC Rooftop Package Unit — Common Areas",
      type: "hvac",
      make: "Voltas",
      model: "PAC-25TR-INV",
      serialNumber: "VLT-2021-11-118",
      location: "Rooftop, Tower A",
      installationDate: "2021-10-02",
      warrantyExpiry: "2026-10-02",
      maintenanceFrequencyDays: 90,
      lastMaintenanceDate: daysAgo(3),
      nextMaintenanceDate: daysFromNow(87),
      healthScore: "0.91",
      status: "operational",
      specifications: { capacityTR: 25, refrigerant: "R-32", zone: "common_corridors" },
      maintenanceHistory: [
        { date: daysAgo(3), type: "quarterly_service", vendorId: v_hvac, notes: "All 24 filters replaced, performance nominal." },
      ],
    },
    {
      id: eq_chiller,
      propertyId,
      name: "Central Water Chiller Plant #1",
      type: "hvac",
      make: "Carrier",
      model: "30XA-452",
      serialNumber: "CR-2020-05-207",
      location: "Basement B2 plant room",
      installationDate: "2020-05-10",
      warrantyExpiry: "2025-05-10",
      maintenanceFrequencyDays: 60,
      lastMaintenanceDate: daysAgo(55),
      nextMaintenanceDate: daysFromNow(5),
      predictedFailureDate: daysFromNow(45),
      predictionConfidence: "0.64",
      healthScore: "0.74",
      status: "operational",
      specifications: { capacityTR: 450, refrigerant: "R-134a", cop: 6.1 },
    },
    {
      id: eq_elevator_main,
      propertyId,
      name: "Passenger Elevator — Atrium Bank A",
      type: "elevator",
      make: "Otis",
      model: "Gen2-Premier",
      serialNumber: "OT-2020-01-0045",
      location: "Atrium, Tower A",
      installationDate: "2020-01-20",
      warrantyExpiry: "2025-01-20",
      maintenanceFrequencyDays: 30,
      lastMaintenanceDate: daysAgo(25),
      nextMaintenanceDate: daysFromNow(5),
      healthScore: "0.88",
      status: "operational",
      specifications: { capacityKg: 1600, persons: 21, floors: 5, speedMps: 2.5 },
    },
    {
      id: eq_elevator_svc,
      propertyId,
      name: "Service Elevator — Loading Dock",
      type: "elevator",
      make: "Schindler",
      model: "5500",
      serialNumber: "SC-2020-03-0119",
      location: "Service core, Basement B1 to Floor 3",
      installationDate: "2020-03-14",
      warrantyExpiry: "2025-03-14",
      maintenanceFrequencyDays: 30,
      lastMaintenanceDate: daysAgo(48),
      nextMaintenanceDate: daysAgo(18),
      predictedFailureDate: daysFromNow(60),
      predictionConfidence: "0.81",
      healthScore: "0.52",
      status: "maintenance",
      specifications: { capacityKg: 2500, speedMps: 1.6, type: "service" },
      maintenanceHistory: [
        { date: daysAgo(48), type: "monthly_service", vendorId: v_elec, notes: "Brake pads showing wear; flagged for follow-up." },
      ],
    },
    {
      id: eq_escalator_e1,
      propertyId,
      name: "Escalator E1 — Ground to First",
      type: "escalator",
      make: "KONE",
      model: "TravelMaster 110",
      serialNumber: "KN-2020-02-0071",
      location: "Atrium G→1",
      installationDate: "2020-02-18",
      warrantyExpiry: "2025-02-18",
      maintenanceFrequencyDays: 45,
      lastMaintenanceDate: daysAgo(40),
      nextMaintenanceDate: daysFromNow(5),
      healthScore: "0.86",
      status: "operational",
      specifications: { riseM: 4.5, speedMps: 0.5, widthMm: 1000 },
    },
    {
      id: eq_escalator_e2,
      propertyId,
      name: "Escalator E2 — First to Second",
      type: "escalator",
      make: "KONE",
      model: "TravelMaster 110",
      serialNumber: "KN-2020-02-0072",
      location: "Atrium 1→2",
      installationDate: "2020-02-18",
      warrantyExpiry: "2025-02-18",
      maintenanceFrequencyDays: 45,
      lastMaintenanceDate: daysAgo(80),
      nextMaintenanceDate: daysAgo(35),
      predictedFailureDate: daysFromNow(30),
      predictionConfidence: "0.89",
      healthScore: "0.41",
      status: "failed",
      specifications: { riseM: 4.5, speedMps: 0.5, widthMm: 1000 },
      maintenanceHistory: [
        { date: daysAgo(80), type: "quarterly_service", vendorId: v_elec, notes: "Step chain tension out of spec." },
      ],
    },
    {
      id: eq_dg_genset,
      propertyId,
      name: "Diesel Generator — 750 kVA Primary",
      type: "generator",
      make: "Cummins",
      model: "C750D5",
      serialNumber: "CM-2019-09-501",
      location: "Utility yard, East wing",
      installationDate: "2019-09-05",
      warrantyExpiry: "2024-09-05",
      maintenanceFrequencyDays: 30,
      lastMaintenanceDate: daysAgo(12),
      nextMaintenanceDate: daysFromNow(18),
      healthScore: "0.82",
      status: "operational",
      specifications: { kva: 750, fuel: "diesel", runtimeHours: 1182 },
    },
    {
      id: eq_fire_panel,
      propertyId,
      name: "Fire Alarm Control Panel — Main",
      type: "fire_system",
      make: "Honeywell",
      model: "NOTIFIER NFS2-3030",
      serialNumber: "HW-2020-06-301",
      location: "Security control room, Ground floor",
      installationDate: "2020-06-10",
      warrantyExpiry: "2025-06-10",
      maintenanceFrequencyDays: 180,
      lastMaintenanceDate: daysAgo(170),
      nextMaintenanceDate: daysFromNow(10),
      healthScore: "0.95",
      status: "operational",
      specifications: { loops: 10, devices: 320, backupBatteryAh: 55 },
    },
    {
      id: eq_cctv_nvr,
      propertyId,
      name: "CCTV NVR — Central Recording Cluster",
      type: "security_system",
      make: "Hikvision",
      model: "DS-96256NI-I24",
      serialNumber: "HK-2021-07-802",
      location: "Security control room, Ground floor",
      installationDate: "2021-07-22",
      warrantyExpiry: "2026-07-22",
      maintenanceFrequencyDays: 90,
      lastMaintenanceDate: daysAgo(60),
      nextMaintenanceDate: daysFromNow(30),
      healthScore: "0.90",
      status: "operational",
      specifications: { channels: 256, storageTB: 144, raid: "RAID6" },
    },
  ])
  console.log("✅ Equipment created (10)")

  // ======== WORK ORDERS ========
  await db.insert(workOrders).values([
    {
      id: crypto.randomUUID(),
      propertyId,
      tenantId: t_zara,
      equipmentId: eq_hvac_g12,
      assignedTo: v_hvac,
      assignedAt: new Date(Date.now() - 2 * 86400000),
      workOrderNumber: "WO-2025-0847",
      type: "repair",
      category: "hvac",
      priority: "high",
      title: "AC not cooling properly in Zara store",
      description: "The air conditioning unit in Unit G-12 is not cooling effectively. Temperature is 28°C during peak hours.",
      location: "Unit G-12, Ground Floor",
      status: "in_progress",
      createdBy: adminId,
    },
    {
      id: crypto.randomUUID(),
      propertyId,
      tenantId: t_haldirams,
      assignedTo: v_plumb,
      assignedAt: new Date(Date.now() - 1 * 86400000),
      workOrderNumber: "WO-2025-0846",
      type: "repair",
      category: "plumbing",
      priority: "medium",
      title: "Water pressure issue at Haldiram's",
      description: "Low water pressure in the kitchen area affecting operations. Dishwasher not working properly.",
      location: "Unit G-05, Ground Floor",
      status: "assigned",
      createdBy: managerId,
    },
    {
      id: crypto.randomUUID(),
      propertyId,
      tenantId: t_pvr,
      assignedTo: v_elec,
      assignedAt: new Date(Date.now() - 12 * 3600000),
      workOrderNumber: "WO-2025-0848",
      type: "maintenance",
      category: "electrical",
      priority: "critical",
      title: "Emergency lighting check — PVR auditorium",
      description: "Annual fire safety compliance check for emergency lighting in all 5 auditoriums. Regulatory deadline in 7 days.",
      location: "3rd Floor, PVR Cinemas",
      status: "in_progress",
      createdBy: adminId,
    },
    {
      id: crypto.randomUUID(),
      propertyId,
      assignedTo: v_clean,
      assignedAt: new Date(),
      workOrderNumber: "WO-2025-0849",
      type: "maintenance",
      category: "cleaning",
      priority: "low",
      title: "Deep cleaning — food court area",
      description: "Monthly deep cleaning of the food court seating area, drainage channels, and exhaust vents.",
      location: "Food Court, Ground Floor",
      status: "open",
      createdBy: managerId,
    },
    {
      id: crypto.randomUUID(),
      propertyId,
      tenantId: t_croma,
      assignedTo: v_it,
      assignedAt: new Date(Date.now() - 3 * 86400000),
      workOrderNumber: "WO-2025-0850",
      type: "installation",
      category: "it_infrastructure",
      priority: "medium",
      title: "Network switch upgrade — Croma Electronics",
      description: "Replace 2x aging 100Mbps network switches with new 1Gbps units to support POS system expansion.",
      location: "Unit F-08, First Floor",
      status: "completed",
      completedAt: new Date(Date.now() - 1 * 86400000),
      createdBy: adminId,
    },
    {
      id: crypto.randomUUID(),
      propertyId,
      assignedTo: v_security,
      assignedAt: new Date(Date.now() - 5 * 86400000),
      workOrderNumber: "WO-2025-0851",
      type: "inspection",
      category: "security",
      priority: "high",
      title: "CCTV camera replacement — parking level B1",
      description: "4 CCTV cameras on parking level B1 are offline. Replace with new IP cameras and integrate into central NVR.",
      location: "Parking Level B1",
      status: "completed",
      completedAt: new Date(Date.now() - 2 * 86400000),
      createdBy: managerId,
    },
    {
      id: crypto.randomUUID(),
      propertyId,
      tenantId: t_haldirams,
      workOrderNumber: "WO-2025-0852",
      type: "repair",
      category: "electrical",
      priority: "high",
      title: "Display signage board flickering — Haldiram's entrance",
      description: "The LED signage board at the Haldiram's entrance is flickering intermittently. Customers have complained.",
      location: "Unit G-05, Ground Floor Entrance",
      status: "open",
      createdBy: adminId,
    },
    {
      id: crypto.randomUUID(),
      propertyId,
      equipmentId: eq_hvac_common,
      assignedTo: v_hvac,
      assignedAt: new Date(Date.now() - 7 * 86400000),
      workOrderNumber: "WO-2025-0853",
      type: "maintenance",
      category: "hvac",
      priority: "medium",
      title: "Quarterly HVAC filter replacement — common areas",
      description: "Replace air filters in all 24 HVAC units across common areas, corridors, and restrooms.",
      location: "All Common Areas",
      status: "resolved",
      completedAt: new Date(Date.now() - 3 * 86400000),
      resolutionNotes: "All 24 HVAC filters replaced. System performance improved. Next service due in 3 months.",
      createdBy: managerId,
    },
    {
      id: crypto.randomUUID(),
      propertyId,
      equipmentId: eq_escalator_e2,
      assignedTo: v_elec,
      assignedAt: new Date(Date.now() - 1 * 86400000),
      workOrderNumber: "WO-2025-0854",
      type: "repair",
      category: "mechanical",
      priority: "critical",
      title: "Escalator E2 step-chain failure — atrium 1→2",
      description: "Predictive agent flagged step-chain tension out of spec; escalator now reporting fault. Isolate, replace chain, recalibrate drive.",
      location: "Atrium, First Floor Landing",
      status: "in_progress",
      predictive: true,
      autoCreated: true,
      estimatedCost: "185000",
      estimatedDurationHours: 12,
      createdBy: adminId,
    },
    {
      id: crypto.randomUUID(),
      propertyId,
      equipmentId: eq_elevator_svc,
      assignedTo: v_elec,
      assignedAt: new Date(Date.now() - 4 * 3600000),
      workOrderNumber: "WO-2025-0855",
      type: "maintenance",
      category: "mechanical",
      priority: "high",
      title: "Service elevator brake-pad replacement — predictive",
      description: "Health score dropped to 0.52 with 81% predicted failure in 60 days. Replace brake pads and test overload trip before condition worsens.",
      location: "Service core, Basement B1",
      status: "assigned",
      predictive: true,
      autoCreated: true,
      estimatedCost: "42000",
      estimatedDurationHours: 4,
      createdBy: adminId,
    },
  ])
  console.log("✅ Work orders created (10)")

  // ======== NOTIFICATION TEMPLATES ========
  await db.insert(notificationTemplates).values([
    {
      id: crypto.randomUUID(),
      organizationId: orgId,
      name: "Invoice Created – Email",
      channel: "email",
      eventType: "invoice_created",
      subject: "Invoice {{invoice_number}} Generated – ₹{{invoice_amount}}",
      body: `<div style="font-family:sans-serif;max-width:600px;margin:0 auto;padding:24px">
  <h2 style="color:#1a1a2e;border-bottom:2px solid #e5e7eb;padding-bottom:12px">New Invoice Generated</h2>
  <p>Dear {{tenant_name}},</p>
  <p>A new invoice has been generated for your tenancy at <strong>{{property_name}}</strong>.</p>
  <table style="width:100%;border-collapse:collapse;margin:16px 0;background:#f9fafb;border-radius:8px">
    <tr><td style="padding:12px 16px;font-weight:600">Invoice Number</td><td style="padding:12px 16px">{{invoice_number}}</td></tr>
    <tr><td style="padding:12px 16px;font-weight:600;background:#f3f4f6">Amount Due</td><td style="padding:12px 16px;background:#f3f4f6;font-size:18px;font-weight:bold;color:#059669">₹{{invoice_amount}}</td></tr>
    <tr><td style="padding:12px 16px;font-weight:600">Due Date</td><td style="padding:12px 16px">{{due_date}}</td></tr>
  </table>
  <p>Please log in to the tenant portal to view your invoice and make payment.</p>
  <p style="color:#6b7280;font-size:13px;margin-top:32px">This is an automated notification from MallOS. Please do not reply to this email.</p>
</div>`,
      isActive: true,
      createdBy: adminId,
    },
    {
      id: crypto.randomUUID(),
      organizationId: orgId,
      name: "Payment Reminder – Email",
      channel: "email",
      eventType: "payment_due",
      subject: "Payment Reminder: Invoice {{invoice_number}} due on {{due_date}}",
      body: `<div style="font-family:sans-serif;max-width:600px;margin:0 auto;padding:24px">
  <h2 style="color:#dc2626;border-bottom:2px solid #fee2e2;padding-bottom:12px">⚠ Payment Reminder</h2>
  <p>Dear {{tenant_name}},</p>
  <p>This is a reminder that your invoice is due soon. Please make payment to avoid any late charges.</p>
  <table style="width:100%;border-collapse:collapse;margin:16px 0;background:#fef2f2;border-radius:8px">
    <tr><td style="padding:12px 16px;font-weight:600">Invoice Number</td><td style="padding:12px 16px">{{invoice_number}}</td></tr>
    <tr><td style="padding:12px 16px;font-weight:600;background:#fee2e2">Amount Due</td><td style="padding:12px 16px;background:#fee2e2;font-size:18px;font-weight:bold;color:#dc2626">₹{{invoice_amount}}</td></tr>
    <tr><td style="padding:12px 16px;font-weight:600">Due Date</td><td style="padding:12px 16px;color:#dc2626;font-weight:bold">{{due_date}}</td></tr>
  </table>
  <p>Log in to the tenant portal to make payment. If you have already paid, please disregard this notice.</p>
  <p style="color:#6b7280;font-size:13px;margin-top:32px">MallOS — Metro Properties Group</p>
</div>`,
      isActive: true,
      createdBy: adminId,
    },
    {
      id: crypto.randomUUID(),
      organizationId: orgId,
      name: "Lease Expiry Notice – Email",
      channel: "email",
      eventType: "lease_expiry",
      subject: "Important: Your Lease Expires in {{days_remaining}} Days",
      body: `<div style="font-family:sans-serif;max-width:600px;margin:0 auto;padding:24px">
  <h2 style="color:#d97706;border-bottom:2px solid #fef3c7;padding-bottom:12px">Lease Expiry Notice</h2>
  <p>Dear {{tenant_name}},</p>
  <p>This is to inform you that your lease agreement for <strong>{{property_name}}</strong> will expire in <strong>{{days_remaining}} days</strong>.</p>
  <table style="width:100%;border-collapse:collapse;margin:16px 0;background:#fffbeb;border-radius:8px">
    <tr><td style="padding:12px 16px;font-weight:600">Property</td><td style="padding:12px 16px">{{property_name}}</td></tr>
    <tr><td style="padding:12px 16px;font-weight:600;background:#fef3c7">Lease Expiry Date</td><td style="padding:12px 16px;background:#fef3c7;font-weight:bold;color:#d97706">{{expiry_date}}</td></tr>
    <tr><td style="padding:12px 16px;font-weight:600">Days Remaining</td><td style="padding:12px 16px">{{days_remaining}}</td></tr>
  </table>
  <p>Please contact your property manager to discuss renewal options before the expiry date.</p>
  <p style="color:#6b7280;font-size:13px;margin-top:32px">MallOS — Metro Properties Group</p>
</div>`,
      isActive: true,
      createdBy: adminId,
    },
    {
      id: crypto.randomUUID(),
      organizationId: orgId,
      name: "Work Order Update – Email",
      channel: "email",
      eventType: "work_order_update",
      subject: "Work Order {{work_order_number}} Update: {{work_order_status}}",
      body: `<div style="font-family:sans-serif;max-width:600px;margin:0 auto;padding:24px">
  <h2 style="color:#1a1a2e;border-bottom:2px solid #e5e7eb;padding-bottom:12px">Work Order Update</h2>
  <p>Dear {{tenant_name}},</p>
  <p>We have an update on your maintenance request:</p>
  <table style="width:100%;border-collapse:collapse;margin:16px 0;background:#f9fafb;border-radius:8px">
    <tr><td style="padding:12px 16px;font-weight:600">Work Order</td><td style="padding:12px 16px">{{work_order_number}}</td></tr>
    <tr><td style="padding:12px 16px;font-weight:600;background:#f3f4f6">Title</td><td style="padding:12px 16px;background:#f3f4f6">{{work_order_title}}</td></tr>
    <tr><td style="padding:12px 16px;font-weight:600">Status</td><td style="padding:12px 16px;text-transform:capitalize;font-weight:bold;color:#059669">{{work_order_status}}</td></tr>
    <tr><td style="padding:12px 16px;font-weight:600;background:#f3f4f6">Update</td><td style="padding:12px 16px;background:#f3f4f6">{{update_message}}</td></tr>
  </table>
  <p>Log in to the tenant portal to view full details.</p>
  <p style="color:#6b7280;font-size:13px;margin-top:32px">MallOS — Metro Properties Group</p>
</div>`,
      isActive: true,
      createdBy: adminId,
    },
    {
      id: crypto.randomUUID(),
      organizationId: orgId,
      name: "CAM Charge Generated – Email",
      channel: "email",
      eventType: "cam_generated",
      subject: "CAM Charges Generated for {{period}}",
      body: `<div style="font-family:sans-serif;max-width:600px;margin:0 auto;padding:24px">
  <h2 style="color:#1a1a2e;border-bottom:2px solid #e5e7eb;padding-bottom:12px">CAM Charges Statement</h2>
  <p>Dear {{tenant_name}},</p>
  <p>Common Area Maintenance (CAM) charges have been calculated for the period <strong>{{period}}</strong>.</p>
  <table style="width:100%;border-collapse:collapse;margin:16px 0;background:#f9fafb;border-radius:8px">
    <tr><td style="padding:12px 16px;font-weight:600">Period</td><td style="padding:12px 16px">{{period}}</td></tr>
    <tr><td style="padding:12px 16px;font-weight:600;background:#f3f4f6">CAM Amount</td><td style="padding:12px 16px;background:#f3f4f6;font-size:18px;font-weight:bold;color:#059669">₹{{cam_amount}}</td></tr>
    <tr><td style="padding:12px 16px;font-weight:600">Your Area Share</td><td style="padding:12px 16px">{{area_share}}%</td></tr>
  </table>
  <p>The detailed breakdown is available in the tenant portal.</p>
  <p style="color:#6b7280;font-size:13px;margin-top:32px">MallOS — Metro Properties Group</p>
</div>`,
      isActive: true,
      createdBy: adminId,
    },
  ])
  console.log("✅ Notification templates created (5 email templates)")

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

  // ======== PAYMENTS — for invoices that are paid ========
  const paidInvoiceRows = await db
    .select({ id: invoices.id, leaseId: invoices.leaseId, totalAmount: invoices.totalAmount, paidDate: invoices.paidDate })
    .from(invoices)
    .where(eq(invoices.status, "paid"))

  const paymentValues = paidInvoiceRows.map((inv) => ({
    id: crypto.randomUUID(),
    invoiceId: inv.id,
    amount: inv.totalAmount,
    paymentDate: inv.paidDate ?? d(new Date(Date.now() - 2 * 86400000)),
    paymentMethod: "neft",
    referenceNumber: `NEFT-${Date.now()}-${Math.random().toString(36).slice(2, 8).toUpperCase()}`,
    bankName: "HDFC Bank",
    reconciled: true,
    reconciledAt: new Date(),
    notes: "Auto-reconciled",
    metadata: {},
  }))

  if (paymentValues.length > 0) {
    await db.insert(payments).values(paymentValues)
  }
  console.log(`✅ Payments created (${paymentValues.length})`)

  // ======== DOCUMENTS — sample docs for demo tenant (Zara) ========
  const docValues = [
    {
      id: crypto.randomUUID(),
      tenantId: t_zara,
      propertyId,
      leaseId: l_zara,
      name: "Lease Agreement — Zara Fashion (G-12)",
      type: "lease_agreement",
      category: "legal",
      fileSize: 245000,
      mimeType: "application/pdf",
      fileUrl: "/documents/lease-agreement-zara-g12.pdf",
      metadata: {},
    },
    {
      id: crypto.randomUUID(),
      tenantId: t_zara,
      propertyId,
      name: "Fire Safety Certificate 2025",
      type: "certificate",
      category: "compliance",
      fileSize: 120000,
      mimeType: "application/pdf",
      fileUrl: "/documents/fire-safety-cert-2025.pdf",
      metadata: {},
    },
    {
      id: crypto.randomUUID(),
      tenantId: t_zara,
      propertyId,
      name: "Insurance Policy — Public Liability",
      type: "insurance",
      category: "insurance",
      fileSize: 380000,
      mimeType: "application/pdf",
      fileUrl: "/documents/insurance-public-liability-zara.pdf",
      metadata: {},
    },
    {
      id: crypto.randomUUID(),
      tenantId: t_zara,
      propertyId,
      name: "GST Registration Certificate",
      type: "certificate",
      category: "tax",
      fileSize: 95000,
      mimeType: "application/pdf",
      fileUrl: "/documents/gst-registration-zara.pdf",
      metadata: {},
    },
    {
      id: crypto.randomUUID(),
      tenantId: t_zara,
      propertyId,
      name: "Shop & Establishment License",
      type: "license",
      category: "legal",
      fileSize: 110000,
      mimeType: "application/pdf",
      fileUrl: "/documents/shop-establishment-license-zara.pdf",
      metadata: {},
    },
  ]

  await db.insert(documents).values(docValues)
  console.log(`✅ Documents created (${docValues.length} for Zara)`)

  // ======== TENANT PORTAL DEMO USER — Zara Fashion ========
  const tenantHashedPassword = await bcrypt.hash("tenant123456", 10)

  const demoTenantUserId = crypto.randomUUID()
  await db.insert(tenantUsers).values([
    {
      id: demoTenantUserId,
      tenantId: t_zara,
      email: "demo@zara.in",
      passwordHash: tenantHashedPassword,
      name: "Deepak Verma",
      isActive: true,
    },
    {
      id: crypto.randomUUID(),
      tenantId: t_haldirams,
      email: "demo@haldirams.com",
      passwordHash: tenantHashedPassword,
      name: "Rakesh Agarwal",
      isActive: true,
    },
    {
      id: crypto.randomUUID(),
      tenantId: t_croma,
      email: "demo@croma.com",
      passwordHash: tenantHashedPassword,
      name: "Sunil Kumar",
      isActive: true,
    },
  ])
  console.log("✅ Tenant portal users created (3 demo accounts)")

  console.log("\n🎉 Database seeded successfully!")
  console.log("\n📝 Demo credentials:")
  console.log("   ┌─────────────────────────────────────────────────────────┐")
  console.log("   │  ADMIN PORTAL (/)                                      │")
  console.log("   │  Email:    admin@metromall.com                         │")
  console.log("   │  Password: demo123456                                  │")
  console.log("   ├─────────────────────────────────────────────────────────┤")
  console.log("   │  TENANT PORTAL (/tenant/login)                         │")
  console.log("   │                                                        │")
  console.log("   │  Zara Fashion (recommended — has most data):           │")
  console.log("   │  Email:    demo@zara.in                                │")
  console.log("   │  Password: tenant123456                                │")
  console.log("   │                                                        │")
  console.log("   │  Haldiram's:                                           │")
  console.log("   │  Email:    demo@haldirams.com                          │")
  console.log("   │  Password: tenant123456                                │")
  console.log("   │                                                        │")
  console.log("   │  Croma Electronics:                                    │")
  console.log("   │  Email:    demo@croma.com                              │")
  console.log("   │  Password: tenant123456                                │")
  console.log("   └─────────────────────────────────────────────────────────┘")
  console.log("\n📊 Data summary:")
  console.log("   2 properties (Gurgaon + Noida)")
  console.log("   16 tenants (13 revenue share, 3 fixed rent)")
  console.log("   3 tenant portal users (Zara, Haldiram's, Croma)")
  console.log("   11 POS integrations (connected)")
  console.log("   2 revenue share tenants not yet connected (Crossword, Bata)")
  console.log(`   ${totalSalesRecords} daily POS sales records (90 days × 11 tenants)`)
  console.log("   5 invoices (2 rent, 3 revenue share)")
  console.log(`   ${paymentValues.length} payments`)
  console.log("   5 documents (for Zara)")
  console.log("   6 vendors (HVAC, electrical, plumbing, cleaning, security, IT)")
  console.log("   10 equipment assets (HVAC, chillers, elevators, escalators, genset, fire, CCTV)")
  console.log("   10 work orders (assigned to vendors, 2 predictive/equipment-linked)")
  console.log("   POS reconciliation — 3 months × 8 connected tenants (matched/variance/resolved mix)")
  console.log("   5 email notification templates")
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
