// @ts-nocheck - Schema alignment matches sibling tool files
import { z } from "zod"
import { sql } from "drizzle-orm"
import { db } from "@/lib/db"
import { generateRevenueForecast } from "@/lib/revenue/forecast-engine"
import type { Tool, ToolResult } from "@/types/agents"

/**
 * Tool: generate_revenue_forecast
 * Wraps the forecast engine so the Revenue Forecast Agent can call it from
 * within an agentic loop. RLS is bound on the connection before the query.
 */
export const generateRevenueForecastTool: Tool = {
  name: "generate_revenue_forecast",
  description:
    "Generate a 30-day revenue forecast for a mall (and optional zone) from the last 90 days of POS sales.",
  parameters: z.object({
    mallId: z.string().describe("Property/mall UUID"),
    zoneId: z.string().optional().describe("Optional zone UUID to scope the forecast"),
  }),
  handler: async (params, context): Promise<ToolResult> => {
    const { mallId, zoneId } = params as { mallId: string; zoneId?: string }
    const organizationId = context?.organizationId
    if (!organizationId) {
      return { success: false, error: "Missing organization context", data: null }
    }

    try {
      await db.execute(sql`SELECT set_config('app.current_organization_id', ${organizationId}, true)`)
      const forecast = await generateRevenueForecast(organizationId, mallId, zoneId ?? null)

      // Compute insight deltas: next 7 days vs trailing 7 days of history.
      const trailing7 = forecast.history.slice(-7).reduce((a, b) => a + b.revenue, 0)
      const next7 = forecast.forecast.slice(0, 7).reduce((a, b) => a + b.predictedRevenue, 0)
      const pctChange = trailing7 > 0 ? ((next7 - trailing7) / trailing7) * 100 : 0
      const avgConfidence =
        forecast.forecast.slice(0, 7).reduce((a, b) => a + b.confidenceScore, 0) / 7

      return {
        success: true,
        data: {
          modelVersion: forecast.modelVersion,
          mallId,
          zoneId: zoneId ?? null,
          trailing7dRevenue: Math.round(trailing7),
          next7dPredicted: Math.round(next7),
          pctChangeNextWeek: Math.round(pctChange * 10) / 10,
          avgConfidenceNext7d: Math.round(avgConfidence * 100) / 100,
          anomaliesInHistory: forecast.history.filter((h: any) => h.isAnomaly).length,
          meta: forecast.meta,
        },
      }
    } catch (err) {
      return {
        success: false,
        error: err instanceof Error ? err.message : "Forecast failed",
        data: null,
      }
    }
  },
}

export const revenueForecastTools: Tool[] = [generateRevenueForecastTool]
