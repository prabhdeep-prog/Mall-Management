"use client"

import * as React from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Progress } from "@/components/ui/progress"
import {
  ShieldCheck,
  Plus,
  Search,
  Filter,
  MoreHorizontal,
  RefreshCw,
  Loader2,
  Eye,
  Edit,
  Trash2,
  AlertTriangle,
  CheckCircle2,
  Clock,
  FileText,
  Calendar,
  Bell,
  Bot,
} from "lucide-react"
import { useToast } from "@/components/ui/use-toast"
import { formatDistanceToNow, format, differenceInDays } from "date-fns"

interface ComplianceRequirement {
  id: string
  propertyId: string
  requirementType: string
  title: string
  description: string | null
  authority: string | null
  frequency: string | null
  dueDate: string | null
  nextDueDate: string | null
  status: string
  riskLevel: string
  autoReminder: boolean
  reminderDays: number[]
  documentsRequired: string[]
  createdAt: string
  updatedAt: string
}

const statusConfig: Record<string, { label: string; color: string; icon: React.ReactNode }> = {
  pending: {
    label: "Pending",
    color: "bg-yellow-100 text-yellow-800 border-yellow-200",
    icon: <Clock className="h-3 w-3" />,
  },
  in_progress: {
    label: "In Progress",
    color: "bg-blue-100 text-blue-800 border-blue-200",
    icon: <Loader2 className="h-3 w-3 animate-spin" />,
  },
  completed: {
    label: "Completed",
    color: "bg-green-100 text-green-800 border-green-200",
    icon: <CheckCircle2 className="h-3 w-3" />,
  },
  overdue: {
    label: "Overdue",
    color: "bg-red-100 text-red-800 border-red-200",
    icon: <AlertTriangle className="h-3 w-3" />,
  },
}

const riskConfig: Record<string, { label: string; color: string }> = {
  low: { label: "Low", color: "bg-green-100 text-green-800" },
  medium: { label: "Medium", color: "bg-yellow-100 text-yellow-800" },
  high: { label: "High", color: "bg-orange-100 text-orange-800" },
  critical: { label: "Critical", color: "bg-red-100 text-red-800" },
}

const typeConfig: Record<string, { label: string; color: string }> = {
  license: { label: "License", color: "bg-purple-100 text-purple-800" },
  permit: { label: "Permit", color: "bg-blue-100 text-blue-800" },
  inspection: { label: "Inspection", color: "bg-cyan-100 text-cyan-800" },
  audit: { label: "Audit", color: "bg-indigo-100 text-indigo-800" },
  certificate: { label: "Certificate", color: "bg-pink-100 text-pink-800" },
}

// Demo data for compliance requirements
const demoRequirements: ComplianceRequirement[] = [
  {
    id: "1",
    propertyId: "prop-1",
    requirementType: "license",
    title: "Fire Safety Certificate",
    description: "Annual fire safety inspection and certificate renewal",
    authority: "Fire Department",
    frequency: "annual",
    dueDate: "2026-02-15",
    nextDueDate: "2026-02-15",
    status: "pending",
    riskLevel: "high",
    autoReminder: true,
    reminderDays: [30, 15, 7, 2],
    documentsRequired: ["Fire Safety Plan", "Evacuation Routes", "Fire Extinguisher Inspection"],
    createdAt: "2025-01-01",
    updatedAt: "2025-01-20",
  },
  {
    id: "2",
    propertyId: "prop-1",
    requirementType: "inspection",
    title: "Elevator Safety Inspection",
    description: "Bi-annual elevator safety inspection by certified inspector",
    authority: "Building Safety Authority",
    frequency: "biannual",
    dueDate: "2026-01-30",
    nextDueDate: "2026-01-30",
    status: "overdue",
    riskLevel: "critical",
    autoReminder: true,
    reminderDays: [30, 15, 7, 2],
    documentsRequired: ["Elevator Maintenance Log", "Safety Certificate"],
    createdAt: "2025-01-01",
    updatedAt: "2025-01-20",
  },
  {
    id: "3",
    propertyId: "prop-1",
    requirementType: "permit",
    title: "Trade License Renewal",
    description: "Annual trade license renewal for mall operations",
    authority: "Municipal Corporation",
    frequency: "annual",
    dueDate: "2026-03-31",
    nextDueDate: "2026-03-31",
    status: "pending",
    riskLevel: "medium",
    autoReminder: true,
    reminderDays: [30, 15, 7, 2],
    documentsRequired: ["Previous License", "Tax Clearance", "NOC"],
    createdAt: "2025-01-01",
    updatedAt: "2025-01-20",
  },
  {
    id: "4",
    propertyId: "prop-1",
    requirementType: "audit",
    title: "GST Compliance Audit",
    description: "Quarterly GST filing and compliance audit",
    authority: "GST Department",
    frequency: "quarterly",
    dueDate: "2026-04-20",
    nextDueDate: "2026-04-20",
    status: "in_progress",
    riskLevel: "medium",
    autoReminder: true,
    reminderDays: [15, 7, 3],
    documentsRequired: ["GST Returns", "Invoice Register", "Input Tax Credit"],
    createdAt: "2025-01-01",
    updatedAt: "2025-01-20",
  },
  {
    id: "5",
    propertyId: "prop-1",
    requirementType: "certificate",
    title: "Environmental Clearance",
    description: "Environmental compliance certificate for waste management",
    authority: "Pollution Control Board",
    frequency: "annual",
    dueDate: "2026-05-10",
    nextDueDate: "2026-05-10",
    status: "completed",
    riskLevel: "low",
    autoReminder: true,
    reminderDays: [30, 15, 7, 2],
    documentsRequired: ["Waste Management Plan", "Water Test Report", "Air Quality Report"],
    createdAt: "2025-01-01",
    updatedAt: "2025-01-20",
  },
]

