"use client"

import * as React from "react"
import { Suspense } from "react"
import { useSearchParams } from "next/navigation"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
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
} from "@/components/ui/dialog"
import { CreateWorkOrderDialog } from "@/components/work-orders/create-work-order-dialog"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import {
  Wrench,
  Plus,
  Search,
  Filter,
  Clock,
  CheckCircle2,
  AlertCircle,
  Zap,
  Thermometer,
  Droplets,
  Shield,
  Sparkles,
  MoreHorizontal,
  Bot,
  RefreshCw,
  Loader2,
  Eye,
  Play,
  UserPlus,
  ArrowUp,
  XCircle,
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
} from "lucide-react"
import { formatRelativeTime } from "@/lib/utils"
import { useToast } from "@/components/ui/use-toast"
import { usePropertyStore } from "@/stores/property-store"

interface WorkOrder {
  id: string
  workOrderNumber: string
  category: string
  priority: string
  title: string
  description: string | null
  location: string | null
  status: string
  reportedAt: string
  assignedTo: string | null
  resolvedAt: string | null
  tenant: {
    id: string
    businessName: string
    contactPerson: string | null
  } | null
  assignedVendor: {
    id: string
    name: string
    type: string | null
  } | null
  createdByAgent: boolean
}

const categoryIcons: Record<string, React.ReactNode> = {
  hvac: <Thermometer className="h-4 w-4" />,
  plumbing: <Droplets className="h-4 w-4" />,
  electrical: <Zap className="h-4 w-4" />,
  cleaning: <Sparkles className="h-4 w-4" />,
  security: <Shield className="h-4 w-4" />,
  general: <Wrench className="h-4 w-4" />,
}

const categoryColors: Record<string, string> = {
  hvac: "bg-blue-100 text-blue-700",
  plumbing: "bg-cyan-100 text-cyan-700",
  electrical: "bg-yellow-100 text-yellow-700",
  cleaning: "bg-green-100 text-green-700",
  security: "bg-red-100 text-red-700",
  general: "bg-gray-100 text-gray-700",
}

const priorityConfig: Record<string, { color: string; label: string }> = {
  low: { color: "bg-gray-100 text-gray-700", label: "Low" },
  medium: { color: "bg-blue-100 text-blue-700", label: "Medium" },
  high: { color: "bg-orange-100 text-orange-700", label: "High" },
  critical: { color: "bg-red-100 text-red-700", label: "Critical" },
}

const statusConfig: Record<string, { color: string; label: string; icon: React.ReactNode }> = {
  open: { color: "bg-yellow-100 text-yellow-700", label: "Open", icon: <AlertCircle className="h-3 w-3" /> },
  in_progress: { color: "bg-blue-100 text-blue-700", label: "In Progress", icon: <Clock className="h-3 w-3" /> },
  resolved: { color: "bg-green-100 text-green-700", label: "Resolved", icon: <CheckCircle2 className="h-3 w-3" /> },
  escalated: { color: "bg-red-100 text-red-700", label: "Escalated", icon: <AlertCircle className="h-3 w-3" /> },
}

