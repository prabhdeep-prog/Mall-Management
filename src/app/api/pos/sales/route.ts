import { NextResponse } from "next/server"
import { db } from "@/lib/db"
import { posSalesData, posIntegrations, tenants, leases } from "@/lib/db/schema"
import { eq, and, gte, lte, sql } from "drizzle-orm"
import { getPOSProvider, isDemoMode } from "@/lib/pos"
import type { POSProviderKey } from "@/lib/pos/types"

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url)
    const propertyId = searchParams.get("propertyId")
    const tenantId = searchParams.get("tenantId")
    const leaseId = searchParams.get("leaseId")
    const startDate = searchParams.get("startDate")
    const endDate = searchParams.get("endDate")
    // Query from database
    const conditions = []
    if (propertyId) conditions.push(eq(posSalesData.propertyId, propertyId))
    if (tenantId) conditions.push(eq(posSalesData.tenantId, tenantId))
    if (leaseId) conditions.push(eq(posSalesData.leaseId, leaseId))
    if (startDate) conditions.push(gte(posSalesData.salesDate, startDate))
    if (endDate) conditions.push(lte(posSalesData.salesDate, endDate))

    const sales = await db
      .select()
      .from(posSalesData)
      .where(conditions.length > 0 ? and(...conditions) : undefined)
      .orderBy(posSalesData.salesDate)

    return NextResponse.json({ success: true, data: sales })
  } catch (error) {
    console.error("Error fetching POS sales:", error)
    return NextResponse.json(
      { success: false, error: "Failed to fetch POS sales data" },
      { status: 500 }
    )
  }
}

// POST — Trigger a sync for a specific POS integration
export async function POST(request: Request) {
  try {
    const body = await request.json()
    const { posIntegrationId, startDate, endDate } = body

    if (!posIntegrationId) {
      return NextResponse.json(
        { success: false, error: "posIntegrationId is required" },
        { status: 400 }
      )
    }

    // Fetch the integration config
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

    // In demo mode, don't generate fake mock data.
    // Sales should only come from the POS Simulator.
    if (isDemoMode()) {
      return NextResponse.json({
        success: true,
        data: {
          synced: 0,
          dateRange: { start: startDate || "N/A", end: endDate || "N/A" },
          message: "Demo mode — use the POS Simulator to enter sales data.",
        },
      })
    }

    // Fetch sales from real provider
    const provider = getPOSProvider(integration.provider as POSProviderKey)
    const end = endDate || new Date().toISOString().split("T")[0]
    const start = startDate || (() => {
      const d = new Date()
      d.setDate(d.getDate() - 30)
      return d.toISOString().split("T")[0]
    })()

    const sales = await provider.fetchSalesRange(
      {
        provider: integration.provider as POSProviderKey,
        storeId: integration.storeId || "",
        locationId: integration.locationId || undefined,
        apiKey: integration.apiKeyEncrypted || "", // In production: decrypt
        syncFrequency: (integration.syncFrequency as "real_time" | "hourly" | "daily") || "daily",
      },
      start,
      end,
    )

    // Batch upsert — chunk into 500 rows to stay within Postgres parameter limit
    const BATCH_SIZE = 500
    let syncedCount = 0

    if (sales.length > 0) {
      for (let i = 0; i < sales.length; i += BATCH_SIZE) {
        const chunk = sales.slice(i, i + BATCH_SIZE)
        await db
          .insert(posSalesData)
          .values(
            chunk.map(sale => ({
              posIntegrationId: integration.id,
              tenantId: integration.tenantId,
              propertyId: integration.propertyId,
              leaseId: integration.leaseId,
              // Drizzle date columns expect YYYY-MM-DD strings
              salesDate: sale.date instanceof Date
                ? sale.date.toISOString().split("T")[0]
                : String(sale.date),
              grossSales: String(sale.grossSales),
              netSales: String(sale.netSales),
              refunds: String(sale.refunds),
              discounts: String(sale.discounts),
              transactionCount: sale.transactionCount,
              avgTransactionValue: String(sale.avgTransactionValue),
              categoryBreakdown: sale.categoryBreakdown,
              hourlyBreakdown: sale.hourlyBreakdown,
              source: "pos_api",
            }))
          )
          .onConflictDoUpdate({
            target: [posSalesData.posIntegrationId, posSalesData.salesDate],
            set: {
              grossSales:          sql<string>`excluded.gross_sales`,
              netSales:            sql<string>`excluded.net_sales`,
              refunds:             sql<string>`excluded.refunds`,
              discounts:           sql<string>`excluded.discounts`,
              transactionCount:    sql<number>`excluded.transaction_count`,
              avgTransactionValue: sql<string>`excluded.avg_transaction_value`,
              categoryBreakdown:   sql<unknown>`excluded.category_breakdown`,
              hourlyBreakdown:     sql<unknown>`excluded.hourly_breakdown`,
            },
          })
        syncedCount += chunk.length
      }
    }

    // Update integration sync status
    await db
      .update(posIntegrations)
      .set({
        lastSyncAt: new Date(),
        lastSyncStatus: "success",
        totalTransactionsSynced: sql`${posIntegrations.totalTransactionsSynced} + ${syncedCount}`,
        status: "connected",
        updatedAt: new Date(),
      })
      .where(eq(posIntegrations.id, posIntegrationId))

    return NextResponse.json({
      success: true,
      data: {
        synced: syncedCount,
        dateRange: { start, end },
      },
    })
  } catch (error) {
    console.error("Error syncing POS sales:", error)
    return NextResponse.json(
      { success: false, error: "Failed to sync POS sales data" },
      { status: 500 }
    )
  }
}
