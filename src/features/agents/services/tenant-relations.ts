// @ts-nocheck - Temporary: Schema alignment needed
import { orchestrator } from "../orchestrator"
import { tenantRelationsTools } from "../tools/tenant-relations"
import { TENANT_RELATIONS_SYSTEM_PROMPT } from "../prompts/tenant-relations"
import type { AgentConfig, AgentContext, AgentDecision } from "@/types/agents"

export const tenantRelationsAgent: AgentConfig = {
  id: "tenant-relations-001",
  name: "Tenant Relations Manager",
  type: "tenant_relations",
  model: "claude-sonnet-4-5-20250929",
  systemPrompt: TENANT_RELATIONS_SYSTEM_PROMPT,
  tools: tenantRelationsTools,
  settings: {
    temperature: 0.7,
    maxTokens: 4096,
    confidenceThreshold: 0.7,
    requiresApprovalActions: [
      "modify_lease",
      "adjust_rent",
      "terminate_lease",
      "escalate_complaint",
    ],
    maxToolCalls: 5,
  },
}

// Register the agent with the orchestrator
orchestrator.registerAgent(tenantRelationsAgent)

export async function executeTenantRelationsAgent(
  context: AgentContext
): Promise<AgentDecision> {
  return orchestrator.executeAgent("tenant_relations", context)
}

// Helper function to handle tenant chat messages
export async function handleTenantChat(
  propertyId: string,
  tenantId: string,
  message: string,
  conversationHistory?: { role: "user" | "assistant"; content: string; timestamp: Date }[]
): Promise<{
  response: string
  confidence: number
  actionsTaken: string[]
  requiresApproval: boolean
}> {
  const context: AgentContext = {
    propertyId,
    triggerType: "chat_message",
    triggerData: {
      tenantId,
      message,
    },
    conversationHistory,
    metadata: {
      tenantId,
      source: "tenant_portal",
    },
  }

  const decision = await executeTenantRelationsAgent(context)

  return {
    response: decision.reasoning,
    confidence: decision.confidence,
    actionsTaken: decision.metadata.toolCalls.map((tc) => tc.name),
    requiresApproval: decision.requiresApproval,
  }
}

