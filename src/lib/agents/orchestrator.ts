import Anthropic from "@anthropic-ai/sdk"
import { db } from "@/lib/db"
import { agentActions, agentDecisions, agents } from "@/lib/db/schema"
import { eq } from "drizzle-orm"
import type {
  AgentConfig,
  AgentContext,
  AgentDecision,
  Tool,
  ToolCall,
  ToolResult,
  AgentType,
} from "@/types/agents"

// Only initialise the Anthropic client when a real key is present.
// Without a key the SDK throws at construction time.
const ANTHROPIC_KEY = process.env.ANTHROPIC_API_KEY
const isAnthropicConfigured =
  !!ANTHROPIC_KEY && ANTHROPIC_KEY.startsWith("sk-ant-") && ANTHROPIC_KEY.length > 20

let anthropic: Anthropic | null = null
if (isAnthropicConfigured) {
  anthropic = new Anthropic({ apiKey: ANTHROPIC_KEY })
}

interface OrchestratorConfig {
  maxIterations: number
  defaultModel: string
  confidenceThreshold: number
}

const DEFAULT_CONFIG: OrchestratorConfig = {
  maxIterations: 10,
  defaultModel: "claude-sonnet-4-5-20250929",
  confidenceThreshold: 0.7,
}

export class AgentOrchestrator {
  private config: OrchestratorConfig
  private agents: Map<AgentType, AgentConfig> = new Map()

