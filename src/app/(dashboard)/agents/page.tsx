"use client"

import * as React from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { AgentActivityFeed } from "@/components/agents/agent-activity-feed"
import {
  Bot,
  Activity,
  Users,
  DollarSign,
  Wrench,
  LayoutGrid,
  Shield,
  TrendingUp,
  CheckCircle2,
  Clock,
  AlertCircle,
  Settings,
  Pause,
  RefreshCw,
  Sparkles,
} from "lucide-react"
import { cn } from "@/lib/utils"

// ── Types ────────────────────────────────────────────────────────────────────

type AgentStatus = "active" | "paused" | "training"
type AgentAccent = "blue" | "emerald" | "amber" | "red" | "purple" | "slate"

interface AgentStats {
  id:          string
  name:        string
  type:        string
  description: string
  status:      AgentStatus
  icon:        React.ElementType
  accent:      AgentAccent
  stats: {
    actionsToday:     number
    pendingApprovals: number
    successRate:      number
    avgConfidence:    number
  }
}

// ── Accent tokens ────────────────────────────────────────────────────────────
// Theme-aware: work in both light and dark mode without hardcoded whites.

const accentTile: Record<AgentAccent, string> = {
  blue:    "bg-blue-500/10 text-blue-600 dark:bg-blue-500/15 dark:text-blue-400",
  emerald: "bg-emerald-500/10 text-emerald-600 dark:bg-emerald-500/15 dark:text-emerald-400",
  amber:   "bg-amber-500/10 text-amber-600 dark:bg-amber-500/15 dark:text-amber-400",
  red:     "bg-red-500/10 text-red-600 dark:bg-red-500/15 dark:text-red-400",
  purple:  "bg-purple-500/10 text-purple-600 dark:bg-purple-500/15 dark:text-purple-400",
  slate:   "bg-slate-500/10 text-slate-600 dark:bg-slate-500/15 dark:text-slate-300",
}

const accentBar: Record<AgentAccent, string> = {
  blue:    "bg-blue-500 dark:bg-blue-400",
  emerald: "bg-emerald-500 dark:bg-emerald-400",
  amber:   "bg-amber-500 dark:bg-amber-400",
  red:     "bg-red-500 dark:bg-red-400",
  purple:  "bg-purple-500 dark:bg-purple-400",
  slate:   "bg-slate-500 dark:bg-slate-400",
}

// ── Data ─────────────────────────────────────────────────────────────────────

const agentData: AgentStats[] = [
  {
    id:          "operations-commander",
    name:        "Operations Commander",
    type:        "operations_commander",
    description: "Monitors operations, detects anomalies, coordinates agents",
    status:      "active",
    icon:        Activity,
    accent:      "blue",
    stats: { actionsToday: 45,  pendingApprovals: 2, successRate: 94.5, avgConfidence: 0.87 },
  },
  {
    id:          "tenant-relations",
    name:        "Tenant Relations Manager",
    type:        "tenant_relations",
    description: "Handles tenant queries, processes requests, manages communications",
    status:      "active",
    icon:        Users,
    accent:      "emerald",
    stats: { actionsToday: 127, pendingApprovals: 0, successRate: 92.3, avgConfidence: 0.89 },
  },
  {
    id:          "financial-analyst",
    name:        "Financial Analyst",
    type:        "financial_analyst",
    description: "Predicts payments, manages collections, analyzes finances",
    status:      "active",
    icon:        DollarSign,
    accent:      "amber",
    stats: { actionsToday: 38,  pendingApprovals: 3, successRate: 91.2, avgConfidence: 0.85 },
  },
  {
    id:          "maintenance-coordinator",
    name:        "Maintenance Coordinator",
    type:        "maintenance_coordinator",
    description: "Schedules maintenance, assigns vendors, predicts failures",
    status:      "active",
    icon:        Wrench,
    accent:      "red",
    stats: { actionsToday: 23,  pendingApprovals: 1, successRate: 88.7, avgConfidence: 0.78 },
  },
  {
    id:          "space-optimizer",
    name:        "Space Optimization Strategist",
    type:        "space_optimizer",
    description: "Analyzes tenant mix, recommends lease decisions, optimizes revenue",
    status:      "training",
    icon:        LayoutGrid,
    accent:      "purple",
    stats: { actionsToday: 0, pendingApprovals: 0, successRate: 0, avgConfidence: 0 },
  },
  {
    id:          "compliance-monitor",
    name:        "Compliance Monitor",
    type:        "compliance_monitor",
    description: "Tracks regulatory requirements, monitors deadlines, ensures documentation",
    status:      "training",
    icon:        Shield,
    accent:      "slate",
    stats: { actionsToday: 0, pendingApprovals: 0, successRate: 0, avgConfidence: 0 },
  },
]