function WorkOrdersPageContent() {
  const { toast } = useToast()
  const searchParams = useSearchParams()
  const { selectedProperty } = usePropertyStore()
  const tenantIdFilter = searchParams.get("tenantId")
  const [workOrders, setWorkOrders] = React.useState<WorkOrder[]>([])
  const [isLoading, setIsLoading] = React.useState(true)
  const [searchQuery, setSearchQuery] = React.useState("")
  const [statusFilter, setStatusFilter] = React.useState<string>("all")
  const [priorityFilter, setPriorityFilter] = React.useState<string>("all")
  const [categoryFilter, setCategoryFilter] = React.useState<string>("all")
  const [currentPage, setCurrentPage] = React.useState(1)
  const [pageSize, setPageSize] = React.useState(10)
  const [dialogOpen, setDialogOpen] = React.useState(false)
  const [viewDialogOpen, setViewDialogOpen] = React.useState(false)
  const [assignDialogOpen, setAssignDialogOpen] = React.useState(false)
  const [isSubmitting, setIsSubmitting] = React.useState(false)
  const [selectedWorkOrder, setSelectedWorkOrder] = React.useState<WorkOrder | null>(null)
  const [filterTenantName, setFilterTenantName] = React.useState<string | null>(null)

  const [assignee, setAssignee] = React.useState("")
  const [assignNotes, setAssignNotes] = React.useState("")
  const [vendors, setVendors] = React.useState<{ id: string; name: string; type: string | null; contactPerson: string | null }[]>([])
  const [vendorsLoaded, setVendorsLoaded] = React.useState(false)

  // Handler for viewing work order details
  const handleViewWorkOrder = (wo: WorkOrder) => {
    setSelectedWorkOrder(wo)
    setViewDialogOpen(true)
  }

  // Handler for updating status
  const handleUpdateStatus = async (wo: WorkOrder, newStatus: string) => {
    try {
      const response = await fetch(`/api/work-orders/${wo.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: newStatus }),
      })

      if (!response.ok) throw new Error("Failed to update status")

      toast({
        title: "Status Updated",
        description: `Work order ${wo.workOrderNumber} is now ${newStatus.replace("_", " ")}`,
      })

      fetchWorkOrders()
    } catch (error) {
      console.error("Error updating status:", error)
      toast({
        title: "Error",
        description: "Failed to update status. Please try again.",
        variant: "destructive",
      })
    }
  }

  // Handler for assigning work order
  const handleAssignWorkOrder = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!selectedWorkOrder || !assignee) return

    setIsSubmitting(true)
    try {
      const selectedVendor = vendors.find((v) => v.id === assignee)
      const assigneeName = selectedVendor
        ? selectedVendor.name
        : assignee

      const response = await fetch(`/api/work-orders/${selectedWorkOrder.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          assignedTo: assignee,
          status: selectedWorkOrder.status === "open" ? "in_progress" : selectedWorkOrder.status,
          ...(assignNotes ? { notes: assignNotes } : {}),
        }),
      })

      if (!response.ok) throw new Error("Failed to assign work order")

      toast({
        title: "Work Order Assigned",
        description: `${selectedWorkOrder.workOrderNumber} assigned to ${assigneeName}`,
      })

      setAssignDialogOpen(false)
      setAssignee("")
      setAssignNotes("")
      fetchWorkOrders()
    } catch (error) {
      console.error("Error assigning work order:", error)
      toast({
        title: "Error",
        description: "Failed to assign work order. Please try again.",
        variant: "destructive",
      })
    } finally {
      setIsSubmitting(false)
    }
  }

  // Handler for escalating work order
  const handleEscalate = async (wo: WorkOrder) => {
    try {
      const response = await fetch(`/api/work-orders/${wo.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ 
          status: "escalated",
          priority: "critical",
        }),
      })

      if (!response.ok) throw new Error("Failed to escalate")

      toast({
        title: "Work Order Escalated",
        description: `Work order ${wo.workOrderNumber} has been escalated to critical priority`,
      })

      fetchWorkOrders()
    } catch (error) {
      console.error("Error escalating:", error)
      toast({
        title: "Error",
        description: "Failed to escalate work order. Please try again.",
        variant: "destructive",
      })
    }
  }

  // Handler for cancelling work order
  const handleCancel = async (wo: WorkOrder) => {
    if (!confirm(`Are you sure you want to cancel work order ${wo.workOrderNumber}?`)) return

    try {
      const response = await fetch(`/api/work-orders/${wo.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "cancelled" }),
      })

      if (!response.ok) throw new Error("Failed to cancel")

      toast({
        title: "Work Order Cancelled",
        description: `Work order ${wo.workOrderNumber} has been cancelled`,
      })

      fetchWorkOrders()
    } catch (error) {
      console.error("Error cancelling:", error)
      toast({
        title: "Error",
        description: "Failed to cancel work order. Please try again.",
        variant: "destructive",
      })
    }
  }

  // Load vendors when assign dialog opens
  const loadVendors = React.useCallback(async () => {
    if (vendorsLoaded) return
    try {
      const res = await fetch("/api/vendors?status=active")
      if (res.ok) {
        const data = await res.json()
        setVendors(data.data ?? data ?? [])
        setVendorsLoaded(true)
      }
    } catch {}
  }, [vendorsLoaded])

  // Open assign dialog
  const handleOpenAssignDialog = (wo: WorkOrder) => {
    setSelectedWorkOrder(wo)
    setAssignee(wo.assignedTo || "")
    setAssignNotes("")
    setAssignDialogOpen(true)
    loadVendors()
  }

  // Fetch work orders from API - filtered by selected property
  const fetchWorkOrders = React.useCallback(async () => {
    setIsLoading(true)
    try {
      const params = new URLSearchParams()
      if (statusFilter !== "all") params.set("status", statusFilter)
      if (priorityFilter !== "all") params.set("priority", priorityFilter)
      if (tenantIdFilter) params.set("tenantId", tenantIdFilter)
      if (selectedProperty) params.set("propertyId", selectedProperty.id)
      
      const url = `/api/work-orders${params.toString() ? `?${params}` : ""}`
      const response = await fetch(url)
      if (!response.ok) throw new Error("Failed to fetch work orders")
      const result = await response.json()
      const workOrdersData = result.data || result || []
      setWorkOrders(workOrdersData)
      
      // If filtering by tenant, get tenant name from first work order
      if (tenantIdFilter && workOrdersData.length > 0 && workOrdersData[0].tenant) {
        setFilterTenantName(workOrdersData[0].tenant.businessName)
      }
    } catch (error) {
      console.error("Error fetching work orders:", error)
      toast({
        title: "Error",
        description: "Failed to load work orders. Please try again.",
        variant: "destructive",
      })
    } finally {
      setIsLoading(false)
    }
  }, [statusFilter, priorityFilter, tenantIdFilter, selectedProperty, toast])

  React.useEffect(() => {
    fetchWorkOrders()
  }, [fetchWorkOrders])

  const filteredWorkOrders = workOrders.filter((wo) => {
    const matchesSearch =
      wo.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      wo.workOrderNumber.toLowerCase().includes(searchQuery.toLowerCase()) ||
      wo.tenant?.businessName.toLowerCase().includes(searchQuery.toLowerCase())
    
    const matchesCategory = categoryFilter === "all" || wo.category === categoryFilter

    return matchesSearch && matchesCategory
  })

  const totalPages = Math.ceil(filteredWorkOrders.length / pageSize)
  const paginatedWorkOrders = filteredWorkOrders.slice(
    (currentPage - 1) * pageSize,
    currentPage * pageSize
  )

  React.useEffect(() => {
    setCurrentPage(1)
  }, [searchQuery, statusFilter, priorityFilter, categoryFilter])

  const stats = {
    total: workOrders.length,
    open: workOrders.filter((wo) => wo.status === "open").length,
    inProgress: workOrders.filter((wo) => wo.status === "in_progress").length,
    critical: workOrders.filter((wo) => wo.priority === "critical" && wo.status !== "resolved").length,
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Work Orders</h1>
          <p className="text-muted-foreground">
            Manage maintenance requests and track resolution
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={fetchWorkOrders} disabled={isLoading}>
            <RefreshCw className={`h-4 w-4 mr-2 ${isLoading ? "animate-spin" : ""}`} />
            Refresh
          </Button>
          <Button className="gap-2" onClick={() => setDialogOpen(true)}>
            <Plus className="h-4 w-4" />
            New Work Order
          </Button>
          <CreateWorkOrderDialog
            open={dialogOpen}
            onOpenChange={setDialogOpen}
            selectedPropertyId={selectedProperty?.id}
            onSuccess={fetchWorkOrders}
          />
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Work Orders</CardTitle>
            <Wrench className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.total}</div>
            <p className="text-xs text-muted-foreground">This month</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Open</CardTitle>
            <AlertCircle className="h-4 w-4 text-yellow-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.open}</div>
            <p className="text-xs text-muted-foreground">Awaiting assignment</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">In Progress</CardTitle>
            <Clock className="h-4 w-4 text-blue-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.inProgress}</div>
            <p className="text-xs text-muted-foreground">Being worked on</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Critical</CardTitle>
            <AlertCircle className="h-4 w-4 text-red-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.critical}</div>
            <p className="text-xs text-red-600">Requires immediate attention</p>
          </CardContent>
        </Card>
      </div>

      {/* Work Orders Table */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-base">All Work Orders</CardTitle>
            <div className="flex items-center gap-2">
              <div className="relative">
                <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search work orders..."
                  className="pl-8 w-[250px]"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                />
              </div>
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger className="w-[130px]">
                  <SelectValue placeholder="Status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Status</SelectItem>
                  <SelectItem value="open">Open</SelectItem>
                  <SelectItem value="in_progress">In Progress</SelectItem>
                  <SelectItem value="resolved">Resolved</SelectItem>
                </SelectContent>
              </Select>
              <Select value={priorityFilter} onValueChange={setPriorityFilter}>
                <SelectTrigger className="w-[130px]">
                  <SelectValue placeholder="Priority" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Priority</SelectItem>
                  <SelectItem value="critical">Critical</SelectItem>
                  <SelectItem value="high">High</SelectItem>
                  <SelectItem value="medium">Medium</SelectItem>
                  <SelectItem value="low">Low</SelectItem>
                </SelectContent>
              </Select>
              <Select value={categoryFilter} onValueChange={setCategoryFilter}>
                <SelectTrigger className="w-[130px]">
                  <Filter className="h-4 w-4 mr-2" />
                  <SelectValue placeholder="Category" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Categories</SelectItem>
                  <SelectItem value="hvac">HVAC</SelectItem>
                  <SelectItem value="plumbing">Plumbing</SelectItem>
                  <SelectItem value="electrical">Electrical</SelectItem>
                  <SelectItem value="cleaning">Cleaning</SelectItem>
                  <SelectItem value="security">Security</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
          ) : filteredWorkOrders.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <Wrench className="h-12 w-12 text-muted-foreground/50 mb-4" />
              <h3 className="text-lg font-semibold">No work orders found</h3>
              <p className="text-muted-foreground">
                {workOrders.length === 0
                  ? "Create your first work order to get started"
                  : "Try adjusting your search or filters"}
              </p>
            </div>
          ) : (
            <>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Work Order</TableHead>
                  <TableHead>Category</TableHead>
                  <TableHead>Tenant / Location</TableHead>
                  <TableHead>Priority</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Assigned To</TableHead>
                  <TableHead>Reported</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {paginatedWorkOrders.map((wo) => {
                  const priority = priorityConfig[wo.priority] || priorityConfig.medium
                  const status = statusConfig[wo.status] || statusConfig.open
                  return (
                    <TableRow key={wo.id}>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <div>
                            <div className="flex items-center gap-2">
                              <span className="font-mono text-sm font-medium">
                                {wo.workOrderNumber}
                              </span>
                              {wo.createdByAgent && (
                                <Badge variant="outline" className="text-[10px] gap-1 h-5">
                                  <Bot className="h-3 w-3" />
                                  AI Created
                                </Badge>
                              )}
                            </div>
                            <div className="text-sm text-muted-foreground line-clamp-1">
                              {wo.title}
                            </div>
                          </div>
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge variant="secondary" className={`gap-1 ${categoryColors[wo.category] || categoryColors.general}`}>
                          {categoryIcons[wo.category] || categoryIcons.general}
                          {wo.category?.toUpperCase() || "GENERAL"}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        {wo.tenant ? (
                          <div>
                            <div className="font-medium">{wo.tenant.businessName}</div>
                            <div className="text-xs text-muted-foreground">{wo.location || "N/A"}</div>
                          </div>
                        ) : (
                          <div className="text-muted-foreground">{wo.location || "N/A"}</div>
                        )}
                      </TableCell>
                      <TableCell>
                        <Badge className={priority.color}>{priority.label}</Badge>
                      </TableCell>
                      <TableCell>
                        <Badge className={`gap-1 ${status.color}`}>
                          {status.icon}
                          {status.label}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        {wo.assignedVendor ? (
                          <div className="flex items-center gap-2">
                            <Avatar className="h-6 w-6">
                              <AvatarFallback className="text-[10px]">
                                {wo.assignedVendor.name.charAt(0)}
                              </AvatarFallback>
                            </Avatar>
                            <div>
                              <div className="text-sm font-medium">{wo.assignedVendor.name}</div>
                              {wo.assignedVendor.type && (
                                <div className="text-xs text-muted-foreground capitalize">{wo.assignedVendor.type}</div>
                              )}
                            </div>
                          </div>
                        ) : wo.assignedTo ? (
                          <div className="flex items-center gap-2">
                            <Avatar className="h-6 w-6">
                              <AvatarFallback className="text-[10px]">V</AvatarFallback>
                            </Avatar>
                            <span className="text-sm text-muted-foreground">Assigned</span>
                          </div>
                        ) : (
                          <span className="text-muted-foreground text-sm">Unassigned</span>
                        )}
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {wo.reportedAt ? formatRelativeTime(new Date(wo.reportedAt)) : "N/A"}
                      </TableCell>
                      <TableCell className="text-right">
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="icon">
                              <MoreHorizontal className="h-4 w-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem onClick={() => handleViewWorkOrder(wo)}>
                              <Eye className="mr-2 h-4 w-4" />
                              View Details
                            </DropdownMenuItem>
                            {wo.status !== "resolved" && wo.status !== "cancelled" && (
                              <>
                                <DropdownMenuItem onClick={() => handleOpenAssignDialog(wo)}>
                                  <UserPlus className="mr-2 h-4 w-4" />
                                  {wo.assignedTo ? "Reassign" : "Assign"}
                                </DropdownMenuItem>
                                <DropdownMenuSeparator />
                                {wo.status === "open" && (
                                  <DropdownMenuItem onClick={() => handleUpdateStatus(wo, "in_progress")}>
                                    <Play className="mr-2 h-4 w-4" />
                                    Start Work
                                  </DropdownMenuItem>
                                )}
                                {wo.status === "in_progress" && (
                                  <DropdownMenuItem onClick={() => handleUpdateStatus(wo, "resolved")}>
                                    <CheckCircle2 className="mr-2 h-4 w-4 text-green-600" />
                                    Mark Resolved
                                  </DropdownMenuItem>
                                )}
                                {wo.status !== "escalated" && wo.priority !== "critical" && (
                                  <DropdownMenuItem onClick={() => handleEscalate(wo)}>
                                    <ArrowUp className="mr-2 h-4 w-4 text-red-600" />
                                    Escalate
                                  </DropdownMenuItem>
                                )}
                                <DropdownMenuSeparator />
                                <DropdownMenuItem 
                                  onClick={() => handleCancel(wo)}
                                  className="text-red-600"
                                >
                                  <XCircle className="mr-2 h-4 w-4" />
                                  Cancel
                                </DropdownMenuItem>
                              </>
                            )}
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </TableCell>
                    </TableRow>
                  )
                })}
              </TableBody>
            </Table>
            {filteredWorkOrders.length > 0 && (
              <div className="flex items-center justify-between border-t pt-4 mt-4">
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <span>
                    Showing {(currentPage - 1) * pageSize + 1}–{Math.min(currentPage * pageSize, filteredWorkOrders.length)} of {filteredWorkOrders.length}
                  </span>
                  <Select value={String(pageSize)} onValueChange={(v) => { setPageSize(Number(v)); setCurrentPage(1) }}>
                    <SelectTrigger className="h-8 w-[70px]">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="10">10</SelectItem>
                      <SelectItem value="20">20</SelectItem>
                      <SelectItem value="50">50</SelectItem>
                      <SelectItem value="100">100</SelectItem>
                    </SelectContent>
                  </Select>
                  <span>per page</span>
                </div>
                <div className="flex items-center gap-1">
                  <Button variant="outline" size="icon" className="h-8 w-8" disabled={currentPage <= 1} onClick={() => setCurrentPage(1)}>
                    <ChevronsLeft className="h-4 w-4" />
                  </Button>
                  <Button variant="outline" size="icon" className="h-8 w-8" disabled={currentPage <= 1} onClick={() => setCurrentPage((p) => p - 1)}>
                    <ChevronLeft className="h-4 w-4" />
                  </Button>
                  <span className="px-3 text-sm font-medium">
                    {currentPage} / {totalPages || 1}
                  </span>
                  <Button variant="outline" size="icon" className="h-8 w-8" disabled={currentPage >= totalPages} onClick={() => setCurrentPage((p) => p + 1)}>
                    <ChevronRight className="h-4 w-4" />
                  </Button>
                  <Button variant="outline" size="icon" className="h-8 w-8" disabled={currentPage >= totalPages} onClick={() => setCurrentPage(totalPages)}>
                    <ChevronsRight className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            )}
            </>
          )}
        </CardContent>
      </Card>

      {/* View Work Order Dialog */}
      <Dialog open={viewDialogOpen} onOpenChange={setViewDialogOpen}>
        <DialogContent className="sm:max-w-[500px]">
          <DialogHeader>
            <DialogTitle>Work Order Details</DialogTitle>
            <DialogDescription>
              {selectedWorkOrder?.workOrderNumber}
            </DialogDescription>
          </DialogHeader>
          {selectedWorkOrder && (
            <div className="grid gap-4 py-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className="text-sm font-medium text-muted-foreground">Category</p>
                  <Badge className={`mt-1 gap-1 ${categoryColors[selectedWorkOrder.category] || categoryColors.general}`}>
                    {categoryIcons[selectedWorkOrder.category] || categoryIcons.general}
                    {selectedWorkOrder.category?.toUpperCase()}
                  </Badge>
                </div>
                <div>
                  <p className="text-sm font-medium text-muted-foreground">Priority</p>
                  <Badge className={`mt-1 ${priorityConfig[selectedWorkOrder.priority]?.color || ""}`}>
                    {priorityConfig[selectedWorkOrder.priority]?.label || selectedWorkOrder.priority}
                  </Badge>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className="text-sm font-medium text-muted-foreground">Status</p>
                  <Badge className={`mt-1 gap-1 ${statusConfig[selectedWorkOrder.status]?.color || ""}`}>
                    {statusConfig[selectedWorkOrder.status]?.icon}
                    {statusConfig[selectedWorkOrder.status]?.label || selectedWorkOrder.status}
                  </Badge>
                </div>
                <div>
                  <p className="text-sm font-medium text-muted-foreground">Assigned To</p>
                  <p className="font-medium mt-1">
                    {selectedWorkOrder.assignedVendor?.name || (selectedWorkOrder.assignedTo ? "Assigned" : "Unassigned")}
                    {selectedWorkOrder.assignedVendor?.type && (
                      <span className="text-xs text-muted-foreground ml-1 capitalize">({selectedWorkOrder.assignedVendor.type})</span>
                    )}
                  </p>
                </div>
              </div>
              <div>
                <p className="text-sm font-medium text-muted-foreground">Title</p>
                <p className="font-medium mt-1">{selectedWorkOrder.title}</p>
              </div>
              {selectedWorkOrder.description && (
                <div>
                  <p className="text-sm font-medium text-muted-foreground">Description</p>
                  <p className="mt-1 text-sm">{selectedWorkOrder.description}</p>
                </div>
              )}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className="text-sm font-medium text-muted-foreground">Location</p>
                  <p className="font-medium mt-1">{selectedWorkOrder.location || "N/A"}</p>
                </div>
                <div>
                  <p className="text-sm font-medium text-muted-foreground">Tenant</p>
                  <p className="font-medium mt-1">{selectedWorkOrder.tenant?.businessName || "N/A"}</p>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className="text-sm font-medium text-muted-foreground">Reported</p>
                  <p className="font-medium mt-1">
                    {selectedWorkOrder.reportedAt 
                      ? new Date(selectedWorkOrder.reportedAt).toLocaleDateString() 
                      : "N/A"}
                  </p>
                </div>
                {selectedWorkOrder.resolvedAt && (
                  <div>
                    <p className="text-sm font-medium text-muted-foreground">Resolved</p>
                    <p className="font-medium mt-1">
                      {new Date(selectedWorkOrder.resolvedAt).toLocaleDateString()}
                    </p>
                  </div>
                )}
              </div>
              {selectedWorkOrder.createdByAgent && (
                <div className="flex items-center gap-2 text-blue-600 text-sm">
                  <Bot className="h-4 w-4" />
                  Created by AI Agent
                </div>
              )}
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setViewDialogOpen(false)}>
              Close
            </Button>
            {selectedWorkOrder?.status !== "resolved" && selectedWorkOrder?.status !== "cancelled" && (
              <Button onClick={() => {
                setViewDialogOpen(false)
                handleOpenAssignDialog(selectedWorkOrder!)
              }}>
                {selectedWorkOrder?.assignedTo ? "Reassign" : "Assign"}
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Assign Work Order Dialog */}
      <Dialog open={assignDialogOpen} onOpenChange={setAssignDialogOpen}>
        <DialogContent className="sm:max-w-[420px]">
          <form onSubmit={handleAssignWorkOrder}>
            <DialogHeader>
              <DialogTitle>Assign Work Order</DialogTitle>
              <DialogDescription>
                {selectedWorkOrder?.workOrderNumber} – {selectedWorkOrder?.title}
              </DialogDescription>
            </DialogHeader>
            <div className="grid gap-4 py-4">
              <div className="grid gap-2">
                <label className="text-sm font-medium">Assign To *</label>
                <Select value={assignee} onValueChange={setAssignee}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select vendor or staff" />
                  </SelectTrigger>
                  <SelectContent>
                    {vendors.length > 0 ? (
                      vendors.map((v) => (
                        <SelectItem key={v.id} value={v.id}>
                          {v.name}
                          {v.type ? ` (${v.type})` : ""}
                          {v.contactPerson ? ` · ${v.contactPerson}` : ""}
                        </SelectItem>
                      ))
                    ) : (
                      <SelectItem value="unassigned" disabled>
                        No vendors found — add vendors first
                      </SelectItem>
                    )}
                  </SelectContent>
                </Select>
                {vendors.length === 0 && vendorsLoaded && (
                  <p className="text-xs text-muted-foreground">
                    No active vendors found.{" "}
                    <a href="/vendors" className="text-primary underline">Add vendors</a> to assign work orders.
                  </p>
                )}
              </div>
              <div className="grid gap-2">
                <label className="text-sm font-medium">Notes <span className="text-muted-foreground font-normal">(optional)</span></label>
                <Input
                  placeholder="e.g. Please call before visiting"
                  value={assignNotes}
                  onChange={(e) => setAssignNotes(e.target.value)}
                />
              </div>
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => {
                setAssignDialogOpen(false)
                setAssignee("")
                setAssignNotes("")
              }}>
                Cancel
              </Button>
              <Button type="submit" disabled={isSubmitting || !assignee || assignee === "unassigned"}>
                {isSubmitting && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                Assign
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  )
}

// Wrap with Suspense for useSearchParams
export default function WorkOrdersPage() {
  return (
    <Suspense fallback={<div className="flex items-center justify-center h-64"><Loader2 className="h-8 w-8 animate-spin" /></div>}>
      <WorkOrdersPageContent />
    </Suspense>
  )
}