  constructor(config: Partial<OrchestratorConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config }
  }

  registerAgent(agent: AgentConfig) {
    this.agents.set(agent.type as AgentType, agent)
  }

  async executeAgent(
    agentType: AgentType,
    context: AgentContext
  ): Promise<AgentDecision> {
    const startTime = Date.now()
    const agent = this.agents.get(agentType)

    if (!agent) {
      throw new Error(`Agent ${agentType} not registered`)
    }

    // Return a mock decision when no Anthropic API key is configured (local dev)
    if (!anthropic) {
      const mockDecision: AgentDecision = {
        id: crypto.randomUUID(),
        agentId: agent.id,
        action: "mock_response",
        reasoning:
          "AI agent is running in mock mode — no ANTHROPIC_API_KEY is configured. " +
          "Set a real key in .env.local to enable live AI responses.",
        confidence: 0.5,
        requiresApproval: true,
        data: { mock: true, agentType, trigger: context.triggerData },
        alternatives: [],
        metadata: { tokensUsed: 0, latencyMs: Date.now() - startTime },
      }
      await this.storeDecision(agent, mockDecision, context)
      return mockDecision
    }

    const toolCalls: ToolCall[] = []
    let totalTokens = 0

    // Build messages array
    const messages: Anthropic.MessageParam[] = []

    // Add conversation history if available
    if (context.conversationHistory) {
      for (const msg of context.conversationHistory) {
        messages.push({
          role: msg.role,
          content: msg.content,
        })
      }
    }

    // Add trigger data as user message if it's a new interaction
    if (context.triggerType === "chat_message" && context.triggerData.message) {
      messages.push({
        role: "user",
        content: context.triggerData.message as string,
      })
    } else if (context.triggerType === "event" || context.triggerType === "scheduled") {
      messages.push({
        role: "user",
        content: `Event triggered: ${JSON.stringify(context.triggerData)}`,
      })
    }

    // Convert tools to Anthropic format
    const anthropicTools: Anthropic.Tool[] = agent.tools.map((tool) => ({
      name: tool.name,
      description: tool.description,
      input_schema: {
        type: "object" as const,
        properties: this.zodToJsonSchema(tool.parameters),
        required: Object.keys(tool.parameters.shape),
      },
    }))

    let response: Anthropic.Message
    let iterations = 0
    let finalContent = ""

    // Iterative tool calling loop
    while (iterations < this.config.maxIterations) {
      iterations++

      response = await anthropic!.messages.create({
        model: agent.model || this.config.defaultModel,
        max_tokens: agent.settings?.maxTokens || 4096,
        temperature: agent.settings?.temperature || 0.7,
        system: agent.systemPrompt,
        tools: anthropicTools,
        messages,
      })

      totalTokens += response.usage.input_tokens + response.usage.output_tokens

      // Process response
      const assistantContent: Anthropic.ContentBlock[] = []
      let hasToolUse = false

      for (const block of response.content) {
        if (block.type === "text") {
          finalContent = block.text
          assistantContent.push(block)
        } else if (block.type === "tool_use") {
          hasToolUse = true
          assistantContent.push(block)

          // Execute tool
          const tool = agent.tools.find((t) => t.name === block.name)
          if (tool) {
            const toolStartTime = Date.now()
            let result: ToolResult

            try {
              result = await tool.handler(block.input, context)
            } catch (error) {
              result = {
                success: false,
                error: error instanceof Error ? error.message : "Unknown error",
              }
            }

            toolCalls.push({
              name: block.name,
              input: block.input as Record<string, unknown>,
              output: result.data,
              success: result.success,
              latencyMs: Date.now() - toolStartTime,
            })

            // Add tool result to messages
            messages.push({ role: "assistant", content: assistantContent })
            messages.push({
              role: "user",
              content: [
                {
                  type: "tool_result",
                  tool_use_id: block.id,
                  content: JSON.stringify(result),
                },
              ],
            })
          }
        }
      }

      // If no tool use, we're done
      if (!hasToolUse || response.stop_reason === "end_turn") {
        break
      }
    }

    // Calculate confidence based on tool success rate and model confidence
    const successfulTools = toolCalls.filter((t) => t.success).length
    const toolConfidence = toolCalls.length > 0 ? successfulTools / toolCalls.length : 1
    const confidence = Math.min(toolConfidence * 0.9 + 0.1, 1) // Base 10% + tool success

    // Determine if approval is required
    const requiresApproval = this.shouldRequireApproval(
      agent,
      confidence,
      toolCalls
    )

    // Create decision record
    const decision: AgentDecision = {
      id: crypto.randomUUID(),
      agentId: agent.id,
      action: this.extractAction(finalContent, toolCalls),
      reasoning: finalContent,
      confidence,
      requiresApproval,
      data: {
        toolCalls,
        response: finalContent,
      },
      alternatives: [],
      metadata: {
        toolCalls,
        tokensUsed: totalTokens,
        latencyMs: Date.now() - startTime,
      },
    }

    // Store decision in database
    await this.storeDecision(agent, decision, context)

    return decision
  }

  private shouldRequireApproval(
    agent: AgentConfig,
    confidence: number,
    toolCalls: ToolCall[]
  ): boolean {
    // Low confidence requires approval
    if (confidence < (agent.settings?.confidenceThreshold || this.config.confidenceThreshold)) {
      return true
    }

    // Check if any tool call requires approval
    const requiresApprovalActions = agent.settings?.requiresApprovalActions || []
    for (const call of toolCalls) {
      if (requiresApprovalActions.includes(call.name)) {
        return true
      }
    }

    return false
  }

  private extractAction(content: string, toolCalls: ToolCall[]): string {
    // If we have tool calls, use the last successful one as the action
    const successfulCalls = toolCalls.filter((t) => t.success)
    if (successfulCalls.length > 0) {
      return successfulCalls[successfulCalls.length - 1].name
    }

    // Otherwise, try to extract from content
    if (content.includes("work order")) return "work_order_created"
    if (content.includes("invoice")) return "invoice_processed"
    if (content.includes("maintenance")) return "maintenance_scheduled"
    if (content.includes("lease")) return "lease_recommendation"

    return "response_generated"
  }

  private async storeDecision(
    agent: AgentConfig,
    decision: AgentDecision,
    context: AgentContext
  ) {
    await db.insert(agentDecisions).values({
      agentId: agent.id,
      decisionType: decision.action,
      context: context,
      reasoning: decision.reasoning,
      recommendation: decision.data,
      confidence: decision.confidence.toString(),
      alternatives: decision.alternatives,
      outcome: decision.requiresApproval ? "pending" : "accepted",
      metadata: {
        ...decision.metadata,
        propertyId: context.propertyId,
        requiresApproval: decision.requiresApproval,
      },
    })

    // Also create an action record for tracking
    await db.insert(agentActions).values({
      id: crypto.randomUUID(),
      agentId: agent.id,
      propertyId: context.propertyId,
      actionType: decision.action,
      trigger: context.triggerType,
      inputData: context.triggerData,
      outputData: decision.data,
      confidence: decision.confidence.toString(),
      status: decision.requiresApproval ? "pending" : "executed",
    })
  }

  async approveDecision(decisionId: string, userId: string): Promise<void> {
    await db
      .update(agentDecisions)
      .set({
        outcome: "accepted",
        humanFeedback: `Approved by ${userId} at ${new Date().toISOString()}`,
      })
      .where(eq(agentDecisions.id, decisionId))
  }

  async rejectDecision(decisionId: string, userId: string, reason?: string): Promise<void> {
    await db
      .update(agentDecisions)
      .set({
        outcome: "rejected",
        humanFeedback: `Rejected by ${userId} at ${new Date().toISOString()}${reason ? `: ${reason}` : ""}`,
        metadata: { rejectionReason: reason },
      })
      .where(eq(agentDecisions.id, decisionId))
  }

  async recordLearning(
    agentId: string,
    propertyId: string,
    learningType: string,
    pattern: Record<string, unknown>,
    outcome: Record<string, unknown>
  ): Promise<void> {
    // TODO: Implement agent learning storage when agentLearning table is added
    console.log("Agent learning recorded:", { agentId, propertyId, learningType, pattern, outcome })
  }

  // Helper to convert Zod schema to JSON Schema (simplified)
  private zodToJsonSchema(schema: Tool["parameters"]): Record<string, unknown> {
    const properties: Record<string, unknown> = {}
    
    for (const [key, value] of Object.entries(schema.shape)) {
      const zodType = value as { _def?: { typeName?: string; description?: string } }
      const typeName = zodType._def?.typeName || "ZodString"
      
      let type = "string"
      if (typeName === "ZodNumber") type = "number"
      if (typeName === "ZodBoolean") type = "boolean"
      if (typeName === "ZodArray") type = "array"
      if (typeName === "ZodObject") type = "object"

      properties[key] = {
        type,
        description: zodType._def?.description || key,
      }
    }

    return properties
  }
}

