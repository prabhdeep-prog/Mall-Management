/**
 * Dashboard API Route with Redis Caching
 * 
 * Provides dashboard metrics with intelligent caching for performance
 */

import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { db } from "@/lib/db"
import { withOrgContext } from "@/lib/db/with-org-context"
import { 
  properties, 
  tenants, 
  invoices, 
  workOrders, 
  dailyMetrics,
  agentActions 
} from "@/lib/db/schema"
import { eq, sql, and, gte, lte, count, sum, desc } from "drizzle-orm"
import { 
  getCachedOrFetch, 
  CACHE_KEYS, 
  CACHE_TTL,
  invalidateEntityCache 
} from "@/lib/cache"

export async function GET(request: NextRequest) {
  try {
    const session = await auth()
    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const { searchParams } = new URL(request.url)
    const propertyId = searchParams.get("propertyId")
    const refresh = searchParams.get("refresh") === "true"
    const organizationId = session.user.organizationId || "default"

    // If refresh requested, invalidate cache
    if (refresh && propertyId) {
      await invalidateEntityCache("property", propertyId, undefined, organizationId)
    }

    // Get dashboard metrics with caching
    const metrics = await getCachedOrFetch(
      propertyId 
        ? CACHE_KEYS.DASHBOARD_METRICS(organizationId, propertyId)
        : CACHE_KEYS.DASHBOARD_SUMMARY(organizationId),
      async () => {
        return await fetchDashboardMetrics(organizationId, propertyId || undefined)
      },
      CACHE_TTL.MEDIUM // 5 minutes
    )

    return NextResponse.json({ success: true, data: metrics })
  } catch (error) {
    console.error("Dashboard API error:", error)
    return NextResponse.json(
      { success: false, error: "Failed to fetch dashboard data" },
      { status: 500 }
    )
  }
}

