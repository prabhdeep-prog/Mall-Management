"use client"

import * as React from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  FileText,
  Wrench,
  MessageSquare,
  UserPlus,
  Receipt,
  Building2,
  Loader2,
} from "lucide-react"
import { useRouter } from "next/navigation"
import { useToast } from "@/components/ui/use-toast"

interface PropertyOption {
  id: string
  name: string
}

interface LeaseOption {
  id: string
  unitNumber: string
  tenantName: string
}

interface InvoiceOption {
  id: string
  invoiceNumber: string
  totalAmount: string
  paidAmount: string | null
  status: string
  tenant: { businessName: string } | null
}

export function QuickActions() {
  const router = useRouter()
  const { toast } = useToast()
  const [workOrderDialogOpen, setWorkOrderDialogOpen] = React.useState(false)
  const [invoiceDialogOpen, setInvoiceDialogOpen] = React.useState(false)
  const [paymentDialogOpen, setPaymentDialogOpen] = React.useState(false)
  const [isSubmitting, setIsSubmitting] = React.useState(false)

  // Data for dropdowns
  const [properties, setProperties] = React.useState<PropertyOption[]>([])
  const [leases, setLeases] = React.useState<LeaseOption[]>([])
  const [pendingInvoices, setPendingInvoices] = React.useState<InvoiceOption[]>([])
  const [loadingData, setLoadingData] = React.useState(false)

  // Work order form state
  const [workOrderForm, setWorkOrderForm] = React.useState({
    title: "",
    description: "",
    priority: "medium",
    category: "general",
    propertyId: "",
  })

  // Invoice form state
  const [invoiceForm, setInvoiceForm] = React.useState({
    leaseId: "",
    invoiceType: "rent",
    amount: "",
    gstAmount: "",
    dueDate: "",
    periodStart: "",
    periodEnd: "",
  })

  // Payment form state
  const [paymentForm, setPaymentForm] = React.useState({
    invoiceId: "",
    amount: "",
    paymentDate: new Date().toISOString().split("T")[0],
    paymentMethod: "bank_transfer",
    referenceNumber: "",
  })

  // Safe JSON fetch helper — handles redirects to login page gracefully
  const fetchJson = React.useCallback(async (url: string) => {
    const res = await fetch(url)
    const contentType = res.headers.get("content-type") || ""
    if (!contentType.includes("application/json")) return null
    if (!res.ok) return null
    return res.json()
  }, [])

  // Fetch properties for work order dialog
  const fetchProperties = React.useCallback(async () => {
    try {
      const data = await fetchJson("/api/properties")
      if (!data) return
      const list = data.data || data
      setProperties(
        Array.isArray(list)
          ? list.map((p: { id: string; name: string }) => ({ id: p.id, name: p.name }))
          : []
      )
    } catch {
      // silently fail — user can still type
    }
  }, [fetchJson])

  // Fetch leases for invoice dialog
  const fetchLeases = React.useCallback(async () => {
    try {
      const data = await fetchJson("/api/leases")
      if (!data) return
      const list = data.data || data
      setLeases(
        Array.isArray(list)
          ? list.map((l: { id: string; unitNumber: string; tenant?: { businessName?: string } }) => ({
              id: l.id,
              unitNumber: l.unitNumber || "N/A",
              tenantName: l.tenant?.businessName || "Unknown",
            }))
          : []
      )
    } catch {
      // silently fail
    }
  }, [fetchJson])

  // Fetch pending invoices for payment dialog
  const fetchPendingInvoices = React.useCallback(async () => {
    try {
      const data = await fetchJson("/api/invoices")
      if (!data) return
      const list = data.data || data
      // Filter to pending/partially_paid on client side
      setPendingInvoices(
        Array.isArray(list)
          ? list.filter((inv: InvoiceOption) => inv.status === "pending" || inv.status === "partially_paid")
          : []
      )
    } catch {
      // silently fail
    }
  }, [fetchJson])

  // Load data when dialogs open
  React.useEffect(() => {
    if (workOrderDialogOpen && properties.length === 0) {
      setLoadingData(true)
      fetchProperties().finally(() => setLoadingData(false))
    }
  }, [workOrderDialogOpen, properties.length, fetchProperties])

  React.useEffect(() => {
    if (invoiceDialogOpen && leases.length === 0) {
      setLoadingData(true)
      fetchLeases().finally(() => setLoadingData(false))
    }
  }, [invoiceDialogOpen, leases.length, fetchLeases])

  React.useEffect(() => {
    if (paymentDialogOpen) {
      setLoadingData(true)
      fetchPendingInvoices().finally(() => setLoadingData(false))
    }
  }, [paymentDialogOpen, fetchPendingInvoices])

  const handleCreateWorkOrder = async () => {
    if (!workOrderForm.propertyId || !workOrderForm.title) return
    setIsSubmitting(true)
    try {
      const response = await fetch("/api/work-orders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          propertyId: workOrderForm.propertyId,
          title: workOrderForm.title,
          description: workOrderForm.description,
          priority: workOrderForm.priority,
          category: workOrderForm.category,
        }),
      })
      if (response.ok) {
        toast({ title: "Success", description: "Work order created successfully!" })
        setWorkOrderDialogOpen(false)
        setWorkOrderForm({ title: "", description: "", priority: "medium", category: "general", propertyId: "" })
        router.push("/work-orders")
      } else {
        const err = await response.json().catch(() => ({}))
        throw new Error(err.error || "Failed to create work order")
      }
    } catch (error) {
      toast({ title: "Error", description: error instanceof Error ? error.message : "Failed to create work order", variant: "destructive" })
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleCreateInvoice = async () => {
    if (!invoiceForm.leaseId || !invoiceForm.amount || !invoiceForm.dueDate) return
    setIsSubmitting(true)
    try {
      const response = await fetch("/api/invoices", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          leaseId: invoiceForm.leaseId,
          invoiceType: invoiceForm.invoiceType,
          amount: invoiceForm.amount,
          gstAmount: invoiceForm.gstAmount || undefined,
          dueDate: invoiceForm.dueDate,
          periodStart: invoiceForm.periodStart || undefined,
          periodEnd: invoiceForm.periodEnd || undefined,
        }),
      })
      if (response.ok) {
        toast({ title: "Success", description: "Invoice created successfully!" })
        setInvoiceDialogOpen(false)
        setInvoiceForm({ leaseId: "", invoiceType: "rent", amount: "", gstAmount: "", dueDate: "", periodStart: "", periodEnd: "" })
        router.push("/financials")
      } else {
        const err = await response.json().catch(() => ({}))
        throw new Error(err.error || "Failed to create invoice")
      }
    } catch (error) {
      toast({ title: "Error", description: error instanceof Error ? error.message : "Failed to create invoice", variant: "destructive" })
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleRecordPayment = async () => {
    if (!paymentForm.invoiceId || !paymentForm.amount || !paymentForm.paymentDate) return
    setIsSubmitting(true)
    try {
      const response = await fetch(`/api/invoices/${paymentForm.invoiceId}/payment`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          amount: paymentForm.amount,
          paymentDate: paymentForm.paymentDate,
          paymentMethod: paymentForm.paymentMethod,
          referenceNumber: paymentForm.referenceNumber || undefined,
        }),
      })
      if (response.ok) {
        toast({ title: "Success", description: "Payment recorded successfully!" })
        setPaymentDialogOpen(false)
        setPaymentForm({ invoiceId: "", amount: "", paymentDate: new Date().toISOString().split("T")[0], paymentMethod: "bank_transfer", referenceNumber: "" })
        router.push("/financials")
      } else {
        const err = await response.json().catch(() => ({}))
        throw new Error(err.error || "Failed to record payment")
      }
    } catch (error) {
      toast({ title: "Error", description: error instanceof Error ? error.message : "Failed to record payment", variant: "destructive" })
    } finally {
      setIsSubmitting(false)
    }
  }

  // Auto-fill amount when invoice is selected for payment
  const selectedInvoice = pendingInvoices.find((inv) => inv.id === paymentForm.invoiceId)
  React.useEffect(() => {
    if (selectedInvoice) {
      const remaining = parseFloat(selectedInvoice.totalAmount) - parseFloat(selectedInvoice.paidAmount || "0")
      setPaymentForm((prev) => ({ ...prev, amount: remaining.toString() }))
    }
  }, [selectedInvoice])

  const quickActions = [
    {
      icon: FileText,
      label: "Create Invoice",
      action: () => setInvoiceDialogOpen(true),
      color: "text-green-600",
      bgColor: "bg-green-100",
    },
    {
      icon: Wrench,
      label: "New Work Order",
      action: () => setWorkOrderDialogOpen(true),
      color: "text-orange-600",
      bgColor: "bg-orange-100",
    },
    {
      icon: MessageSquare,
      label: "View Tenants",
      action: () => router.push("/tenants"),
      color: "text-blue-600",
      bgColor: "bg-blue-100",
    },
    {
      icon: UserPlus,
      label: "Add Tenant",
      action: () => router.push("/tenants?action=add"),
      color: "text-purple-600",
      bgColor: "bg-purple-100",
    },
    {
      icon: Receipt,
      label: "Record Payment",
      action: () => setPaymentDialogOpen(true),
      color: "text-emerald-600",
      bgColor: "bg-emerald-100",
    },
    {
      icon: Building2,
      label: "View Properties",
      action: () => router.push("/properties"),
      color: "text-pink-600",
      bgColor: "bg-pink-100",
    },
  ]

  return (
    <>
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Quick Actions</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 gap-2">
            {quickActions.map((action) => (
              <Button
                key={action.label}
                variant="outline"
                className="h-auto flex-col gap-2 py-4"
                onClick={action.action}
              >
                <div className={`rounded-lg p-2 ${action.bgColor}`}>
                  <action.icon className={`h-5 w-5 ${action.color}`} />
                </div>
                <span className="text-xs font-medium">{action.label}</span>
              </Button>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Work Order Dialog */}
      <Dialog open={workOrderDialogOpen} onOpenChange={setWorkOrderDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Create New Work Order</DialogTitle>
            <DialogDescription>Fill in the details for the new work order.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <label className="text-sm font-medium">Property *</label>
              {loadingData ? (
                <div className="text-sm text-muted-foreground">Loading properties...</div>
              ) : properties.length === 0 ? (
                <div className="text-sm text-muted-foreground">No properties found. <a href="/properties" className="underline">Add a property first</a>.</div>
              ) : (
                <Select
                  value={workOrderForm.propertyId}
                  onValueChange={(value) => setWorkOrderForm(prev => ({ ...prev, propertyId: value }))}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select a property" />
                  </SelectTrigger>
                  <SelectContent>
                    {properties.map((p) => (
                      <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">Title *</label>
              <Input
                placeholder="e.g., AC not working in Unit 203"
                value={workOrderForm.title}
                onChange={(e) => setWorkOrderForm(prev => ({ ...prev, title: e.target.value }))}
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">Description</label>
              <Textarea
                placeholder="Describe the issue in detail..."
                value={workOrderForm.description}
                onChange={(e) => setWorkOrderForm(prev => ({ ...prev, description: e.target.value }))}
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <label className="text-sm font-medium">Priority</label>
                <Select
                  value={workOrderForm.priority}
                  onValueChange={(value) => setWorkOrderForm(prev => ({ ...prev, priority: value }))}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="low">Low</SelectItem>
                    <SelectItem value="medium">Medium</SelectItem>
                    <SelectItem value="high">High</SelectItem>
                    <SelectItem value="urgent">Urgent</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">Category</label>
                <Select
                  value={workOrderForm.category}
                  onValueChange={(value) => setWorkOrderForm(prev => ({ ...prev, category: value }))}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="hvac">HVAC</SelectItem>
                    <SelectItem value="electrical">Electrical</SelectItem>
                    <SelectItem value="plumbing">Plumbing</SelectItem>
                    <SelectItem value="general">General</SelectItem>
                    <SelectItem value="cleaning">Cleaning</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setWorkOrderDialogOpen(false)}>Cancel</Button>
            <Button onClick={handleCreateWorkOrder} disabled={isSubmitting || !workOrderForm.title || !workOrderForm.propertyId}>
              {isSubmitting && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Create Work Order
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Invoice Dialog */}
      <Dialog open={invoiceDialogOpen} onOpenChange={setInvoiceDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Create New Invoice</DialogTitle>
            <DialogDescription>Create a new invoice for a tenant lease.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <label className="text-sm font-medium">Lease *</label>
              {loadingData ? (
                <div className="text-sm text-muted-foreground">Loading leases...</div>
              ) : leases.length === 0 ? (
                <div className="text-sm text-muted-foreground">No leases found. <a href="/leases" className="underline">Create a lease first</a>.</div>
              ) : (
                <Select
                  value={invoiceForm.leaseId}
                  onValueChange={(value) => setInvoiceForm(prev => ({ ...prev, leaseId: value }))}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select a lease" />
                  </SelectTrigger>
                  <SelectContent>
                    {leases.map((l) => (
                      <SelectItem key={l.id} value={l.id}>
                        {l.tenantName} — Unit {l.unitNumber}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </div>
            <div className="space-y-2">
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
                  <SelectItem value="cam">CAM Charges</SelectItem>
                  <SelectItem value="utility">Utility</SelectItem>
                  <SelectItem value="security_deposit">Security Deposit</SelectItem>
                  <SelectItem value="other">Other</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <label className="text-sm font-medium">Amount (₹) *</label>
                <Input
                  type="number"
                  placeholder="e.g., 150000"
                  value={invoiceForm.amount}
                  onChange={(e) => setInvoiceForm(prev => ({ ...prev, amount: e.target.value }))}
                />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">GST Amount (₹)</label>
                <Input
                  type="number"
                  placeholder="e.g., 27000"
                  value={invoiceForm.gstAmount}
                  onChange={(e) => setInvoiceForm(prev => ({ ...prev, gstAmount: e.target.value }))}
                />
              </div>
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">Due Date *</label>
              <Input
                type="date"
                value={invoiceForm.dueDate}
                onChange={(e) => setInvoiceForm(prev => ({ ...prev, dueDate: e.target.value }))}
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <label className="text-sm font-medium">Period Start</label>
                <Input
                  type="date"
                  value={invoiceForm.periodStart}
                  onChange={(e) => setInvoiceForm(prev => ({ ...prev, periodStart: e.target.value }))}
                />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">Period End</label>
                <Input
                  type="date"
                  value={invoiceForm.periodEnd}
                  onChange={(e) => setInvoiceForm(prev => ({ ...prev, periodEnd: e.target.value }))}
                />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setInvoiceDialogOpen(false)}>Cancel</Button>
            <Button onClick={handleCreateInvoice} disabled={isSubmitting || !invoiceForm.leaseId || !invoiceForm.amount || !invoiceForm.dueDate}>
              {isSubmitting && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Create Invoice
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Payment Dialog */}
      <Dialog open={paymentDialogOpen} onOpenChange={setPaymentDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Record Payment</DialogTitle>
            <DialogDescription>Record a payment against a pending invoice.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <label className="text-sm font-medium">Invoice *</label>
              {loadingData ? (
                <div className="text-sm text-muted-foreground">Loading invoices...</div>
              ) : pendingInvoices.length === 0 ? (
                <div className="text-sm text-muted-foreground">No pending invoices found.</div>
              ) : (
                <Select
                  value={paymentForm.invoiceId}
                  onValueChange={(value) => setPaymentForm(prev => ({ ...prev, invoiceId: value }))}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select an invoice" />
                  </SelectTrigger>
                  <SelectContent>
                    {pendingInvoices.map((inv) => (
                      <SelectItem key={inv.id} value={inv.id}>
                        {inv.invoiceNumber} — ₹{parseFloat(inv.totalAmount).toLocaleString("en-IN")}
                        {inv.tenant ? ` (${inv.tenant.businessName})` : ""}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </div>
            {selectedInvoice && (
              <div className="text-sm text-muted-foreground rounded-md bg-muted p-2">
                Total: ₹{parseFloat(selectedInvoice.totalAmount).toLocaleString("en-IN")} |
                Paid: ₹{parseFloat(selectedInvoice.paidAmount || "0").toLocaleString("en-IN")} |
                Remaining: ₹{(parseFloat(selectedInvoice.totalAmount) - parseFloat(selectedInvoice.paidAmount || "0")).toLocaleString("en-IN")}
              </div>
            )}
            <div className="space-y-2">
              <label className="text-sm font-medium">Amount (₹) *</label>
              <Input
                type="number"
                placeholder="e.g., 150000"
                value={paymentForm.amount}
                onChange={(e) => setPaymentForm(prev => ({ ...prev, amount: e.target.value }))}
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">Payment Date *</label>
              <Input
                type="date"
                value={paymentForm.paymentDate}
                onChange={(e) => setPaymentForm(prev => ({ ...prev, paymentDate: e.target.value }))}
              />
            </div>
            <div className="space-y-2">
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
                  <SelectItem value="cheque">Cheque</SelectItem>
                  <SelectItem value="cash">Cash</SelectItem>
                  <SelectItem value="upi">UPI</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">Reference Number</label>
              <Input
                placeholder="e.g., UTR / Cheque number"
                value={paymentForm.referenceNumber}
                onChange={(e) => setPaymentForm(prev => ({ ...prev, referenceNumber: e.target.value }))}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setPaymentDialogOpen(false)}>Cancel</Button>
            <Button onClick={handleRecordPayment} disabled={isSubmitting || !paymentForm.invoiceId || !paymentForm.amount || !paymentForm.paymentDate}>
              {isSubmitting && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Record Payment
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
