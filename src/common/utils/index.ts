import { type ClassValue, clsx } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function formatCurrency(amount: number | string, currency = "INR"): string {
  const num = typeof amount === "string" ? parseFloat(amount) : amount
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency,
    maximumFractionDigits: 0,
  }).format(num)
}

export function formatDate(date: Date | string): string {
  const d = typeof date === "string" ? new Date(date) : date
  return new Intl.DateTimeFormat("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(d)
}

export function formatRelativeTime(date: Date | string): string {
  const d = typeof date === "string" ? new Date(date) : date
  const now = new Date()
  const diffMs = now.getTime() - d.getTime()
  const diffMins = Math.floor(diffMs / 60000)
  const diffHours = Math.floor(diffMs / 3600000)
  const diffDays = Math.floor(diffMs / 86400000)

  if (diffMins < 1) return "just now"
  if (diffMins < 60) return `${diffMins} min ago`
  if (diffHours < 24) return `${diffHours} hours ago`
  if (diffDays < 7) return `${diffDays} days ago`
  return formatDate(d)
}

export function generateId(): string {
  return crypto.randomUUID()
}

export function truncate(str: string, length: number): string {
  if (str.length <= length) return str
  return str.slice(0, length) + "..."
}

export function capitalizeFirst(str: string): string {
  return str.charAt(0).toUpperCase() + str.slice(1)
}

export function getAgentColor(agentType: string): string {
  const colors: Record<string, string> = {
    operations_commander: "#3B82F6", // blue
    tenant_relations: "#22C55E", // green
    financial_analyst: "#A855F7", // purple
    maintenance_coordinator: "#F97316", // orange
    space_optimizer: "#EC4899", // pink
    compliance_monitor: "#EF4444", // red
  }
  return colors[agentType] || "#6B7280"
}

export function getAgentBgClass(agentType: string): string {
  const classes: Record<string, string> = {
    operations_commander: "bg-blue-100 text-blue-700",
    tenant_relations: "bg-green-100 text-green-700",
    financial_analyst: "bg-purple-100 text-purple-700",
    maintenance_coordinator: "bg-orange-100 text-orange-700",
    space_optimizer: "bg-pink-100 text-pink-700",
    compliance_monitor: "bg-red-100 text-red-700",
  }
  return classes[agentType] || "bg-gray-100 text-gray-700"
}

export function getStatusBadgeClass(status: string): string {
  const classes: Record<string, string> = {
    active: "bg-green-100 text-green-800",
    pending: "bg-yellow-100 text-yellow-800",
    completed: "bg-blue-100 text-blue-800",
    cancelled: "bg-gray-100 text-gray-800",
    overdue: "bg-red-100 text-red-800",
    paid: "bg-green-100 text-green-800",
    open: "bg-blue-100 text-blue-800",
    in_progress: "bg-yellow-100 text-yellow-800",
    escalated: "bg-orange-100 text-orange-800",
    resolved: "bg-green-100 text-green-800",
    failed: "bg-red-100 text-red-800",
    approved: "bg-green-100 text-green-800",
    rejected: "bg-red-100 text-red-800",
    executed: "bg-blue-100 text-blue-800",
  }
  return classes[status] || "bg-gray-100 text-gray-800"
}

export function getPriorityBadgeClass(priority: string): string {
  const classes: Record<string, string> = {
    low: "bg-gray-100 text-gray-800",
    medium: "bg-blue-100 text-blue-800",
    high: "bg-orange-100 text-orange-800",
    critical: "bg-red-100 text-red-800",
  }
  return classes[priority] || "bg-gray-100 text-gray-800"
}

export function calculatePercentage(value: number, total: number): number {
  if (total === 0) return 0
  return Math.round((value / total) * 100)
}

export function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}

