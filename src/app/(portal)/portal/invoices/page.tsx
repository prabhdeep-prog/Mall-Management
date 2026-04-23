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
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  FileText,
  Search,
  Download,
  Eye,
  AlertCircle,
  CheckCircle2,
  Clock,
  Lock,
  Loader2,
  IndianRupee,
  ChevronLeft,
  ChevronRight,
} from "lucide-react"
import { formatCurrency, formatDate } from "@/lib/utils/index"

interface Invoice {
  id: string
  invoiceNumber: string
  periodStart: string
  periodEnd: string
  totalAmount: number
  paidAmount: number
  dueDate: string
  status: string
  lifecycleStatus: string
  pdfUrl: string | null
}

interface Pagination {
  page: number
  limit: number
  total: number
  totalPages: number
}

const STATUS_CONFIG: Record<string, { label: string; className: string; icon: React.ReactNode }> = {
  pending:   { label: "Pending",   className: "bg-yellow-100 text-yellow-700", icon: <Clock       className="h-3 w-3" /> },
  paid:      { label: "Paid",      className: "bg-green-100 text-green-700",   icon: <CheckCircle2 className="h-3 w-3" /> },
  overdue:   { label: "Overdue",   className: "bg-red-100 text-red-700",       icon: <AlertCircle  className="h-3 w-3" /> },
  cancelled: { label: "Cancelled", className: "bg-gray-100 text-gray-600",     icon: null },
  posted:    { label: "Posted",    className: "bg-blue-100 text-blue-700",     icon: <Lock        className="h-3 w-3" /> },
}

const PAGE_SIZE = 20