async function fetchDashboardMetrics(organizationId: string, propertyId?: string) {
  return await withOrgContext(organizationId, async (tx) => {
    const today = new Date()
  const startOfMonthDate = new Date(today.getFullYear(), today.getMonth(), 1)
  const endOfMonthDate = new Date(today.getFullYear(), today.getMonth() + 1, 0)
  const startOfMonth = startOfMonthDate.toISOString().split("T")[0]
  const endOfMonth = endOfMonthDate.toISOString().split("T")[0]

  // Fetch all metrics in parallel
  const [
    propertyStats,
    tenantStats,
    invoiceStats,
    workOrderStats,
    agentStats,
    recentMetrics,
    recentActivities
  ] = await Promise.all([
    // Property statistics
    propertyId 
      ? tx.select({ 
          count: count(),
          totalArea: sum(properties.totalAreaSqft)
        }).from(properties).where(eq(properties.id, propertyId))
      : tx.select({ 
          count: count(),
          totalArea: sum(properties.totalAreaSqft)
        }).from(properties),

    // Tenant statistics
    propertyId
      ? tx.select({
          total: count(),
          active: sql<number>`count(case when ${tenants.status} = 'active' then 1 end)`,
        }).from(tenants).where(eq(tenants.propertyId, propertyId))
      : tx.select({
          total: count(),
          active: sql<number>`count(case when ${tenants.status} = 'active' then 1 end)`,
        }).from(tenants),

    // Invoice statistics for current month
    tx.select({
      totalInvoices: count(),
      totalAmount: sum(invoices.totalAmount),
      pending: sql<number>`count(case when ${invoices.status} = 'pending' then 1 end)`,
      paid: sql<number>`count(case when ${invoices.status} = 'paid' then 1 end)`,
      overdue: sql<number>`count(case when ${invoices.status} = 'overdue' then 1 end)`,
    }).from(invoices)
      .where(
        and(
          gte(invoices.dueDate, startOfMonth),
          lte(invoices.dueDate, endOfMonth)
        )
      ),

    // Work order statistics
    propertyId
      ? tx.select({
          total: count(),
          open: sql<number>`count(case when ${workOrders.status} = 'open' then 1 end)`,
          inProgress: sql<number>`count(case when ${workOrders.status} = 'in_progress' then 1 end)`,
          completed: sql<number>`count(case when ${workOrders.status} = 'completed' then 1 end)`,
          critical: sql<number>`count(case when ${workOrders.priority} = 'critical' then 1 end)`,
        }).from(workOrders).where(eq(workOrders.propertyId, propertyId))
      : tx.select({
          total: count(),
          open: sql<number>`count(case when ${workOrders.status} = 'open' then 1 end)`,
          inProgress: sql<number>`count(case when ${workOrders.status} = 'in_progress' then 1 end)`,
          completed: sql<number>`count(case when ${workOrders.status} = 'completed' then 1 end)`,
          critical: sql<number>`count(case when ${workOrders.priority} = 'critical' then 1 end)`,
        }).from(workOrders),

    // Agent action statistics
    tx.select({
      total: count(),
      pending: sql<number>`count(case when ${agentActions.status} = 'pending' then 1 end)`,
      approved: sql<number>`count(case when ${agentActions.status} = 'approved' then 1 end)`,
      executed: sql<number>`count(case when ${agentActions.status} = 'executed' then 1 end)`,
    }).from(agentActions),

    // Recent daily metrics (last 7 days)
    propertyId
      ? tx.select()
          .from(dailyMetrics)
          .where(eq(dailyMetrics.propertyId, propertyId))
          .orderBy(desc(dailyMetrics.metricDate))
          .limit(7)
      : tx.select()
          .from(dailyMetrics)
          .orderBy(desc(dailyMetrics.metricDate))
          .limit(7),

    // Recent agent activities
    tx.select()
      .from(agentActions)
      .orderBy(desc(agentActions.createdAt))
      .limit(10),
  ])

  // Calculate occupancy rate
  const occupancyRate = tenantStats[0]?.total 
    ? Math.round((Number(tenantStats[0].active) / Number(tenantStats[0].total)) * 100)
    : 0

  // Calculate collection rate
  const collectionRate = invoiceStats[0]?.totalInvoices
    ? Math.round((Number(invoiceStats[0].paid) / Number(invoiceStats[0].totalInvoices)) * 100)
    : 0

  return {
    summary: {
      properties: {
        count: Number(propertyStats[0]?.count || 0),
        totalArea: Number(propertyStats[0]?.totalArea || 0),
      },
      tenants: {
        total: Number(tenantStats[0]?.total || 0),
        active: Number(tenantStats[0]?.active || 0),
        occupancyRate,
      },
      financials: {
        totalInvoices: Number(invoiceStats[0]?.totalInvoices || 0),
        totalAmount: Number(invoiceStats[0]?.totalAmount || 0),
        pending: Number(invoiceStats[0]?.pending || 0),
        paid: Number(invoiceStats[0]?.paid || 0),
        overdue: Number(invoiceStats[0]?.overdue || 0),
        collectionRate,
      },
      workOrders: {
        total: Number(workOrderStats[0]?.total || 0),
        open: Number(workOrderStats[0]?.open || 0),
        inProgress: Number(workOrderStats[0]?.inProgress || 0),
        completed: Number(workOrderStats[0]?.completed || 0),
        critical: Number(workOrderStats[0]?.critical || 0),
      },
      agents: {
        total: Number(agentStats[0]?.total || 0),
        pending: Number(agentStats[0]?.pending || 0),
        approved: Number(agentStats[0]?.approved || 0),
        executed: Number(agentStats[0]?.executed || 0),
      },
    },
    trends: {
      dailyMetrics: recentMetrics.map(m => ({
        date: m.metricDate,
        footfall: Number(m.footTraffic || 0),
        revenue: Number(m.revenue || 0),
        occupancy: Number(m.occupancyRate || 0),
      })),
    },
    recentActivities: recentActivities.map(a => ({
      id: a.id,
      agentId: a.agentId,
      actionType: a.actionType,
      status: a.status,
      createdAt: a.createdAt,
    })),
    lastUpdated: new Date().toISOString(),
    };
  });
}

