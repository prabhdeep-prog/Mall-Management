"use client"

/**
 * Finance-Grade Audit Log Viewer
 * ─────────────────────────────────────────────────────────────────────────────
 * Append-only, immutable ledger of all financial changes.
 * Columns: timestamp · action · entity · changed_by · IP · diff
 */

import * as React from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select"
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table"
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from "@/components/ui/dialog"
import {
  Shield, Search, Eye, RefreshCw, ChevronLeft, ChevronRight,
  FileText, IndianRupee, Building2, BarChart2, Lock,
  CheckCircle2, XCircle, AlertTriangle, Clock, Filter,
} from "lucide-react"
import { cn } from "@/lib/utils"

// ── Types ──────────────────────────────────────────────────────────────────────

interface AuditLog {
  id:            string
  organizationId:string
  action:        string
  entity:        string
  entityId:      string
  before:        Record<string, unknown> | null
  after:         Record<string, unknown> | null
  changedFields: Record<string, { from: unknown; to: unknown }> | null
  userId:        string | null
  ipAddress:     string | null
  userAgent:     string | null
  createdAt:     string
}

interface Pagination { page: number; limit: number; total: number; totalPages: number }

// ── Config ────────────────────────────────────────────────────────────────────

const ACTION_CONFIG: Record<string, { label: string; color: string; icon: React.ReactNode }> = {
  "invoice.update":  { label: "Invoice Edit",    color: "bg-blue-100 text-blue-700",    icon: <FileText      className="h-3 w-3" /> },
  "invoice.post":    { label: "Invoice Posted",  color: "bg-indigo-100 text-indigo-700", icon: <Lock          className="h-3 w-3" /> },
  "invoice.cancel":  { label: "Invoice Cancel",  color: "bg-red-100 text-red-700",      icon: <XCircle       className="h-3 w-3" /> },
  "payment.create":  { label: "Payment",         color: "bg-green-100 text-green-700",  icon: <IndianRupee   className="h-3 w-3" /> },
  "lease.create":    { label: "Lease Created",   color: "bg-emerald-100 text-emerald-700", icon: <Building2  className="h-3 w-3" /> },
  "lease.update":    { label: "Lease Updated",   color: "bg-yellow-100 text-yellow-700",icon: <Building2     className="h-3 w-3" /> },
  "lease.terminate": { label: "Lease Terminated",color: "bg-orange-100 text-orange-700",icon: <AlertTriangle className="h-3 w-3" /> },
  "pos.override":    { label: "POS Override",    color: "bg-purple-100 text-purple-700",icon: <BarChart2     className="h-3 w-3" /> },
}

