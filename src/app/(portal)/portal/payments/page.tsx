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
  CreditCard,
  Search,
  Download,
  Loader2,
  IndianRupee,
  ChevronLeft,
  ChevronRight,
} from "lucide-react"
import { formatCurrency, formatDate } from "@/lib/utils/index"

interface Payment {
  id: string
  paymentDate: string
  amount: number
  paymentMethod: string | null
  referenceNumber: string | null
  invoiceNumber: string
  invoiceId: string
  receiptUrl: string | null
}

interface Pagination {
  page: number
  limit: number
  total: number
  totalPages: number
}

const METHOD_LABELS: Record<string, string> = {
  cash: "Cash", cheque: "Cheque", neft: "NEFT",
  upi: "UPI", rtgs: "RTGS", imps: "IMPS",
}

const PAGE_SIZE = 20

export default function TenantPaymentsPage() {
  const [payments, setPayments]       = React.useState<Payment[]>([])
  const [pagination, setPagination]   = React.useState<Pagination | null>(null)
  const [isLoading, setIsLoading]     = React.useState(true)
  const [search, setSearch]           = React.useState("")
  const [page, setPage]               = React.useState(1)

  const fetchPayments = React.useCallback((p: number) => {
    setIsLoading(true)
    fetch(`/api/tenant/payments?page=${p}&limit=${PAGE_SIZE}`)
      .then((r) => r.json())
      .then((res) => {
        if (res.data) {
          setPayments(res.data.payments ?? [])
          setPagination(res.data.pagination ?? null)
        }
      })
      .finally(() => setIsLoading(false))
  }, [])

  React.useEffect(() => { fetchPayments(page) }, [page, fetchPayments])

  const filtered = payments.filter((p) =>
    (p.referenceNumber ?? "").toLowerCase().includes(search.toLowerCase()) ||
    p.invoiceNumber.toLowerCase().includes(search.toLowerCase()),
  )

  const totalPaid = payments.reduce((sum, p) => sum + p.amount, 0)

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Payment History</h1>
        <p className="text-sm text-muted-foreground mt-1">All payments recorded against your invoices</p>
      </div>

      {/* Summary */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-1">
            <CardTitle className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Total Paid</CardTitle>
            <IndianRupee className="h-3.5 w-3.5 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <p className="text-xl font-bold">{formatCurrency(totalPaid)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-1">
            <CardTitle className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Transactions</CardTitle>
            <CreditCard className="h-3.5 w-3.5 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <p className="text-xl font-bold">{pagination?.total ?? payments.length}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-1">
            <CardTitle className="text-xs font-medium text-muted-foreground uppercase tracking-wide">This Page</CardTitle>
            <CreditCard className="h-3.5 w-3.5 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <p className="text-xl font-bold">{payments.length} <span className="text-sm font-normal text-muted-foreground">payments</span></p>
          </CardContent>
        </Card>
      </div>

      {/* Table */}
      <Card>
        <CardHeader>
          <div className="relative max-w-sm">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Search by reference or invoice…"
              className="pl-9"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="flex h-40 items-center justify-center">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          ) : filtered.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
              <CreditCard className="h-8 w-8 mb-2 opacity-40" />
              <p className="text-sm">No payments found</p>
            </div>
          ) : (
            <>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Date</TableHead>
                    <TableHead>Invoice</TableHead>
                    <TableHead>Method</TableHead>
                    <TableHead>Reference</TableHead>
                    <TableHead className="text-right">Amount</TableHead>
                    <TableHead className="w-24">Receipt</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered.map((p) => (
                    <TableRow key={p.id}>
                      <TableCell className="text-sm">{formatDate(p.paymentDate)}</TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {p.invoiceNumber}
                      </TableCell>
                      <TableCell>
                        {p.paymentMethod ? (
                          <Badge variant="outline" className="text-xs">
                            {METHOD_LABELS[p.paymentMethod] ?? p.paymentMethod}
                          </Badge>
                        ) : "—"}
                      </TableCell>
                      <TableCell className="font-mono text-xs text-muted-foreground">
                        {p.referenceNumber ?? "—"}
                      </TableCell>
                      <TableCell className="text-right font-semibold">
                        {formatCurrency(p.amount)}
                      </TableCell>
                      <TableCell>
                        {p.receiptUrl ? (
                          <Button variant="ghost" size="sm" className="h-7 gap-1.5 text-xs" asChild>
                            <a href={p.receiptUrl} download target="_blank" rel="noreferrer">
                              <Download className="h-3 w-3" /> Receipt
                            </a>
                          </Button>
                        ) : (
                          <span className="text-xs text-muted-foreground">—</span>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>

              {/* Pagination */}
              {pagination && pagination.totalPages > 1 && (
                <div className="flex items-center justify-between border-t px-6 py-3">
                  <p className="text-xs text-muted-foreground">
                    Page {pagination.page} of {pagination.totalPages} ({pagination.total} payments)
                  </p>
                  <div className="flex items-center gap-1">
                    <Button
                      variant="outline" size="icon" className="h-7 w-7"
                      disabled={page <= 1}
                      onClick={() => setPage((p) => p - 1)}
                    >
                      <ChevronLeft className="h-3.5 w-3.5" />
                    </Button>
                    <Button
                      variant="outline" size="icon" className="h-7 w-7"
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
    </div>
  )
}
