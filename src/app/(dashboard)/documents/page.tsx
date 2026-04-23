"use client"

import * as React from "react"
import Link from "next/link"
import { cn } from "@/lib/utils"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select"
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table"
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import {
  Search, Plus, MoreHorizontal, Download, Eye, Upload, Trash2,
  FileText, ChevronLeft, ChevronRight, RefreshCw, Loader2,
} from "lucide-react"
import { usePropertyStore } from "@/stores/property-store"
import { UploadDocumentDialog } from "@/components/documents/upload-document-dialog"

// ── Types ────────────────────────────────────────────────────────────────────

interface Document {
  id:           string
  name:         string
  documentType: string
  category:     string
  mimeType:     string | null
  fileSize:     number | null
  version:      number
  tags:         string[]
  createdAt:    string
  tenantName:   string | null
  propertyName: string | null
  vendorName:   string | null
  leaseUnit:    string | null
  uploadedBy:   string | null
}

interface Pagination {
  page: number; limit: number; total: number; totalPages: number
}

// ── Helpers ──────────────────────────────────────────────────────────────────

const DOC_TYPE_LABELS: Record<string, string> = {
  lease:           "Lease",
  compliance:      "Compliance",
  insurance:       "Insurance",
  vendor_contract: "Vendor Contract",
  property_doc:    "Property Doc",
  tenant_doc:      "Tenant Doc",
  other:           "Other",
}

function formatBytes(bytes: number): string {
  if (bytes < 1024)        return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

function linkedEntity(doc: Document): string {
  if (doc.tenantName) return doc.tenantName
  if (doc.vendorName) return doc.vendorName
  if (doc.propertyName) return doc.propertyName
  if (doc.leaseUnit) return `Unit ${doc.leaseUnit}`
  return "—"
}

// ── Component ────────────────────────────────────────────────────────────────

export default function DocumentsPage() {
  const { properties, fetchProperties } = usePropertyStore()
  const [documents, setDocuments]   = React.useState<Document[]>([])
  const [pagination, setPagination] = React.useState<Pagination>({ page: 1, limit: 20, total: 0, totalPages: 0 })
  const [search, setSearch]         = React.useState("")
  const [typeFilter, setTypeFilter] = React.useState("all")
  const [loading, setLoading]       = React.useState(true)
  const [uploadDialogOpen, setUploadDialogOpen] = React.useState(false)

  React.useEffect(() => { fetchProperties() }, [fetchProperties])

  const fetchDocs = React.useCallback(async (page = 1) => {
    setLoading(true)
    try {
      const params = new URLSearchParams({ page: String(page), limit: "20" })
      if (search)                    params.set("search", search)
      if (typeFilter !== "all")      params.set("documentType", typeFilter)

      const res  = await fetch(`/api/documents?${params}`)
      const json = await res.json()
      if (json.success) {
        setDocuments(json.data.documents)
        setPagination(json.data.pagination)
      }
    } catch (err) {
      console.error("Failed to fetch documents:", err)
    } finally {
      setLoading(false)
    }
  }, [search, typeFilter])

  React.useEffect(() => { fetchDocs(1) }, [fetchDocs])

  const handleDownload = async (id: string) => {
    const res  = await fetch(`/api/documents/${id}/download`)
    const json = await res.json()
    if (json.success) {
      window.open(json.data.downloadUrl, "_blank")
    }
  }

  const handleDelete = async (id: string) => {
    if (!confirm("Are you sure you want to delete this document?")) return
    const res = await fetch(`/api/documents/${id}`, { method: "DELETE" })
    if (res.ok) fetchDocs(pagination.page)
  }

  return (
    <div className="space-y-6 p-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Documents</h1>
          <p className="text-sm text-muted-foreground">
            Manage leases, contracts, compliance certificates, and more
          </p>
        </div>
        <Button onClick={() => setUploadDialogOpen(true)}>
          <Plus className="mr-2 h-4 w-4" />
          Upload Document
        </Button>
        <UploadDocumentDialog
          open={uploadDialogOpen}
          onOpenChange={setUploadDialogOpen}
          properties={properties}
          onSuccess={() => fetchDocs(1)}
        />
      </div>

      {/* Filters */}
      <div className="flex items-center gap-4">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search documents…"
            className="pl-9"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <Select value={typeFilter} onValueChange={setTypeFilter}>
          <SelectTrigger className="w-[180px]">
            <SelectValue placeholder="Document type" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Types</SelectItem>
            {Object.entries(DOC_TYPE_LABELS).map(([k, v]) => (
              <SelectItem key={k} value={k}>{v}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button variant="outline" size="icon" onClick={() => fetchDocs(pagination.page)} disabled={loading}>
          <RefreshCw className={cn("h-4 w-4", loading && "animate-spin")} />
        </Button>
      </div>

      {/* Table */}
      <Card>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Type</TableHead>
              <TableHead>Category</TableHead>
              <TableHead>Linked To</TableHead>
              <TableHead>Size</TableHead>
              <TableHead>Version</TableHead>
              <TableHead>Date</TableHead>
              <TableHead>Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow>
                <TableCell colSpan={8} className="h-24 text-center">
                  <Loader2 className="h-5 w-5 animate-spin mx-auto text-muted-foreground" />
                </TableCell>
              </TableRow>
            ) : documents.length === 0 ? (
              <TableRow>
                <TableCell colSpan={8} className="h-24 text-center text-muted-foreground">
                  No documents found.
                </TableCell>
              </TableRow>
            ) : (
              documents.map((doc) => (
                <TableRow key={doc.id}>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <FileText className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                      <Link href={`/documents/${doc.id}`} className="font-medium hover:underline truncate max-w-[200px]">
                        {doc.name}
                      </Link>
                    </div>
                  </TableCell>
                  <TableCell>
                    <Badge variant="outline">{DOC_TYPE_LABELS[doc.documentType] ?? doc.documentType}</Badge>
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">{doc.category}</TableCell>
                  <TableCell className="text-sm">{linkedEntity(doc)}</TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {doc.fileSize ? formatBytes(doc.fileSize) : "—"}
                  </TableCell>
                  <TableCell className="text-sm">v{doc.version}</TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {new Date(doc.createdAt).toLocaleDateString("en-IN")}
                  </TableCell>
                  <TableCell>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon" className="h-8 w-8">
                          <MoreHorizontal className="h-4 w-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem onClick={() => handleDownload(doc.id)}>
                          <Download className="mr-2 h-4 w-4" /> Download
                        </DropdownMenuItem>
                        <DropdownMenuItem asChild>
                          <Link href={`/documents/${doc.id}`}>
                            <Eye className="mr-2 h-4 w-4" /> View
                          </Link>
                        </DropdownMenuItem>
                        <DropdownMenuItem asChild>
                          <Link href={`/documents/upload?versionOf=${doc.id}`}>
                            <Upload className="mr-2 h-4 w-4" /> New Version
                          </Link>
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => handleDelete(doc.id)} className="text-red-600">
                          <Trash2 className="mr-2 h-4 w-4" /> Delete
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </Card>

      {/* Pagination */}
      {pagination.totalPages > 1 && (
        <div className="flex items-center justify-between">
          <p className="text-sm text-muted-foreground">
            Page {pagination.page} of {pagination.totalPages} ({pagination.total} documents)
          </p>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" disabled={pagination.page <= 1} onClick={() => fetchDocs(pagination.page - 1)}>
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <Button variant="outline" size="sm" disabled={pagination.page >= pagination.totalPages} onClick={() => fetchDocs(pagination.page + 1)}>
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}
