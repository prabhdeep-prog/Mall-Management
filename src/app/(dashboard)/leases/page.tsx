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
} from "@/components/ui/dialog"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import {
  FileText,
  Plus,
  Search,
  Building2,
  RefreshCw,
  Loader2,
  Eye,
  MoreHorizontal,
  AlertTriangle,
  CheckCircle2,
  Clock,
  XCircle,
  FileSignature,
  IndianRupee,
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
} from "lucide-react"
import { formatCurrency, cn } from "@/lib/utils"
import Link from "next/link"
import { useToast } from "@/components/ui/use-toast"
import { usePropertyStore } from "@/stores/property-store"
import { format, differenceInDays } from "date-fns"
import { CreateLeaseDialog } from "@/components/leases/create-lease-dialog"

interface Lease {
  id: string
  unitNumber: string
  floor: string | null
  zone: string | null
  areaSqft: string
  leaseType: string
  baseRent: string | null
  revenueSharePercentage: string | null
  camCharges: string | null
  securityDeposit: string | null
  startDate: string
  endDate: string
  rentEscalationPercentage: string | null
  escalationFrequencyMonths: number | null
  lockInPeriodMonths: number | null
  noticePeriodMonths: number | null
  status: string | null
  tenant: {
    id: string
    businessName: string
    contactPerson: string | null
  } | null
  property: {
    id: string
    name: string
    code: string
  } | null
}


const statusConfig: Record<string, { color: string; label: string; icon: React.ReactNode }> = {
  active: { color: "bg-emerald-100 text-emerald-700", label: "Active", icon: <CheckCircle2 className="h-3 w-3" /> },
  pending: { color: "bg-yellow-100 text-yellow-700", label: "Pending", icon: <Clock className="h-3 w-3" /> },
  expired: { color: "bg-red-100 text-red-700", label: "Expired", icon: <XCircle className="h-3 w-3" /> },
  terminated: { color: "bg-gray-100 text-gray-700", label: "Terminated", icon: <XCircle className="h-3 w-3" /> },
  renewal_pending: { color: "bg-blue-100 text-blue-700", label: "Renewal Pending", icon: <RefreshCw className="h-3 w-3" /> },
}

const leaseTypeLabels: Record<string, string> = {
  fixed_rent: "Fixed Rent",
  revenue_share: "Revenue Share",
  hybrid: "Hybrid",
  minimum_guarantee: "Minimum Guarantee",
}

