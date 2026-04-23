"use client"

import * as React from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import {
  FolderOpen,
  Search,
  Download,
  FileText,
  Image,
  File,
  Loader2,
  Calendar,
} from "lucide-react"
import { formatDate } from "@/lib/utils/index"

interface Document {
  id: string
  name: string
  type: string | null
  category: string
  fileSize: number | null
  mimeType: string | null
  downloadUrl: string
  uploadedAt: string
}

const CATEGORY_LABELS: Record<string, string> = {
  lease_agreement:  "Lease Agreement",
  invoice:          "Invoice",
  invoice_pdf:      "Invoice PDF",
  payment_receipt:  "Payment Receipt",
  noc:              "NOC",
  trade_license:    "Trade License",
  insurance:        "Insurance",
  fit_out_approval: "Fit-Out Approval",
  other:            "Other",
}

function fileIcon(mimeType: string | null) {
  if (!mimeType) return <File className="h-5 w-5 text-muted-foreground" />
  if (mimeType.startsWith("image/"))  return <Image    className="h-5 w-5 text-blue-500" />
  if (mimeType === "application/pdf") return <FileText className="h-5 w-5 text-red-500"  />
  return <File className="h-5 w-5 text-muted-foreground" />
}

function formatBytes(bytes: number): string {
  if (bytes < 1024)        return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

export default function TenantDocumentsPage() {
  const [documents, setDocuments] = React.useState<Document[]>([])
  const [isLoading, setIsLoading] = React.useState(true)
  const [search, setSearch]       = React.useState("")

  React.useEffect(() => {
    fetch("/api/tenant/documents")
      .then((r) => r.json())
      .then((res) => setDocuments(res.data ?? []))
      .finally(() => setIsLoading(false))
  }, [])

  const filtered = documents.filter((d) =>
    d.name.toLowerCase().includes(search.toLowerCase()) ||
    (CATEGORY_LABELS[d.category] ?? d.category).toLowerCase().includes(search.toLowerCase()),
  )

  // Group by category
  const grouped = filtered.reduce<Record<string, Document[]>>((acc, doc) => {
    const cat = doc.category
    if (!acc[cat]) acc[cat] = []
    acc[cat].push(doc)
    return acc
  }, {})

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Documents</h1>
        <p className="text-sm text-muted-foreground mt-1">Your agreements, receipts, and compliance documents</p>
      </div>

      {/* Search */}
      <div className="relative max-w-sm">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          placeholder="Search documents…"
          className="pl-9"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      {isLoading ? (
        <div className="flex h-48 items-center justify-center">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </div>
      ) : filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
          <FolderOpen className="h-10 w-10 mb-3 opacity-30" />
          <p className="text-sm font-medium">No documents</p>
          <p className="text-xs mt-1">Documents shared by your property manager will appear here</p>
        </div>
      ) : (
        <div className="space-y-6">
          {Object.entries(grouped).map(([category, docs]) => (
            <Card key={category}>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
                  {CATEGORY_LABELS[category] ?? category}
                  <span className="ml-2 text-xs font-normal normal-case">({docs.length})</span>
                </CardTitle>
              </CardHeader>
              <CardContent className="p-0">
                <div className="divide-y">
                  {docs.map((doc) => (
                    <div key={doc.id} className="flex items-center justify-between gap-4 px-6 py-3">
                      <div className="flex items-center gap-3 min-w-0">
                        {fileIcon(doc.mimeType)}
                        <div className="min-w-0">
                          <p className="text-sm font-medium truncate">{doc.name}</p>
                          <div className="flex items-center gap-2 mt-0.5">
                            {doc.fileSize && (
                              <span className="text-[10px] text-muted-foreground">{formatBytes(doc.fileSize)}</span>
                            )}
                            <span className="text-[10px] text-muted-foreground flex items-center gap-1">
                              <Calendar className="h-3 w-3" /> {formatDate(doc.uploadedAt)}
                            </span>
                          </div>
                        </div>
                      </div>
                      <Button variant="ghost" size="sm" className="flex-shrink-0 gap-1.5" asChild>
                        <a href={doc.downloadUrl} download={doc.name} target="_blank" rel="noreferrer">
                          <Download className="h-3.5 w-3.5" />
                          Download
                        </a>
                      </Button>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  )
}
