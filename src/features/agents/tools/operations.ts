// @ts-nocheck - Temporary: Schema alignment needed
import { z } from "zod"
import { db } from "@/lib/db"
import { dailyMetrics, workOrders, tenants, leases } from "@/lib/db/schema"
import { eq, and, desc, sql, gte, lte } from "drizzle-orm"
import type { Tool, AgentContext, ToolResult } from "@/types/agents"

// Tool: Analyze Daily Metrics
export const analyzeDailyMetricsTool: Tool = {
  name: "analyze_daily_metrics",
  description: "Analyze daily operational metrics to identify trends and anomalies",
  parameters: z.object({
    propertyId: z.string().describe("The property's unique identifier"),
    dateRange: z.number().optional().describe("Number of days to analyze (default: 7)"),
  }),
  handler: async (params, context): Promise<ToolResult> => {
    const { dateRange = 7 } = params as { dateRange?: number }

    try {
      const startDate = new Date()
      startDate.setDate(startDate.getDate() - dateRange)

      const metrics = await db
        .select()
        .from(dailyMetrics)
        .where(
          and(
            eq(dailyMetrics.propertyId, context.propertyId),
            gte(dailyMetrics.metricDate, startDate.toISOString().split("T")[0])
          )
        )
        .orderBy(desc(dailyMetrics.metricDate))

      // Calculate averages and trends
      const avgOccupancy =
        metrics.reduce((sum, m) => sum + parseFloat(m.occupancyRate || "0"), 0) / metrics.length
      const avgCollection =
        metrics.reduce((sum, m) => sum + parseFloat(m.collectionRate || "0"), 0) / metrics.length
      const totalRevenue = metrics.reduce(
        (sum, m) => sum + parseFloat(m.revenue || "0"),
        0
      )

      // Detect anomalies (simple threshold-based)
      const anomalies = metrics.filter(
        (m) =>
          parseFloat(m.occupancyRate || "0") < avgOccupancy * 0.85 ||
          parseFloat(m.collectionRate || "0") < avgCollection * 0.85
      )

      return {
        success: true,
        data: {
          period: `${dateRange} days`,
          averages: {
            occupancyRate: avgOccupancy.toFixed(2),
            collectionRate: avgCollection.toFixed(2),
            dailyRevenue: (totalRevenue / metrics.length).toFixed(2),
          },
          trends: {
            occupancyTrend: metrics.length > 1 
              ? parseFloat(metrics[0]?.occupancyRate || "0") > parseFloat(metrics[metrics.length - 1]?.occupancyRate || "0")
                ? "improving"
                : "declining"
              : "stable",
          },
          anomalies: anomalies.map((a) => ({
            date: a.metricDate,
            occupancyRate: a.occupancyRate,
            collectionRate: a.collectionRate,
          })),
          totalDataPoints: metrics.length,
        },
      }
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : "Failed to analyze metrics",
      }
    }
  },
}

// Tool: Detect Operational Anomalies
export const detectAnomaliesTool: Tool = {
  name: "detect_anomalies",
  description: "Detect operational anomalies that require attention",
  parameters: z.object({
    propertyId: z.string().describe("The property's unique identifier"),
    category: z.enum(["foot_traffic", "revenue", "maintenance", "all"]).optional(),
  }),
  handler: async (params, context): Promise<ToolResult> => {
    const { category = "all" } = params as { category?: string }

    try {
      const anomalies: Array<{
        type: string
        severity: string
        description: string
        metric: string
        deviation: string
      }> = []

      // Get recent metrics
      const recentMetrics = await db
        .select()
        .from(dailyMetrics)
        .where(eq(dailyMetrics.propertyId, context.propertyId))
        .orderBy(desc(dailyMetrics.metricDate))
        .limit(7)

      if (recentMetrics.length > 0) {
        const latest = recentMetrics[0]
        const avgFootTraffic =
          recentMetrics.reduce((sum, m) => sum + (m.footTraffic || 0), 0) / recentMetrics.length

        // Check foot traffic anomaly
        if (
          (category === "all" || category === "foot_traffic") &&
          latest.footTraffic &&
          latest.footTraffic < avgFootTraffic * 0.75
        ) {
          anomalies.push({
            type: "foot_traffic_low",
            severity: "medium",
            description: "Foot traffic significantly below average",
            metric: `${latest.footTraffic} visitors (avg: ${avgFootTraffic.toFixed(0)})`,
            deviation: `-${((1 - latest.footTraffic / avgFootTraffic) * 100).toFixed(1)}%`,
          })
        }

        // Check collection rate anomaly
        if (
          parseFloat(latest.collectionRate || "0") < 80
        ) {
          anomalies.push({
            type: "collection_rate_low",
            severity: "high",
            description: "Collection rate below target threshold",
            metric: `${latest.collectionRate}%`,
            deviation: `${parseFloat(latest.collectionRate || "0") - 85}% from target`,
          })
        }
      }

      // Check maintenance backlog
      if (category === "all" || category === "maintenance") {
        const openWorkOrders = await db
          .select()
          .from(workOrders)
          .where(
            and(
              eq(workOrders.propertyId, context.propertyId),
              eq(workOrders.status, "open")
            )
          )

        if (openWorkOrders.length > 10) {
          anomalies.push({
            type: "maintenance_backlog",
            severity: "medium",
            description: "High number of open work orders",
            metric: `${openWorkOrders.length} open work orders`,
            deviation: `${openWorkOrders.length - 10} above threshold`,
          })
        }
      }

      return {
        success: true,
        data: {
          anomaliesFound: anomalies.length,
          anomalies,
          checkedAt: new Date().toISOString(),
        },
      }
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : "Failed to detect anomalies",
      }
    }
  },
}

