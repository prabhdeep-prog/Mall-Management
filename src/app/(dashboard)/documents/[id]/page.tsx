"use client"

import * as React from "react"
import { useParams, useRouter } from "next/navigation"
import Link from "next/link"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import {
  Download, Upload, ArrowLeft, FileText, Loader2, Calendar, User, Tag, HardDrive,
} from "lucide-react"

interface DocumentDetail {
  id:           string
  name:         string
  documentType: string
  category:     string
  description:  string | null
  fileUrl:      string
  fileKey:      string | null
  mimeType:     string | null
  fileSize:     number | null
  version:      number
  tags:         string[]
  uploadedBy:   string | null
  createdAt:    string
  tenantName:   string | null
  propertyName: string | null
  vendorName:   string | null
  leaseUnit:    string | null
}

const TYPE_LABELS: Record<string, string> = {
  lease: "Lease", compliance: "Compliance", insurance: "Insurance",
  vendor_contract: "Vendor Contract", property_doc: "Property Doc",
  tenant_doc: "Tenant Doc", other: "Other",
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

export default function DocumentDetailPage() {
  const { id } = useParams<{ id: string }>()
  const router = useRouter()
  const [doc, setDoc] = React.useState<DocumentDetail | null>(null)
  const [loading, setLoading] = React.useState(true)

  React.useEffect(() => {
    fetch(`/api/documents?search=&limit=1&page=1`)
      // We need to fetch by id — use the list endpoint with a direct approach
      .finally(() => {})

    // Fetch single document via the list endpoint filtered to just this ID
    // For now, use a simple raw query approach
    fetch(`/api/documents?limit=100`)
      .then((r) => r.json())
      .then((json) => {
        if (json.success) {
          const found = json.data.documents.find((d: DocumentDetail) => d.id === id)
          setDoc(found ?? null)
        }
      })
      .finally(() => setLoading(false))
  }, [id])

  const handleDownload = async () => {
    const res = await fetch(`/api/documents/${id}/download`)
    const json = await res.json()
    if (json.success) window.open(json.data.downloadUrl, "_blank")
  }

  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    )
  }

  if (!doc) {
    return (
      <div className="p-6 text-center text-muted-foreground">
        <p>Document not found.</p>
        <Button variant="link" onClick={() => router.push("/documents")}>Back to Documents</Button>
      </div>
    )
  }

  return (
    <div className="max-w-3xl mx-auto p-6 space-y-6">
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" onClick={() => router.push("/documents")}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div className="flex-1">
          <h1 className="text-xl font-bold tracking-tight">{doc.name}</h1>
          <p className="text-sm text-muted-foreground">
            Version {doc.version} — Uploaded {new Date(doc.createdAt).toLocaleDateString("en-IN")}
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={handleDownload}>
            <Download className="mr-2 h-4 w-4" /> Download
          </Button>
          <Button variant="outline" asChild>
            <Link href={`/documents/upload?versionOf=${doc.id}`}>
              <Upload className="mr-2 h-4 w-4" /> New Version
            </Link>
          </Button>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium text-muted-foreground">Document Info</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <div className="flex items-center gap-2">
              <FileText className="h-4 w-4 text-muted-foreground" />
              <span className="font-medium">Type:</span>
              <Badge variant="outline">{TYPE_LABELS[doc.documentType] ?? doc.documentType}</Badge>
            </div>
            <div className="flex items-center gap-2">
              <Tag className="h-4 w-4 text-muted-foreground" />
              <span className="font-medium">Category:</span>
              <span>{doc.category}</span>
            </div>
            {doc.mimeType && (
              <div className="flex items-center gap-2">
                <HardDrive className="h-4 w-4 text-muted-foreground" />
                <span className="font-medium">Format:</span>
                <span>{doc.mimeType}</span>
              </div>
            )}
            {doc.fileSize && (
              <div className="flex items-center gap-2">
                <HardDrive className="h-4 w-4 text-muted-foreground" />
                <span className="font-medium">Size:</span>
                <span>{formatBytes(doc.fileSize)}</span>
              </div>
            )}
            <div className="flex items-center gap-2">
              <Calendar className="h-4 w-4 text-muted-foreground" />
              <span className="font-medium">Uploaded:</span>
              <span>{new Date(doc.createdAt).toLocaleString("en-IN")}</span>
            </div>
            {doc.description && (
              <div className="pt-2 border-t">
                <p className="text-muted-foreground">{doc.description}</p>
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium text-muted-foreground">Linked Entities</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            {doc.tenantName && (
              <div className="flex items-center gap-2">
                <User className="h-4 w-4 text-muted-foreground" />
                <span className="font-medium">Tenant:</span> {doc.tenantName}
              </div>
            )}
            {doc.propertyName && (
              <div className="flex items-center gap-2">
                <span className="font-medium">Property:</span> {doc.propertyName}
              </div>
            )}
            {doc.vendorName && (
              <div className="flex items-center gap-2">
                <span className="font-medium">Vendor:</span> {doc.vendorName}
              </div>
            )}
            {doc.leaseUnit && (
              <div className="flex items-center gap-2">
                <span className="font-medium">Lease Unit:</span> {doc.leaseUnit}
              </div>
            )}
            {!doc.tenantName && !doc.propertyName && !doc.vendorName && !doc.leaseUnit && (
              <p className="text-muted-foreground">No linked entities</p>
            )}

            {doc.tags && (doc.tags as string[]).length > 0 && (
              <div className="pt-2 border-t">
                <p className="font-medium mb-2">Tags</p>
                <div className="flex flex-wrap gap-1">
                  {(doc.tags as string[]).map((tag) => (
                    <Badge key={tag} variant="secondary" className="text-xs">{tag}</Badge>
                  ))}
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
