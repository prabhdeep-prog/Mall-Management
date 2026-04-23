"use client"

import * as React from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { Progress } from "@/components/ui/progress"
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
import { AddVendorDialog } from "@/components/vendors/add-vendor-dialog"
import { CreateWorkOrderDialog } from "@/components/work-orders/create-work-order-dialog"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import {
  Truck,
  Plus,
  Search,
  Filter,
  MoreHorizontal,
  RefreshCw,
  Loader2,
  Eye,
  Edit,
  Trash2,
  Star,
  Phone,
  Mail,
  MapPin,
  FileText,
  CheckCircle2,
  Clock,
  DollarSign,
  TrendingUp,
  AlertTriangle,
  Award,
  Wrench,
  ExternalLink,
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
} from "lucide-react"
import { useToast } from "@/components/ui/use-toast"
import { useRouter } from "next/navigation"
import { format } from "date-fns"

interface Vendor {
  id: string
  organizationId: string
  name: string
  category: string
  contactPerson: string | null
  email: string | null
  phone: string | null
  address: string | null
  gstNumber: string | null
  panNumber: string | null
  bankDetails: {
    accountName?: string
    accountNumber?: string
    bankName?: string
    ifscCode?: string
  } | null
  performanceRating: number
  totalWorkOrders: number
  completedWorkOrders: number
  avgResponseTime: number | null
  avgCompletionTime: number | null
  totalAmountPaid: number
  status: string
  contractExpiry: string | null
  createdAt: string
}

const categoryConfig: Record<string, { label: string; icon: React.ReactNode; color: string }> = {
  hvac: { label: "HVAC", icon: <Truck className="h-4 w-4" />, color: "bg-blue-100 text-blue-800" },
  electrical: { label: "Electrical", icon: <Truck className="h-4 w-4" />, color: "bg-yellow-100 text-yellow-800" },
  plumbing: { label: "Plumbing", icon: <Truck className="h-4 w-4" />, color: "bg-cyan-100 text-cyan-800" },
  cleaning: { label: "Cleaning", icon: <Truck className="h-4 w-4" />, color: "bg-green-100 text-green-800" },
  security: { label: "Security", icon: <Truck className="h-4 w-4" />, color: "bg-red-100 text-red-800" },
  landscaping: { label: "Landscaping", icon: <Truck className="h-4 w-4" />, color: "bg-emerald-100 text-emerald-800" },
  elevator: { label: "Elevator", icon: <Truck className="h-4 w-4" />, color: "bg-purple-100 text-purple-800" },
  general: { label: "General", icon: <Truck className="h-4 w-4" />, color: "bg-gray-100 text-gray-800" },
  pest_control: { label: "Pest Control", icon: <Truck className="h-4 w-4" />, color: "bg-orange-100 text-orange-800" },
  it: { label: "IT Services", icon: <Truck className="h-4 w-4" />, color: "bg-indigo-100 text-indigo-800" },
}

const statusConfig: Record<string, { label: string; color: string }> = {
  active: { label: "Active", color: "bg-green-100 text-green-800" },
  inactive: { label: "Inactive", color: "bg-gray-100 text-gray-800" },
  suspended: { label: "Suspended", color: "bg-red-100 text-red-800" },
  pending: { label: "Pending", color: "bg-yellow-100 text-yellow-800" },
}

