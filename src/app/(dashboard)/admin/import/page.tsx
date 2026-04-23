"use client"

import * as React from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
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
  Upload,
  Download,
  FileSpreadsheet,
  Loader2,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Clock,
  RefreshCw,
} from "lucide-react"
import { useToast } from "@/components/ui/use-toast"
import { formatDate } from "@/lib/utils"

// ── Types ────────────────────────────────────────────────────────────────────

interface ImportJob {
  id: string
  type: string
  fileName: string
  status: string
  totalRows: number
  processedRows: number
  errorRows: number
  errorLog: { row: number; data: Record<string, string>; error: string }[]
  progress: number
  createdAt: string
}

type ImportType = "tenants" | "leases" | "vendors" | "sales"

// ── Constants ────────────────────────────────────────────────────────────────

const typeLabels: Record<string, string> = {
  tenants: "Tenants",
  leases: "Leases",
  vendors: "Vendors",
  sales: "POS Sales",
}

const statusConfig: Record<string, { color: string; label: string; icon: React.ReactNode }> = {
  pending: { color: "bg-yellow-100 text-yellow-700", label: "Pending", icon: <Clock className="h-3 w-3" /> },
  processing: { color: "bg-blue-100 text-blue-700", label: "Processing", icon: <Loader2 className="h-3 w-3 animate-spin" /> },
  completed: { color: "bg-green-100 text-green-700", label: "Completed", icon: <CheckCircle2 className="h-3 w-3" /> },
  failed: { color: "bg-red-100 text-red-700", label: "Failed", icon: <XCircle className="h-3 w-3" /> },
}

const columnDescriptions: Record<ImportType, string[]> = {
  tenants: ["name", "email", "property (code)", "unit", "area_sqft"],
  leases: ["tenant (name)", "start_date", "end_date", "unit", "area_sqft", "rent", "mg", "rev_share"],
  vendors: ["name", "category", "contact", "email", "phone"],
  sales: ["tenant (name)", "date", "gross", "net", "method", "transactions"],
}

// ── Component ────────────────────────────────────────────────────────────────