// ── Helpers ──────────────────────────────────────────────────────────────────

const statusConfig: Record<AgentStatus, { label: string; className: string; Icon: React.ElementType }> = {
  active: {
    label:     "Active",
    className: "bg-emerald-100 text-emerald-700 border-emerald-200 dark:bg-emerald-500/15 dark:text-emerald-400 dark:border-emerald-500/30",
    Icon:      CheckCircle2,
  },
  paused: {
    label:     "Paused",
    className: "bg-amber-100 text-amber-700 border-amber-200 dark:bg-amber-500/15 dark:text-amber-400 dark:border-amber-500/30",
    Icon:      Pause,
  },
  training: {
    label:     "Training",
    className: "bg-blue-100 text-blue-700 border-blue-200 dark:bg-blue-500/15 dark:text-blue-400 dark:border-blue-500/30",
    Icon:      Clock,
  },
}

// ── Agent Card ───────────────────────────────────────────────────────────────

function AgentCard({ agent }: { agent: AgentStats }) {
  const status = statusConfig[agent.status]
  const StatusIcon = status.Icon
  const AgentIcon = agent.icon
  const isActive = agent.status === "active"

  return (
    <Card className="group relative flex h-full flex-col overflow-hidden transition-all hover:border-primary/40 hover:shadow-md">
      {/* Left accent bar */}
      <div className={cn("absolute inset-y-0 left-0 w-1", accentBar[agent.accent])} aria-hidden />

      <CardHeader className="pb-3 pl-5">
        <div className="flex items-start justify-between gap-3">
          <div className="flex min-w-0 items-start gap-3">
            <div className={cn("flex h-10 w-10 shrink-0 items-center justify-center rounded-lg", accentTile[agent.accent])}>
              <AgentIcon className="h-5 w-5" />
            </div>
            <div className="min-w-0">
              <CardTitle className="truncate text-base leading-tight">{agent.name}</CardTitle>
              <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">{agent.description}</p>
            </div>
          </div>
          <Badge variant="outline" className={cn("shrink-0 gap-1 border", status.className)}>
            <StatusIcon className="h-3 w-3" />
            {status.label}
          </Badge>
        </div>
      </CardHeader>

      <CardContent className="flex flex-1 flex-col pl-5">
        {isActive ? (
          <>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1">
                <p className="text-xs text-muted-foreground">Actions Today</p>
                <p className="text-2xl font-bold tabular-nums">{agent.stats.actionsToday}</p>
              </div>
              <div className="space-y-1">
                <p className="text-xs text-muted-foreground">Pending Approvals</p>
                <p className={cn(
                  "text-2xl font-bold tabular-nums",
                  agent.stats.pendingApprovals > 0
                    ? "text-amber-600 dark:text-amber-400"
                    : "text-emerald-600 dark:text-emerald-400",
                )}>
                  {agent.stats.pendingApprovals}
                </p>
              </div>
            </div>

            <div className="mt-auto flex items-center justify-between gap-2 border-t pt-4">
              <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs">
                <span className="flex items-center gap-1 text-emerald-600 dark:text-emerald-400">
                  <TrendingUp className="h-3.5 w-3.5" />
                  {agent.stats.successRate}% success
                </span>
                <span className="flex items-center gap-1 text-muted-foreground">
                  <Sparkles className="h-3.5 w-3.5" />
                  {(agent.stats.avgConfidence * 100).toFixed(0)}% confidence
                </span>
              </div>
              <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0" aria-label={`Configure ${agent.name}`}>
                <Settings className="h-4 w-4" />
              </Button>
            </div>
          </>
        ) : (
          <div className="flex flex-1 flex-col items-center justify-center py-8 text-center">
            <div className={cn("mb-3 flex h-12 w-12 items-center justify-center rounded-full", accentTile[agent.accent])}>
              <Clock className="h-6 w-6" />
            </div>
            <p className="text-sm font-medium">Agent is being trained</p>
            <p className="mt-0.5 text-xs text-muted-foreground">Coming soon</p>
          </div>
        )}
      </CardContent>
    </Card>
  )
}