export default function CompliancePage() {
  const { toast } = useToast()
  const [requirements, setRequirements] = React.useState<ComplianceRequirement[]>(demoRequirements)
  const [isLoading, setIsLoading] = React.useState(false)
  const [searchQuery, setSearchQuery] = React.useState("")
  const [statusFilter, setStatusFilter] = React.useState<string>("all")
  const [typeFilter, setTypeFilter] = React.useState<string>("all")
  const [riskFilter, setRiskFilter] = React.useState<string>("all")

  // Dialog states
  const [addDialogOpen, setAddDialogOpen] = React.useState(false)
  const [viewDialogOpen, setViewDialogOpen] = React.useState(false)
  const [selectedRequirement, setSelectedRequirement] = React.useState<ComplianceRequirement | null>(null)
  const [isSubmitting, setIsSubmitting] = React.useState(false)

  // Form state
  const [formData, setFormData] = React.useState({
    title: "",
    description: "",
    requirementType: "",
    authority: "",
    frequency: "",
    dueDate: "",
    riskLevel: "medium",
  })

  const getDaysUntilDue = (dueDate: string | null) => {
    if (!dueDate) return null
    return differenceInDays(new Date(dueDate), new Date())
  }

  const getDueDateColor = (days: number | null) => {
    if (days === null) return ""
    if (days < 0) return "text-red-600"
    if (days <= 7) return "text-orange-600"
    if (days <= 30) return "text-yellow-600"
    return "text-green-600"
  }

  const filteredRequirements = requirements.filter((req) => {
    if (searchQuery) {
      const searchLower = searchQuery.toLowerCase()
      if (
        !req.title.toLowerCase().includes(searchLower) &&
        !req.description?.toLowerCase().includes(searchLower) &&
        !req.authority?.toLowerCase().includes(searchLower)
      ) {
        return false
      }
    }
    if (statusFilter !== "all" && req.status !== statusFilter) return false
    if (typeFilter !== "all" && req.requirementType !== typeFilter) return false
    if (riskFilter !== "all" && req.riskLevel !== riskFilter) return false
    return true
  })

  const stats = {
    total: requirements.length,
    pending: requirements.filter((r) => r.status === "pending").length,
    overdue: requirements.filter((r) => r.status === "overdue").length,
    completed: requirements.filter((r) => r.status === "completed").length,
    critical: requirements.filter((r) => r.riskLevel === "critical" || r.riskLevel === "high").length,
    complianceRate: Math.round(
      (requirements.filter((r) => r.status === "completed").length / requirements.length) * 100
    ),
  }

  const handleCreateRequirement = async (e: React.FormEvent) => {
    e.preventDefault()
    setIsSubmitting(true)
    try {
      // Simulate API call
      await new Promise((resolve) => setTimeout(resolve, 1000))
      
      const newReq: ComplianceRequirement = {
        id: crypto.randomUUID(),
        propertyId: "prop-1",
        ...formData,
        nextDueDate: formData.dueDate,
        status: "pending",
        autoReminder: true,
        reminderDays: [30, 15, 7, 2],
        documentsRequired: [],
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      }
      
      setRequirements((prev) => [newReq, ...prev])
      toast({
        title: "Success",
        description: "Compliance requirement added successfully!",
      })
      setAddDialogOpen(false)
      setFormData({
        title: "",
        description: "",
        requirementType: "",
        authority: "",
        frequency: "",
        dueDate: "",
        riskLevel: "medium",
      })
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to add requirement. Please try again.",
        variant: "destructive",
      })
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleMarkComplete = async (id: string) => {
    setRequirements((prev) =>
      prev.map((r) => (r.id === id ? { ...r, status: "completed", updatedAt: new Date().toISOString() } : r))
    )
    toast({
      title: "Success",
      description: "Requirement marked as completed!",
    })
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Compliance Management</h1>
          <p className="text-muted-foreground">
            Track regulatory requirements, licenses, and audits
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" onClick={() => setIsLoading(true)} disabled={isLoading}>
            <RefreshCw className={`h-4 w-4 mr-2 ${isLoading ? "animate-spin" : ""}`} />
            Refresh
          </Button>
          <Dialog open={addDialogOpen} onOpenChange={setAddDialogOpen}>
            <DialogTrigger asChild>
              <Button className="gap-2">
                <Plus className="h-4 w-4" />
                Add Requirement
              </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-[500px]">
              <form onSubmit={handleCreateRequirement}>
                <DialogHeader>
                  <DialogTitle>Add Compliance Requirement</DialogTitle>
                  <DialogDescription>
                    Add a new regulatory or compliance requirement to track.
                  </DialogDescription>
                </DialogHeader>
                <div className="grid gap-4 py-4">
                  <div className="grid gap-2">
                    <label htmlFor="title" className="text-sm font-medium">
                      Title *
                    </label>
                    <Input
                      id="title"
                      placeholder="e.g., Fire Safety Certificate"
                      value={formData.title}
                      onChange={(e) => setFormData((prev) => ({ ...prev, title: e.target.value }))}
                      required
                    />
                  </div>
                  <div className="grid gap-2">
                    <label htmlFor="description" className="text-sm font-medium">
                      Description
                    </label>
                    <Input
                      id="description"
                      placeholder="Brief description..."
                      value={formData.description}
                      onChange={(e) => setFormData((prev) => ({ ...prev, description: e.target.value }))}
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="grid gap-2">
                      <label htmlFor="type" className="text-sm font-medium">
                        Type *
                      </label>
                      <Select
                        value={formData.requirementType}
                        onValueChange={(value) => setFormData((prev) => ({ ...prev, requirementType: value }))}
                        required
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="Select type" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="license">License</SelectItem>
                          <SelectItem value="permit">Permit</SelectItem>
                          <SelectItem value="inspection">Inspection</SelectItem>
                          <SelectItem value="audit">Audit</SelectItem>
                          <SelectItem value="certificate">Certificate</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="grid gap-2">
                      <label htmlFor="risk" className="text-sm font-medium">
                        Risk Level *
                      </label>
                      <Select
                        value={formData.riskLevel}
                        onValueChange={(value) => setFormData((prev) => ({ ...prev, riskLevel: value }))}
                      >
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="low">Low</SelectItem>
                          <SelectItem value="medium">Medium</SelectItem>
                          <SelectItem value="high">High</SelectItem>
                          <SelectItem value="critical">Critical</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                  <div className="grid gap-2">
                    <label htmlFor="authority" className="text-sm font-medium">
                      Issuing Authority
                    </label>
                    <Input
                      id="authority"
                      placeholder="e.g., Fire Department"
                      value={formData.authority}
                      onChange={(e) => setFormData((prev) => ({ ...prev, authority: e.target.value }))}
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="grid gap-2">
                      <label htmlFor="frequency" className="text-sm font-medium">
                        Frequency
                      </label>
                      <Select
                        value={formData.frequency}
                        onValueChange={(value) => setFormData((prev) => ({ ...prev, frequency: value }))}
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="Select" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="monthly">Monthly</SelectItem>
                          <SelectItem value="quarterly">Quarterly</SelectItem>
                          <SelectItem value="biannual">Bi-Annual</SelectItem>
                          <SelectItem value="annual">Annual</SelectItem>
                          <SelectItem value="one-time">One-time</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="grid gap-2">
                      <label htmlFor="dueDate" className="text-sm font-medium">
                        Due Date *
                      </label>
                      <Input
                        id="dueDate"
                        type="date"
                        value={formData.dueDate}
                        onChange={(e) => setFormData((prev) => ({ ...prev, dueDate: e.target.value }))}
                        required
                      />
                    </div>
                  </div>
                </div>
                <DialogFooter>
                  <Button type="button" variant="outline" onClick={() => setAddDialogOpen(false)}>
                    Cancel
                  </Button>
                  <Button type="submit" disabled={isSubmitting}>
                    {isSubmitting && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                    Add Requirement
                  </Button>
                </DialogFooter>
              </form>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      {/* Stats */}
      <div className="grid gap-4 md:grid-cols-5">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Requirements</CardTitle>
            <ShieldCheck className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.total}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Compliance Rate</CardTitle>
            <CheckCircle2 className="h-4 w-4 text-green-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-600">{stats.complianceRate}%</div>
            <Progress value={stats.complianceRate} className="mt-2 h-2" />
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Overdue</CardTitle>
            <AlertTriangle className="h-4 w-4 text-red-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-red-600">{stats.overdue}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Pending</CardTitle>
            <Clock className="h-4 w-4 text-yellow-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-yellow-600">{stats.pending}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">High Risk</CardTitle>
            <AlertTriangle className="h-4 w-4 text-orange-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-orange-600">{stats.critical}</div>
          </CardContent>
        </Card>
      </div>

      {/* AI Insights */}
      <Card className="border-cyan-200 bg-cyan-50/30 dark:border-cyan-900 dark:bg-cyan-950/20">
        <CardHeader className="pb-3">
          <div className="flex items-center gap-2">
            <Bot className="h-5 w-5 text-cyan-600 dark:text-cyan-400" />
            <CardTitle className="text-base">Compliance Monitor Insights</CardTitle>
          </div>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 md:grid-cols-3">
            <div className="flex items-start gap-3 p-3 bg-card rounded-lg border">
              <div className="p-2 bg-red-100 dark:bg-red-900/30 rounded-lg">
                <AlertTriangle className="h-4 w-4 text-red-600 dark:text-red-400" />
              </div>
              <div>
                <p className="text-sm font-medium">Critical: Elevator Inspection</p>
                <p className="text-xs text-muted-foreground">
                  Overdue by 20 days. Immediate action required.
                </p>
              </div>
            </div>
            <div className="flex items-start gap-3 p-3 bg-card rounded-lg border">
              <div className="p-2 bg-yellow-100 dark:bg-yellow-900/30 rounded-lg">
                <Bell className="h-4 w-4 text-yellow-600 dark:text-yellow-400" />
              </div>
              <div>
                <p className="text-sm font-medium">Reminder: Fire Safety</p>
                <p className="text-xs text-muted-foreground">
                  Due in 26 days. Document preparation suggested.
                </p>
              </div>
            </div>
            <div className="flex items-start gap-3 p-3 bg-card rounded-lg border">
              <div className="p-2 bg-green-100 dark:bg-green-900/30 rounded-lg">
                <CheckCircle2 className="h-4 w-4 text-green-600 dark:text-green-400" />
              </div>
              <div>
                <p className="text-sm font-medium">On Track</p>
                <p className="text-xs text-muted-foreground">
                  3 requirements completed this month.
                </p>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Filters */}
      <div className="flex items-center gap-4">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search requirements..."
            className="pl-8"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-[150px]">
            <Filter className="h-4 w-4 mr-2" />
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Status</SelectItem>
            <SelectItem value="pending">Pending</SelectItem>
            <SelectItem value="in_progress">In Progress</SelectItem>
            <SelectItem value="completed">Completed</SelectItem>
            <SelectItem value="overdue">Overdue</SelectItem>
          </SelectContent>
        </Select>
        <Select value={typeFilter} onValueChange={setTypeFilter}>
          <SelectTrigger className="w-[150px]">
            <SelectValue placeholder="Type" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Types</SelectItem>
            <SelectItem value="license">License</SelectItem>
            <SelectItem value="permit">Permit</SelectItem>
            <SelectItem value="inspection">Inspection</SelectItem>
            <SelectItem value="audit">Audit</SelectItem>
            <SelectItem value="certificate">Certificate</SelectItem>
          </SelectContent>
        </Select>
        <Select value={riskFilter} onValueChange={setRiskFilter}>
          <SelectTrigger className="w-[130px]">
            <SelectValue placeholder="Risk" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Risk</SelectItem>
            <SelectItem value="low">Low</SelectItem>
            <SelectItem value="medium">Medium</SelectItem>
            <SelectItem value="high">High</SelectItem>
            <SelectItem value="critical">Critical</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Requirements Table */}
      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Requirement</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>Authority</TableHead>
                <TableHead>Due Date</TableHead>
                <TableHead>Risk</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredRequirements.map((req) => {
                const status = statusConfig[req.status]
                const risk = riskConfig[req.riskLevel]
                const type = typeConfig[req.requirementType]
                const daysUntilDue = getDaysUntilDue(req.dueDate)

                return (
                  <TableRow key={req.id}>
                    <TableCell>
                      <div>
                        <div className="font-medium">{req.title}</div>
                        <div className="text-xs text-muted-foreground line-clamp-1">
                          {req.description || "No description"}
                        </div>
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge className={type?.color || "bg-gray-100 text-gray-800"}>
                        {type?.label || req.requirementType}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {req.authority || "—"}
                    </TableCell>
                    <TableCell>
                      <div className={getDueDateColor(daysUntilDue)}>
                        <div className="flex items-center gap-1">
                          <Calendar className="h-3.5 w-3.5" />
                          {req.dueDate ? format(new Date(req.dueDate), "MMM d, yyyy") : "—"}
                        </div>
                        {daysUntilDue !== null && (
                          <div className="text-xs">
                            {daysUntilDue < 0
                              ? `${Math.abs(daysUntilDue)} days overdue`
                              : daysUntilDue === 0
                              ? "Due today"
                              : `${daysUntilDue} days left`}
                          </div>
                        )}
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge className={risk?.color || "bg-gray-100 text-gray-800"}>
                        {risk?.label || req.riskLevel}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <Badge className={`gap-1 ${status?.color || "bg-gray-100 text-gray-800"}`}>
                        {status?.icon}
                        {status?.label || req.status}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon">
                            <MoreHorizontal className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuLabel>Actions</DropdownMenuLabel>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem
                            onClick={() => {
                              setSelectedRequirement(req)
                              setViewDialogOpen(true)
                            }}
                          >
                            <Eye className="mr-2 h-4 w-4" />
                            View Details
                          </DropdownMenuItem>
                          <DropdownMenuItem>
                            <Edit className="mr-2 h-4 w-4" />
                            Edit
                          </DropdownMenuItem>
                          <DropdownMenuItem>
                            <FileText className="mr-2 h-4 w-4" />
                            Upload Document
                          </DropdownMenuItem>
                          {req.status !== "completed" && (
                            <DropdownMenuItem onClick={() => handleMarkComplete(req.id)}>
                              <CheckCircle2 className="mr-2 h-4 w-4" />
                              Mark Complete
                            </DropdownMenuItem>
                          )}
                          <DropdownMenuSeparator />
                          <DropdownMenuItem className="text-red-600">
                            <Trash2 className="mr-2 h-4 w-4" />
                            Delete
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </TableCell>
                  </TableRow>
                )
              })}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* View Dialog */}
      <Dialog open={viewDialogOpen} onOpenChange={setViewDialogOpen}>
        <DialogContent className="sm:max-w-[500px]">
          <DialogHeader>
            <DialogTitle>{selectedRequirement?.title}</DialogTitle>
            <DialogDescription>{selectedRequirement?.description}</DialogDescription>
          </DialogHeader>
          {selectedRequirement && (
            <div className="grid gap-4 py-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <span className="text-sm text-muted-foreground">Type</span>
                  <Badge className="ml-2">{selectedRequirement.requirementType}</Badge>
                </div>
                <div>
                  <span className="text-sm text-muted-foreground">Risk Level</span>
                  <Badge className={`ml-2 ${riskConfig[selectedRequirement.riskLevel]?.color}`}>
                    {selectedRequirement.riskLevel}
                  </Badge>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <span className="text-sm text-muted-foreground">Authority</span>
                  <p className="font-medium">{selectedRequirement.authority || "—"}</p>
                </div>
                <div>
                  <span className="text-sm text-muted-foreground">Frequency</span>
                  <p className="font-medium">{selectedRequirement.frequency || "—"}</p>
                </div>
              </div>
              <div>
                <span className="text-sm text-muted-foreground">Due Date</span>
                <p className="font-medium">
                  {selectedRequirement.dueDate
                    ? format(new Date(selectedRequirement.dueDate), "MMMM d, yyyy")
                    : "—"}
                </p>
              </div>
              {selectedRequirement.documentsRequired.length > 0 && (
                <div>
                  <span className="text-sm text-muted-foreground">Required Documents</span>
                  <ul className="mt-1 space-y-1">
                    {selectedRequirement.documentsRequired.map((doc, idx) => (
                      <li key={idx} className="flex items-center gap-2 text-sm">
                        <FileText className="h-3.5 w-3.5 text-muted-foreground" />
                        {doc}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setViewDialogOpen(false)}>
              Close
            </Button>
            {selectedRequirement?.status !== "completed" && (
              <Button
                onClick={() => {
                  handleMarkComplete(selectedRequirement!.id)
                  setViewDialogOpen(false)
                }}
              >
                Mark Complete
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