export default function ImportPage() {
  const { toast } = useToast()

  const [importType, setImportType] = React.useState<ImportType>("tenants")
  const [file, setFile] = React.useState<File | null>(null)
  const [isUploading, setIsUploading] = React.useState(false)

  // Active job tracking
  const [activeJob, setActiveJob] = React.useState<ImportJob | null>(null)
  const [pollingId, setPollingId] = React.useState<ReturnType<typeof setInterval> | null>(null)

  // Error dialog
  const [errorsOpen, setErrorsOpen] = React.useState(false)

  // Cleanup polling on unmount
  React.useEffect(() => {
    return () => {
      if (pollingId) clearInterval(pollingId)
    }
  }, [pollingId])

  // ── Poll job progress ──────────────────────────────────────────────────

  const pollJob = React.useCallback(
    async (jobId: string) => {
      try {
        const res = await fetch(`/api/import/${jobId}`)
        if (!res.ok) return
        const json = await res.json()
        const job = json.data as ImportJob
        setActiveJob(job)

        if (job.status === "completed" || job.status === "failed") {
          if (pollingId) {
            clearInterval(pollingId)
            setPollingId(null)
          }
          toast({
            title: job.status === "completed" ? "Import Complete" : "Import Failed",
            description:
              job.status === "completed"
                ? `${job.processedRows - job.errorRows} rows imported successfully.${job.errorRows > 0 ? ` ${job.errorRows} rows had errors.` : ""}`
                : "Import failed. Check error log for details.",
            variant: job.status === "completed" ? "default" : "destructive",
          })
        }
      } catch {
        // polling failure, continue
      }
    },
    [pollingId, toast]
  )

  // ── Upload handler ─────────────────────────────────────────────────────

  const handleUpload = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!file) return

    setIsUploading(true)
    try {
      const formData = new FormData()
      formData.append("file", file)
      formData.append("type", importType)

      const res = await fetch("/api/import/upload", {
        method: "POST",
        body: formData,
      })

      if (!res.ok) {
        const json = await res.json()
        throw new Error(json.error || "Upload failed")
      }

      const json = await res.json()
      const jobId = json.data.jobId

      toast({ title: "Upload started", description: `Processing ${file.name}...` })
      setFile(null)

      // Start polling
      setActiveJob({ id: jobId, type: importType, fileName: file.name, status: "pending", totalRows: 0, processedRows: 0, errorRows: 0, errorLog: [], progress: 0, createdAt: new Date().toISOString() })

      const id = setInterval(() => pollJob(jobId), 2000)
      setPollingId(id)
      // Immediate first poll
      pollJob(jobId)
    } catch (err) {
      toast({
        title: "Upload failed",
        description: err instanceof Error ? err.message : "Unknown error",
        variant: "destructive",
      })
    } finally {
      setIsUploading(false)
    }
  }

  // ── Template download ──────────────────────────────────────────────────

  const downloadTemplate = () => {
    window.open(`/api/import/template?type=${importType}`, "_blank")
  }

  // ── Error CSV download ─────────────────────────────────────────────────

  const downloadErrorCSV = () => {
    if (!activeJob || activeJob.errorLog.length === 0) return

    const errors = activeJob.errorLog
    const headers = ["row", "error", ...Object.keys(errors[0]?.data || {})]
    const csvLines = [
      headers.join(","),
      ...errors.map((e) => {
        const dataValues = Object.values(e.data).map((v) => `"${(v ?? "").replace(/"/g, '""')}"`)
        return [e.row, `"${e.error.replace(/"/g, '""')}"`, ...dataValues].join(",")
      }),
    ]

    const blob = new Blob([csvLines.join("\n")], { type: "text/csv" })
    const url = URL.createObjectURL(blob)
    const a = document.createElement("a")
    a.href = url
    a.download = `${activeJob.type}_errors.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  // ── Render ─────────────────────────────────────────────────────────────

  return (
    <div className="flex-1 space-y-6 p-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Bulk CSV Import</h1>
        <p className="text-muted-foreground">
          Import tenants, leases, vendors, or historical POS sales from CSV files.
        </p>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Upload Card */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Upload className="h-5 w-5" />
              Upload CSV
            </CardTitle>
            <CardDescription>
              Select import type and upload a CSV file.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleUpload} className="space-y-4">
              <div className="space-y-2">
                <Label>Import Type</Label>
                <Select
                  value={importType}
                  onValueChange={(v) => setImportType(v as ImportType)}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="tenants">Tenants</SelectItem>
                    <SelectItem value="leases">Leases</SelectItem>
                    <SelectItem value="vendors">Vendors</SelectItem>
                    <SelectItem value="sales">POS Sales (Historical)</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label>CSV File</Label>
                <Input
                  type="file"
                  accept=".csv"
                  onChange={(e) => setFile(e.target.files?.[0] || null)}
                />
                <p className="text-xs text-muted-foreground">Max 10 MB. Must be .csv format.</p>
              </div>

              {/* Column reference */}
              <div className="rounded-md border p-3 bg-muted/50">
                <p className="text-xs font-medium mb-1">Required columns for {typeLabels[importType]}:</p>
                <p className="text-xs text-muted-foreground font-mono">
                  {columnDescriptions[importType].join(", ")}
                </p>
              </div>

              <div className="flex gap-2">
                <Button type="submit" disabled={!file || isUploading} className="flex-1">
                  {isUploading ? (
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  ) : (
                    <Upload className="h-4 w-4 mr-2" />
                  )}
                  {isUploading ? "Uploading..." : "Upload & Import"}
                </Button>
                <Button type="button" variant="outline" onClick={downloadTemplate}>
                  <Download className="h-4 w-4 mr-2" />
                  Template
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>

        {/* Progress Card */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <FileSpreadsheet className="h-5 w-5" />
              Import Progress
            </CardTitle>
            <CardDescription>
              {activeJob ? `${typeLabels[activeJob.type]} — ${activeJob.fileName}` : "No active import"}
            </CardDescription>
          </CardHeader>
          <CardContent>
            {!activeJob ? (
              <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
                <FileSpreadsheet className="h-12 w-12 mb-4 opacity-20" />
                <p className="text-sm">Upload a CSV file to start an import.</p>
              </div>
            ) : (
              <div className="space-y-4">
                {/* Status badge */}
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium">Status</span>
                  <Badge
                    variant="secondary"
                    className={statusConfig[activeJob.status]?.color || ""}
                  >
                    <span className="mr-1">{statusConfig[activeJob.status]?.icon}</span>
                    {statusConfig[activeJob.status]?.label || activeJob.status}
                  </Badge>
                </div>

                {/* Progress bar */}
                <div className="space-y-1">
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Progress</span>
                    <span className="font-mono">{activeJob.progress}%</span>
                  </div>
                  <div className="h-2 rounded-full bg-muted overflow-hidden">
                    <div
                      className="h-full rounded-full bg-primary transition-all duration-300"
                      style={{ width: `${activeJob.progress}%` }}
                    />
                  </div>
                </div>

                {/* Stats */}
                <div className="grid grid-cols-3 gap-3 text-center">
                  <div className="rounded-md border p-2">
                    <p className="text-lg font-bold">{activeJob.totalRows}</p>
                    <p className="text-xs text-muted-foreground">Total</p>
                  </div>
                  <div className="rounded-md border p-2">
                    <p className="text-lg font-bold text-green-600">
                      {activeJob.processedRows - activeJob.errorRows}
                    </p>
                    <p className="text-xs text-muted-foreground">Success</p>
                  </div>
                  <div className="rounded-md border p-2">
                    <p className="text-lg font-bold text-red-600">{activeJob.errorRows}</p>
                    <p className="text-xs text-muted-foreground">Errors</p>
                  </div>
                </div>

                {/* Error actions */}
                {activeJob.errorRows > 0 && (
                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      className="flex-1"
                      onClick={() => setErrorsOpen(true)}
                    >
                      <AlertTriangle className="h-4 w-4 mr-2" />
                      View Errors ({activeJob.errorRows})
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={downloadErrorCSV}
                    >
                      <Download className="h-4 w-4 mr-2" />
                      Error CSV
                    </Button>
                  </div>
                )}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* ── Error Detail Dialog ─────────────────────────────────────────── */}
      <Dialog open={errorsOpen} onOpenChange={setErrorsOpen}>
        <DialogContent className="sm:max-w-2xl max-h-[70vh] overflow-hidden flex flex-col">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-red-500" />
              Import Errors
            </DialogTitle>
            <DialogDescription>
              {activeJob?.errorRows} rows failed validation or insertion.
            </DialogDescription>
          </DialogHeader>
          <div className="overflow-auto flex-1">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-16">Row</TableHead>
                  <TableHead>Error</TableHead>
                  <TableHead>Data</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(activeJob?.errorLog || []).slice(0, 100).map((err, i) => (
                  <TableRow key={i}>
                    <TableCell className="font-mono text-sm">{err.row}</TableCell>
                    <TableCell className="text-red-600 text-sm">{err.error}</TableCell>
                    <TableCell className="text-xs text-muted-foreground font-mono max-w-[300px] truncate">
                      {JSON.stringify(err.data)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            {(activeJob?.errorLog?.length || 0) > 100 && (
              <p className="text-xs text-muted-foreground text-center py-2">
                Showing first 100 of {activeJob?.errorLog.length} errors. Download CSV for full list.
              </p>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={downloadErrorCSV}>
              <Download className="h-4 w-4 mr-2" />
              Download Error CSV
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