const ENTITY_ICONS: Record<string, React.ReactNode> = {
  invoice:       <FileText    className="h-3.5 w-3.5 text-muted-foreground" />,
  payment:       <IndianRupee className="h-3.5 w-3.5 text-muted-foreground" />,
  lease:         <Building2   className="h-3.5 w-3.5 text-muted-foreground" />,
  pos_sales_data:<BarChart2   className="h-3.5 w-3.5 text-muted-foreground" />,
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmtDate(iso: string) {
  return new Intl.DateTimeFormat("en-IN", {
    day: "2-digit", month: "short", year: "numeric",
    hour: "2-digit", minute: "2-digit", second: "2-digit",
    hour12: false,
  }).format(new Date(iso))
}

function shortId(id: string) { return id.slice(0, 8).toUpperCase() }

function ActionBadge({ action }: { action: string }) {
  const cfg = ACTION_CONFIG[action] ?? {
    label: action,
    color: "bg-gray-100 text-gray-700",
    icon: <Clock className="h-3 w-3" />,
  }
  return (
    <Badge className={cn("flex w-fit items-center gap-1 text-[10px] font-medium", cfg.color)}>
      {cfg.icon} {cfg.label}
    </Badge>
  )
}

function DiffTable({ fields }: { fields: Record<string, { from: unknown; to: unknown }> }) {
  const entries = Object.entries(fields)
  if (!entries.length) return <p className="text-xs text-muted-foreground">No field-level diff available.</p>
  return (
    <table className="w-full text-xs border-collapse">
      <thead>
        <tr className="border-b">
          <th className="py-1.5 pr-4 text-left font-medium text-muted-foreground w-32">Field</th>
          <th className="py-1.5 pr-4 text-left font-medium text-red-600">Before</th>
          <th className="py-1.5 text-left font-medium text-green-700">After</th>
        </tr>
      </thead>
      <tbody>
        {entries.map(([key, { from, to }]) => (
          <tr key={key} className="border-b last:border-0">
            <td className="py-1.5 pr-4 font-mono text-muted-foreground">{key}</td>
            <td className="py-1.5 pr-4 font-mono text-red-600 break-all">
              {from == null ? <span className="italic opacity-50">null</span> : String(from)}
            </td>
            <td className="py-1.5 font-mono text-green-700 break-all">
              {to == null ? <span className="italic opacity-50">null</span> : String(to)}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}

function JsonBlock({ data, label }: { data: Record<string, unknown> | null; label: string }) {
  if (!data) return <p className="text-xs text-muted-foreground italic">—</p>
  return (
    <div>
      <p className="text-xs font-medium text-muted-foreground mb-1">{label}</p>
      <pre className="text-[10px] bg-muted/50 rounded p-2 overflow-auto max-h-52 whitespace-pre-wrap break-all">
        {JSON.stringify(data, null, 2)}
      </pre>
    </div>
  )
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function AuditLogPage() {
  const [logs,       setLogs]       = React.useState<AuditLog[]>([])
  const [pagination, setPagination] = React.useState<Pagination | null>(null)
  const [loading,    setLoading]    = React.useState(true)
  const [selected,   setSelected]   = React.useState<AuditLog | null>(null)
  const [page,       setPage]       = React.useState(1)

  // Filters
  const [entityType, setEntityType] = React.useState("all")
  const [action,     setAction]     = React.useState("all")
  const [from,       setFrom]       = React.useState("")
  const [to,         setTo]         = React.useState("")
  const [search,     setSearch]     = React.useState("")

  const fetchLogs = React.useCallback((p: number) => {
    setLoading(true)
    const params = new URLSearchParams({ page: String(p), limit: "50" })
    if (entityType !== "all") params.set("entityType", entityType)
    if (action     !== "all") params.set("action",     action)
    if (from)                 params.set("from",       from)
    if (to)                   params.set("to",         to)

    fetch(`/api/audit-logs?${params}`)
      .then((r) => r.json())
      .then((res) => {
        if (res.data) {
          setLogs(res.data.logs ?? [])
          setPagination(res.data.pagination ?? null)
        }
      })
      .finally(() => setLoading(false))
  }, [entityType, action, from, to])

  React.useEffect(() => { setPage(1); fetchLogs(1) }, [fetchLogs])

  // Client-side search on current page
  const filtered = logs.filter((l) => {
    if (!search) return true
    const q = search.toLowerCase()
    return (
      l.entityId.includes(q) ||
      l.action.includes(q)   ||
      (l.userId ?? "").includes(q) ||
      (l.ipAddress ?? "").includes(q)
    )
  })

  // Stats
  const createCount = logs.filter((l) => l.action.includes("create")).length
  const updateCount = logs.filter((l) => l.action.includes("update") || l.action.includes("post")).length
  const cancelCount = logs.filter((l) => l.action.includes("cancel") || l.action.includes("terminate")).length

  return (
    <div className="space-y-6">

      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <div className="flex items-start justify-between">
        <div>
          <div className="flex items-center gap-2">
            <Shield className="h-5 w-5 text-indigo-500" />
            <h1 className="text-2xl font-bold tracking-tight">Financial Audit Log</h1>
          </div>
          <p className="text-sm text-muted-foreground mt-1">
            Immutable, append-only ledger of all financial changes · tamper-proof
          </p>
        </div>
        <Button variant="outline" size="sm" className="h-8 w-8 p-0"
          onClick={() => fetchLogs(page)} disabled={loading}>
          <RefreshCw className={cn("h-3.5 w-3.5", loading && "animate-spin")} />
        </Button>
      </div>

      {/* ── Immutability notice ─────────────────────────────────────────────── */}
      <div className="flex items-start gap-3 rounded-lg border border-indigo-200 bg-indigo-50 dark:bg-indigo-950/20 px-4 py-3">
        <Lock className="h-4 w-4 text-indigo-600 mt-0.5 shrink-0" />
        <div className="text-xs text-indigo-700 dark:text-indigo-300 space-y-0.5">
          <p className="font-semibold">Append-only · DB trigger prevents UPDATE / DELETE</p>
          <p className="text-indigo-600/80">
            Every financial mutation is recorded with full before/after snapshots, field-level diffs, actor identity, IP address, and User-Agent.
          </p>
        </div>
      </div>

      {/* ── KPI summary ─────────────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        {[
          { label: "Total Events",  value: pagination?.total ?? logs.length, icon: Shield,       color: "text-indigo-500" },
          { label: "Creates",       value: createCount,  icon: CheckCircle2,  color: "text-emerald-500" },
          { label: "Updates",       value: updateCount,  icon: FileText,      color: "text-blue-500"    },
          { label: "Cancellations", value: cancelCount,  icon: XCircle,       color: "text-red-500"     },
        ].map(({ label, value, icon: Icon, color }) => (
          <Card key={label}>
            <CardHeader className="flex flex-row items-center justify-between pb-1">
              <CardTitle className="text-xs font-medium text-muted-foreground">{label}</CardTitle>
              <Icon className={cn("h-4 w-4", color)} />
            </CardHeader>
            <CardContent>
              <p className="text-2xl font-bold">{value}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* ── Filters ─────────────────────────────────────────────────────────── */}
      <Card>
        <CardContent className="py-4">
          <div className="flex flex-wrap items-center gap-2">
            <Filter className="h-3.5 w-3.5 text-muted-foreground shrink-0" />

            <div className="relative flex-1 min-w-36">
              <Search className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
              <Input placeholder="Search entity ID, user, IP…" className="h-8 pl-9 text-xs"
                value={search} onChange={(e) => setSearch(e.target.value)} />
            </div>

            <Select value={entityType} onValueChange={setEntityType}>
              <SelectTrigger className="h-8 w-36 text-xs"><SelectValue placeholder="Entity type" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All entities</SelectItem>
                <SelectItem value="invoice">Invoice</SelectItem>
                <SelectItem value="payment">Payment</SelectItem>
                <SelectItem value="lease">Lease</SelectItem>
                <SelectItem value="pos_sales_data">POS Data</SelectItem>
              </SelectContent>
            </Select>

            <Select value={action} onValueChange={setAction}>
              <SelectTrigger className="h-8 w-40 text-xs"><SelectValue placeholder="Action" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All actions</SelectItem>
                <SelectItem value="invoice.update">Invoice edit</SelectItem>
                <SelectItem value="invoice.post">Invoice post</SelectItem>
                <SelectItem value="invoice.cancel">Invoice cancel</SelectItem>
                <SelectItem value="payment.create">Payment</SelectItem>
                <SelectItem value="lease.create">Lease create</SelectItem>
                <SelectItem value="pos.override">POS override</SelectItem>
              </SelectContent>
            </Select>

            <input type="date" value={from} onChange={(e) => setFrom(e.target.value)}
              className="h-8 rounded-md border bg-background px-2 text-xs" />
            <span className="text-xs text-muted-foreground">to</span>
            <input type="date" value={to} onChange={(e) => setTo(e.target.value)}
              className="h-8 rounded-md border bg-background px-2 text-xs" />
          </div>
        </CardContent>
      </Card>

      {/* ── Log table ───────────────────────────────────────────────────────── */}
      <Card>
        <CardContent className="p-0">
          {loading ? (
            <div className="flex h-48 items-center justify-center">
              <RefreshCw className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          ) : filtered.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
              <Shield className="h-10 w-10 mb-3 opacity-30" />
              <p className="text-sm">No audit events match the current filters</p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-44">Timestamp</TableHead>
                  <TableHead className="w-40">Action</TableHead>
                  <TableHead>Entity</TableHead>
                  <TableHead>Changes</TableHead>
                  <TableHead>Actor</TableHead>
                  <TableHead className="w-10" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((log) => (
                  <TableRow key={log.id} className="hover:bg-muted/40">
                    {/* Timestamp */}
                    <TableCell className="text-xs text-muted-foreground whitespace-nowrap">
                      {fmtDate(log.createdAt)}
                    </TableCell>

                    {/* Action badge */}
                    <TableCell><ActionBadge action={log.action} /></TableCell>

                    {/* Entity */}
                    <TableCell>
                      <div className="flex items-center gap-1.5">
                        {ENTITY_ICONS[log.entity] ?? <FileText className="h-3.5 w-3.5 text-muted-foreground" />}
                        <div>
                          <p className="text-xs font-medium capitalize">{log.entity}</p>
                          <p className="text-[10px] font-mono text-muted-foreground">{shortId(log.entityId)}</p>
                        </div>
                      </div>
                    </TableCell>

                    {/* Inline diff summary */}
                    <TableCell>
                      {log.changedFields && Object.keys(log.changedFields).length > 0 ? (
                        <div className="flex flex-wrap gap-1">
                          {Object.keys(log.changedFields).slice(0, 3).map((f) => (
                            <span key={f}
                              className="inline-flex items-center rounded px-1.5 py-0.5 text-[10px] font-mono bg-muted text-muted-foreground">
                              {f}
                            </span>
                          ))}
                          {Object.keys(log.changedFields).length > 3 && (
                            <span className="text-[10px] text-muted-foreground">
                              +{Object.keys(log.changedFields).length - 3} more
                            </span>
                          )}
                        </div>
                      ) : (
                        <span className="text-[10px] text-muted-foreground">
                          {log.action.startsWith("lease.create") || log.action.startsWith("payment.create")
                            ? "New record" : "—"}
                        </span>
                      )}
                    </TableCell>

                    {/* Actor + IP */}
                    <TableCell>
                      <div className="text-xs">
                        {log.userId ? (
                          <p className="font-mono text-muted-foreground">{shortId(log.userId)}</p>
                        ) : (
                          <p className="italic text-muted-foreground">system</p>
                        )}
                        {log.ipAddress && (
                          <p className="text-[10px] text-muted-foreground/60">{log.ipAddress}</p>
                        )}
                      </div>
                    </TableCell>

                    {/* Detail button */}
                    <TableCell>
                      <Button variant="ghost" size="icon" className="h-7 w-7"
                        onClick={() => setSelected(log)}>
                        <Eye className="h-3.5 w-3.5" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}

          {/* Pagination */}
          {pagination && pagination.totalPages > 1 && (
            <div className="flex items-center justify-between border-t px-6 py-3">
              <p className="text-xs text-muted-foreground">
                Page {pagination.page} of {pagination.totalPages} · {pagination.total} events
              </p>
              <div className="flex gap-1">
                <Button variant="outline" size="icon" className="h-7 w-7"
                  disabled={page <= 1}
                  onClick={() => { setPage((p) => p - 1); fetchLogs(page - 1) }}>
                  <ChevronLeft className="h-3.5 w-3.5" />
                </Button>
                <Button variant="outline" size="icon" className="h-7 w-7"
                  disabled={page >= pagination.totalPages}
                  onClick={() => { setPage((p) => p + 1); fetchLogs(page + 1) }}>
                  <ChevronRight className="h-3.5 w-3.5" />
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* ── Detail dialog ────────────────────────────────────────────────────── */}
      <Dialog open={!!selected} onOpenChange={(open) => !open && setSelected(null)}>
        <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-base">
              <Shield className="h-4 w-4 text-indigo-500" />
              Audit Event Detail
            </DialogTitle>
          </DialogHeader>
          {selected && (
            <div className="space-y-4 text-sm">

              {/* Meta */}
              <div className="grid grid-cols-2 gap-3 rounded-lg border p-3 text-xs">
                {([
                  ["Event ID",   selected.id],
                  ["Timestamp",  fmtDate(selected.createdAt)],
                  ["Action",     selected.action],
                  ["Entity",     selected.entity],
                  ["Entity ID",  selected.entityId],
                  ["Actor",      selected.userId   ?? "—"],
                  ["IP Address", selected.ipAddress ?? "—"],
                  ["User-Agent", selected.userAgent ?? "—"],
                ] as const).map(([label, value]) => (
                  <div key={label} className="flex flex-col gap-0.5">
                    <span className="text-muted-foreground font-medium">{label}</span>
                    <span className="font-mono break-all">{value}</span>
                  </div>
                ))}
              </div>

              {/* Changed fields diff */}
              {selected.changedFields && Object.keys(selected.changedFields).length > 0 && (
                <div>
                  <p className="text-xs font-semibold mb-2">Field-Level Changes</p>
                  <div className="rounded-lg border p-3">
                    <DiffTable fields={selected.changedFields} />
                  </div>
                </div>
              )}

              {/* Full snapshots */}
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <JsonBlock data={selected.before} label="Before snapshot" />
                <JsonBlock data={selected.after}  label="After snapshot"  />
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

    </div>
  )
}
