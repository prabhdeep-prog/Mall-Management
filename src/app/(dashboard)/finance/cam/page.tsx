"use client"

import * as React from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { Label } from "@/components/ui/label"
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
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import {
  Plus,
  Calculator,
  Eye,
  FileText,
  MoreHorizontal,
  Loader2,
  RefreshCw,
  IndianRupee,
} from "lucide-react"
import { formatCurrency, formatDate } from "@/lib/utils"
import { useToast } from "@/components/ui/use-toast"
import { usePropertyStore } from "@/stores/property-store"

// ── Types ────────────────────────────────────────────────────────────────────

interface CamCharge {
  id: string
  propertyId: string
  periodStart: string
  periodEnd: string
  category: string
  totalAmount: string
  allocationMethod: string
  status: string
  createdAt: string
  property: { id: string; name: string; code: string } | null
}

interface AllocationRow {
  tenantId: string
  tenantName: string
  leaseId: string | null
  unitNumber: string
  areaSqft: string
  ratio: number
  allocatedAmount: number
}

interface Property {
  id: string
  name: string
  code: string
}

// ── Constants ────────────────────────────────────────────────────────────────

const categoryLabels: Record<string, string> = {
  electricity: "Electricity",
  housekeeping: "Housekeeping",
  security: "Security",
  shared_utilities: "Shared Utilities",
}

const methodLabels: Record<string, string> = {
  per_sqft: "Per Sq. Ft.",
  equal: "Equal Share",
  footfall: "Footfall Based",
}

const statusConfig: Record<string, { color: string; label: string }> = {
  draft: { color: "bg-yellow-100 text-yellow-700", label: "Draft" },
  allocated: { color: "bg-blue-100 text-blue-700", label: "Allocated" },
  invoiced: { color: "bg-green-100 text-green-700", label: "Invoiced" },
}

// ── Component ────────────────────────────────────────────────────────────────

