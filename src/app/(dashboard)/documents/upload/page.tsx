"use client"

import * as React from "react"
import { useRouter, useSearchParams } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select"
import { Upload, Loader2, CheckCircle, AlertTriangle } from "lucide-react"

// ── Types ────────────────────────────────────────────────────────────────────

const DOCUMENT_TYPES = [
  { value: "lease",           label: "Lease" },
  { value: "compliance",      label: "Compliance Certificate" },
  { value: "insurance",       label: "Insurance" },
  { value: "vendor_contract", label: "Vendor Contract" },
  { value: "property_doc",    label: "Property Document" },
  { value: "tenant_doc",      label: "Tenant Document" },
] as const

type UploadStep = "form" | "uploading" | "success" | "error"

// ── Component ────────────────────────────────────────────────────────────────

export default function DocumentUploadPage() {
  const router       = useRouter()
  const searchParams = useSearchParams()
  const versionOf    = searchParams.get("versionOf")

  const [step, setStep]     = React.useState<UploadStep>("form")
  const [error, setError]   = React.useState("")
  const [progress, setProgress] = React.useState("")

  // Form state
  const [name, setName]                   = React.useState("")
  const [documentType, setDocumentType]   = React.useState("")
  const [category, setCategory]           = React.useState("")
  const [description, setDescription]     = React.useState("")
  const [tenantId, setTenantId]           = React.useState("")
  const [leaseId, setLeaseId]             = React.useState("")
  const [vendorId, setVendorId]           = React.useState("")
  const [propertyId, setPropertyId]       = React.useState("")
  const [tags, setTags]                   = React.useState("")
  const [file, setFile]                   = React.useState<File | null>(null)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!file || !name || !documentType || !category) {
      setError("Please fill in all required fields and select a file.")
      return
    }

    setStep("uploading")
    setError("")

    try {
      // 1. Get presigned URL
      setProgress("Generating upload URL…")
      const presignRes = await fetch("/api/documents/presign", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          filename:       file.name,
          contentType:    file.type,
          organizationId: "current", // Server will resolve from session
        }),
      })

      if (!presignRes.ok) {
        const data = await presignRes.json()
        throw new Error(data.error ?? "Failed to get upload URL")
      }

      const { data: presign } = await presignRes.json()

      // 2. Upload to S3
      setProgress("Uploading file…")
      const uploadRes = await fetch(presign.uploadUrl, {
        method:  "PUT",
        headers: { "Content-Type": file.type },
        body:    file,
      })

      if (!uploadRes.ok) {
        throw new Error("File upload failed")
      }

      // 3. Save metadata (or create new version)
      setProgress("Saving document…")

      const tagArray = tags ? tags.split(",").map((t) => t.trim()).filter(Boolean) : []

      if (versionOf) {
        // New version of existing document
        const versionRes = await fetch(`/api/documents/${versionOf}/version`, {
          method:  "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name,
            fileKey:  presign.fileKey,
            fileUrl:  presign.publicUrl,
            mimeType: file.type,
            fileSize: file.size,
          }),
        })
        if (!versionRes.ok) throw new Error("Failed to save new version")
      } else {
        // New document
        const saveRes = await fetch("/api/documents", {
          method:  "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name,
            documentType,
            category,
            description: description || undefined,
            organizationId: "current",
            tenantId:   tenantId || undefined,
            leaseId:    leaseId || undefined,
            vendorId:   vendorId || undefined,
            propertyId: propertyId || undefined,
            fileKey:    presign.fileKey,
            fileUrl:    presign.publicUrl,
            mimeType:   file.type,
            fileSize:   file.size,
            tags:       tagArray,
          }),
        })
        if (!saveRes.ok) throw new Error("Failed to save document metadata")
      }

      setStep("success")
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload failed")
      setStep("error")
    }
  }

  // ── Success state ──────────────────────────────────────────────────────
  if (step === "success") {
    return (
      <div className="flex flex-col items-center justify-center py-24 space-y-4">
        <CheckCircle className="h-12 w-12 text-emerald-500" />
        <h2 className="text-xl font-semibold">
          {versionOf ? "New version uploaded" : "Document uploaded"}
        </h2>
        <Button onClick={() => router.push("/documents")}>Back to Documents</Button>
      </div>
    )
  }

  // ── Form ───────────────────────────────────────────────────────────────
  return (
    <div className="max-w-2xl mx-auto p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">
          {versionOf ? "Upload New Version" : "Upload Document"}
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          {versionOf
            ? "Upload a new version of an existing document"
            : "Upload and categorize a new document"}
        </p>
      </div>

      <form onSubmit={handleSubmit}>
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Document Details</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="name">Name *</Label>
              <Input id="name" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Lease Agreement - Zara" />
            </div>

            {!versionOf && (
              <>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Document Type *</Label>
                    <Select value={documentType} onValueChange={setDocumentType}>
                      <SelectTrigger><SelectValue placeholder="Select type" /></SelectTrigger>
                      <SelectContent>
                        {DOCUMENT_TYPES.map((t) => (
                          <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label>Category *</Label>
                    <Input value={category} onChange={(e) => setCategory(e.target.value)} placeholder="e.g. fire_safety, annual_renewal" />
                  </div>
                </div>

                <div className="space-y-2">
                  <Label>Description</Label>
                  <Textarea value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Optional description" rows={2} />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Tenant ID</Label>
                    <Input value={tenantId} onChange={(e) => setTenantId(e.target.value)} placeholder="UUID (optional)" />
                  </div>
                  <div className="space-y-2">
                    <Label>Lease ID</Label>
                    <Input value={leaseId} onChange={(e) => setLeaseId(e.target.value)} placeholder="UUID (optional)" />
                  </div>
                  <div className="space-y-2">
                    <Label>Vendor ID</Label>
                    <Input value={vendorId} onChange={(e) => setVendorId(e.target.value)} placeholder="UUID (optional)" />
                  </div>
                  <div className="space-y-2">
                    <Label>Property ID</Label>
                    <Input value={propertyId} onChange={(e) => setPropertyId(e.target.value)} placeholder="UUID (optional)" />
                  </div>
                </div>

                <div className="space-y-2">
                  <Label>Tags</Label>
                  <Input value={tags} onChange={(e) => setTags(e.target.value)} placeholder="Comma-separated: insurance, 2026, fire" />
                </div>
              </>
            )}

            {/* File input */}
            <div className="space-y-2">
              <Label>File *</Label>
              <div className="border-2 border-dashed rounded-lg p-6 text-center">
                {file ? (
                  <div className="space-y-1">
                    <p className="text-sm font-medium">{file.name}</p>
                    <p className="text-xs text-muted-foreground">{(file.size / 1024).toFixed(1)} KB — {file.type}</p>
                    <Button variant="ghost" size="sm" onClick={() => setFile(null)}>Remove</Button>
                  </div>
                ) : (
                  <label className="cursor-pointer space-y-2 block">
                    <Upload className="h-8 w-8 mx-auto text-muted-foreground" />
                    <p className="text-sm text-muted-foreground">Click to select a file (max 20MB)</p>
                    <input
                      type="file"
                      className="hidden"
                      onChange={(e) => setFile(e.target.files?.[0] ?? null)}
                      accept=".pdf,.doc,.docx,.xls,.xlsx,.csv,.txt,.jpg,.jpeg,.png,.webp,.gif"
                    />
                  </label>
                )}
              </div>
            </div>

            {error && (
              <div className="flex items-center gap-2 text-sm text-red-600">
                <AlertTriangle className="h-4 w-4" /> {error}
              </div>
            )}

            <Button type="submit" className="w-full" disabled={step === "uploading"}>
              {step === "uploading" ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  {progress}
                </>
              ) : (
                <>
                  <Upload className="mr-2 h-4 w-4" />
                  {versionOf ? "Upload New Version" : "Upload Document"}
                </>
              )}
            </Button>
          </CardContent>
        </Card>
      </form>
    </div>
  )
}
