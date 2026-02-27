// @ts-nocheck - Temporary: Schema alignment needed
import { BaseAgent } from "../orchestrator"
import { spaceOptimizationTools } from "../tools/space-optimization"
import { SPACE_OPTIMIZATION_SYSTEM_PROMPT } from "../prompts/space-optimization"
import type { AgentConfig, AgentContext, AgentResponse, ToolResult } from "@/types/agents"

export class SpaceOptimizationAgent extends BaseAgent {
  constructor() {
    const config: AgentConfig = {
      id: "space-optimizer",
      name: "Space Optimization Strategist",
      persona: "space_optimizer",
      description: "Analyzes tenant performance, space utilization, and recommends strategic decisions",
      capabilities: [
        "Tenant performance analysis",
        "Space utilization optimization",
        "Market rate comparison",
        "Lease renewal recommendations",
        "Tenant mix analysis",
      ],
      systemPrompt: SPACE_OPTIMIZATION_SYSTEM_PROMPT,
      tools: spaceOptimizationTools,
      maxIterations: 5,
      confidenceThreshold: 0.7,
    }
    super(config)
  }

  async process(input: string, context: AgentContext): Promise<AgentResponse> {
    const startTime = Date.now()
    const observations: string[] = []
    const reasoning: string[] = []
    const toolResults: ToolResult[] = []

    observations.push(`Received space optimization query: "${input.substring(0, 100)}..."`)
    reasoning.push("Analyzing request to determine appropriate optimization action")

    const intent = this.detectIntent(input)
    reasoning.push(`Detected intent: ${intent}`)

    try {
      let result: ToolResult | null = null
      const params = this.extractParams(input)

      switch (intent) {
        case "tenant_performance":
          result = await this.executeTool("analyze_tenant_performance", {
            propertyId: context.propertyId,
            category: params.category,
            period: params.period || "quarterly",
          }, context)
          break

        case "space_utilization":
          result = await this.executeTool("get_space_utilization", {
            propertyId: context.propertyId,
            floor: params.floor,
          }, context)
          break

        case "market_comparison":
          result = await this.executeTool("compare_market_rates", {
            propertyId: context.propertyId,
            category: params.category,
          }, context)
          break

        case "lease_recommendation":
          if (params.tenantId) {
            result = await this.executeTool("generate_lease_recommendation", {
              tenantId: params.tenantId,
              propertyId: context.propertyId,
            }, context)
          } else {
            reasoning.push("Tenant ID required for lease recommendation")
          }
          break

        case "tenant_mix":
          result = await this.executeTool("get_tenant_mix_analysis", {
            propertyId: context.propertyId,
          }, context)
          break

        default:
          // Default to comprehensive analysis
          reasoning.push("Performing comprehensive space analysis")
          
          const performanceResult = await this.executeTool("analyze_tenant_performance", {
            propertyId: context.propertyId,
            period: "quarterly",
          }, context)
          
          const utilizationResult = await this.executeTool("get_space_utilization", {
            propertyId: context.propertyId,
          }, context)

          const mixResult = await this.executeTool("get_tenant_mix_analysis", {
            propertyId: context.propertyId,
          }, context)

          toolResults.push(performanceResult, utilizationResult, mixResult)

          result = {
            toolName: "comprehensive_analysis",
            success: true,
            data: {
              performance: performanceResult.data,
              utilization: utilizationResult.data,
              tenantMix: mixResult.data,
              summary: "Comprehensive space analysis complete",
            },
          }
      }

      if (result) {
        toolResults.push(result)
        observations.push(`Tool execution complete: ${result.toolName}`)
      }

      // Calculate confidence based on data quality
      let confidence = 0.85
      if (result?.success && result.data) {
        const data = result.data as Record<string, unknown>
        if (data.recommendation || data.recommendations) {
          confidence = 0.8 // Recommendations need approval
        }
        if ((data as { impact?: string }).impact === "high") {
          confidence = 0.7 // High impact needs more scrutiny
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
        message: "I encountered an issue while analyzing the space optimization data. Please try again or contact support if the issue persists.",
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

    if (inputLower.includes("performance") || inputLower.includes("revenue") || inputLower.includes("underperforming")) {
      return "tenant_performance"
    }
    if (inputLower.includes("utilization") || inputLower.includes("occupancy") || inputLower.includes("vacant")) {
      return "space_utilization"
    }
    if (inputLower.includes("market") || inputLower.includes("rate") || inputLower.includes("benchmark")) {
      return "market_comparison"
    }
    if (inputLower.includes("lease") || inputLower.includes("renew") || inputLower.includes("expir")) {
      return "lease_recommendation"
    }
    if (inputLower.includes("mix") || inputLower.includes("category") || inputLower.includes("distribution")) {
      return "tenant_mix"
    }

    return "comprehensive"
  }

  private extractParams(input: string): Record<string, unknown> {
    const params: Record<string, unknown> = {}

    // Extract category
    const categories = ["fashion", "food_beverage", "electronics", "entertainment", "services"]
    for (const cat of categories) {
      if (input.toLowerCase().includes(cat.replace("_", " "))) {
        params.category = cat
        break
      }
    }

    // Extract period
    if (input.toLowerCase().includes("month")) params.period = "monthly"
    if (input.toLowerCase().includes("quarter")) params.period = "quarterly"
    if (input.toLowerCase().includes("year")) params.period = "yearly"

    // Extract floor
    const floorMatch = input.match(/floor\s*(\d+)/i)
    if (floorMatch) params.floor = parseInt(floorMatch[1])

    // Extract tenant ID (UUID pattern)
    const uuidMatch = input.match(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i)
    if (uuidMatch) params.tenantId = uuidMatch[0]

    return params
  }

  private generateResponse(
    result: ToolResult | null,
    intent: string,
    reasoning: string[]
  ): string {
    if (!result?.success) {
      return "I wasn't able to complete the analysis. Please provide more specific details or try again."
    }

    const data = result.data as Record<string, unknown>

    switch (intent) {
      case "tenant_performance":
        return `**Tenant Performance Analysis**\n\n${data.summary}\n\nKey findings:\n- Above average: ${data.aboveAverage} tenants\n- Need attention: ${data.belowAverage} tenants\n\nI can provide detailed recommendations for any specific tenant.`

      case "space_utilization":
        return `**Space Utilization Report**\n\nCurrent utilization: ${data.utilizationRate}%\nStatus: ${data.status}\n\nVacant area: ${data.vacantArea} sq ft\nActive leases: ${data.activeLeaseCount}\n\n${data.recommendation}`

      case "market_comparison":
        return `**Market Rate Comparison**\n\n${data.summary}\n\n${(data.opportunities as unknown[])?.length > 0 ? "Opportunities identified for rate adjustment." : "Current rates are competitive."}`

      case "lease_recommendation":
        const rec = data as { tenantName?: string; recommendation?: string; reasoning?: string[]; suggestedActions?: string[] }
        return `**Lease Recommendation: ${rec.tenantName}**\n\nRecommendation: ${rec.recommendation?.toUpperCase()}\n\nReasoning:\n${(rec.reasoning as string[])?.map(r => `- ${r}`).join("\n")}\n\nSuggested Actions:\n${(rec.suggestedActions as string[])?.map(a => `- ${a}`).join("\n")}`

      case "tenant_mix":
        return `**Tenant Mix Analysis**\n\n${data.summary}\n\nMix Score: ${data.mixScore}/100\n\n${(data.recommendations as unknown[])?.length > 0 ? "Adjustments recommended for optimal category distribution." : "Current mix is well-balanced."}`

      default:
        return `**Comprehensive Space Analysis Complete**\n\nI've analyzed tenant performance, space utilization, and tenant mix for your property. Would you like me to dive deeper into any specific area?`
    }
  }

  private getSuggestedActions(result: ToolResult | null, intent: string): string[] {
    if (!result?.success) {
      return ["Retry analysis", "Contact support"]
    }

    const actions: string[] = []
    const data = result.data as Record<string, unknown>

    switch (intent) {
      case "tenant_performance":
        if ((data.belowAverage as number) > 0) {
          actions.push("Review underperforming tenants")
          actions.push("Generate lease recommendations")
        }
        actions.push("Compare with market rates")
        break

      case "space_utilization":
        if ((data.utilizationRate as number) < 90) {
          actions.push("Market vacant spaces")
          actions.push("Review pricing strategy")
        }
        break

      case "lease_recommendation":
        if (data.recommendation === "non_renew") {
          actions.push("Prepare non-renewal notice")
          actions.push("Start space remarketing")
        } else if (data.recommendation === "negotiate") {
          actions.push("Schedule tenant meeting")
          actions.push("Prepare negotiation terms")
        }
        break

      default:
        actions.push("Review detailed analysis")
        actions.push("Export report")
    }

    return actions
  }
}

// Export singleton instance
export const spaceOptimizationAgent = new SpaceOptimizationAgent()