export default function CAMPage() {
  const { toast } = useToast()
  const { selectedProperty } = usePropertyStore()

  // Data
  const [charges, setCharges] = React.useState<CamCharge[]>([])
  const [properties, setProperties] = React.useState<Property[]>([])
  const [isLoading, setIsLoading] = React.useState(true)

  // Create dialog
  const [createOpen, setCreateOpen] = React.useState(false)
  const [isSubmitting, setIsSubmitting] = React.useState(false)
  const [form, setForm] = React.useState({
    propertyId: "",
    periodStart: "",
    periodEnd: "",
    category: "electricity",
    totalAmount: "",
    allocationMethod: "per_sqft",
  })

  // Preview dialog
  const [previewOpen, setPreviewOpen] = React.useState(false)
  const [previewData, setPreviewData] = React.useState<AllocationRow[]>([])
  const [previewLoading, setPreviewLoading] = React.useState(false)
  const [previewCharge, setPreviewCharge] = React.useState<{
    chargeId?: string
    category: string
    totalAmount: number
    allocationMethod: string
  } | null>(null)

  // Allocations view dialog
  const [allocationsOpen, setAllocationsOpen] = React.useState(false)
  const [allocationsData, setAllocationsData] = React.useState<any[]>([])
  const [allocationsLoading, setAllocationsLoading] = React.useState(false)

  // ── Fetch charges ────────────────────────────────────────────────────────

  const fetchCharges = React.useCallback(async () => {
    setIsLoading(true)
    try {
      const params = new URLSearchParams()
      if (selectedProperty) params.set("propertyId", selectedProperty.id)
      const url = params.toString() ? `/api/cam/charges?${params}` : "/api/cam/charges"
      const res = await fetch(url)
      if (!res.ok) throw new Error("Failed to fetch")
      const json = await res.json()
      setCharges(json.data || [])
    } catch {
      toast({ title: "Error", description: "Failed to load CAM charges.", variant: "destructive" })
    } finally {
      setIsLoading(false)
    }
  }, [selectedProperty, toast])

  // Fetch properties for create form
  React.useEffect(() => {
    const fetchProperties = async () => {
      try {
        const res = await fetch("/api/properties")
        if (res.ok) {
          const json = await res.json()
          const list = json.data || json || []
          setProperties(list.map((p: any) => ({ id: p.id, name: p.name, code: p.code })))
        }
      } catch {
        // non-critical
      }
    }
    fetchProperties()
  }, [])

  React.useEffect(() => {
    fetchCharges()
  }, [fetchCharges])

  // Pre-fill property from global selector
  React.useEffect(() => {
    if (selectedProperty && !form.propertyId) {
      setForm((prev) => ({ ...prev, propertyId: selectedProperty.id }))
    }
  }, [selectedProperty, form.propertyId])

  // ── Create charge ────────────────────────────────────────────────────────

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault()
    setIsSubmitting(true)
    try {
      const res = await fetch("/api/cam/charges", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      })
      if (!res.ok) {
        const json = await res.json()
        throw new Error(json.error || "Failed to create")
      }
      toast({ title: "Success", description: "CAM charge created." })
      setCreateOpen(false)
      setForm({
        propertyId: selectedProperty?.id || "",
        periodStart: "",
        periodEnd: "",
        category: "electricity",
        totalAmount: "",
        allocationMethod: "per_sqft",
      })
      fetchCharges()
    } catch (err) {
      toast({
        title: "Error",
        description: err instanceof Error ? err.message : "Failed to create CAM charge.",
        variant: "destructive",
      })
    } finally {
      setIsSubmitting(false)
    }
  }

  // ── Preview allocation ───────────────────────────────────────────────────

  const handlePreview = async (charge?: CamCharge) => {
    setPreviewLoading(true)
    setPreviewOpen(true)

    const params = charge
      ? {
          propertyId: charge.propertyId,
          category: charge.category,
          totalAmount: charge.totalAmount,
          allocationMethod: charge.allocationMethod,
          periodStart: charge.periodStart,
          periodEnd: charge.periodEnd,
        }
      : {
          propertyId: form.propertyId,
          category: form.category,
          totalAmount: form.totalAmount,
          allocationMethod: form.allocationMethod,
          periodStart: form.periodStart,
          periodEnd: form.periodEnd,
        }

    setPreviewCharge({
      chargeId: charge?.id,
      category: params.category,
      totalAmount: parseFloat(params.totalAmount),
      allocationMethod: params.allocationMethod,
    })

    try {
      const res = await fetch("/api/cam/preview", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(params),
      })
      if (!res.ok) {
        const json = await res.json()
        throw new Error(json.error || "Preview failed")
      }
      const json = await res.json()
      setPreviewData(json.data.allocations || [])
    } catch (err) {
      toast({
        title: "Error",
        description: err instanceof Error ? err.message : "Failed to preview allocation.",
        variant: "destructive",
      })
      setPreviewOpen(false)
    } finally {
      setPreviewLoading(false)
    }
  }

  // ── Run allocation ───────────────────────────────────────────────────────

  const handleAllocate = async (chargeId: string) => {
    try {
      const res = await fetch("/api/cam/allocate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ chargeId }),
      })
      if (!res.ok) {
        const json = await res.json()
        throw new Error(json.error || "Allocation failed")
      }
      toast({ title: "Success", description: "CAM allocation completed." })
      setPreviewOpen(false)
      fetchCharges()
    } catch (err) {
      toast({
        title: "Error",
        description: err instanceof Error ? err.message : "Allocation failed.",
        variant: "destructive",
      })
    }
  }

  // ── View allocations ─────────────────────────────────────────────────────

  const handleViewAllocations = async (chargeId: string) => {
    setAllocationsLoading(true)
    setAllocationsOpen(true)
    try {
      const res = await fetch(`/api/cam/allocations?chargeId=${chargeId}`)
      if (!res.ok) throw new Error("Failed to fetch")
      const json = await res.json()
      setAllocationsData(json.data || [])
    } catch {
      toast({ title: "Error", description: "Failed to load allocations.", variant: "destructive" })
      setAllocationsOpen(false)
    } finally {
      setAllocationsLoading(false)
    }
  }

  // ── Render ───────────────────────────────────────────────────────────────

  const summary = React.useMemo(() => {
    const total = charges.reduce((s, c) => s + parseFloat(c.totalAmount), 0)
    const draft = charges.filter((c) => c.status === "draft").length
    const allocated = charges.filter((c) => c.status === "allocated").length
    const invoiced = charges.filter((c) => c.status === "invoiced").length
    return { total, draft, allocated, invoiced }
  }, [charges])

  return (
    <div className="flex-1 space-y-6 p-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">CAM Allocation</h1>
          <p className="text-muted-foreground">
            Common Area Maintenance cost allocation engine
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={fetchCharges}>
            <RefreshCw className="h-4 w-4 mr-2" />
            Refresh
          </Button>
          <Button size="sm" onClick={() => setCreateOpen(true)}>
            <Plus className="h-4 w-4 mr-2" />
            New CAM Charge
          </Button>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Total Pool</CardDescription>
            <CardTitle className="text-2xl">{formatCurrency(summary.total)}</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Draft</CardDescription>
            <CardTitle className="text-2xl">{summary.draft}</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Allocated</CardDescription>
            <CardTitle className="text-2xl">{summary.allocated}</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Invoiced</CardDescription>
            <CardTitle className="text-2xl">{summary.invoiced}</CardTitle>
          </CardHeader>
        </Card>
      </div>

      {/* Charges Table */}
      <Card>
        <CardHeader>
          <CardTitle>CAM Charges</CardTitle>
          <CardDescription>Property-level expense pools for allocation</CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : charges.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <IndianRupee className="h-12 w-12 mx-auto mb-4 opacity-20" />
              <p>No CAM charges found. Create one to get started.</p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Property</TableHead>
                  <TableHead>Category</TableHead>
                  <TableHead>Period</TableHead>
                  <TableHead>Method</TableHead>
                  <TableHead className="text-right">Amount</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="w-[50px]" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {charges.map((charge) => {
                  const st = statusConfig[charge.status] || statusConfig.draft
                  return (
                    <TableRow key={charge.id}>
                      <TableCell className="font-medium">
                        {charge.property?.name || "—"}
                      </TableCell>
                      <TableCell>{categoryLabels[charge.category] || charge.category}</TableCell>
                      <TableCell>
                        {formatDate(charge.periodStart)} – {formatDate(charge.periodEnd)}
                      </TableCell>
                      <TableCell>{methodLabels[charge.allocationMethod] || charge.allocationMethod}</TableCell>
                      <TableCell className="text-right font-mono">
                        {formatCurrency(parseFloat(charge.totalAmount))}
                      </TableCell>
                      <TableCell>
                        <Badge variant="secondary" className={st.color}>
                          {st.label}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="icon" className="h-8 w-8">
                              <MoreHorizontal className="h-4 w-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem onClick={() => handlePreview(charge)}>
                              <Eye className="h-4 w-4 mr-2" />
                              Preview Allocation
                            </DropdownMenuItem>
                            {charge.status === "draft" && (
                              <DropdownMenuItem onClick={() => handleAllocate(charge.id)}>
                                <Calculator className="h-4 w-4 mr-2" />
                                Run Allocation
                              </DropdownMenuItem>
                            )}
                            {(charge.status === "allocated" || charge.status === "invoiced") && (
                              <DropdownMenuItem onClick={() => handleViewAllocations(charge.id)}>
                                <FileText className="h-4 w-4 mr-2" />
                                View Allocations
                              </DropdownMenuItem>
                            )}
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </TableCell>
                    </TableRow>
                  )
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* ── Create CAM Charge Dialog ──────────────────────────────────────── */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>New CAM Charge</DialogTitle>
            <DialogDescription>
              Create a Common Area Maintenance expense pool for allocation.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleCreate} className="space-y-4">
            <div className="space-y-2">
              <Label>Property</Label>
              <Select
                value={form.propertyId}
                onValueChange={(v) => setForm((f) => ({ ...f, propertyId: v }))}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select property" />
                </SelectTrigger>
                <SelectContent>
                  {properties.map((p) => (
                    <SelectItem key={p.id} value={p.id}>
                      {p.name} ({p.code})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Period Start</Label>
                <Input
                  type="date"
                  value={form.periodStart}
                  onChange={(e) => setForm((f) => ({ ...f, periodStart: e.target.value }))}
                  required
                />
              </div>
              <div className="space-y-2">
                <Label>Period End</Label>
                <Input
                  type="date"
                  value={form.periodEnd}
                  onChange={(e) => setForm((f) => ({ ...f, periodEnd: e.target.value }))}
                  required
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label>Category</Label>
              <Select
                value={form.category}
                onValueChange={(v) => setForm((f) => ({ ...f, category: v }))}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="electricity">Electricity</SelectItem>
                  <SelectItem value="housekeeping">Housekeeping</SelectItem>
                  <SelectItem value="security">Security</SelectItem>
                  <SelectItem value="shared_utilities">Shared Utilities</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Total Amount</Label>
              <Input
                type="number"
                step="0.01"
                min="0"
                placeholder="0.00"
                value={form.totalAmount}
                onChange={(e) => setForm((f) => ({ ...f, totalAmount: e.target.value }))}
                required
              />
            </div>
            <div className="space-y-2">
              <Label>Allocation Method</Label>
              <Select
                value={form.allocationMethod}
                onValueChange={(v) => setForm((f) => ({ ...f, allocationMethod: v }))}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="per_sqft">Per Sq. Ft.</SelectItem>
                  <SelectItem value="equal">Equal Share</SelectItem>
                  <SelectItem value="footfall">Footfall Based</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <DialogFooter className="gap-2">
              <Button
                type="button"
                variant="outline"
                disabled={!form.propertyId || !form.totalAmount || !form.periodStart || !form.periodEnd}
                onClick={() => handlePreview()}
              >
                <Eye className="h-4 w-4 mr-2" />
                Preview
              </Button>
              <Button type="submit" disabled={isSubmitting}>
                {isSubmitting && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                Create
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* ── Preview Dialog ────────────────────────────────────────────────── */}
      <Dialog open={previewOpen} onOpenChange={setPreviewOpen}>
        <DialogContent className="sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>Allocation Preview</DialogTitle>
            <DialogDescription>
              {previewCharge && (
                <>
                  {categoryLabels[previewCharge.category] || previewCharge.category}
                  {" — "}
                  {formatCurrency(previewCharge.totalAmount)}
                  {" via "}
                  {methodLabels[previewCharge.allocationMethod] || previewCharge.allocationMethod}
                </>
              )}
            </DialogDescription>
          </DialogHeader>
          {previewLoading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Tenant</TableHead>
                  <TableHead>Unit</TableHead>
                  <TableHead className="text-right">Area (sqft)</TableHead>
                  <TableHead className="text-right">Ratio</TableHead>
                  <TableHead className="text-right">Allocated</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {previewData.map((row) => (
                  <TableRow key={row.tenantId}>
                    <TableCell className="font-medium">{row.tenantName}</TableCell>
                    <TableCell>{row.unitNumber}</TableCell>
                    <TableCell className="text-right font-mono">{row.areaSqft}</TableCell>
                    <TableCell className="text-right font-mono">
                      {(row.ratio * 100).toFixed(2)}%
                    </TableCell>
                    <TableCell className="text-right font-mono">
                      {formatCurrency(row.allocatedAmount)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
          {previewCharge?.chargeId && (
            <DialogFooter>
              <Button onClick={() => handleAllocate(previewCharge.chargeId!)}>
                <Calculator className="h-4 w-4 mr-2" />
                Confirm Allocation
              </Button>
            </DialogFooter>
          )}
        </DialogContent>
      </Dialog>

      {/* ── Allocations View Dialog ───────────────────────────────────────── */}
      <Dialog open={allocationsOpen} onOpenChange={setAllocationsOpen}>
        <DialogContent className="sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>Tenant Allocations</DialogTitle>
            <DialogDescription>Breakdown of allocated CAM charges per tenant</DialogDescription>
          </DialogHeader>
          {allocationsLoading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Tenant</TableHead>
                  <TableHead>Unit</TableHead>
                  <TableHead className="text-right">Area (sqft)</TableHead>
                  <TableHead className="text-right">Ratio</TableHead>
                  <TableHead className="text-right">Amount</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {allocationsData.map((a: any) => (
                  <TableRow key={a.id}>
                    <TableCell className="font-medium">
                      {a.tenant?.businessName || "—"}
                    </TableCell>
                    <TableCell>{a.lease?.unitNumber || "—"}</TableCell>
                    <TableCell className="text-right font-mono">
                      {a.lease?.areaSqft || "—"}
                    </TableCell>
                    <TableCell className="text-right font-mono">
                      {(parseFloat(a.ratio) * 100).toFixed(2)}%
                    </TableCell>
                    <TableCell className="text-right font-mono">
                      {formatCurrency(parseFloat(a.allocatedAmount))}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}
