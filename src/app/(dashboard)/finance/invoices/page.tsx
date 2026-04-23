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
  FileText,
  Search,
  Lock,
  Pencil,
  AlertCircle,
  CheckCircle2,
  Clock,
  Loader2,
  IndianRupee,
  Send,
} from "lucide-react"
import { formatCurrency, formatDate } from "@/lib/utils/index"

interface Invoice {
  id: string
  invoiceNumber: string
  invoiceType: string | null
  periodStart: string
  periodEnd: string
  totalAmount: string
  paidAmount: string
  dueDate: string
  status: string
  lifecycleStatus: string
  tenant: { id: string; businessName: string | null; email: string | null } | null
  lease: { id: string; unitNumber: string | null } | null
}

const PAYMENT_STATUS_CONFIG: Record<string, { label: string; className: string; icon: React.ReactNode }> = {
  pending:        { label: "Pending",      className: "bg-yellow-100 text-yellow-800", icon: <Clock        className="h-3 w-3" /> },
  paid:           { label: "Paid",         className: "bg-green-100 text-green-800",   icon: <CheckCircle2 className="h-3 w-3" /> },
  overdue:        { label: "Overdue",      className: "bg-red-100 text-red-800",       icon: <AlertCircle  className="h-3 w-3" /> },
  partially_paid: { label: "Partial",      className: "bg-orange-100 text-orange-800", icon: <Clock        className="h-3 w-3" /> },
  cancelled:      { label: "Cancelled",    className: "bg-gray-100 text-gray-600",     icon: null },
}

const LIFECYCLE_CONFIG: Record<string, { label: string; className: string }> = {
  draft:     { label: "Draft",     className: "bg-gray-100 text-gray-600" },
  posted:    { label: "Posted",    className: "bg-blue-100 text-blue-700" },
  cancelled: { label: "Cancelled", className: "bg-gray-100 text-gray-600" },
}