export default function VendorsPage() {
  const { toast } = useToast()
  const router = useRouter()
  const [vendors, setVendors] = React.useState<Vendor[]>([])
  const [isLoading, setIsLoading] = React.useState(true)
  const [searchQuery, setSearchQuery] = React.useState("")
  const [statusFilter, setStatusFilter] = React.useState<string>("all")
  const [categoryFilter, setCategoryFilter] = React.useState<string>("all")
  const [currentPage, setCurrentPage] = React.useState(1)
  const [pageSize, setPageSize] = React.useState(10)

  // Dialog states
  const [addDialogOpen, setAddDialogOpen] = React.useState(false)
  const [viewDialogOpen, setViewDialogOpen] = React.useState(false)
  const [createWODialogOpen, setCreateWODialogOpen] = React.useState(false)
  const [selectedVendor, setSelectedVendor] = React.useState<Vendor | null>(null)

  const fetchVendors = React.useCallback(async () => {
    setIsLoading(true)
    try {
      const res = await fetch("/api/vendors")
      const json = await res.json()
      if (json.success && Array.isArray(json.data)) {
        const mapped: Vendor[] = json.data.map((v: any) => ({
          id: v.id,
          organizationId: v.organizationId || "",
          name: v.name,
          category: v.type || v.category || "general",
          contactPerson: v.contactPerson || null,
          email: v.email || null,
          phone: v.phone || null,
          address: v.address || null,
          gstNumber: v.gstin || null,
          panNumber: v.pan || null,
          bankDetails: v.metadata?.bankDetails || null,
          performanceRating: parseFloat(v.rating) || 0,
          totalWorkOrders: v.totalJobs || 0,
          completedWorkOrders: v.completedJobs || 0,
          avgResponseTime: v.avgResponseTimeHours ? parseFloat(v.avgResponseTimeHours) : null,
          avgCompletionTime: v.avgCompletionTimeHours ? parseFloat(v.avgCompletionTimeHours) : null,
          totalAmountPaid: 0,
          status: v.status || "active",
          contractExpiry: v.metadata?.contractExpiry || null,
          createdAt: v.createdAt || new Date().toISOString(),
        }))
        setVendors(mapped)
      } else {
        setVendors([])
      }
    } catch (err) {
      console.error("Failed to fetch vendors:", err)
      setVendors([])
    } finally {
      setIsLoading(false)
    }
  }, [])

  React.useEffect(() => { fetchVendors() }, [fetchVendors])

  const handleDeactivate = async (vendor: Vendor) => {
    const action = vendor.status === "active" ? "deactivate" : "reactivate"
    if (!confirm(`${action.charAt(0).toUpperCase() + action.slice(1)} ${vendor.name}?`)) return
    try {
      const res = await fetch(`/api/vendors/${vendor.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: vendor.status === "active" ? "inactive" : "active" }),
      })
      if (!res.ok) throw new Error("Failed to update vendor status")
      toast({
        title: vendor.status === "active" ? "Vendor deactivated" : "Vendor reactivated",
        description: `${vendor.name} has been ${action}d.`,
      })
      fetchVendors()
    } catch {
      toast({ title: "Error", description: "Failed to update vendor status.", variant: "destructive" })
    }
  }

  const getRatingStars = (rating: number) => {
    const fullStars = Math.floor(rating)
    const hasHalfStar = rating % 1 >= 0.5
    return { fullStars, hasHalfStar }
  }

  const getRatingColor = (rating: number) => {
    if (rating >= 4.5) return "text-green-600"
    if (rating >= 4.0) return "text-blue-600"
    if (rating >= 3.5) return "text-yellow-600"
    return "text-red-600"
  }

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat("en-IN", {
      style: "currency",
      currency: "INR",
      maximumFractionDigits: 0,
    }).format(amount)
  }

  const filteredVendors = vendors.filter((vendor) => {
    if (searchQuery) {
      const searchLower = searchQuery.toLowerCase()
      if (
        !vendor.name.toLowerCase().includes(searchLower) &&
        !vendor.contactPerson?.toLowerCase().includes(searchLower) &&
        !vendor.email?.toLowerCase().includes(searchLower)
      ) {
        return false
      }
    }
    if (statusFilter !== "all" && vendor.status !== statusFilter) return false
    if (categoryFilter !== "all" && vendor.category !== categoryFilter) return false
    return true
  })

  const totalPages = Math.ceil(filteredVendors.length / pageSize)
  const paginatedVendors = filteredVendors.slice(
    (currentPage - 1) * pageSize,
    currentPage * pageSize
  )

  React.useEffect(() => {
    setCurrentPage(1)
  }, [searchQuery, statusFilter, categoryFilter])

  const totalWOs = vendors.reduce((acc, v) => acc + v.totalWorkOrders, 0)
  const completedWOs = vendors.reduce((acc, v) => acc + v.completedWorkOrders, 0)
  const stats = {
    total: vendors.length,
    active: vendors.filter((v) => v.status === "active").length,
    avgRating: vendors.length > 0
      ? vendors.reduce((acc, v) => acc + v.performanceRating, 0) / vendors.length
      : 0,
    totalPaid: vendors.reduce((acc, v) => acc + v.totalAmountPaid, 0),
    totalWorkOrders: totalWOs,
    completionRate: totalWOs > 0 ? (completedWOs / totalWOs) * 100 : 0,
  }


  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Vendor Management</h1>
          <p className="text-muted-foreground">
            Manage service providers, track performance, and maintain vendor relationships
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" onClick={() => fetchVendors()} disabled={isLoading}>
            <RefreshCw className={`h-4 w-4 mr-2 ${isLoading ? "animate-spin" : ""}`} />
            Refresh
          </Button>
          <Button className="gap-2" onClick={() => setAddDialogOpen(true)}>
            <Plus className="h-4 w-4" />
            Add Vendor
          </Button>
          <AddVendorDialog
            open={addDialogOpen}
            onOpenChange={setAddDialogOpen}
            onSuccess={fetchVendors}
          />
        </div>
      </div>

      {/* Stats */}
      <div className="grid gap-4 md:grid-cols-6">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Vendors</CardTitle>
            <Truck className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.total}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Active</CardTitle>
            <CheckCircle2 className="h-4 w-4 text-green-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-600">{stats.active}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Avg Rating</CardTitle>
            <Star className="h-4 w-4 text-yellow-500" />
          </CardHeader>
          <CardContent>
            <div className={`text-2xl font-bold ${getRatingColor(stats.avgRating)}`}>
              {stats.avgRating.toFixed(1)}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Paid</CardTitle>
            <DollarSign className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{formatCurrency(stats.totalPaid)}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Work Orders</CardTitle>
            <FileText className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.totalWorkOrders}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Completion Rate</CardTitle>
            <TrendingUp className="h-4 w-4 text-green-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-600">{stats.completionRate.toFixed(1)}%</div>
          </CardContent>
        </Card>
      </div>

      {/* Top Performers */}
      <Card className="border-green-200 bg-green-50/30">
        <CardHeader className="pb-3">
          <div className="flex items-center gap-2">
            <Award className="h-5 w-5 text-green-600" />
            <CardTitle className="text-base">Top Performing Vendors</CardTitle>
          </div>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 md:grid-cols-3">
            {vendors
              .filter((v) => v.status === "active")
              .sort((a, b) => b.performanceRating - a.performanceRating)
              .slice(0, 3)
              .map((vendor, idx) => (
                <div key={vendor.id} className="flex items-start gap-3 p-3 bg-white rounded-lg border">
                  <div
                    className={`flex items-center justify-center w-8 h-8 rounded-full text-white font-bold ${
                      idx === 0 ? "bg-yellow-500" : idx === 1 ? "bg-gray-400" : "bg-orange-400"
                    }`}
                  >
                    {idx + 1}
                  </div>
                  <div className="flex-1">
                    <p className="font-medium">{vendor.name}</p>
                    <div className="flex items-center gap-1 mt-1">
                      <Star className="h-3.5 w-3.5 fill-yellow-500 text-yellow-500" />
                      <span className="text-sm font-medium">{vendor.performanceRating.toFixed(1)}</span>
                      <span className="text-xs text-muted-foreground">
                        • {vendor.completedWorkOrders}/{vendor.totalWorkOrders} jobs
                      </span>
                    </div>
                  </div>
                </div>
              ))}
          </div>
        </CardContent>
      </Card>

      {/* Filters */}
      <div className="flex items-center gap-4">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search vendors..."
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
            <SelectItem value="active">Active</SelectItem>
            <SelectItem value="inactive">Inactive</SelectItem>
            <SelectItem value="suspended">Suspended</SelectItem>
            <SelectItem value="pending">Pending</SelectItem>
          </SelectContent>
        </Select>
        <Select value={categoryFilter} onValueChange={setCategoryFilter}>
          <SelectTrigger className="w-[150px]">
            <SelectValue placeholder="Category" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Categories</SelectItem>
            <SelectItem value="hvac">HVAC</SelectItem>
            <SelectItem value="electrical">Electrical</SelectItem>
            <SelectItem value="plumbing">Plumbing</SelectItem>
            <SelectItem value="cleaning">Cleaning</SelectItem>
            <SelectItem value="security">Security</SelectItem>
            <SelectItem value="landscaping">Landscaping</SelectItem>
            <SelectItem value="elevator">Elevator</SelectItem>
            <SelectItem value="pest_control">Pest Control</SelectItem>
            <SelectItem value="it">IT Services</SelectItem>
            <SelectItem value="general">General</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Vendor Table */}
      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Vendor</TableHead>
                <TableHead>Category</TableHead>
                <TableHead>Contact</TableHead>
                <TableHead>Rating</TableHead>
                <TableHead>Work Orders</TableHead>
                <TableHead>Total Paid</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow>
                  <TableCell colSpan={8} className="py-12 text-center">
                    <Loader2 className="h-6 w-6 animate-spin mx-auto text-muted-foreground" />
                  </TableCell>
                </TableRow>
              ) : filteredVendors.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={8} className="py-12 text-center">
                    <Truck className="h-10 w-10 mx-auto text-muted-foreground/40 mb-3" />
                    <p className="font-medium text-muted-foreground">
                      {vendors.length === 0 ? "No vendors yet" : "No vendors match your filters"}
                    </p>
                    {vendors.length === 0 && (
                      <p className="text-sm text-muted-foreground mt-1">
                        Click <strong>Add Vendor</strong> to get started
                      </p>
                    )}
                  </TableCell>
                </TableRow>
              ) : null}
              {!isLoading && paginatedVendors.map((vendor) => {
                const category = categoryConfig[vendor.category]
                const status = statusConfig[vendor.status]
                const { fullStars, hasHalfStar } = getRatingStars(vendor.performanceRating)

                return (
                  <TableRow key={vendor.id}>
                    <TableCell>
                      <div>
                        <div className="font-medium">{vendor.name}</div>
                        <div className="text-xs text-muted-foreground">{vendor.contactPerson}</div>
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge className={`gap-1 ${category?.color || "bg-gray-100 text-gray-800"}`}>
                        {category?.label || vendor.category}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <div className="space-y-1">
                        {vendor.email && (
                          <div className="flex items-center gap-1 text-xs text-muted-foreground">
                            <Mail className="h-3 w-3" />
                            {vendor.email}
                          </div>
                        )}
                        {vendor.phone && (
                          <div className="flex items-center gap-1 text-xs text-muted-foreground">
                            <Phone className="h-3 w-3" />
                            {vendor.phone}
                          </div>
                        )}
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1">
                        {[...Array(5)].map((_, i) => (
                          <Star
                            key={i}
                            className={`h-3.5 w-3.5 ${
                              i < fullStars
                                ? "fill-yellow-500 text-yellow-500"
                                : i === fullStars && hasHalfStar
                                ? "fill-yellow-500/50 text-yellow-500"
                                : "text-gray-300"
                            }`}
                          />
                        ))}
                        <span className="ml-1 text-sm font-medium">{vendor.performanceRating.toFixed(1)}</span>
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="text-sm">
                        <span className="font-medium">{vendor.completedWorkOrders}</span>
                        <span className="text-muted-foreground">/{vendor.totalWorkOrders}</span>
                      </div>
                      <div className="w-16 h-1.5 bg-gray-200 rounded-full mt-1">
                        <div
                          className="h-full bg-green-500 rounded-full"
                          style={{
                            width: `${(vendor.completedWorkOrders / Math.max(vendor.totalWorkOrders, 1)) * 100}%`,
                          }}
                        />
                      </div>
                    </TableCell>
                    <TableCell className="font-medium">{formatCurrency(vendor.totalAmountPaid)}</TableCell>
                    <TableCell>
                      <Badge className={status?.color || "bg-gray-100 text-gray-800"}>
                        {status?.label || vendor.status}
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
                              setSelectedVendor(vendor)
                              setViewDialogOpen(true)
                            }}
                          >
                            <Eye className="mr-2 h-4 w-4" />
                            View Details
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            onClick={() => {
                              setSelectedVendor(vendor)
                              setViewDialogOpen(false)
                              setCreateWODialogOpen(true)
                            }}
                          >
                            <Wrench className="mr-2 h-4 w-4" />
                            Create Work Order
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            onClick={() => router.push(`/work-orders?assignedTo=${vendor.id}`)}
                          >
                            <ExternalLink className="mr-2 h-4 w-4" />
                            View Work Orders
                          </DropdownMenuItem>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem
                            className={vendor.status === "active" ? "text-red-600" : "text-green-600"}
                            onClick={() => handleDeactivate(vendor)}
                          >
                            <Trash2 className="mr-2 h-4 w-4" />
                            {vendor.status === "active" ? "Deactivate" : "Reactivate"}
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </TableCell>
                  </TableRow>
                )
              })}
            </TableBody>
          </Table>
          {filteredVendors.length > 0 && (
            <div className="flex items-center justify-between border-t pt-4 mt-4">
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <span>
                  Showing {(currentPage - 1) * pageSize + 1}–{Math.min(currentPage * pageSize, filteredVendors.length)} of {filteredVendors.length}
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
        </CardContent>
      </Card>

      {/* Create Work Order Dialog */}
      <CreateWorkOrderDialog
        open={createWODialogOpen}
        onOpenChange={setCreateWODialogOpen}
        onSuccess={() => {
          toast({ title: "Work order created", description: selectedVendor ? `Work order assigned to ${selectedVendor.name}.` : "Work order created." })
        }}
      />

      {/* View Dialog */}
      <Dialog open={viewDialogOpen} onOpenChange={setViewDialogOpen}>
        <DialogContent className="sm:max-w-[600px]">
          <DialogHeader>
            <DialogTitle>{selectedVendor?.name}</DialogTitle>
            <DialogDescription>Vendor details and performance metrics</DialogDescription>
          </DialogHeader>
          {selectedVendor && (
            <Tabs defaultValue="details" className="w-full">
              <TabsList className="grid w-full grid-cols-3">
                <TabsTrigger value="details">Details</TabsTrigger>
                <TabsTrigger value="performance">Performance</TabsTrigger>
                <TabsTrigger value="financial">Financial</TabsTrigger>
              </TabsList>
              <TabsContent value="details" className="space-y-4">
                <div className="flex items-center gap-4 pt-4">
                  <Badge className={categoryConfig[selectedVendor.category]?.color}>
                    {categoryConfig[selectedVendor.category]?.label}
                  </Badge>
                  <Badge className={statusConfig[selectedVendor.status]?.color}>
                    {statusConfig[selectedVendor.status]?.label}
                  </Badge>
                </div>

                <div className="grid grid-cols-2 gap-4 pt-4 border-t">
                  <div>
                    <span className="text-sm text-muted-foreground">Contact Person</span>
                    <p className="font-medium">{selectedVendor.contactPerson || "—"}</p>
                  </div>
                  <div>
                    <span className="text-sm text-muted-foreground">Email</span>
                    <p className="font-medium">{selectedVendor.email || "—"}</p>
                  </div>
                  <div>
                    <span className="text-sm text-muted-foreground">Phone</span>
                    <p className="font-medium">{selectedVendor.phone || "—"}</p>
                  </div>
                  <div>
                    <span className="text-sm text-muted-foreground">Contract Expiry</span>
                    <p className="font-medium">
                      {selectedVendor.contractExpiry
                        ? format(new Date(selectedVendor.contractExpiry), "MMM d, yyyy")
                        : "—"}
                    </p>
                  </div>
                </div>

                <div className="pt-4 border-t">
                  <span className="text-sm text-muted-foreground">Address</span>
                  <p className="font-medium">{selectedVendor.address || "—"}</p>
                </div>

                <div className="grid grid-cols-2 gap-4 pt-4 border-t">
                  <div>
                    <span className="text-sm text-muted-foreground">GST Number</span>
                    <p className="font-medium">{selectedVendor.gstNumber || "—"}</p>
                  </div>
                  <div>
                    <span className="text-sm text-muted-foreground">PAN Number</span>
                    <p className="font-medium">{selectedVendor.panNumber || "—"}</p>
                  </div>
                </div>
              </TabsContent>

              <TabsContent value="performance" className="space-y-4 pt-4">
                <div className="flex items-center justify-center gap-2 p-4 bg-muted rounded-lg">
                  {[...Array(5)].map((_, i) => (
                    <Star
                      key={i}
                      className={`h-8 w-8 ${
                        i < Math.floor(selectedVendor.performanceRating)
                          ? "fill-yellow-500 text-yellow-500"
                          : "text-gray-300"
                      }`}
                    />
                  ))}
                  <span className={`text-3xl font-bold ml-2 ${getRatingColor(selectedVendor.performanceRating)}`}>
                    {selectedVendor.performanceRating.toFixed(1)}
                  </span>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="p-3 bg-muted rounded-lg text-center">
                    <span className="text-xs text-muted-foreground">Total Work Orders</span>
                    <p className="text-2xl font-bold">{selectedVendor.totalWorkOrders}</p>
                  </div>
                  <div className="p-3 bg-muted rounded-lg text-center">
                    <span className="text-xs text-muted-foreground">Completed</span>
                    <p className="text-2xl font-bold text-green-600">{selectedVendor.completedWorkOrders}</p>
                  </div>
                  <div className="p-3 bg-muted rounded-lg text-center">
                    <span className="text-xs text-muted-foreground">Avg Response Time</span>
                    <p className="text-2xl font-bold">{selectedVendor.avgResponseTime?.toFixed(1) || "—"} hrs</p>
                  </div>
                  <div className="p-3 bg-muted rounded-lg text-center">
                    <span className="text-xs text-muted-foreground">Avg Completion Time</span>
                    <p className="text-2xl font-bold">{selectedVendor.avgCompletionTime?.toFixed(1) || "—"} hrs</p>
                  </div>
                </div>

                <div className="pt-4 border-t">
                  <h4 className="text-sm font-medium mb-2">Completion Rate</h4>
                  <Progress
                    value={(selectedVendor.completedWorkOrders / Math.max(selectedVendor.totalWorkOrders, 1)) * 100}
                    className="h-3"
                  />
                  <p className="text-sm text-muted-foreground mt-1 text-right">
                    {((selectedVendor.completedWorkOrders / Math.max(selectedVendor.totalWorkOrders, 1)) * 100).toFixed(
                      1
                    )}
                    %
                  </p>
                </div>
              </TabsContent>

              <TabsContent value="financial" className="space-y-4 pt-4">
                <div className="p-4 bg-muted rounded-lg text-center">
                  <span className="text-sm text-muted-foreground">Total Amount Paid</span>
                  <p className="text-3xl font-bold">{formatCurrency(selectedVendor.totalAmountPaid)}</p>
                </div>

                {selectedVendor.bankDetails && (
                  <div className="pt-4 border-t">
                    <h4 className="text-sm font-medium mb-3">Bank Details</h4>
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <span className="text-sm text-muted-foreground">Account Name</span>
                        <p className="font-medium">{selectedVendor.bankDetails.accountName}</p>
                      </div>
                      <div>
                        <span className="text-sm text-muted-foreground">Account Number</span>
                        <p className="font-medium">{selectedVendor.bankDetails.accountNumber}</p>
                      </div>
                      <div>
                        <span className="text-sm text-muted-foreground">Bank Name</span>
                        <p className="font-medium">{selectedVendor.bankDetails.bankName}</p>
                      </div>
                      <div>
                        <span className="text-sm text-muted-foreground">IFSC Code</span>
                        <p className="font-medium">{selectedVendor.bankDetails.ifscCode}</p>
                      </div>
                    </div>
                  </div>
                )}
              </TabsContent>
            </Tabs>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setViewDialogOpen(false)}>
              Close
            </Button>
            <Button
              onClick={() => {
                setViewDialogOpen(false)
                setCreateWODialogOpen(true)
              }}
            >
              <Wrench className="h-4 w-4 mr-2" />
              Create Work Order
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