// Singleton instance
export const orchestrator = new AgentOrchestrator()

// Response type for agent processing
interface AgentProcessResponse {
  agentId?: string
  message: string
  confidence: number
  reasoning?: string[]
  observations?: string[]
  toolResults?: ToolResult[]
  toolsUsed?: (string | { name: string; params?: Record<string, unknown>; result?: ToolResult })[]
  requiresApproval?: boolean
  requiresHumanApproval?: boolean
  suggestedActions?: string[]
  metadata?: Record<string, unknown>
  actions?: unknown[]
  processingTime?: number
}

// Base class for individual agent implementations
export abstract class BaseAgent {
  protected config: AgentConfig
  
  constructor(config: AgentConfig) {
    this.config = config
  }
  
  abstract process(input: string, context: AgentContext): Promise<AgentProcessResponse>
  
  protected async executeTool(
    toolName: string,
    params: Record<string, unknown>,
    context: AgentContext
  ): Promise<ToolResult> {
    const tool = this.config.tools.find(t => t.name === toolName)
    if (!tool) {
      return { success: false, error: `Tool ${toolName} not found` }
    }
    try {
      return await tool.handler(params, context)
    } catch (error) {
      return { 
        success: false, 
        error: error instanceof Error ? error.message : "Tool execution failed" 
      }
    }
  }
}

