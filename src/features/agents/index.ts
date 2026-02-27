// Agent Implementations
export { tenantRelationsAgent } from "./implementations/tenant-relations"
export { operationsCommanderAgent } from "./implementations/operations"
export { financialAnalystAgent } from "./implementations/financial"
export { maintenanceCoordinatorAgent } from "./implementations/maintenance"
export { spaceOptimizationAgent } from "./implementations/space-optimization"
export { complianceMonitorAgent } from "./implementations/compliance"

// Agent Classes (only those with class implementations)
export { FinancialAnalystAgent } from "./implementations/financial"
export { MaintenanceCoordinatorAgent } from "./implementations/maintenance"
export { SpaceOptimizationAgent } from "./implementations/space-optimization"
export { ComplianceMonitorAgent } from "./implementations/compliance"

// Agent Tools
export { tenantRelationsTools } from "./tools/tenant-relations"
export { operationsTools } from "./tools/operations"
export { financialTools } from "./tools/financial"
export { maintenanceTools } from "./tools/maintenance"
export { spaceOptimizationTools } from "./tools/space-optimization"
export { complianceTools } from "./tools/compliance"

// Agent Prompts
export { TENANT_RELATIONS_SYSTEM_PROMPT } from "./prompts/tenant-relations"
export { OPERATIONS_COMMANDER_SYSTEM_PROMPT } from "./prompts/operations"
export { FINANCIAL_ANALYST_SYSTEM_PROMPT } from "./prompts/financial"
export { MAINTENANCE_COORDINATOR_SYSTEM_PROMPT } from "./prompts/maintenance"
export { SPACE_OPTIMIZATION_SYSTEM_PROMPT } from "./prompts/space-optimization"
export { COMPLIANCE_MONITOR_SYSTEM_PROMPT } from "./prompts/compliance"

// Orchestrator
export { BaseAgent, AgentOrchestrator, orchestrator } from "./orchestrator"

// Types
export type {
  AgentConfig,
  AgentContext,
  AgentMessage,
  AgentResponse,
  AgentType,
  Tool,
  ToolResult,
  AgentAction,
} from "@/types/agents"

// Agent Registry
import { tenantRelationsAgent } from "./implementations/tenant-relations"
import { operationsCommanderAgent } from "./implementations/operations"
import { financialAnalystAgent } from "./implementations/financial"
import { maintenanceCoordinatorAgent } from "./implementations/maintenance"
import { spaceOptimizationAgent } from "./implementations/space-optimization"
import { complianceMonitorAgent } from "./implementations/compliance"
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const agentRegistry: Record<string, any> = {
  "tenant-relations": tenantRelationsAgent,
  "operations-commander": operationsCommanderAgent,
  "financial-analyst": financialAnalystAgent,
  "maintenance-coordinator": maintenanceCoordinatorAgent,
  "space-optimizer": spaceOptimizationAgent,
  "compliance-monitor": complianceMonitorAgent,
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function getAgent(agentId: string): any | undefined {
  return agentRegistry[agentId]
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function getAllAgents(): any[] {
  return Object.values(agentRegistry)
}

export const agentMetadata = [
  {
    id: "tenant-relations",
    name: "Tenant Relations Manager",
    type: "tenant_relations",
    description: "Handles tenant communications, requests, and relationship management",
    color: "#10b981",
    icon: "Users",
  },
  {
    id: "operations-commander",
    name: "Operations Commander",
    type: "operations_commander",
    description: "Oversees daily operations, monitors KPIs, and detects anomalies",
    color: "#3b82f6",
    icon: "Activity",
  },
  {
    id: "financial-analyst",
    name: "Financial Analyst",
    type: "financial_analyst",
    description: "Analyzes financial data, predicts payments, and manages collections",
    color: "#f59e0b",
    icon: "DollarSign",
  },
  {
    id: "maintenance-coordinator",
    name: "Maintenance Coordinator",
    type: "maintenance_coordinator",
    description: "Manages work orders, vendors, and preventive maintenance",
    color: "#ef4444",
    icon: "Wrench",
  },
  {
    id: "space-optimizer",
    name: "Space Optimization Strategist",
    type: "space_optimizer",
    description: "Analyzes tenant performance, optimizes space utilization, and recommends lease decisions",
    color: "#8b5cf6",
    icon: "LayoutGrid",
  },
  {
    id: "compliance-monitor",
    name: "Compliance Monitor",
    type: "compliance_monitor",
    description: "Monitors regulatory compliance, tracks deadlines, and ensures documentation standards",
    color: "#64748b",
    icon: "Shield",
  },
]