// ── Summary Stat ─────────────────────────────────────────────────────────────

function StatCard({
  label,
  value,
  icon: Icon,
  iconClassName,
  valueClassName,
  hint,
}: {
  label:           string
  value:           React.ReactNode
  icon:            React.ElementType
  iconClassName?:  string
  valueClassName?: string
  hint?:           string
}) {
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-sm font-medium">{label}</CardTitle>
        <Icon className={cn("h-4 w-4 text-muted-foreground", iconClassName)} />
      </CardHeader>
      <CardContent>
        <div className={cn("text-2xl font-bold tabular-nums", valueClassName)}>{value}</div>
        {hint && <p className="mt-1 text-xs text-muted-foreground">{hint}</p>}
      </CardContent>
    </Card>
  )
}

// ── Page ─────────────────────────────────────────────────────────────────────

export default function AgentsPage() {
  const [isLoading, setIsLoading] = React.useState(false)

  const activeAgents       = agentData.filter((a) => a.status === "active")
  const totalActionsToday  = activeAgents.reduce((sum, a) => sum + a.stats.actionsToday,     0)
  const totalPending       = activeAgents.reduce((sum, a) => sum + a.stats.pendingApprovals, 0)
  const avgSuccessRate     = activeAgents.length > 0
    ? activeAgents.reduce((sum, a) => sum + a.stats.successRate, 0) / activeAgents.length
    : 0

  const handleRefresh = async () => {
    setIsLoading(true)
    await new Promise((resolve) => setTimeout(resolve, 800))
    setIsLoading(false)
  }

  return (
    <div className="space-y-6">
      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">AI Agents</h1>
          <p className="text-sm text-muted-foreground">
            Monitor and manage autonomous AI agents across the platform
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={handleRefresh} disabled={isLoading}>
            <RefreshCw className={cn("mr-2 h-4 w-4", isLoading && "animate-spin")} />
            Refresh
          </Button>
        </div>
      </div>

      {/* ── Summary Stats ──────────────────────────────────────────────────── */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <StatCard
          label="Active Agents"
          value={`${activeAgents.length}/${agentData.length}`}
          icon={Bot}
          hint={`${agentData.length - activeAgents.length} in training`}
        />
        <StatCard
          label="Actions Today"
          value={totalActionsToday.toLocaleString("en-IN")}
          icon={Activity}
          iconClassName="text-blue-500 dark:text-blue-400"
          hint="Across all active agents"
        />
        <StatCard
          label="Pending Approvals"
          value={totalPending}
          icon={AlertCircle}
          iconClassName={cn(totalPending > 0 && "text-amber-500 dark:text-amber-400")}
          valueClassName={cn(totalPending > 0 && "text-amber-600 dark:text-amber-400")}
          hint={totalPending > 0 ? "Waiting on a human" : "Nothing to review"}
        />
        <StatCard
          label="Avg Success Rate"
          value={`${avgSuccessRate.toFixed(1)}%`}
          icon={TrendingUp}
          iconClassName="text-emerald-500 dark:text-emerald-400"
          valueClassName="text-emerald-600 dark:text-emerald-400"
          hint="Last 30 days"
        />
      </div>

      {/* ── Tabs ───────────────────────────────────────────────────────────── */}
      <Tabs defaultValue="agents" className="space-y-4">
        <TabsList>
          <TabsTrigger value="agents" className="gap-2">
            <Bot className="h-4 w-4" />
            Agent Overview
          </TabsTrigger>
          <TabsTrigger value="activity" className="gap-2">
            <Activity className="h-4 w-4" />
            Live Activity
            {totalPending > 0 && (
              <Badge variant="destructive" className="ml-1 h-5 min-w-5 rounded-full px-1.5 text-[10px]">
                {totalPending}
              </Badge>
            )}
          </TabsTrigger>
        </TabsList>

        <TabsContent value="agents" className="mt-0">
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {agentData.map((agent) => (
              <AgentCard key={agent.id} agent={agent} />
            ))}
          </div>
        </TabsContent>

        <TabsContent value="activity" className="mt-0">
          <AgentActivityFeed />
        </TabsContent>
      </Tabs>
    </div>
  )
}