export default function LeasesPage() {
  const { toast } = useToast()
  const { selectedProperty, properties, fetchProperties } = usePropertyStore()
  const [leases, setLeases] = React.useState<Lease[]>([])
  const [isLoading, setIsLoading] = React.useState(true)
  const [searchQuery, setSearchQuery] = React.useState("")
  const [statusFilter, setStatusFilter] = React.useState<string>("all")
  const [createDialogOpen, setCreateDialogOpen] = React.useState(false)
  const [selectedLease, setSelectedLease] = React.useState<Lease | null>(null)
  const [viewDialogOpen, setViewDialogOpen] = React.useState(false)
  const [currentPage, setCurrentPage] = React.useState(1)
  const [pageSize, setPageSize] = React.useState(10)

  // Ensure properties are loaded
  React.useEffect(() => { fetchProperties() }, [fetchProperties])

  // Fetch leases
  const fetchLeases = React.useCallback(async () => {
    setIsLoading(true)
    try {
      const params = new URLSearchParams()
      if (selectedProperty) params.set("propertyId", selectedProperty.id)
      if (statusFilter !== "all") params.set("status", statusFilter)
      
      const url = params.toString() ? `/api/leases?${params.toString()}` : "/api/leases"
      const response = await fetch(url)
      if (!response.ok) throw new Error("Failed to fetch leases")
      const result = await response.json()
      setLeases(result.data || result || [])
    } catch (error) {
      console.error("Error fetching leases:", error)
      toast({ title: "Error", description: "Failed to load leases", variant: "destructive" })
    } finally {
      setIsLoading(false)
    }
  }, [selectedProperty, statusFilter, toast])

  React.useEffect(() => {
    fetchLeases()
  }, [fetchLeases])

  // Stats calculations
  const activeLeases = leases.filter(l => l.status === "active").length
  const totalMonthlyRent = leases
    .filter(l => l.status === "active")
    .reduce((sum, l) => sum + parseFloat(l.baseRent || "0"), 0)
  
  const expiringLeases = leases.filter(l => {
    if (l.status !== "active") return false
    const daysToExpiry = differenceInDays(new Date(l.endDate), new Date())
    return daysToExpiry > 0 && daysToExpiry <= 90
  }).length

  const totalArea = leases
    .filter(l => l.status === "active")
    .reduce((sum, l) => sum + parseFloat(l.areaSqft || "0"), 0)

  // Filter leases
  const filteredLeases = leases.filter(lease => {
    const matchesSearch =
      lease.tenant?.businessName.toLowerCase().includes(searchQuery.toLowerCase()) ||
      lease.unitNumber.toLowerCase().includes(searchQuery.toLowerCase()) ||
      lease.property?.name.toLowerCase().includes(searchQuery.toLowerCase())
    return matchesSearch
  })

  const totalPages = Math.ceil(filteredLeases.length / pageSize)
  const paginatedLeases = filteredLeases.slice(
    (currentPage - 1) * pageSize,
    currentPage * pageSize
  )

  React.useEffect(() => {
    setCurrentPage(1)
  }, [searchQuery, statusFilter])

  return (
    <div className="flex flex-col gap-6 p-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Lease Management</h1>
          <p className="text-muted-foreground">
            Manage lease agreements across all properties
            {selectedProperty && ` • ${selectedProperty.name}`}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" className="gap-1" onClick={() => fetchLeases()}>
            <RefreshCw className="h-4 w-4" /> Refresh
          </Button>
          <Button className="gap-1 bg-emerald-500 hover:bg-emerald-600" onClick={() => setCreateDialogOpen(true)}>
            <Plus className="h-4 w-4" /> Create Lease
          </Button>
          <CreateLeaseDialog
            open={createDialogOpen}
            onOpenChange={setCreateDialogOpen}
            properties={properties}
            selectedPropertyId={selectedProperty?.id}
            onSuccess={fetchLeases}
          />
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Active Leases</CardTitle>
            <FileSignature className="h-4 w-4 text-emerald-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{activeLeases}</div>
            <p className="text-xs text-muted-foreground">{leases.length} total leases</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Monthly Revenue</CardTitle>
            <IndianRupee className="h-4 w-4 text-emerald-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{formatCurrency(totalMonthlyRent)}</div>
            <p className="text-xs text-emerald-600">From active leases</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Leased Area</CardTitle>
            <Building2 className="h-4 w-4 text-blue-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{totalArea.toLocaleString()}</div>
            <p className="text-xs text-muted-foreground">sq.ft under active leases</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Expiring Soon</CardTitle>
            <AlertTriangle className="h-4 w-4 text-amber-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{expiringLeases}</div>
            <p className="text-xs text-amber-600">Within 90 days</p>
          </CardContent>
        </Card>
      </div>

      {/* Filters */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-base">Lease Directory</CardTitle>
            <div className="flex items-center gap-2">
              <div className="relative">
                <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search leases..."
                  className="pl-8 w-[250px]"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                />
              </div>
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger className="w-[150px]">
                  <SelectValue placeholder="Status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Status</SelectItem>
                  <SelectItem value="active">Active</SelectItem>
                  <SelectItem value="pending">Pending</SelectItem>
                  <SelectItem value="expired">Expired</SelectItem>
                  <SelectItem value="terminated">Terminated</SelectItem>
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
          ) : filteredLeases.length === 0 ? (
            <div className="text-center py-12">
              <FileText className="h-12 w-12 text-muted-foreground/50 mx-auto mb-4" />
              <h3 className="text-lg font-semibold">No Leases Found</h3>
              <p className="text-muted-foreground mb-4">
                {searchQuery ? "Try a different search term" : "Create your first lease to get started"}
              </p>
              <Button className="gap-1 bg-emerald-500 hover:bg-emerald-600" onClick={() => setCreateDialogOpen(true)}>
                <Plus className="h-4 w-4" /> Create Lease
              </Button>
            </div>
          ) : (
            <>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Tenant</TableHead>
                  <TableHead>Property / Unit</TableHead>
                  <TableHead>Area</TableHead>
                  <TableHead>Rent</TableHead>
                  <TableHead>Duration</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {paginatedLeases.map((lease) => {
                  const daysToExpiry = differenceInDays(new Date(lease.endDate), new Date())
                  const isExpiringSoon = daysToExpiry > 0 && daysToExpiry <= 90
                  
                  return (
                    <TableRow key={lease.id}>
                      <TableCell>
                        <div>
                          <Link href={`/tenants/${lease.tenant?.id}`} className="font-medium hover:underline">
                            {lease.tenant?.businessName || "Unknown"}
                          </Link>
                          <p className="text-xs text-muted-foreground">{lease.tenant?.contactPerson}</p>
                        </div>
                      </TableCell>
                      <TableCell>
                        <div>
                          <span className="font-medium">{lease.property?.name}</span>
                          <p className="text-xs text-muted-foreground">
                            Unit {lease.unitNumber} • {lease.floor || "Ground"} Floor
                          </p>
                        </div>
                      </TableCell>
                      <TableCell>{parseFloat(lease.areaSqft).toLocaleString()} sq.ft</TableCell>
                      <TableCell>
                        <div>
                          <span className="font-medium">{formatCurrency(parseFloat(lease.baseRent || "0"))}</span>
                          <p className="text-xs text-muted-foreground">/month</p>
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="text-sm">
                          <div>{format(new Date(lease.startDate), "dd MMM yyyy")}</div>
                          <div className="text-muted-foreground">to {format(new Date(lease.endDate), "dd MMM yyyy")}</div>
                          {isExpiringSoon && (
                            <Badge variant="outline" className="text-amber-600 border-amber-300 mt-1">
                              {daysToExpiry} days left
                            </Badge>
                          )}
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline">{leaseTypeLabels[lease.leaseType] || lease.leaseType}</Badge>
                      </TableCell>
                      <TableCell>
                        <Badge className={cn("gap-1", statusConfig[lease.status || "active"]?.color)}>
                          {statusConfig[lease.status || "active"]?.icon}
                          {statusConfig[lease.status || "active"]?.label}
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
                            <DropdownMenuItem asChild>
                              <Link href={`/leases/${lease.id}`}>
                                <Eye className="h-4 w-4 mr-2" /> Full Lease Details
                              </Link>
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={() => { setSelectedLease(lease); setViewDialogOpen(true); }}>
                              <Eye className="h-4 w-4 mr-2" /> Quick View
                            </DropdownMenuItem>
                            <DropdownMenuItem asChild>
                              <Link href={`/tenants/${lease.tenant?.id}`}>
                                <Building2 className="h-4 w-4 mr-2" /> View Tenant
                              </Link>
                            </DropdownMenuItem>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem asChild>
                              <Link href={`/financials?leaseId=${lease.id}`}>
                                <IndianRupee className="h-4 w-4 mr-2" /> View Invoices
                              </Link>
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </TableCell>
                    </TableRow>
                  )
                })}
              </TableBody>
            </Table>
            {filteredLeases.length > 0 && (
              <div className="flex items-center justify-between border-t pt-4 mt-4">
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <span>
                    Showing {(currentPage - 1) * pageSize + 1}–{Math.min(currentPage * pageSize, filteredLeases.length)} of {filteredLeases.length}
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

      {/* View Lease Dialog */}
      <Dialog open={viewDialogOpen} onOpenChange={setViewDialogOpen}>
        <DialogContent className="sm:max-w-[600px]">
          <DialogHeader>
            <DialogTitle>Lease Details</DialogTitle>
            <DialogDescription>
              {selectedLease?.tenant?.businessName} - Unit {selectedLease?.unitNumber}
            </DialogDescription>
          </DialogHeader>
          {selectedLease && (
            <div className="space-y-6">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-sm text-muted-foreground">Property</label>
                  <p className="font-medium">{selectedLease.property?.name}</p>
                </div>
                <div>
                  <label className="text-sm text-muted-foreground">Unit / Floor</label>
                  <p className="font-medium">{selectedLease.unitNumber} / {selectedLease.floor || "Ground"}</p>
                </div>
                <div>
                  <label className="text-sm text-muted-foreground">Area</label>
                  <p className="font-medium">{parseFloat(selectedLease.areaSqft).toLocaleString()} sq.ft</p>
                </div>
                <div>
                  <label className="text-sm text-muted-foreground">Lease Type</label>
                  <p className="font-medium">{leaseTypeLabels[selectedLease.leaseType] || selectedLease.leaseType}</p>
                </div>
                <div>
                  <label className="text-sm text-muted-foreground">Base Rent</label>
                  <p className="font-medium">{formatCurrency(parseFloat(selectedLease.baseRent || "0"))}/month</p>
                </div>
                <div>
                  <label className="text-sm text-muted-foreground">CAM Charges</label>
                  <p className="font-medium">{formatCurrency(parseFloat(selectedLease.camCharges || "0"))}/month</p>
                </div>
                <div>
                  <label className="text-sm text-muted-foreground">Security Deposit</label>
                  <p className="font-medium">{formatCurrency(parseFloat(selectedLease.securityDeposit || "0"))}</p>
                </div>
                <div>
                  <label className="text-sm text-muted-foreground">Escalation</label>
                  <p className="font-medium">{selectedLease.rentEscalationPercentage || "0"}% / {selectedLease.escalationFrequencyMonths || 12} months</p>
                </div>
                <div>
                  <label className="text-sm text-muted-foreground">Start Date</label>
                  <p className="font-medium">{format(new Date(selectedLease.startDate), "dd MMM yyyy")}</p>
                </div>
                <div>
                  <label className="text-sm text-muted-foreground">End Date</label>
                  <p className="font-medium">{format(new Date(selectedLease.endDate), "dd MMM yyyy")}</p>
                </div>
                <div>
                  <label className="text-sm text-muted-foreground">Lock-in Period</label>
                  <p className="font-medium">{selectedLease.lockInPeriodMonths || 0} months</p>
                </div>
                <div>
                  <label className="text-sm text-muted-foreground">Notice Period</label>
                  <p className="font-medium">{selectedLease.noticePeriodMonths || 3} months</p>
                </div>
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setViewDialogOpen(false)}>Close</Button>
            <Button asChild className="bg-emerald-500 hover:bg-emerald-600">
              <Link href={`/tenants/${selectedLease?.tenant?.id}`}>View Tenant</Link>
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

