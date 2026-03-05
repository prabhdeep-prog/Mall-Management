"use client"

import * as React from "react"
import { Suspense } from "react"
import { useSearchParams } from "next/navigation"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
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
  DialogTrigger,
} from "@/components/ui/dialog"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import {
  CreditCard,
  Plus,
  Search,
  Filter,
  TrendingUp,
  TrendingDown,
  Clock,
  CheckCircle2,
  AlertCircle,
  Send,
  Download,
  MoreHorizontal,
  IndianRupee,
  Bot,
  Calendar,
  RefreshCw,
  Loader2,
  Eye,
  Banknote,
  XCircle,
} from "lucide-react"
import { formatCurrency, formatDate } from "@/lib/utils"
import { useToast } from "@/components/ui/use-toast"
import { usePropertyStore } from "@/stores/property-store"

interface Invoice {
  id: string
  invoiceNumber: string
  invoiceType: string
  periodStart: string
  periodEnd: string
  amount: string
  gstAmount: string
  totalAmount: string
  dueDate: string
  status: string
  paidAmount: string | null
  paidDate: string | null
  predictedPaymentDate: string | null
  predictionConfidence: string | null
  remindersSent: number
  tenant: {
    id: string
    businessName: string
    contactPerson: string | null
    email: string | null
  } | null
  lease: {
    id: string
    unitNumber: string
  } | null
}

const statusConfig: Record<string, { color: string; label: string; icon: React.ReactNode }> = {
  pending: { color: "bg-yellow-100 text-yellow-700", label: "Pending", icon: <Clock className="h-3 w-3" /> },
  paid: { color: "bg-green-100 text-green-700", label: "Paid", icon: <CheckCircle2 className="h-3 w-3" /> },
  overdue: { color: "bg-red-100 text-red-700", label: "Overdue", icon: <AlertCircle className="h-3 w-3" /> },
  cancelled: { color: "bg-gray-100 text-gray-700", label: "Cancelled", icon: null },
}

const invoiceTypeLabels: Record<string, string> = {
  rent: "Rent",
  cam: "CAM Charges",
  utility: "Utility",
  late_fee: "Late Fee",
  revenue_share: "Revenue Share (POS)",
  other: "Other",
}

