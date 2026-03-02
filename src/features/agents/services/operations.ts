// @ts-nocheck - Temporary: Schema alignment needed
import { BaseAgent } from "../orchestrator"
import { operationsTools } from "../tools/operations"
import { OPERATIONS_COMMANDER_SYSTEM_PROMPT } from "../prompts/operations"
import type { AgentConfig, AgentContext, AgentMessage, AgentResponse, Tool, ToolResult } from "@/types/agents"

export class OperationsCommanderAgent extends BaseAgent {
  constructor() {
    const config: AgentConfig = {
      id: "operations-commander",
      name: "Operations Commander",
      persona: "operations_commander",
      description: "Oversees all operational aspects, monitors KPIs, and ensures smooth daily operations",
      capabilities: [
        "Daily metrics analysis",
        "Anomaly detection",
        "Performance monitoring",
        "Operational reporting",
        "Resource optimization",
      ],
      systemPrompt: OPERATIONS_COMMANDER_SYSTEM_PROMPT,
      tools: operationsTools,
      maxIterations: 5,
      confidenceThreshold: 0.75,
    }
    super(config)
  }

  async process(input: string, context: AgentContext): Promise<AgentResponse> {
    const startTime = Date.now()
    const observations: string[] = []
    const reasoning: string[] = []
    const toolResults: ToolResult[] = []

    // Add initial observation
    observations.push(`Received operations query: "${input.substring(0, 100)}..."`)
    reasoning.push("Analyzing request to determine appropriate operational action")

    // Intent detection
    const intent = this.detectIntent(input)
    reasoning.push(`Detected intent: ${intent}`)

    try {
      let result: ToolResult | null = null

      switch (intent) {
        case "anomaly_detection":
          result = await this.executeTool("detect_anomalies", {
            propertyId: context.propertyId,
            category: "all",
          }, context)
          break

        case "metrics_analysis":
          result = await this.executeTool("analyze_daily_metrics", {
            propertyId: context.propertyId,
            dateRange: 7,
          }, context)
          break

        case "operations_summary":
          result = await this.executeTool("get_operations_summary", {
            propertyId: context.propertyId,
          }, context)
          break

        case "daily_report":
          result = await this.executeTool("generate_daily_report", {
            propertyId: context.propertyId,
          }, context)
          break

        default:
          // Default to operations summary
          result = await this.executeTool("get_operations_summary", {
            propertyId: context.propertyId,
          }, context)
      }

      if (result) {
        toolResults.push(result)
        observations.push(`Tool execution completed: ${result.success ? "success" : "failed"}`)
      }

      // Generate response
      const response = this.generateResponse(intent, result, input)
      reasoning.push("Generated response based on operational data")

      return {
        agentId: this.config.id,
        message: response,
        confidence: result?.success ? 0.9 : 0.5,
        toolsUsed: toolResults.map((r) => ({
          name: intent,
          params: {},
          result: r,
        })),
        reasoning,
        observations,
        processingTime: Date.now() - startTime,
        requiresHumanApproval: false,
      }
    } catch (error) {
      return {
        agentId: this.config.id,
        message: `I encountered an error while processing your request: ${error instanceof Error ? error.message : "Unknown error"}`,
        confidence: 0.3,
        toolsUsed: [],
        reasoning: [...reasoning, "Error occurred during processing"],
        observations: [...observations, `Error: ${error}`],
        processingTime: Date.now() - startTime,
        requiresHumanApproval: false,
      }
    }
  }

  private detectIntent(input: string): string {
    const lowerInput = input.toLowerCase()

    if (lowerInput.includes("anomal") || lowerInput.includes("issue") || lowerInput.includes("problem")) {
      return "anomaly_detection"
    }
    if (lowerInput.includes("metric") || lowerInput.includes("trend") || lowerInput.includes("analysis")) {
      return "metrics_analysis"
    }
    if (lowerInput.includes("report") || lowerInput.includes("daily")) {
      return "daily_report"
    }
    if (lowerInput.includes("summary") || lowerInput.includes("status") || lowerInput.includes("overview")) {
      return "operations_summary"
    }

    return "operations_summary"
  }

  private generateResponse(intent: string, result: ToolResult | null, originalInput: string): string {
    if (!result || !result.success) {
      return "I was unable to retrieve the operational data at this time. Please try again or contact support if the issue persists."
    }

    const data = result.data as Record<string, any>

    switch (intent) {
      case "anomaly_detection":
        if (data.anomaliesFound === 0) {
          return "🟢 **All systems normal.** I've completed a comprehensive scan of operations and found no anomalies requiring attention. The mall is operating within expected parameters."
        }
        return `⚠️ **${data.anomaliesFound} Anomalies Detected**\n\n${data.anomalies.map((a: { type: string; severity: string; description: string; metric: string }) => 
          `• **${a.type.replace(/_/g, " ").toUpperCase()}** (${a.severity})\n  ${a.description}\n  Current: ${a.metric}`
        ).join("\n\n")}\n\nI recommend addressing high-severity items within the next 4 hours.`

      case "metrics_analysis":
        return `📊 **Metrics Analysis (${data.period})**\n\n**Averages:**\n• Occupancy Rate: ${data.averages.occupancyRate}%\n• Collection Rate: ${data.averages.collectionRate}%\n• Daily Revenue: ₹${parseFloat(data.averages.dailyRevenue).toLocaleString()}\n\n**Trend:** ${data.trends.occupancyTrend === "improving" ? "📈 Improving" : data.trends.occupancyTrend === "declining" ? "📉 Declining" : "➡️ Stable"}\n\n${data.anomalies?.length > 0 ? `**Anomalous Days:** ${data.anomalies.length}` : "No anomalous patterns detected."}`

      case "daily_report":
        return `📋 **Daily Operations Report (${data.reportDate})**\n\n${data.summary}\n\n**Key Metrics:**\n• Occupancy: ${data.metrics.occupancyRate}%\n• Collection: ${data.metrics.collectionRate}%\n• Foot Traffic: ${data.metrics.footTraffic?.toLocaleString() || "N/A"}\n• Maintenance: ${data.metrics.maintenanceResolved}/${data.metrics.maintenanceTickets} resolved`

      case "operations_summary":
        return `📌 **Operations Summary**\n\n**Tenants:**\n• Active: ${data.tenants.active}/${data.tenants.total}\n• Inactive: ${data.tenants.inactive}\n\n**Work Orders:**\n• Open: ${data.workOrders.open}\n• In Progress: ${data.workOrders.inProgress}\n• Critical: ${data.workOrders.critical}\n\n**Leases:**\n• Active: ${data.leases.active}\n• Expiring in 90 days: ${data.leases.expiringIn90Days}`

      default:
        return "Here's the operational data you requested."
    }
  }

  async handleMessage(message: AgentMessage, context: AgentContext): Promise<AgentResponse> {
    return this.process(message.content, context)
  }
}

export const operationsCommanderAgent = new OperationsCommanderAgent()

