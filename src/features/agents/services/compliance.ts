// @ts-nocheck - Temporary: Schema alignment needed
import { BaseAgent } from "../orchestrator"
import { complianceTools } from "../tools/compliance"
import { COMPLIANCE_MONITOR_SYSTEM_PROMPT } from "../prompts/compliance"
import type { AgentConfig, AgentContext, AgentResponse, ToolResult } from "@/types/agents"

export class ComplianceMonitorAgent extends BaseAgent {
  constructor() {
    const config: AgentConfig = {
      id: "compliance-monitor",
      name: "Compliance Monitor",
      persona: "compliance_monitor",
      description: "Monitors regulatory compliance, tracks deadlines, and ensures documentation standards",
      capabilities: [
        "Compliance status monitoring",
        "Document expiry tracking",
        "Filing deadline management",
        "Compliance alert creation",
        "Compliance report generation",
      ],
      systemPrompt: COMPLIANCE_MONITOR_SYSTEM_PROMPT,
      tools: complianceTools,
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

    observations.push(`Received compliance query: "${input.substring(0, 100)}..."`)
    reasoning.push("Analyzing request to determine compliance action")

    const intent = this.detectIntent(input)
    reasoning.push(`Detected intent: ${intent}`)

    try {
      let result: ToolResult | null = null
      const params = this.extractParams(input)

      switch (intent) {
        case "compliance_status":
          result = await this.executeTool("get_compliance_status", {
            propertyId: context.propertyId,
            includeExpired: true,
          }, context)
          break

        case "document_expiry":
          result = await this.executeTool("check_document_expiry", {
            propertyId: context.propertyId,
            daysAhead: params.daysAhead || 90,
            documentType: params.documentType,
          }, context)
          break

        case "filing_deadlines":
          result = await this.executeTool("track_filing_deadlines", {
            propertyId: context.propertyId,
            filingType: params.filingType || "all",
          }, context)
          break

        case "create_alert":
          if (params.alertTitle) {
            result = await this.executeTool("create_compliance_alert", {
              propertyId: context.propertyId,
              alertType: params.alertType || "expiry",
              severity: params.severity || "medium",
              title: params.alertTitle,
              description: params.alertDescription || params.alertTitle,
            }, context)
          } else {
            reasoning.push("Alert details required to create compliance alert")
          }
          break

        case "generate_report":
          result = await this.executeTool("generate_compliance_report", {
            propertyId: context.propertyId,
            reportType: params.reportType || "summary",
            period: params.period || "quarterly",
          }, context)
          break

        default:
          // Default to comprehensive compliance check
          reasoning.push("Performing comprehensive compliance check")

          const statusResult = await this.executeTool("get_compliance_status", {
            propertyId: context.propertyId,
            includeExpired: true,
          }, context)

          const deadlinesResult = await this.executeTool("track_filing_deadlines", {
            propertyId: context.propertyId,
            filingType: "all",
          }, context)

          toolResults.push(statusResult, deadlinesResult)

          result = {
            toolName: "comprehensive_compliance_check",
            success: true,
            data: {
              status: statusResult.data,
              deadlines: deadlinesResult.data,
              summary: "Comprehensive compliance check complete",
            },
          }
      }

      if (result) {
        toolResults.push(result)
        observations.push(`Tool execution complete: ${result.toolName}`)
      }

      // Calculate confidence based on compliance status
      let confidence = 0.9
      if (result?.success && result.data) {
        const data = result.data as Record<string, unknown>
        const summary = data.summary as Record<string, unknown> | undefined
        if (summary?.overdue || summary?.expired) {
          confidence = 0.75 // Issues found, need human review
        }
        if ((data.status as string) === "non_compliant") {
          confidence = 0.7 // Serious issues
        }
      }

      // Generate response
      const response = this.generateResponse(result, intent, reasoning)

      return {
        message: response,
        confidence,
        reasoning,
        observations,
        toolResults,
        requiresApproval: confidence < (this.config.confidenceThreshold || 0.7),
        suggestedActions: this.getSuggestedActions(result, intent),
        metadata: {
          intent,
          processingTimeMs: Date.now() - startTime,
          toolsUsed: toolResults.map(tr => tr.toolName),
        },
      }
    } catch (error) {
      observations.push(`Error during processing: ${error instanceof Error ? error.message : "Unknown error"}`)

      return {
        message: "I encountered an issue while checking compliance data. Please try again or contact support.",
        confidence: 0,
        reasoning,
        observations,
        toolResults,
        requiresApproval: false,
        suggestedActions: ["Retry the request", "Check system status"],
        metadata: {
          error: true,
          processingTimeMs: Date.now() - startTime,
        },
      }
    }
  }

  private detectIntent(input: string): string {
    const inputLower = input.toLowerCase()

    if (inputLower.includes("status") || inputLower.includes("overview") || inputLower.includes("check compliance")) {
      return "compliance_status"
    }
    if (inputLower.includes("expir") || inputLower.includes("document") || inputLower.includes("certificate")) {
      return "document_expiry"
    }
    if (inputLower.includes("filing") || inputLower.includes("deadline") || inputLower.includes("gst") || inputLower.includes("tax")) {
      return "filing_deadlines"
    }
    if (inputLower.includes("alert") || inputLower.includes("notify") || inputLower.includes("escalate")) {
      return "create_alert"
    }
    if (inputLower.includes("report") || inputLower.includes("summary") || inputLower.includes("audit")) {
      return "generate_report"
    }

    return "comprehensive"
  }

  private extractParams(input: string): Record<string, unknown> {
    const params: Record<string, unknown> = {}

    // Extract days
    const daysMatch = input.match(/(\d+)\s*days?/i)
    if (daysMatch) params.daysAhead = parseInt(daysMatch[1])

    // Extract filing type
    if (input.toLowerCase().includes("gst")) params.filingType = "gst"
    if (input.toLowerCase().includes("property tax")) params.filingType = "property_tax"

    // Extract period
    if (input.toLowerCase().includes("month")) params.period = "monthly"
    if (input.toLowerCase().includes("quarter")) params.period = "quarterly"
    if (input.toLowerCase().includes("year")) params.period = "yearly"

    // Extract report type
    if (input.toLowerCase().includes("detail")) params.reportType = "detailed"
    if (input.toLowerCase().includes("audit")) params.reportType = "audit"

    // Extract severity
    if (input.toLowerCase().includes("critical")) params.severity = "critical"
    if (input.toLowerCase().includes("high")) params.severity = "high"
    if (input.toLowerCase().includes("urgent")) params.severity = "high"

    return params
  }

  private generateResponse(
    result: ToolResult | null,
    intent: string,
    reasoning: string[]
  ): string {
    if (!result?.success) {
      return "I wasn't able to complete the compliance check. Please provide more details or try again."
    }

    const data = result.data as Record<string, unknown>

    switch (intent) {
      case "compliance_status":
        const summary = data.summary as Record<string, number>
        return `**Compliance Status Report**\n\nOverall Status: ${data.status === "compliant" ? "✅ Compliant" : data.status === "at_risk" ? "⚠️ At Risk" : "❌ Non-Compliant"}\n\nCompliance Rate: ${summary?.complianceRate || 0}%\n\n- Expired: ${summary?.expired || 0}\n- Critical (≤7 days): ${summary?.critical || 0}\n- High (≤30 days): ${summary?.high || 0}\n- Compliant: ${summary?.compliant || 0}\n\n${data.recommendation}`

      case "document_expiry":
        const expired = data.expired as Record<string, unknown>
        const urgent = data.urgent as Record<string, unknown>
        return `**Document Expiry Check**\n\n${data.summary}\n\n⛔ Expired: ${(expired?.count as number) || 0} items\n🔴 Urgent (≤7 days): ${(urgent?.count as number) || 0} items\n\n${(expired?.count as number) > 0 ? "Immediate action required for expired documents." : "No immediate action required."}`

      case "filing_deadlines":
        const alert = data.alert as string
        return `**Filing Deadlines Tracker**\n\n${alert}\n\nUpcoming deadlines:\n${((data.deadlines as { type: string; deadline: string; daysRemaining: number; status: string }[]) || []).map(d => `- ${d.type}: ${d.deadline} (${d.daysRemaining} days - ${d.status})`).join("\n")}`

      case "create_alert":
        return `**Compliance Alert Created**\n\n${data.message}\n\nEscalation Path: ${((data.escalationPath as string[]) || []).join(" → ")}`

      case "generate_report":
        const reportSummary = data.summary as Record<string, number>
        return `**Compliance Report Generated**\n\nReport ID: ${data.reportId}\n\nCompliance Rate: ${reportSummary?.complianceRate || 0}%\n- Total Requirements: ${reportSummary?.totalRequirements || 0}\n- Compliant: ${reportSummary?.compliant || 0}\n- Non-Compliant: ${reportSummary?.nonCompliant || 0}\n\nRecommendations:\n${((data.recommendations as string[]) || []).map(r => `• ${r}`).join("\n")}`

      default:
        return `**Comprehensive Compliance Check Complete**\n\nI've reviewed compliance status and filing deadlines for your property. Would you like details on any specific area?`
    }
  }

  private getSuggestedActions(result: ToolResult | null, intent: string): string[] {
    if (!result?.success) {
      return ["Retry compliance check", "Contact support"]
    }

    const actions: string[] = []
    const data = result.data as Record<string, unknown>
    const summary = data.summary as Record<string, number> | undefined

    if ((summary?.expired as number) > 0 || (summary?.overdue as number) > 0) {
      actions.push("Address expired compliance items")
      actions.push("Contact vendors for renewals")
    }

    if ((summary?.critical as number) > 0) {
      actions.push("Initiate renewal processes")
      actions.push("Schedule urgent follow-ups")
    }

    if (data.status === "non_compliant") {
      actions.push("Escalate to compliance officer")
      actions.push("Review with legal team")
    }

    if (actions.length === 0) {
      actions.push("Schedule next compliance review")
      actions.push("Generate detailed report")
    }

    return actions
  }
}

// Export singleton instance
export const complianceMonitorAgent = new ComplianceMonitorAgent()