function FinancialsPageContent() {
  const { toast } = useToast()
  const searchParams = useSearchParams()
  const { selectedProperty } = usePropertyStore()
  const tenantIdFilter = searchParams.get("tenantId")
  const [invoices, setInvoices] = React.useState<Invoice[]>([])
  const [isLoading, setIsLoading] = React.useState(true)
  const [searchQuery, setSearchQuery] = React.useState("")
  const [statusFilter, setStatusFilter] = React.useState<string>("all")
  const [filterTenantName, setFilterTenantName] = React.useState<string | null>(null)
  
  // Dialog states
  const [createDialogOpen, setCreateDialogOpen] = React.useState(false)
  const [viewDialogOpen, setViewDialogOpen] = React.useState(false)
  const [paymentDialogOpen, setPaymentDialogOpen] = React.useState(false)
  const [selectedInvoice, setSelectedInvoice] = React.useState<Invoice | null>(null)
  const [isSubmitting, setIsSubmitting] = React.useState(false)
  const [leases, setLeases] = React.useState<{id: string; unitNumber: string; tenantName: string; propertyName: string}[]>([])
  
  // Form states
  const [invoiceForm, setInvoiceForm] = React.useState({
    leaseId: "",
    invoiceType: "rent",
    amount: "",
    gstAmount: "",
    dueDate: "",
    periodStart: "",
    periodEnd: "",
  })
  
  const [paymentForm, setPaymentForm] = React.useState({
    amount: "",
    paymentDate: new Date().toISOString().split("T")[0],
    paymentMethod: "bank_transfer",
    referenceNumber: "",
  })

  // Fetch leases for create invoice form - filtered by selected property
  React.useEffect(() => {
    const fetchLeases = async () => {
      try {
        const url = selectedProperty 
          ? `/api/leases?status=active&propertyId=${selectedProperty.id}`
          : "/api/leases?status=active"
        const response = await fetch(url)
        if (response.ok) {
          const result = await response.json()
          // API returns { success: true, data: [...] }
          const leasesData = result.data || result || []
          setLeases(leasesData.map((l: any) => ({
            id: l.id,
            unitNumber: l.unitNumber,
            tenantName: l.tenant?.businessName || "Unknown",
            propertyName: l.property?.name || "Unknown",
          })))
        }
      } catch (error) {
        console.error("Error fetching leases:", error)
      }
    }
    fetchLeases()
  }, [selectedProperty])

  // Fetch invoices from API - filtered by selected property
  const fetchInvoices = React.useCallback(async () => {
    setIsLoading(true)
    try {
      // Build URL with filters
      const params = new URLSearchParams()
      if (statusFilter !== "all") params.set("status", statusFilter)
      if (tenantIdFilter) params.set("tenantId", tenantIdFilter)
      if (selectedProperty) params.set("propertyId", selectedProperty.id)
      
      const url = params.toString() ? `/api/invoices?${params.toString()}` : "/api/invoices"
      const response = await fetch(url)
      if (!response.ok) throw new Error("Failed to fetch invoices")
      const result = await response.json()
      const invoicesData = result.data || result || []
      setInvoices(invoicesData)
      
      // If filtering by tenant, get tenant name from first invoice
      if (tenantIdFilter && invoicesData.length > 0 && invoicesData[0].tenant) {
        setFilterTenantName(invoicesData[0].tenant.businessName)
      }
    } catch (error) {
      console.error("Error fetching invoices:", error)
      toast({
        title: "Error",
        description: "Failed to load invoices. Please try again.",
        variant: "destructive",
      })
    } finally {
      setIsLoading(false)
    }
  }, [statusFilter, tenantIdFilter, selectedProperty, toast])

  React.useEffect(() => {
    fetchInvoices()
  }, [fetchInvoices])

  // Create invoice handler
  const handleCreateInvoice = async (e: React.FormEvent) => {
    e.preventDefault()
    setIsSubmitting(true)
    
    try {
      const response = await fetch("/api/invoices", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(invoiceForm),
      })
      
      if (!response.ok) throw new Error("Failed to create invoice")
      
      toast({
        title: "Success",
        description: "Invoice created successfully!",
      })
      
      setCreateDialogOpen(false)
      setInvoiceForm({
        leaseId: "",
        invoiceType: "rent",
        amount: "",
        gstAmount: "",
        dueDate: "",
        periodStart: "",
        periodEnd: "",
      })
      fetchInvoices()
    } catch (error) {
      console.error("Error creating invoice:", error)
      toast({
        title: "Error",
        description: "Failed to create invoice. Please try again.",
        variant: "destructive",
      })
    } finally {
      setIsSubmitting(false)
    }
  }

  // Record payment handler
  const handleRecordPayment = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!selectedInvoice) return
    
    setIsSubmitting(true)
    
    try {
      const response = await fetch(`/api/invoices/${selectedInvoice.id}/payment`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(paymentForm),
      })
      
      if (!response.ok) throw new Error("Failed to record payment")
      
      toast({
        title: "Success",
        description: "Payment recorded successfully!",
      })
      
      setPaymentDialogOpen(false)
      setSelectedInvoice(null)
      setPaymentForm({
        amount: "",
        paymentDate: new Date().toISOString().split("T")[0],
        paymentMethod: "bank_transfer",
        referenceNumber: "",
      })
      fetchInvoices()
    } catch (error) {
      console.error("Error recording payment:", error)
      toast({
        title: "Error",
        description: "Failed to record payment. Please try again.",
        variant: "destructive",
      })
    } finally {
      setIsSubmitting(false)
    }
  }

  // Send reminder handler
  const handleSendReminder = async (invoice: Invoice) => {
    try {
      const response = await fetch(`/api/invoices/${invoice.id}/reminder`, {
        method: "POST",
      })
      
      if (!response.ok) throw new Error("Failed to send reminder")
      
      toast({
        title: "Reminder Sent",
        description: `Payment reminder sent to ${invoice.tenant?.businessName || "tenant"}`,
      })
      
      fetchInvoices()
    } catch (error) {
      console.error("Error sending reminder:", error)
      toast({
        title: "Error",
        description: "Failed to send reminder. Please try again.",
        variant: "destructive",
      })
    }
  }

  // Cancel invoice handler
  const handleCancelInvoice = async (invoice: Invoice) => {
    if (!confirm(`Are you sure you want to cancel invoice ${invoice.invoiceNumber}?`)) return
    
    try {
      const response = await fetch(`/api/invoices/${invoice.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "cancelled" }),
      })
      
      if (!response.ok) throw new Error("Failed to cancel invoice")
      
      toast({
        title: "Invoice Cancelled",
        description: `Invoice ${invoice.invoiceNumber} has been cancelled`,
      })
      
      fetchInvoices()
    } catch (error) {
      console.error("Error cancelling invoice:", error)
      toast({
        title: "Error",
        description: "Failed to cancel invoice. Please try again.",
        variant: "destructive",
      })
    }
  }

  // View invoice handler
  const handleViewInvoice = (invoice: Invoice) => {
    setSelectedInvoice(invoice)
    setViewDialogOpen(true)
  }

  // Open payment dialog
  const handleOpenPaymentDialog = (invoice: Invoice) => {
    setSelectedInvoice(invoice)
    setPaymentForm({
      amount: invoice.totalAmount,
      paymentDate: new Date().toISOString().split("T")[0],
      paymentMethod: "bank_transfer",
      referenceNumber: "",
    })
    setPaymentDialogOpen(true)
  }

  const filteredInvoices = invoices.filter((inv) => {
    const matchesSearch =
      inv.invoiceNumber.toLowerCase().includes(searchQuery.toLowerCase()) ||
      inv.tenant?.businessName.toLowerCase().includes(searchQuery.toLowerCase())
    return matchesSearch
  })

  const stats = {
    totalOutstanding: invoices
      .filter((inv) => inv.status !== "paid")
      .reduce((sum, inv) => sum + parseFloat(inv.totalAmount || "0"), 0),
    totalCollected: invoices
      .filter((inv) => inv.status === "paid")
      .reduce((sum, inv) => sum + parseFloat(inv.paidAmount || inv.totalAmount || "0"), 0),
    overdueCount: invoices.filter((inv) => inv.status === "overdue").length,
    pendingCount: invoices.filter((inv) => inv.status === "pending").length,
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Financials</h1>
          <p className="text-muted-foreground">
            Manage invoices, track payments, and monitor collections
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={fetchInvoices} disabled={isLoading}>
            <RefreshCw className={`h-4 w-4 mr-2 ${isLoading ? "animate-spin" : ""}`} />
            Refresh
          </Button>
          <Button variant="outline" className="gap-2">
            <Download className="h-4 w-4" />
            Export
          </Button>
          <Dialog open={createDialogOpen} onOpenChange={setCreateDialogOpen}>
            <DialogTrigger asChild>
              <Button className="gap-2">
                <Plus className="h-4 w-4" />
                Create Invoice
              </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-[500px]">
              <form onSubmit={handleCreateInvoice}>
                <DialogHeader>
                  <DialogTitle>Create New Invoice</DialogTitle>
                  <DialogDescription>
                    Generate a new invoice for a tenant
                  </DialogDescription>
                </DialogHeader>
                <div className="grid gap-4 py-4">
                  <div className="grid gap-2">
                    <label className="text-sm font-medium">Lease / Tenant *</label>
                    <Select
                      value={invoiceForm.leaseId}
                      onValueChange={(value) => setInvoiceForm(prev => ({ ...prev, leaseId: value }))}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder={leases.length === 0 ? "No active leases found" : "Select a lease"} />
                      </SelectTrigger>
                      <SelectContent>
                        {leases.length === 0 ? (
                          <div className="px-2 py-4 text-sm text-muted-foreground text-center">
                            No active leases found{selectedProperty ? ` for ${selectedProperty.name}` : ""}
                          </div>
                        ) : (
                          leases.map((lease) => (
                            <SelectItem key={lease.id} value={lease.id}>
                              {lease.tenantName} - Unit {lease.unitNumber}
                            </SelectItem>
                          ))
                        )}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="grid gap-2">
                      <label className="text-sm font-medium">Invoice Type *</label>
                      <Select
                        value={invoiceForm.invoiceType}
                        onValueChange={(value) => setInvoiceForm(prev => ({ ...prev, invoiceType: value }))}
                      >
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="rent">Rent</SelectItem>
                          <SelectItem value="revenue_share">Revenue Share (POS)</SelectItem>
                          <SelectItem value="cam">CAM Charges</SelectItem>
                          <SelectItem value="utility">Utility</SelectItem>
                          <SelectItem value="late_fee">Late Fee</SelectItem>
                          <SelectItem value="other">Other</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="grid gap-2">
                      <label className="text-sm font-medium">Due Date *</label>
                      <Input
                        type="date"
                        value={invoiceForm.dueDate}
                        onChange={(e) => setInvoiceForm(prev => ({ ...prev, dueDate: e.target.value }))}
                        required
                      />
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="grid gap-2">
                      <label className="text-sm font-medium">Period Start *</label>
                      <Input
                        type="date"
                        value={invoiceForm.periodStart}
                        onChange={(e) => setInvoiceForm(prev => ({ ...prev, periodStart: e.target.value }))}
                        required
                      />
                    </div>
                    <div className="grid gap-2">
                      <label className="text-sm font-medium">Period End *</label>
                      <Input
                        type="date"
                        value={invoiceForm.periodEnd}
                        onChange={(e) => setInvoiceForm(prev => ({ ...prev, periodEnd: e.target.value }))}
                        required
                      />
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="grid gap-2">
                      <label className="text-sm font-medium">Amount (₹) *</label>
                      <Input
                        type="number"
                        placeholder="0.00"
                        value={invoiceForm.amount}
                        onChange={(e) => setInvoiceForm(prev => ({ ...prev, amount: e.target.value }))}
                        required
                      />
                    </div>
                    <div className="grid gap-2">
                      <label className="text-sm font-medium">GST Amount (₹)</label>
                      <Input
                        type="number"
                        placeholder="0.00"
                        value={invoiceForm.gstAmount}
                        onChange={(e) => setInvoiceForm(prev => ({ ...prev, gstAmount: e.target.value }))}
                      />
                    </div>
                  </div>
                </div>
                <DialogFooter>
                  <Button type="button" variant="outline" onClick={() => setCreateDialogOpen(false)}>
                    Cancel
                  </Button>
                  <Button type="submit" disabled={isSubmitting}>
                    {isSubmitting && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                    Create Invoice
                  </Button>
                </DialogFooter>
              </form>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Outstanding</CardTitle>
            <IndianRupee className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{formatCurrency(stats.totalOutstanding)}</div>
            <p className="text-xs text-muted-foreground">
              {stats.pendingCount + stats.overdueCount} invoices
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Collected (MTD)</CardTitle>
            <TrendingUp className="h-4 w-4 text-green-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{formatCurrency(stats.totalCollected)}</div>
            <p className="text-xs text-green-600">From paid invoices</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Overdue</CardTitle>
            <AlertCircle className="h-4 w-4 text-red-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-red-600">{stats.overdueCount}</div>
            <p className="text-xs text-muted-foreground">Requires follow-up</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Collection Rate</CardTitle>
            <TrendingUp className="h-4 w-4 text-green-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {invoices.length > 0 
                ? ((invoices.filter(i => i.status === "paid").length / invoices.length) * 100).toFixed(1)
                : 0}%
            </div>
            <p className="text-xs text-muted-foreground">Current period</p>
          </CardContent>
        </Card>
      </div>

      {/* AI Insights Card */}
      <Card className="border-blue-200 bg-blue-50/30 dark:border-blue-900 dark:bg-blue-950/20">
        <CardHeader className="pb-3">
          <div className="flex items-center gap-2">
            <Bot className="h-5 w-5 text-blue-600 dark:text-blue-400" />
            <CardTitle className="text-base">AI Collection Insights</CardTitle>
          </div>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 md:grid-cols-3">
            <div className="flex items-start gap-3 p-3 bg-card rounded-lg border">
              <div className="p-2 bg-green-100 dark:bg-green-900/30 rounded-lg">
                <TrendingUp className="h-4 w-4 text-green-600 dark:text-green-400" />
              </div>
              <div>
                <p className="text-sm font-medium">Outstanding Amount</p>
                <p className="text-xs text-muted-foreground">
                  {formatCurrency(stats.totalOutstanding)} pending collection
                </p>
              </div>
            </div>
            <div className="flex items-start gap-3 p-3 bg-card rounded-lg border">
              <div className="p-2 bg-yellow-100 dark:bg-yellow-900/30 rounded-lg">
                <Clock className="h-4 w-4 text-yellow-600 dark:text-yellow-400" />
              </div>
              <div>
                <p className="text-sm font-medium">At-Risk Payments</p>
                <p className="text-xs text-muted-foreground">
                  {stats.overdueCount} invoices showing delayed payment patterns
                </p>
              </div>
            </div>
            <div className="flex items-start gap-3 p-3 bg-card rounded-lg border">
              <div className="p-2 bg-blue-100 dark:bg-blue-900/30 rounded-lg">
                <Send className="h-4 w-4 text-blue-600 dark:text-blue-400" />
              </div>
              <div>
                <p className="text-sm font-medium">Suggested Actions</p>
                <p className="text-xs text-muted-foreground">
                  {stats.pendingCount} payment reminders scheduled by AI agent
                </p>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Invoices Table */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-base">All Invoices</CardTitle>
            <div className="flex items-center gap-2">
              <div className="relative">
                <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search invoices..."
                  className="pl-8 w-[250px]"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                />
              </div>
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger className="w-[130px]">
                  <Filter className="h-4 w-4 mr-2" />
                  <SelectValue placeholder="Status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Status</SelectItem>
                  <SelectItem value="pending">Pending</SelectItem>
                  <SelectItem value="paid">Paid</SelectItem>
                  <SelectItem value="overdue">Overdue</SelectItem>
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
          ) : filteredInvoices.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <CreditCard className="h-12 w-12 text-muted-foreground/50 mb-4" />
              <h3 className="text-lg font-semibold">No invoices found</h3>
              <p className="text-muted-foreground">
                {invoices.length === 0
                  ? "Create your first invoice to get started"
                  : "Try adjusting your search or filters"}
              </p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Invoice</TableHead>
                  <TableHead>Tenant</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead className="text-right">Amount</TableHead>
                  <TableHead>Due Date</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>AI Prediction</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredInvoices.map((invoice) => {
                  const status = statusConfig[invoice.status] || statusConfig.pending
                  const isPredicted = invoice.predictedPaymentDate && invoice.predictionConfidence
                  const confidence = parseFloat(invoice.predictionConfidence || "0") * 100
                  
                  return (
                    <TableRow key={invoice.id}>
                      <TableCell>
                        <div>
                          <div className="font-mono text-sm font-medium">
                            {invoice.invoiceNumber}
                          </div>
                          <div className="text-xs text-muted-foreground">
                            {formatDate(invoice.periodStart)} - {formatDate(invoice.periodEnd)}
                          </div>
                        </div>
                      </TableCell>
                      <TableCell>
                        {invoice.tenant ? (
                          <div className="flex items-center gap-2">
                            <Avatar className="h-8 w-8">
                              <AvatarFallback className="text-xs bg-primary/10 text-primary">
                                {invoice.tenant.businessName.charAt(0)}
                              </AvatarFallback>
                            </Avatar>
                            <div>
                              <div className="font-medium text-sm">{invoice.tenant.businessName}</div>
                              <div className="text-xs text-muted-foreground">
                                Unit {invoice.lease?.unitNumber || "N/A"}
                              </div>
                            </div>
                          </div>
                        ) : (
                          <span className="text-muted-foreground">-</span>
                        )}
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline" className={invoice.invoiceType === "revenue_share" ? "border-emerald-300 bg-emerald-50 text-emerald-700" : ""}>
                          {invoiceTypeLabels[invoice.invoiceType] || invoice.invoiceType}
                        </Badge>
                        {invoice.invoiceType === "revenue_share" && (
                          <div className="text-[10px] text-emerald-600 mt-0.5 font-medium">POS-Verified</div>
                        )}
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="font-medium">{formatCurrency(invoice.totalAmount)}</div>
                        <div className="text-xs text-muted-foreground">
                          +{formatCurrency(invoice.gstAmount)} GST
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-1">
                          <Calendar className="h-3.5 w-3.5 text-muted-foreground" />
                          <span className="text-sm">{formatDate(invoice.dueDate)}</span>
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge className={`gap-1 ${status.color}`}>
                          {status.icon}
                          {status.label}
                        </Badge>
                        {invoice.remindersSent > 0 && (
                          <div className="text-xs text-muted-foreground mt-1">
                            {invoice.remindersSent} reminder{invoice.remindersSent > 1 ? "s" : ""} sent
                          </div>
                        )}
                      </TableCell>
                      <TableCell>
                        {isPredicted && invoice.status !== "paid" ? (
                          <div className="flex items-center gap-2">
                            <Bot className="h-3.5 w-3.5 text-blue-600" />
                            <div>
                              <div className="text-sm">{formatDate(invoice.predictedPaymentDate!)}</div>
                              <div className="text-xs text-muted-foreground">
                                {confidence.toFixed(0)}% confidence
                              </div>
                            </div>
                          </div>
                        ) : invoice.status === "paid" && invoice.paidDate ? (
                          <span className="text-xs text-muted-foreground">
                            Paid on {formatDate(invoice.paidDate)}
                          </span>
                        ) : (
                          <span className="text-xs text-muted-foreground">-</span>
                        )}
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex items-center justify-end gap-1">
                          {invoice.status !== "paid" && invoice.status !== "cancelled" && (
                            <Button 
                              variant="ghost" 
                              size="icon" 
                              title="Send Reminder"
                              onClick={() => handleSendReminder(invoice)}
                            >
                              <Send className="h-4 w-4" />
                            </Button>
                          )}
                          <Button variant="ghost" size="icon" title="Download">
                            <Download className="h-4 w-4" />
                          </Button>
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button variant="ghost" size="icon">
                                <MoreHorizontal className="h-4 w-4" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                              <DropdownMenuItem onClick={() => handleViewInvoice(invoice)}>
                                <Eye className="mr-2 h-4 w-4" />
                                View Details
                              </DropdownMenuItem>
                              {invoice.status !== "paid" && invoice.status !== "cancelled" && (
                                <>
                                  <DropdownMenuItem onClick={() => handleOpenPaymentDialog(invoice)}>
                                    <Banknote className="mr-2 h-4 w-4" />
                                    Record Payment
                                  </DropdownMenuItem>
                                  <DropdownMenuItem onClick={() => handleSendReminder(invoice)}>
                                    <Send className="mr-2 h-4 w-4" />
                                    Send Reminder
                                  </DropdownMenuItem>
                                  <DropdownMenuSeparator />
                                  <DropdownMenuItem 
                                    onClick={() => handleCancelInvoice(invoice)}
                                    className="text-red-600"
                                  >
                                    <XCircle className="mr-2 h-4 w-4" />
                                    Cancel Invoice
                                  </DropdownMenuItem>
                                </>
                              )}
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </div>
                      </TableCell>
                    </TableRow>
                  )
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* View Invoice Dialog */}
      <Dialog open={viewDialogOpen} onOpenChange={setViewDialogOpen}>
        <DialogContent className="sm:max-w-[500px]">
          <DialogHeader>
            <DialogTitle>Invoice Details</DialogTitle>
            <DialogDescription>
              {selectedInvoice?.invoiceNumber}
            </DialogDescription>
          </DialogHeader>
          {selectedInvoice && (
            <div className="grid gap-4 py-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className="text-sm font-medium text-muted-foreground">Tenant</p>
                  <p className="font-medium">{selectedInvoice.tenant?.businessName || "N/A"}</p>
                </div>
                <div>
                  <p className="text-sm font-medium text-muted-foreground">Unit</p>
                  <p className="font-medium">{selectedInvoice.lease?.unitNumber || "N/A"}</p>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className="text-sm font-medium text-muted-foreground">Type</p>
                  <p className="font-medium">{invoiceTypeLabels[selectedInvoice.invoiceType] || selectedInvoice.invoiceType}</p>
                </div>
                <div>
                  <p className="text-sm font-medium text-muted-foreground">Status</p>
                  <Badge className={statusConfig[selectedInvoice.status]?.color || ""}>
                    {statusConfig[selectedInvoice.status]?.label || selectedInvoice.status}
                  </Badge>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className="text-sm font-medium text-muted-foreground">Period</p>
                  <p className="font-medium">{formatDate(selectedInvoice.periodStart)} - {formatDate(selectedInvoice.periodEnd)}</p>
                </div>
                <div>
                  <p className="text-sm font-medium text-muted-foreground">Due Date</p>
                  <p className="font-medium">{formatDate(selectedInvoice.dueDate)}</p>
                </div>
              </div>
              <div className="border-t pt-4">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Base Amount</span>
                  <span>{formatCurrency(selectedInvoice.amount)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">GST</span>
                  <span>{formatCurrency(selectedInvoice.gstAmount)}</span>
                </div>
                <div className="flex justify-between font-bold border-t pt-2 mt-2">
                  <span>Total</span>
                  <span>{formatCurrency(selectedInvoice.totalAmount)}</span>
                </div>
                {selectedInvoice.paidAmount && (
                  <div className="flex justify-between text-green-600 mt-2">
                    <span>Paid</span>
                    <span>{formatCurrency(selectedInvoice.paidAmount)}</span>
                  </div>
                )}
              </div>
              {selectedInvoice.remindersSent > 0 && (
                <div className="text-sm text-muted-foreground">
                  {selectedInvoice.remindersSent} reminder(s) sent
                </div>
              )}
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setViewDialogOpen(false)}>
              Close
            </Button>
            {selectedInvoice?.status !== "paid" && selectedInvoice?.status !== "cancelled" && (
              <Button onClick={() => {
                setViewDialogOpen(false)
                handleOpenPaymentDialog(selectedInvoice!)
              }}>
                Record Payment
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Record Payment Dialog */}
      <Dialog open={paymentDialogOpen} onOpenChange={setPaymentDialogOpen}>
        <DialogContent className="sm:max-w-[400px]">
          <form onSubmit={handleRecordPayment}>
            <DialogHeader>
              <DialogTitle>Record Payment</DialogTitle>
              <DialogDescription>
                Invoice: {selectedInvoice?.invoiceNumber}
              </DialogDescription>
            </DialogHeader>
            <div className="grid gap-4 py-4">
              <div className="grid gap-2">
                <label className="text-sm font-medium">Amount (₹) *</label>
                <Input
                  type="number"
                  placeholder="0.00"
                  value={paymentForm.amount}
                  onChange={(e) => setPaymentForm(prev => ({ ...prev, amount: e.target.value }))}
                  required
                />
                <p className="text-xs text-muted-foreground">
                  Invoice total: {formatCurrency(selectedInvoice?.totalAmount || "0")}
                </p>
              </div>
              <div className="grid gap-2">
                <label className="text-sm font-medium">Payment Date *</label>
                <Input
                  type="date"
                  value={paymentForm.paymentDate}
                  onChange={(e) => setPaymentForm(prev => ({ ...prev, paymentDate: e.target.value }))}
                  required
                />
              </div>
              <div className="grid gap-2">
                <label className="text-sm font-medium">Payment Method</label>
                <Select
                  value={paymentForm.paymentMethod}
                  onValueChange={(value) => setPaymentForm(prev => ({ ...prev, paymentMethod: value }))}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="bank_transfer">Bank Transfer</SelectItem>
                    <SelectItem value="upi">UPI</SelectItem>
                    <SelectItem value="cheque">Cheque</SelectItem>
                    <SelectItem value="cash">Cash</SelectItem>
                    <SelectItem value="card">Card</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="grid gap-2">
                <label className="text-sm font-medium">Reference Number</label>
                <Input
                  placeholder="Transaction ID / Cheque No."
                  value={paymentForm.referenceNumber}
                  onChange={(e) => setPaymentForm(prev => ({ ...prev, referenceNumber: e.target.value }))}
                />
              </div>
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setPaymentDialogOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={isSubmitting}>
                {isSubmitting && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                Record Payment
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  )
}

// Wrap with Suspense for useSearchParams
export default function FinancialsPage() {
  return (
    <Suspense fallback={<div className="flex items-center justify-center h-64"><Loader2 className="h-8 w-8 animate-spin" /></div>}>
      <FinancialsPageContent />
    </Suspense>
  )
}
