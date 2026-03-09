import { NextResponse } from "next/server"
import { db } from "@/lib/db"
import { posIntegrations, tenants, leases, posSalesData } from "@/lib/db/schema"
import { eq, and, sql } from "drizzle-orm"

// ── Production guard — simulator must never be accessible in prod ─────────────
const PROD_BLOCK = process.env.NODE_ENV === "production"
  ? new Response(JSON.stringify({ error: "Not found" }), {
      status: 404,
      headers: { "Content-Type": "application/json" },
    })
  : null

export async function GET(request: Request) {
  if (PROD_BLOCK) return PROD_BLOCK
  try {
    const { searchParams } = new URL(request.url)
    const integrationId = searchParams.get("integrationId")

    // If integrationId provided, return today's sales data for that integration
    if (integrationId) {
      const today = new Date().toISOString().split("T")[0]
      const [todaySales] = await db
        .select()
        .from(posSalesData)
        .where(
          and(
            eq(posSalesData.posIntegrationId, integrationId),
            eq(posSalesData.salesDate, today)
          )
        )
        .limit(1)

      return NextResponse.json({
        success: true,
        data: { todaySales: todaySales || null },
      })
    }

    // Default: return all connected integrations with tenant info
    const integrations = await db
      .select({
        id: posIntegrations.id,
        tenantId: posIntegrations.tenantId,
        propertyId: posIntegrations.propertyId,
        leaseId: posIntegrations.leaseId,
        provider: posIntegrations.provider,
        storeId: posIntegrations.storeId,
        status: posIntegrations.status,
        lastSyncAt: posIntegrations.lastSyncAt,
        businessName: tenants.businessName,
        category: tenants.category,
        unitNumber: leases.unitNumber,
        floor: leases.floor,
        revenueSharePercentage: leases.revenueSharePercentage,
      })
      .from(posIntegrations)
      .innerJoin(tenants, eq(posIntegrations.tenantId, tenants.id))
      .innerJoin(leases, eq(posIntegrations.leaseId, leases.id))
      .where(eq(posIntegrations.status, "connected"))

    return NextResponse.json({ success: true, data: integrations })
  } catch (error) {
    console.error("Error in POS simulator GET:", error)
    return NextResponse.json(
      { success: false, error: "Failed to fetch POS data" },
      { status: 500 }
    )
  }
}

export async function POST(request: Request) {
  if (PROD_BLOCK) return PROD_BLOCK
  try {
    const body = await request.json()
    const {
      posIntegrationId,
      amount,
      paymentMethod,
      category,
      discount,
    } = body

    if (!posIntegrationId || !amount) {
      return NextResponse.json(
        { success: false, error: "posIntegrationId and amount are required" },
        { status: 400 }
      )
    }

    // Fetch integration to get tenantId, propertyId, leaseId
    const [integration] = await db
      .select()
      .from(posIntegrations)
      .where(eq(posIntegrations.id, posIntegrationId))
      .limit(1)

    if (!integration) {
      return NextResponse.json(
        { success: false, error: "POS integration not found" },
        { status: 404 }
      )
    }

    const today = new Date().toISOString().split("T")[0]
    const saleAmount = Number(amount)
    const discountAmount = Number(discount || 0)
    const netAmount = saleAmount - discountAmount

    // Read today's existing row (if any)
    const [existing] = await db
      .select()
      .from(posSalesData)
      .where(
        and(
          eq(posSalesData.posIntegrationId, posIntegrationId),
          eq(posSalesData.salesDate, today)
        )
      )
      .limit(1)

    // Calculate new aggregates
    const newGross = (existing ? Number(existing.grossSales) : 0) + saleAmount
    const newRefunds = existing ? Number(existing.refunds || 0) : 0
    const newDiscounts = (existing ? Number(existing.discounts || 0) : 0) + discountAmount
    const newNet = newGross - newRefunds - newDiscounts
    const newTxnCount = (existing ? existing.transactionCount || 0 : 0) + 1
    const newAvgTxn = newGross / newTxnCount

    // Merge category breakdown
    const existingCatBreakdown = (existing?.categoryBreakdown as Record<string, number>) || {}
    const updatedCatBreakdown = { ...existingCatBreakdown }
    if (category) {
      updatedCatBreakdown[category] = (updatedCatBreakdown[category] || 0) + saleAmount
    }

    // Merge hourly breakdown
    const currentHour = String(new Date().getHours())
    const existingHourBreakdown = (existing?.hourlyBreakdown as Record<string, number>) || {}
    const updatedHourBreakdown = { ...existingHourBreakdown }
    updatedHourBreakdown[currentHour] = (updatedHourBreakdown[currentHour] || 0) + saleAmount

    // Build payment method tracking in metadata
    const existingMeta = (existing?.metadata as Record<string, unknown>) || {}
    const paymentMethods = (existingMeta.paymentMethods as Record<string, number>) || {}
    if (paymentMethod) {
      paymentMethods[paymentMethod] = (paymentMethods[paymentMethod] || 0) + saleAmount
    }
    const updatedMeta = { ...existingMeta, paymentMethods }

    // Upsert the daily aggregate
    await db
      .insert(posSalesData)
      .values({
        posIntegrationId: integration.id,
        tenantId: integration.tenantId,
        propertyId: integration.propertyId,
        leaseId: integration.leaseId,
        salesDate: today,
        grossSales: String(Math.round(newGross * 100) / 100),
        netSales: String(Math.round(newNet * 100) / 100),
        refunds: String(Math.round(newRefunds * 100) / 100),
        discounts: String(Math.round(newDiscounts * 100) / 100),
        transactionCount: newTxnCount,
        avgTransactionValue: String(Math.round(newAvgTxn * 100) / 100),
        categoryBreakdown: updatedCatBreakdown,
        hourlyBreakdown: updatedHourBreakdown,
        source: "pos_simulator",
        metadata: updatedMeta,
      })
      .onConflictDoUpdate({
        target: [posSalesData.posIntegrationId, posSalesData.salesDate],
        set: {
          grossSales: String(Math.round(newGross * 100) / 100),
          netSales: String(Math.round(newNet * 100) / 100),
          refunds: String(Math.round(newRefunds * 100) / 100),
          discounts: String(Math.round(newDiscounts * 100) / 100),
          transactionCount: newTxnCount,
          avgTransactionValue: String(Math.round(newAvgTxn * 100) / 100),
          categoryBreakdown: updatedCatBreakdown,
          hourlyBreakdown: updatedHourBreakdown,
          source: "pos_simulator",
          metadata: updatedMeta,
        },
      })

    // Update posIntegrations.lastSyncAt
    await db
      .update(posIntegrations)
      .set({
        lastSyncAt: new Date(),
        lastSyncStatus: "success",
        totalTransactionsSynced: sql`${posIntegrations.totalTransactionsSynced} + 1`,
        updatedAt: new Date(),
      })
      .where(eq(posIntegrations.id, posIntegrationId))

    return NextResponse.json({
      success: true,
      data: {
        transactionCount: newTxnCount,
        grossSales: Math.round(newGross * 100) / 100,
        netSales: Math.round(newNet * 100) / 100,
        discounts: Math.round(newDiscounts * 100) / 100,
        avgTransactionValue: Math.round(newAvgTxn * 100) / 100,
        categoryBreakdown: updatedCatBreakdown,
        lastSyncAt: new Date().toISOString(),
      },
    })
  } catch (error) {
    console.error("Error recording POS sale:", error)
    return NextResponse.json(
      { success: false, error: "Failed to record sale" },
      { status: 500 }
    )
  }
}
