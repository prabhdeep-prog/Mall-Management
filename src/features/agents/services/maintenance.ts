// @ts-nocheck - Temporary: Schema alignment needed
import { BaseAgent } from "../orchestrator"
import { maintenanceTools } from "../tools/maintenance"
import { MAINTENANCE_COORDINATOR_SYSTEM_PROMPT } from "../prompts/maintenance"
import type { AgentConfig, AgentContext, AgentMessage, AgentResponse, Tool, ToolResult } from "@/types/agents"

export class MaintenanceCoordinatorAgent extends BaseAgent {
  constructor() {
    const config: AgentConfig = {
      id: "maintenance-coordinator",
      name: "Maintenance Coordinator",
      persona: "maintenance_coordinator",
      description: "Manages maintenance operations, work orders, and vendor coordination",
      capabilities: [
        "Work order management",
        "Vendor assignment",
        "Preventive maintenance scheduling",
        "Priority management",
        "Maintenance analytics",
      ],
      systemPrompt: MAINTENANCE_COORDINATOR_SYSTEM_PROMPT,
      tools: maintenanceTools,
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

    observations.push(`Received maintenance query: "${input.substring(0, 100)}..."`)
    reasoning.push("Analyzing request to determine appropriate maintenance action")

    const intent = this.detectIntent(input)
    reasoning.push(`Detected intent: ${intent}`)

    try {
      let result: ToolResult | null = null
      const params = this.extractParams(input)

      switch (intent) {
        case "work_order_queue":
          result = await this.executeTool("get_work_order_queue", {
            propertyId: context.propertyId,
            status: params.status || "all",
          }, context)
          break

        case "prioritize":
          if (params.workOrderId) {
            result = await this.executeTool("prioritize_work_order", {
              workOrderId: params.workOrderId,
              newPriority: params.priority || "high",
              reason: params.reason || "Priority updated based on analysis",
            }, context)
          } else {
            return {
              agentId: this.config.id,
              message: "To prioritize a work order, please provide the work order ID.",
              confidence: 0.5,
              toolsUsed: [],
              reasoning,
              observations,
              processingTime: Date.now() - startTime,
              requiresHumanApproval: false,
            }
          }
          break

        case "assign_vendor":
          if (params.workOrderId) {
            result = await this.executeTool("assign_vendor", {
              workOrderId: params.workOrderId,
              vendorId: params.vendorId,
            }, context)
          } else {
            return {
              agentId: this.config.id,
              message: "To assign a vendor, please provide the work order ID.",
              confidence: 0.5,
              toolsUsed: [],
              reasoning,
              observations,
              processingTime: Date.now() - startTime,
              requiresHumanApproval: false,
            }
          }
          break

        case "preventive_maintenance":
          result = await this.executeTool("schedule_preventive_maintenance", {
            maintenanceType: params.maintenanceType || "routine",
          }, context)
          break

        case "analytics":
          result = await this.executeTool("get_maintenance_analytics", {
            propertyId: context.propertyId,
            period: params.period || "month",
          }, context)
          break

        default:
          result = await this.executeTool("get_work_order_queue", {
            propertyId: context.propertyId,
            status: "all",
          }, context)
      }

      if (result) {
        toolResults.push(result)
        observations.push(`Tool execution completed: ${result.success ? "success" : "failed"}`)
      }

      const response = this.generateResponse(intent, result, input)
      reasoning.push("Generated response based on maintenance data")

      // Check if this needs human approval (e.g., high-priority changes)
      const requiresApproval = 
        intent === "prioritize" && params.priority === "critical" ||
        intent === "assign_vendor"

      return {
        agentId: this.config.id,
        message: response,
        confidence: result?.success ? 0.88 : 0.5,
        toolsUsed: toolResults.map((r) => ({
          name: intent,
          params,
          result: r,
        })),
        reasoning,
        observations,
        processingTime: Date.now() - startTime,
        requiresHumanApproval: requiresApproval,
      }
    } catch (error) {
      return {
        agentId: this.config.id,
        message: `I encountered an error processing your maintenance request: ${error instanceof Error ? error.message : "Unknown error"}`,
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

    if (lowerInput.includes("queue") || lowerInput.includes("list") || lowerInput.includes("work order") || lowerInput.includes("ticket")) {
      return "work_order_queue"
    }
    if (lowerInput.includes("priorit") || lowerInput.includes("urgent") || lowerInput.includes("escalate")) {
      return "prioritize"
    }
    if (lowerInput.includes("assign") || lowerInput.includes("vendor") || lowerInput.includes("technician")) {
      return "assign_vendor"
    }
    if (lowerInput.includes("preventive") || lowerInput.includes("schedule") || lowerInput.includes("routine")) {
      return "preventive_maintenance"
    }
    if (lowerInput.includes("analytics") || lowerInput.includes("performance") || lowerInput.includes("metric") || lowerInput.includes("report")) {
      return "analytics"
    }

    return "work_order_queue"
  }

  private extractParams(input: string): Record<string, string> {
    const params: Record<string, string> = {}

    // Extract work order ID
    const woMatch = input.match(/(?:work\s*order|wo|ticket)[:\s#]*([a-zA-Z0-9-]+)/i)
    if (woMatch) {
      params.workOrderId = woMatch[1]
    }

    // Extract vendor ID
    const vendorMatch = input.match(/vendor[:\s#]*([a-zA-Z0-9-]+)/i)
    if (vendorMatch) {
      params.vendorId = vendorMatch[1]
    }

    // Extract priority
    if (input.toLowerCase().includes("critical")) params.priority = "critical"
    else if (input.toLowerCase().includes("high")) params.priority = "high"
    else if (input.toLowerCase().includes("medium")) params.priority = "medium"
    else if (input.toLowerCase().includes("low")) params.priority = "low"

    // Extract status
    if (input.toLowerCase().includes("open")) params.status = "open"
    else if (input.toLowerCase().includes("progress")) params.status = "in_progress"
    else if (input.toLowerCase().includes("resolved")) params.status = "resolved"

    // Extract period
    if (input.toLowerCase().includes("week")) params.period = "week"
    else if (input.toLowerCase().includes("quarter")) params.period = "quarter"
    else params.period = "month"

    // Extract maintenance type
    if (input.toLowerCase().includes("seasonal")) params.maintenanceType = "seasonal"
    else if (input.toLowerCase().includes("compliance")) params.maintenanceType = "compliance"
    else params.maintenanceType = "routine"

    // Extract reason
    const reasonMatch = input.match(/because\s+(.+?)(?:\.|$)/i)
    if (reasonMatch) {
      params.reason = reasonMatch[1]
    }

    return params
  }

  private generateResponse(intent: string, result: ToolResult | null, originalInput: string): string {
    if (!result || !result.success) {
      return "I was unable to retrieve the maintenance data at this time. Please verify the information and try again."
    }

    const data = result.data as Record<string, any>

    switch (intent) {
      case "work_order_queue":
        const urgentCount = data.priorityCounts.critical + data.priorityCounts.high
        return `🔧 **Work Order Queue**\n\n**Summary:**\n• Total Orders: ${data.totalOrders}\n• Critical: ${data.priorityCounts.critical}\n• High: ${data.priorityCounts.high}\n• Medium: ${data.priorityCounts.medium}\n• Low: ${data.priorityCounts.low}\n\n${urgentCount > 0 ? `⚠️ ${urgentCount} urgent items require attention!\n\n` : ""}**Recent Orders:**\n${data.orders.slice(0, 5).map((o: { priority: string; orderNumber: string; title: string; tenantName: string; status: string }) => 
          `• [${o.priority.toUpperCase()}] ${o.orderNumber}: ${o.title}\n  Location: ${o.tenantName} | Status: ${o.status}`
        ).join("\n")}`

      case "prioritize":
        return `✅ **Priority Updated**\n\n• Order: ${data.orderNumber}\n• Previous: ${data.previousPriority}\n• New: **${data.newPriority.toUpperCase()}**\n• Reason: ${data.reason}\n\nI've updated the work order queue accordingly.`

      case "assign_vendor":
        return `🧰 **Vendor Assigned**\n\n• Order: ${data.orderNumber}\n• Vendor: ${data.vendorName}\n• Contact: ${data.vendorContact || "On file"}\n• Status: ${data.status}\n\nThe vendor has been notified and the work order is now in progress.`

      case "preventive_maintenance":
        return `📅 **Preventive Maintenance Scheduled**\n\n• Type: ${data.maintenanceType}\n• Equipment Checked: ${data.totalEquipmentChecked}\n• Due for Maintenance: ${data.dueForMaintenance}\n• Scheduled: ${data.scheduled}\n\n${data.orders.length > 0 ? `**Created Work Orders:**\n${data.orders.map((o: { orderNumber: string; equipmentName: string }) => 
          `• ${o.orderNumber}: ${o.equipmentName}`
        ).join("\n")}` : "No maintenance required at this time."}`

      case "analytics":
        return `📊 **Maintenance Analytics (${data.period})**\n\n**Summary:**\n• Total Orders: ${data.summary.totalOrders}\n• Resolved: ${data.summary.resolved}\n• Pending: ${data.summary.pending}\n• Resolution Rate: ${data.summary.resolutionRate}%\n• Avg Resolution: ${data.summary.avgResolutionHours} hours\n\n**By Category:**\n${Object.entries(data.categoryBreakdown).map(([cat, count]) => 
          `• ${cat}: ${count}`
        ).join("\n")}\n\n**Current Backlog:** ${data.currentBacklog} orders`

      default:
        return "Here's the maintenance data you requested."
    }
  }

  async handleMessage(message: AgentMessage, context: AgentContext): Promise<AgentResponse> {
    return this.process(message.content, context)
  }
}

export const maintenanceCoordinatorAgent = new MaintenanceCoordinatorAgent()