export default function TenantInvoicesPage() {
  const [invoices, setInvoices]         = React.useState<Invoice[]>([])
  const [pagination, setPagination]     = React.useState<Pagination | null>(null)
  const [isLoading, setIsLoading]       = React.useState(true)
  const [search, setSearch]             = React.useState("")
  const [statusFilter, setStatusFilter] = React.useState("all")
  const [page, setPage]                 = React.useState(1)
  const [selected, setSelected]         = React.useState<Invoice | null>(null)

  const fetchInvoices = React.useCallback((p: number) => {
    setIsLoading(true)
    fetch(`/api/tenant/invoices?page=${p}&limit=${PAGE_SIZE}`)
      .then((r) => r.json())
      .then((res) => {
        if (res.data) {
          setInvoices(res.data.invoices ?? [])
          setPagination(res.data.pagination ?? null)
        }
      })
      .finally(() => setIsLoading(false))
  }, [])

  React.useEffect(() => { fetchInvoices(page) }, [page, fetchInvoices])

  // Client-side search + status filter on current page
  const filtered = invoices.filter((inv) => {
    const matchSearch = !search || inv.invoiceNumber.toLowerCase().includes(search.toLowerCase())
    const matchStatus = statusFilter === "all" || inv.status === statusFilter
    return matchSearch && matchStatus
  })

  // Summary stats from current page data
  const overdueCount = invoices.filter((i) => i.status === "overdue").length
  const totalOutstanding = invoices
    .filter((i) => i.status === "pending" || i.status === "overdue")
    .reduce((sum, i) => sum + (i.totalAmount - i.paidAmount), 0)

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Invoices</h1>
        <p className="text-sm text-muted-foreground mt-1">View and download your invoices</p>
      </div>

      {/* Summary */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-1">
            <CardTitle className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Total</CardTitle>
            <FileText className="h-3.5 w-3.5 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <p className="text-xl font-bold">{pagination?.total ?? invoices.length} <span className="text-sm font-normal text-muted-foreground">invoices</span></p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-1">
            <CardTitle className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Overdue</CardTitle>
            <AlertCircle className="h-3.5 w-3.5 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <p className="text-xl font-bold text-destructive">{overdueCount}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-1">
            <CardTitle className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Outstanding</CardTitle>
            <IndianRupee className="h-3.5 w-3.5 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <p className="text-xl font-bold">{formatCurrency(totalOutstanding)}</p>
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
                placeholder="Search invoice number…"
                className="pl-9"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-36">
                <SelectValue placeholder="Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All status</SelectItem>
                <SelectItem value="pending">Pending</SelectItem>
                <SelectItem value="paid">Paid</SelectItem>
                <SelectItem value="overdue">Overdue</SelectItem>
                <SelectItem value="posted">Posted</SelectItem>
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
            <>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Invoice #</TableHead>
                    <TableHead>Period</TableHead>
                    <TableHead className="text-right">Amount</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="w-24">PDF</TableHead>
                    <TableHead className="w-12" />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered.map((inv) => {
                    const s = STATUS_CONFIG[inv.status] ?? STATUS_CONFIG.pending
                    const isPosted = inv.lifecycleStatus === "posted"
                    return (
                      <TableRow key={inv.id}>
                        <TableCell className="font-medium">
                          <span className="flex items-center gap-1.5">
                            {inv.invoiceNumber}
                            {isPosted && <Lock className="h-3 w-3 text-blue-500" aria-label="Locked" />}
                          </span>
                        </TableCell>
                        <TableCell className="text-sm text-muted-foreground">
                          {formatDate(inv.periodStart)} – {formatDate(inv.periodEnd)}
                        </TableCell>
                        <TableCell className="text-right">
                          <div>
                            <span className="font-semibold">{formatCurrency(inv.totalAmount)}</span>
                            {inv.paidAmount > 0 && inv.status !== "paid" && (
                              <p className="text-[10px] text-muted-foreground">
                                Paid {formatCurrency(inv.paidAmount)}
                              </p>
                            )}
                          </div>
                        </TableCell>
                        <TableCell>
                          <Badge className={`flex w-fit items-center gap-1 text-[10px] ${s.className}`}>
                            {s.icon}{s.label}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          {inv.pdfUrl ? (
                            <Button variant="ghost" size="sm" className="h-7 gap-1.5 text-xs" asChild>
                              <a href={inv.pdfUrl} download target="_blank" rel="noreferrer">
                                <Download className="h-3 w-3" /> PDF
                              </a>
                            </Button>
                          ) : (
                            <span className="text-xs text-muted-foreground">—</span>
                          )}
                        </TableCell>
                        <TableCell>
                          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setSelected(inv)}>
                            <Eye className="h-3.5 w-3.5" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    )
                  })}
                </TableBody>
              </Table>

              {/* Pagination */}
              {pagination && pagination.totalPages > 1 && (
                <div className="flex items-center justify-between border-t px-6 py-3">
                  <p className="text-xs text-muted-foreground">
                    Page {pagination.page} of {pagination.totalPages} ({pagination.total} invoices)
                  </p>
                  <div className="flex items-center gap-1">
                    <Button
                      variant="outline"
                      size="icon"
                      className="h-7 w-7"
                      disabled={page <= 1}
                      onClick={() => setPage((p) => p - 1)}
                    >
                      <ChevronLeft className="h-3.5 w-3.5" />
                    </Button>
                    <Button
                      variant="outline"
                      size="icon"
                      className="h-7 w-7"
                      disabled={page >= pagination.totalPages}
                      onClick={() => setPage((p) => p + 1)}
                    >
                      <ChevronRight className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>
              )}
            </>
          )}
        </CardContent>
      </Card>

      {/* Detail dialog */}
      <Dialog open={!!selected} onOpenChange={(open) => !open && setSelected(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              {selected?.invoiceNumber}
              {selected?.lifecycleStatus === "posted" && (
                <Badge className="bg-blue-100 text-blue-700 flex items-center gap-1 text-[10px]">
                  <Lock className="h-2.5 w-2.5" /> Posted
                </Badge>
              )}
            </DialogTitle>
          </DialogHeader>
          {selected && (
            <div className="space-y-3 text-sm">
              {selected.lifecycleStatus === "posted" && (
                <div className="flex items-start gap-2 rounded-md border border-blue-200 bg-blue-50 px-3 py-2 text-blue-700">
                  <Lock className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                  <p className="text-xs">This invoice is posted and locked. Use a Credit Note to adjust.</p>
                </div>
              )}
              {([
                ["Period",      `${formatDate(selected.periodStart)} – ${formatDate(selected.periodEnd)}`],
                ["Due Date",    formatDate(selected.dueDate)],
                ["Total",       formatCurrency(selected.totalAmount)],
                ["Paid",        formatCurrency(selected.paidAmount)],
                ["Balance",     formatCurrency(selected.totalAmount - selected.paidAmount)],
              ] as const).map(([label, value]) => (
                <div key={label} className="flex justify-between">
                  <span className="text-muted-foreground">{label}</span>
                  <span className="font-medium">{value}</span>
                </div>
              ))}
              {selected.pdfUrl && (
                <div className="pt-2 flex justify-end">
                  <Button size="sm" variant="outline" asChild>
                    <a href={selected.pdfUrl} download target="_blank" rel="noreferrer">
                      <Download className="mr-2 h-3.5 w-3.5" /> Download PDF
                    </a>
                  </Button>
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}
