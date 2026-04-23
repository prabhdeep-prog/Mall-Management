"use client"

import * as React from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { ScrollArea } from "@/components/ui/scroll-area"
import { AgentActivityCard } from "./agent-activity-card"
import { Bot, RefreshCw, Filter, Wifi, WifiOff } from "lucide-react"
import { useAgentActivity, type AgentActivity } from "@/hooks/use-agent-activity"
import type { AgentAction, AgentType } from "@/types/agents"

// Map SSE activities to AgentAction format
function mapActivityToAction(activity: AgentActivity): AgentAction {
  return {
    id: activity.id,
    agentId: activity.agentId,
    agentType: (activity.agentPersona || "operations_commander") as AgentType,
    agentName: activity.agentName,
    actionType: activity.actionType,
    entityType: activity.actionType.includes("work_order") ? "work_order" : 
                activity.actionType.includes("payment") ? "invoice" :
                activity.actionType.includes("maintenance") ? "equipment" : "metrics",
    entityId: activity.id,
    trigger: "Agent autonomous action",
    reasoning: activity.description,
    confidence: activity.confidence,
    status: activity.status as AgentAction["status"],
    requiresApproval: activity.status === "pending",
    createdAt: new Date(activity.timestamp),
    executedAt: activity.status === "executed" ? new Date(activity.timestamp) : undefined,
  }
}

// Demo data for initial display
const demoActions: AgentAction[] = [
  {
    id: "demo-1",
    agentId: "tenant-relations-001",
    agentType: "tenant_relations",
    agentName: "Tenant Relations",
    actionType: "work_order_created",
    entityType: "work_order",
    entityId: "wo-123",
    trigger: "Tenant chat message",
    reasoning: "Tenant reported AC not working in Unit 203. Created work order with high priority due to summer season and store operations impact.",
    confidence: 0.92,
    status: "executed",
    requiresApproval: false,
    executedAt: new Date(Date.now() - 2 * 60 * 1000),
    createdAt: new Date(Date.now() - 2 * 60 * 1000),
  },
  {
    id: "demo-2",
    agentId: "financial-analyst-001",
    agentType: "financial_analyst",
    agentName: "Financial Analyst",
    actionType: "payment_reminder_sent",
    entityType: "invoice",
    entityId: "inv-456",
    trigger: "Invoice overdue by 5 days",
    reasoning: "Payment predicted to be delayed based on historical pattern. Sent gentle reminder with 89% confidence that payment will be received within 3 days.",
    confidence: 0.89,
    status: "executed",
    requiresApproval: false,
    executedAt: new Date(Date.now() - 15 * 60 * 1000),
    createdAt: new Date(Date.now() - 15 * 60 * 1000),
  },
  {
    id: "demo-3",
    agentId: "maintenance-coordinator-001",
    agentType: "maintenance_coordinator",
    agentName: "Maintenance Coordinator",
    actionType: "preventive_maintenance_scheduled",
    entityType: "equipment",
    entityId: "eq-789",
    trigger: "Equipment health prediction",
    reasoning: "HVAC Unit #4 showing 73% health score. Historical data suggests failure within 2 weeks. Scheduling preventive maintenance during low-traffic hours.",
    confidence: 0.73,
    status: "pending",
    requiresApproval: true,
    createdAt: new Date(Date.now() - 45 * 60 * 1000),
  },
  {
    id: "demo-4",
    agentId: "operations-commander-001",
    agentType: "operations_commander",
    agentName: "Operations Commander",
    actionType: "anomaly_detected",
    entityType: "metrics",
    entityId: "anomaly-101",
    trigger: "Daily metrics analysis",
    reasoning: "Foot traffic 23% below average for Tuesday. Investigating potential causes - checking for nearby events, weather impact, and competitor activity.",
    confidence: 0.85,
    status: "executed",
    requiresApproval: false,
    executedAt: new Date(Date.now() - 1 * 60 * 60 * 1000),
    createdAt: new Date(Date.now() - 1 * 60 * 60 * 1000),
  },
  {
    id: "demo-5",
    agentId: "space-optimizer-001",
    agentType: "space_optimizer",
    agentName: "Space Optimizer",
    actionType: "lease_recommendation",
    entityType: "lease",
    entityId: "lease-321",
    trigger: "Lease expiring in 60 days",
    reasoning: "Electronics Store performance at ₹800/sqft (mall avg ₹1,200). Recommend non-renewal and replacement with F&B tenant. Projected revenue increase: ₹70,000/month.",
    confidence: 0.68,
    status: "pending",
    requiresApproval: true,
    createdAt: new Date(Date.now() - 2 * 60 * 60 * 1000),
  },
]

interface AgentActivityFeedProps {
  propertyId?: string
}