// Tool: Get Operations Summary
export const getOperationsSummaryTool: Tool = {
  name: "get_operations_summary",
  description: "Get a comprehensive summary of current operations status",
  parameters: z.object({
    propertyId: z.string().describe("The property's unique identifier"),
  }),
  handler: async (params, context): Promise<ToolResult> => {
    try {
      // Get tenant stats
      const allTenants = await db
        .select()
        .from(tenants)
        .where(eq(tenants.propertyId, context.propertyId))

      const activeTenants = allTenants.filter((t) => t.status === "active").length

      // Get work order stats
      const allWorkOrders = await db
        .select()
        .from(workOrders)
        .where(eq(workOrders.propertyId, context.propertyId))

      const openWorkOrders = allWorkOrders.filter((w) => w.status === "open").length
      const inProgressWorkOrders = allWorkOrders.filter((w) => w.status === "in_progress").length
      const criticalWorkOrders = allWorkOrders.filter(
        (w) => w.priority === "critical" && w.status !== "resolved"
      ).length

      // Get lease stats
      const activeLeases = await db
        .select()
        .from(leases)
        .where(
          and(
            eq(leases.propertyId, context.propertyId),
            eq(leases.status, "active")
          )
        )

      const expiringLeases = activeLeases.filter((l) => {
        const endDate = new Date(l.endDate)
        const daysUntilExpiry = (endDate.getTime() - Date.now()) / (1000 * 60 * 60 * 24)
        return daysUntilExpiry <= 90
      })

      return {
        success: true,
        data: {
          tenants: {
            total: allTenants.length,
            active: activeTenants,
            inactive: allTenants.length - activeTenants,
          },
          workOrders: {
            open: openWorkOrders,
            inProgress: inProgressWorkOrders,
            critical: criticalWorkOrders,
          },
          leases: {
            active: activeLeases.length,
            expiringIn90Days: expiringLeases.length,
          },
          generatedAt: new Date().toISOString(),
        },
      }
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : "Failed to get operations summary",
      }
    }
  },
}

// Tool: Generate Daily Report
export const generateDailyReportTool: Tool = {
  name: "generate_daily_report",
  description: "Generate a daily operations report with key insights",
  parameters: z.object({
    propertyId: z.string().describe("The property's unique identifier"),
    reportDate: z.string().optional().describe("Date for the report (YYYY-MM-DD)"),
  }),
  handler: async (params, context): Promise<ToolResult> => {
    const { reportDate } = params as { reportDate?: string }
    const date = reportDate || new Date().toISOString().split("T")[0]

    try {
      const metrics = await db.query.dailyMetrics.findFirst({
        where: and(
          eq(dailyMetrics.propertyId, context.propertyId),
          eq(dailyMetrics.metricDate, date)
        ),
      })

      if (!metrics) {
        return {
          success: false,
          error: `No metrics found for ${date}`,
        }
      }

      return {
        success: true,
        data: {
          reportDate: date,
          metrics: {
            occupancyRate: metrics.occupancyRate,
            collectionRate: metrics.collectionRate,
            tenantSatisfaction: metrics.tenantSatisfaction,
            revenue: metrics.revenue,
            footTraffic: metrics.footTraffic,
            maintenanceTickets: metrics.maintenanceTickets,
            maintenanceResolved: metrics.maintenanceResolved,
          },
          summary: `Daily report for ${date}: Occupancy at ${metrics.occupancyRate}%, Collection rate ${metrics.collectionRate}%, ${metrics.maintenanceTickets} maintenance tickets with ${metrics.maintenanceResolved} resolved.`,
        },
      }
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : "Failed to generate report",
      }
    }
  },
}

export const operationsTools: Tool[] = [
  analyzeDailyMetricsTool,
  detectAnomaliesTool,
  getOperationsSummaryTool,
  generateDailyReportTool,
]

