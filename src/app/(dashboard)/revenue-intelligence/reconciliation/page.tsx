"use client"

import * as React from "react"
import { cn } from "@/lib/utils"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
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
  IndianRupee,
  AlertTriangle,
  CheckCircle,
  Users,
  RefreshCw,
  ChevronLeft,
  ChevronRight,
  FileText,
} from "lucide-react"

// ── Types ────────────────────────────────────────────────────────────────────

interface ReconRecord {
  id:           string
  tenantId:     string
  leaseId:      string | null
  tenantName:   string
  periodStart:  string
  periodEnd:    string
  posTotal:     number
  invoiceTotal: number
  variance:     number
  status:       string
  createdAt:    string
}

interface Summary {
  totalVariance: number
  flaggedCount:  number
  matchedCount:  number
}

interface Pagination {
  page:       number
  limit:      number
  total:      number
  totalPages: number
}

// ── Formatters ───────────────────────────────────────────────────────────────

const fmtINR = (n: number) =>
  new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 }).format(n)

// ── Component ────────────────────────────────────────────────────────────────

export default function ReconciliationPage() {
  const [records, setRecords]       = React.useState<ReconRecord[]>([])
  const [summary, setSummary]       = React.useState<Summary>({ totalVariance: 0, flaggedCount: 0, matchedCount: 0 })
  const [pagination, setPagination] = React.useState<Pagination>({ page: 1, limit: 20, total: 0, totalPages: 0 })
  const [statusFilter, setStatusFilter] = React.useState<string>("all")
  const [loading, setLoading]       = React.useState(true)

  const fetchData = React.useCallback(async (page = 1) => {
    setLoading(true)
    try {
      const params = new URLSearchParams({ page: String(page), limit: "20" })
      if (statusFilter !== "all") params.set("status", statusFilter)

      const res  = await fetch(`/api/reconciliation?${params}`)
      const json = await res.json()
      if (json.success) {
        setRecords(json.data.records)
        setSummary(json.data.summary)
        setPagination(json.data.pagination)
      }
    } catch (err) {
      console.error("Failed to fetch reconciliation data:", err)
    } finally {
      setLoading(false)
    }
  }, [statusFilter])

  React.useEffect(() => { fetchData(1) }, [fetchData])

  // ── Dashboard widgets ───────────────────────────────────────────────────

  return (
    <div className="space-y-6 p-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">POS Reconciliation</h1>
          <p className="text-sm text-muted-foreground">
            Compare POS sales against billed amounts
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => fetchData(pagination.page)}
          disabled={loading}
        >
          <RefreshCw className={cn("mr-2 h-4 w-4", loading && "animate-spin")} />
          Refresh
        </Button>
      </div>

      {/* ── Summary Cards ──────────────────────────────────────────────────── */}
      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Variance</CardTitle>
            <IndianRupee className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className={cn(
              "text-2xl font-bold",
              summary.totalVariance > 0 && "text-emerald-600",
              summary.totalVariance < 0 && "text-red-600",
            )}>
              {fmtINR(summary.totalVariance)}
            </div>
            <p className="text-xs text-muted-foreground">
              Across all reconciled periods
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Flagged Tenants</CardTitle>
            <AlertTriangle className="h-4 w-4 text-amber-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{summary.flaggedCount}</div>
            <p className="text-xs text-muted-foreground">
              Variance exceeds threshold
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Matched Tenants</CardTitle>
            <CheckCircle className="h-4 w-4 text-emerald-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{summary.matchedCount}</div>
            <p className="text-xs text-muted-foreground">
              POS and invoice totals aligned
            </p>
          </CardContent>
        </Card>
      </div>

      {/* ── Filters ────────────────────────────────────────────────────────── */}
      <div className="flex items-center gap-4">
        <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v)}>
          <SelectTrigger className="w-[180px]">
            <SelectValue placeholder="Filter by status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Statuses</SelectItem>
            <SelectItem value="matched">Matched</SelectItem>
            <SelectItem value="flagged">Flagged</SelectItem>
            <SelectItem value="resolved">Resolved</SelectItem>
            <SelectItem value="pending">Pending</SelectItem>
          </SelectContent>
        </Select>
        <p className="text-sm text-muted-foreground">
          {pagination.total} records
        </p>
      </div>

      {/* ── Data Table ─────────────────────────────────────────────────────── */}
      <Card>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Tenant</TableHead>
              <TableHead>Period</TableHead>
              <TableHead className="text-right">POS Sales</TableHead>
              <TableHead className="text-right">Invoice Amount</TableHead>
              <TableHead className="text-right">Variance</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Action</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {records.length === 0 && !loading ? (
              <TableRow>
                <TableCell colSpan={7} className="h-24 text-center text-muted-foreground">
                  No reconciliation records found.
                </TableCell>
              </TableRow>
            ) : (
              records.map((r) => (
                <TableRow key={r.id}>
                  <TableCell className="font-medium">{r.tenantName}</TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {r.periodStart} – {r.periodEnd}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {fmtINR(r.posTotal)}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {fmtINR(r.invoiceTotal)}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    <VarianceBadge variance={r.variance} />
                  </TableCell>
                  <TableCell>
                    <StatusBadge status={r.status} />
                  </TableCell>
                  <TableCell>
                    {r.status === "flagged" && r.leaseId && (
                      <CreateAdjustmentButton record={r} onCreated={() => fetchData(pagination.page)} />
                    )}
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </Card>

      {/* ── Pagination ─────────────────────────────────────────────────────── */}
      {pagination.totalPages > 1 && (
        <div className="flex items-center justify-between">
          <p className="text-sm text-muted-foreground">
            Page {pagination.page} of {pagination.totalPages}
          </p>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={pagination.page <= 1}
              onClick={() => fetchData(pagination.page - 1)}
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={pagination.page >= pagination.totalPages}
              onClick={() => fetchData(pagination.page + 1)}
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}

// ── Sub-components ───────────────────────────────────────────────────────────

function VarianceBadge({ variance }: { variance: number }) {
  if (variance === 0) {
    return <span className="text-muted-foreground">—</span>
  }
  return (
    <Badge
      variant="outline"
      className={cn(
        "tabular-nums",
        variance > 0 && "border-emerald-200 bg-emerald-50 text-emerald-700",
        variance < 0 && "border-red-200 bg-red-50 text-red-700",
      )}
    >
      {variance > 0 ? "+" : ""}
      {fmtINR(variance)}
    </Badge>
  )
}

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, { label: string; className: string }> = {
    matched:  { label: "Matched",  className: "bg-emerald-50 text-emerald-700 border-emerald-200" },
    flagged:  { label: "Flagged",  className: "bg-red-50 text-red-700 border-red-200" },
    resolved: { label: "Resolved", className: "bg-blue-50 text-blue-700 border-blue-200" },
    pending:  { label: "Pending",  className: "bg-amber-50 text-amber-700 border-amber-200" },
  }
  const cfg = map[status] ?? { label: status, className: "" }
  return <Badge variant="outline" className={cfg.className}>{cfg.label}</Badge>
}

function CreateAdjustmentButton({
  record,
  onCreated,
}: {
  record: ReconRecord
  onCreated: () => void
}) {
  const [loading, setLoading] = React.useState(false)

  const handleCreate = async () => {
    setLoading(true)
    try {
      const res = await fetch("/api/invoices/create-adjustment", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          reconciliationId: record.id,
          leaseId:          record.leaseId,
          amount:           record.variance,
          periodStart:      record.periodStart,
          periodEnd:        record.periodEnd,
        }),
      })
      if (res.ok) {
        onCreated()
      }
    } catch (err) {
      console.error("Failed to create adjustment:", err)
    } finally {
      setLoading(false)
    }
  }

  return (
    <Button variant="outline" size="sm" onClick={handleCreate} disabled={loading}>
      <FileText className="mr-1.5 h-3.5 w-3.5" />
      Adjust
    </Button>
  )
}