export default function AdminInvoicesPage() {
  const [invoices, setInvoices]         = React.useState<Invoice[]>([])
  const [isLoading, setIsLoading]       = React.useState(true)
  const [search, setSearch]             = React.useState("")
  const [statusFilter, setStatusFilter] = React.useState("all")
  const [posting, setPosting]           = React.useState<string | null>(null)

  const fetchInvoices = React.useCallback(() => {
    setIsLoading(true)
    fetch("/api/invoices?refresh=true")
      .then((r) => r.json())
      .then((res) => {
        if (res.data) setInvoices(res.data)
      })
      .finally(() => setIsLoading(false))
  }, [])

  React.useEffect(() => { fetchInvoices() }, [fetchInvoices])

  const filtered = invoices.filter((inv) => {
    const matchSearch =
      !search ||
      inv.invoiceNumber.toLowerCase().includes(search.toLowerCase()) ||
      (inv.tenant?.businessName ?? "").toLowerCase().includes(search.toLowerCase())
    const matchStatus = statusFilter === "all" || inv.lifecycleStatus === statusFilter
    return matchSearch && matchStatus
  })

  const totalPosted = invoices.filter((i) => i.lifecycleStatus === "posted").length
  const totalDraft  = invoices.filter((i) => i.lifecycleStatus === "draft").length
  const outstanding = invoices
    .filter((i) => i.status === "pending" || i.status === "overdue")
    .reduce((sum, i) => sum + (parseFloat(i.totalAmount) - parseFloat(i.paidAmount)), 0)

  async function postInvoice(id: string) {
    setPosting(id)
    try {
      const res = await fetch(`/api/invoices/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ lifecycleStatus: "posted" }),
      })
      if (res.ok) fetchInvoices()
    } finally {
      setPosting(null)
    }
  }

  return (
    <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Invoices</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Manage and post invoices. Posted invoices are immutable.
          </p>
        </div>

        {/* Summary */}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-1">
              <CardTitle className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                Draft
              </CardTitle>
              <FileText className="h-3.5 w-3.5 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <p className="text-xl font-bold">{totalDraft}</p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-1">
              <CardTitle className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                Posted
              </CardTitle>
              <Lock className="h-3.5 w-3.5 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <p className="text-xl font-bold">{totalPosted}</p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-1">
              <CardTitle className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                Outstanding
              </CardTitle>
              <IndianRupee className="h-3.5 w-3.5 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <p className="text-xl font-bold">{formatCurrency(outstanding)}</p>
            </CardContent>
          </Card>
        </div>

        {/* Table */}
        <Card>
          <CardHeader>
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  placeholder="Search invoice or tenant…"
                  className="pl-9"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
              </div>
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger className="w-36">
                  <SelectValue placeholder="Lifecycle" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All</SelectItem>
                  <SelectItem value="draft">Draft</SelectItem>
                  <SelectItem value="posted">Posted</SelectItem>
                  <SelectItem value="cancelled">Cancelled</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </CardHeader>
          <CardContent className="p-0">
            {isLoading ? (
              <div className="flex h-40 items-center justify-center">
                <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
              </div>
            ) : filtered.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
                <FileText className="h-8 w-8 mb-2 opacity-40" />
                <p className="text-sm">No invoices found</p>
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Invoice #</TableHead>
                    <TableHead>Tenant / Unit</TableHead>
                    <TableHead>Period</TableHead>
                    <TableHead className="text-right">Amount</TableHead>
                    <TableHead>Payment</TableHead>
                    <TableHead>Lifecycle</TableHead>
                    <TableHead className="w-28 text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered.map((inv) => {
                    const isPosted = inv.lifecycleStatus === "posted"
                    const ps = PAYMENT_STATUS_CONFIG[inv.status] ?? PAYMENT_STATUS_CONFIG.pending
                    const lc = LIFECYCLE_CONFIG[inv.lifecycleStatus] ?? LIFECYCLE_CONFIG.draft

                    return (
                      <TableRow key={inv.id}>
                        <TableCell className="font-medium">
                          <span className="flex items-center gap-1.5">
                            {isPosted && (
                              <Lock className="h-3 w-3 shrink-0 text-blue-500" aria-label="Posted — immutable" />
                            )}
                            {inv.invoiceNumber}
                          </span>
                        </TableCell>
                        <TableCell>
                          <p className="font-medium text-sm">{inv.tenant?.businessName ?? "—"}</p>
                          {inv.lease?.unitNumber && (
                            <p className="text-xs text-muted-foreground">Unit {inv.lease.unitNumber}</p>
                          )}
                        </TableCell>
                        <TableCell className="text-sm text-muted-foreground">
                          {formatDate(inv.periodStart)} – {formatDate(inv.periodEnd)}
                        </TableCell>
                        <TableCell className="text-right">
                          <p className="font-semibold">{formatCurrency(parseFloat(inv.totalAmount))}</p>
                          {parseFloat(inv.paidAmount) > 0 && inv.status !== "paid" && (
                            <p className="text-[10px] text-muted-foreground">
                              Paid {formatCurrency(parseFloat(inv.paidAmount))}
                            </p>
                          )}
                        </TableCell>
                        <TableCell>
                          <Badge className={`flex w-fit items-center gap-1 text-[10px] ${ps.className}`}>
                            {ps.icon}{ps.label}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <Badge className={`flex w-fit items-center gap-1 text-[10px] ${lc.className}`}>
                            {isPosted && <Lock className="h-2.5 w-2.5" />}
                            {lc.label}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex items-center justify-end gap-1">
                            {isPosted ? (
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-7 w-7 cursor-not-allowed opacity-40"
                                disabled
                                title="Invoice is posted and locked. Use a Credit Note to adjust."
                                aria-label="Edit disabled — invoice posted"
                              >
                                <Pencil className="h-3.5 w-3.5" />
                              </Button>
                            ) : (
                              <>
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="h-7 w-7"
                                  title="Edit invoice"
                                  aria-label="Edit invoice"
                                >
                                  <Pencil className="h-3.5 w-3.5" />
                                </Button>
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="h-7 w-7 text-blue-600 hover:text-blue-700"
                                  disabled={posting === inv.id}
                                  onClick={() => postInvoice(inv.id)}
                                  title="Post invoice (locks it)"
                                  aria-label="Post invoice"
                                >
                                  {posting === inv.id ? (
                                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                  ) : (
                                    <Send className="h-3.5 w-3.5" />
                                  )}
                                </Button>
                              </>
                            )}
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
    </div>
  )
}
