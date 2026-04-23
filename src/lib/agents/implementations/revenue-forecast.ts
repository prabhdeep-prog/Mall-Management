// @ts-nocheck - Schema alignment matches sibling agent files
import { BaseAgent } from "../orchestrator"
import { revenueForecastTools } from "../tools/revenue-forecast"
import { REVENUE_FORECAST_SYSTEM_PROMPT } from "../prompts/revenue-forecast"
import type { AgentConfig, AgentContext, AgentMessage, AgentResponse, ToolResult } from "@/types/agents"

/**
 * Revenue Forecast Agent
 * ----------------------
 * Drives the `generate_revenue_forecast` tool and turns its output into
 * decision-ready, one-line insights such as:
 *   "Food court revenue expected to drop 8% next week vs the trailing week"
 */
export class RevenueForecastAgent extends BaseAgent {
  constructor() {
    const config: AgentConfig = {
      id: "revenue-forecast",
      name: "Revenue Forecast Agent",
      persona: "revenue_forecast",
      description:
        "Predicts mall and zone-level revenue 30 days ahead and surfaces actionable insights for finance and leasing teams.",
      capabilities: [
        "30-day revenue forecasting",
        "Zone-level seasonality analysis",
        "Anomaly detection vs historical baseline",
        "Next-week delta insights with recommended actions",
      ],
      systemPrompt: REVENUE_FORECAST_SYSTEM_PROMPT,
      tools: revenueForecastTools,
      maxIterations: 4,
      confidenceThreshold: 0.75,
    }
    super(config)
  }

  async process(input: string, context: AgentContext): Promise<AgentResponse> {
    const startTime = Date.now()
    const reasoning: string[] = []
    const observations: string[] = []
    const toolResults: ToolResult[] = []

    const params = this.extractParams(input, context)
    reasoning.push(`Forecasting for mallId=${params.mallId ?? "?"} zoneId=${params.zoneId ?? "all"}`)

    if (!params.mallId) {
      return {
        agentId: this.config.id,
        message: "Please provide a mallId (property UUID) so I can generate a forecast.",
        confidence: 0.4,
        toolsUsed: [],
        reasoning,
        observations,
        processingTime: Date.now() - startTime,
        requiresHumanApproval: false,
      }
    }

    try {
      const result = await this.executeTool(
        "generate_revenue_forecast",
        { mallId: params.mallId, zoneId: params.zoneId },
        context,
      )
      toolResults.push(result)
      observations.push(`Forecast tool returned: ${result.success ? "success" : "failure"}`)

      if (!result.success || !result.data) {
        return {
          agentId: this.config.id,
          message: `I couldn't generate a forecast: ${result.error ?? "unknown error"}.`,
          confidence: 0.3,
          toolsUsed: toolResults.map((r) => ({ name: "generate_revenue_forecast", params, result: r })),
          reasoning,
          observations,
          processingTime: Date.now() - startTime,
          requiresHumanApproval: false,
        }
      }

      const d = result.data as Record<string, any>
      const direction = d.pctChangeNextWeek >= 0 ? "rise" : "drop"
      const absPct = Math.abs(d.pctChangeNextWeek)
      const scopeLabel = params.zoneId ? `Zone ${params.zoneId}` : "Mall"

      const headline = `${scopeLabel} revenue expected to ${direction} ${absPct}% next week (₹${d.next7dPredicted.toLocaleString()} vs ₹${d.trailing7dRevenue.toLocaleString()}).`

      const action =
        absPct >= 10 && direction === "drop"
          ? "Recommend launching a targeted promotion and contacting underperforming tenants."
          : absPct >= 10 && direction === "rise"
          ? "Recommend ensuring staffing and inventory are ready for the surge."
          : "No immediate action required — monitor daily."

      const message = [
        `📈 **Revenue Forecast Insight**`,
        ``,
        headline,
        ``,
        `• Trailing 7d: ₹${d.trailing7dRevenue.toLocaleString()}`,
        `• Next 7d (predicted): ₹${d.next7dPredicted.toLocaleString()}`,
        `• Confidence: ${(d.avgConfidenceNext7d * 100).toFixed(0)}%`,
        `• Historical anomalies considered: ${d.anomaliesInHistory}`,
        `• Model: ${d.modelVersion}`,
        ``,
        action,
      ].join("\n")

      return {
        agentId: this.config.id,
        message,
        confidence: Math.max(0.5, Math.min(0.95, d.avgConfidenceNext7d)),
        toolsUsed: toolResults.map((r) => ({ name: "generate_revenue_forecast", params, result: r })),
        reasoning: [...reasoning, `Computed Δ=${d.pctChangeNextWeek}% vs trailing week`],
        observations,
        processingTime: Date.now() - startTime,
        // Insights are advisory — no human approval required to read them.
        requiresHumanApproval: false,
      }
    } catch (error) {
      return {
        agentId: this.config.id,
        message: `I encountered an error generating the forecast: ${error instanceof Error ? error.message : "unknown error"}`,
        confidence: 0.3,
        toolsUsed: [],
        reasoning,
        observations,
        processingTime: Date.now() - startTime,
        requiresHumanApproval: false,
      }
    }
  }

  private extractParams(input: string, context: AgentContext): { mallId?: string; zoneId?: string } {
    const out: { mallId?: string; zoneId?: string } = {}
    const uuidRe = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i
    const mallMatch = input.match(new RegExp(`mall[:\\s#]*(${uuidRe.source})`, "i"))
    const zoneMatch = input.match(new RegExp(`zone[:\\s#]*(${uuidRe.source})`, "i"))
    if (mallMatch) out.mallId = mallMatch[1]
    if (zoneMatch) out.zoneId = zoneMatch[1]
    if (!out.mallId && (context as any)?.propertyId) out.mallId = (context as any).propertyId
    return out
  }

  async handleMessage(message: AgentMessage, context: AgentContext): Promise<AgentResponse> {
    return this.process(message.content, context)
  }
}

export const revenueForecastAgent = new RevenueForecastAgent()