export function AgentActivityFeed({ propertyId }: AgentActivityFeedProps) {
  const [actions, setActions] = React.useState<AgentAction[]>(demoActions)
  const [isRefreshing, setIsRefreshing] = React.useState(false)
  const [filterStatus, setFilterStatus] = React.useState<string>("all")
  const [showFilterMenu, setShowFilterMenu] = React.useState(false)
  
  const { activities, isConnected, error, clearActivities, reconnect } = useAgentActivity({
    propertyId,
    enabled: true,
    onActivity: (newActivities) => {
      // Add new activities from SSE
      setActions((prev) => {
        const mappedActivities = newActivities.map(mapActivityToAction)
        const existingIds = new Set(prev.map(a => a.id))
        const uniqueNew = mappedActivities.filter(a => !existingIds.has(a.id))
        return [...uniqueNew, ...prev].slice(0, 50)
      })
    },
  })

  const pendingCount = actions.filter(a => a.status === "pending").length
  
  // Filter actions based on selected status
  const filteredActions = filterStatus === "all" 
    ? actions 
    : actions.filter(a => a.status === filterStatus)

  const handleRefresh = async () => {
    setIsRefreshing(true)
    // Reconnect SSE and refresh data
    reconnect()
    await new Promise(resolve => setTimeout(resolve, 1000))
    setIsRefreshing(false)
  }

  const handleApprove = async (actionId: string) => {
    setActions(prev =>
      prev.map(action =>
        action.id === actionId
          ? { ...action, status: "approved", approvedAt: new Date() }
          : action
      )
    )
    // Send approval to backend API
    try {
      await fetch(`/api/agents/actions/${actionId}/approve`, {
        method: "POST",
      })
    } catch (error) {
      console.error("Failed to approve action:", error)
    }
  }

  const handleReject = async (actionId: string) => {
    setActions(prev =>
      prev.map(action =>
        action.id === actionId ? { ...action, status: "rejected" } : action
      )
    )
    // Send rejection to backend API
    try {
      await fetch(`/api/agents/actions/${actionId}/reject`, {
        method: "POST",
      })
    } catch (error) {
      console.error("Failed to reject action:", error)
    }
  }

  return (
    <Card className="flex flex-col">
      <CardHeader className="flex-row items-center justify-between space-y-0 pb-4">
        <div className="flex items-center gap-3">
          <CardTitle className="flex items-center gap-2">
            <Bot className="h-5 w-5 text-primary" />
            Agent Activity
          </CardTitle>
          {pendingCount > 0 && (
            <Badge variant="warning">{pendingCount} Pending</Badge>
          )}
          <div className="flex items-center gap-1 text-xs">
            {isConnected ? (
              <>
                <Wifi className="h-3 w-3 text-green-500 dark:text-green-400" />
                <span className="text-green-600 dark:text-green-400">Live</span>
              </>
            ) : (
              <>
                <WifiOff className="h-3 w-3 text-muted-foreground" />
                <span className="text-muted-foreground">Offline</span>
              </>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <div className="relative">
            <Button 
              variant="outline" 
              size="sm" 
              className="gap-2"
              onClick={() => setShowFilterMenu(!showFilterMenu)}
            >
              <Filter className="h-4 w-4" />
              Filter
              {filterStatus !== "all" && (
                <Badge variant="secondary" className="ml-1 text-[10px]">
                  {filterStatus}
                </Badge>
              )}
            </Button>
            {showFilterMenu && (
              <div className="absolute right-0 top-full mt-1 z-50 bg-background border rounded-md shadow-lg p-1 min-w-[120px]">
                {["all", "pending", "executed", "approved", "rejected"].map((status) => (
                  <button
                    key={status}
                    className={`w-full text-left px-3 py-1.5 text-sm rounded hover:bg-muted ${
                      filterStatus === status ? "bg-muted font-medium" : ""
                    }`}
                    onClick={() => {
                      setFilterStatus(status)
                      setShowFilterMenu(false)
                    }}
                  >
                    {status.charAt(0).toUpperCase() + status.slice(1)}
                  </button>
                ))}
              </div>
            )}
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={handleRefresh}
            disabled={isRefreshing}
            className="gap-2"
          >
            <RefreshCw className={`h-4 w-4 ${isRefreshing ? "animate-spin" : ""}`} />
            Refresh
          </Button>
        </div>
      </CardHeader>
      <CardContent className="flex-1 p-0">
        {error && (
          <div className="mx-6 mb-4 rounded-lg bg-amber-50 px-4 py-2 text-sm text-amber-700 dark:bg-amber-950/20 dark:text-amber-400">
            {error}. <button onClick={reconnect} className="underline">Reconnect</button>
          </div>
        )}
        <ScrollArea className="h-[500px] px-6 pb-6">
          <div className="space-y-4">
            {filteredActions.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 text-center text-muted-foreground">
                <Bot className="mb-4 h-12 w-12 opacity-50" />
                <p>No agent activity {filterStatus !== "all" ? `with status "${filterStatus}"` : "yet"}</p>
                <p className="text-sm">
                  {filterStatus !== "all" 
                    ? "Try changing the filter" 
                    : "Agents will appear here as they take actions"}
                </p>
              </div>
            ) : (
              filteredActions.map((action) => (
                <AgentActivityCard
                  key={action.id}
                  action={action}
                  onApprove={handleApprove}
                  onReject={handleReject}
                />
              ))
            )}
          </div>
        </ScrollArea>
      </CardContent>
    </Card>
  )
}
