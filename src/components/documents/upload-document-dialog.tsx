"use client"

import * as React from "react"
import {
  Check,
  ChevronLeft,
  ChevronRight,
  FileText,
  Link2,
  ClipboardList,
  Loader2,
  FileCheck,
  ShieldCheck,
  Landmark,
  FileSignature,
  Building2,
  Users,
  Tag,
} from "lucide-react"
import { Dialog, DialogContent } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Separator } from "@/components/ui/separator"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { cn } from "@/lib/utils"
import { useToast } from "@/components/ui/use-toast"
import type { Property } from "@/stores/property-store"

// ── Types ─────────────────────────────────────────────────────────────────────

interface UploadDocumentDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  properties: Property[]
  onSuccess: () => void
}

interface DocumentForm {
  name: string
  documentType: string
  category: string
  description: string
  fileUrl: string
  tags: string
  propertyId: string
  tenantId: string
  vendorId: string
}

const EMPTY_FORM: DocumentForm = {
  name: "", documentType: "", category: "", description: "",
  fileUrl: "", tags: "", propertyId: "", tenantId: "", vendorId: "",
}

// ── Step definitions ──────────────────────────────────────────────────────────

const STEPS = [
  { id: 1, key: "info",   label: "Info",   icon: FileText,      title: "Document Information",  description: "Name, type and description of the document" },
  { id: 2, key: "file",   label: "File",   icon: Link2,         title: "File & Links",           description: "File URL and link to related entities" },
  { id: 3, key: "review", label: "Review", icon: ClipboardList, title: "Review & Submit",        description: "Confirm all details before saving" },
]

// ── Document type cards ───────────────────────────────────────────────────────

const DOC_TYPES = [
  { value: "lease",           label: "Lease",          icon: FileSignature, color: "bg-blue-50 border-blue-200 text-blue-700" },
  { value: "compliance",      label: "Compliance",     icon: ShieldCheck,   color: "bg-green-50 border-green-200 text-green-700" },
  { value: "insurance",       label: "Insurance",      icon: Landmark,      color: "bg-indigo-50 border-indigo-200 text-indigo-700" },
  { value: "vendor_contract", label: "Vendor Contract",icon: FileCheck,     color: "bg-orange-50 border-orange-200 text-orange-700" },
  { value: "property_doc",    label: "Property Doc",   icon: Building2,     color: "bg-purple-50 border-purple-200 text-purple-700" },
  { value: "tenant_doc",      label: "Tenant Doc",     icon: Users,         color: "bg-cyan-50 border-cyan-200 text-cyan-700" },
  { value: "other",           label: "Other",          icon: FileText,      color: "bg-gray-50 border-gray-200 text-gray-700" },
]

const DOC_TYPE_LABELS: Record<string, string> = Object.fromEntries(DOC_TYPES.map((d) => [d.value, d.label]))

// ── Helpers ───────────────────────────────────────────────────────────────────

function SectionHeader({ title, description }: { title: string; description?: string }) {
  return (
    <div className="mb-4">
      <h3 className="text-sm font-semibold">{title}</h3>
      {description && <p className="text-xs text-muted-foreground mt-0.5">{description}</p>}
      <Separator className="mt-2" />
    </div>
  )
}

function ReviewRow({ label, value }: { label: string; value?: string | null }) {
  return (
    <div className="flex justify-between py-1.5 text-sm border-b last:border-0">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-medium text-right max-w-[65%] truncate">{value || "—"}</span>
    </div>
  )
}

// ── Main Component ────────────────────────────────────────────────────────────

export function UploadDocumentDialog({ open, onOpenChange, properties, onSuccess }: UploadDocumentDialogProps) {
  const { toast } = useToast()
  const [step, setStep] = React.useState(1)
  const [form, setForm] = React.useState<DocumentForm>(EMPTY_FORM)
  const [isSubmitting, setIsSubmitting] = React.useState(false)
  const [errors, setErrors] = React.useState<Partial<DocumentForm>>({})

  const set = (field: keyof DocumentForm, value: string) =>
    setForm((prev) => ({ ...prev, [field]: value }))

  const validate = (s: number): boolean => {
    const errs: Partial<DocumentForm> = {}
    if (s === 1) {
      if (!form.name.trim()) errs.name = "Document name is required"
      if (!form.documentType) errs.documentType = "Please select a document type"
    }
    if (s === 2) {
      if (!form.fileUrl.trim()) errs.fileUrl = "File URL is required"
    }
    setErrors(errs)
    return Object.keys(errs).length === 0
  }

  const handleNext = () => {
    if (!validate(step)) return
    setStep((s) => s + 1)
  }

  const handleBack = () => {
    setErrors({})
    setStep((s) => s - 1)
  }

  const handleClose = () => {
    setStep(1)
    setForm(EMPTY_FORM)
    setErrors({})
    onOpenChange(false)
  }

  const handleSubmit = async () => {
    if (!validate(1)) { setStep(1); return }
    if (!validate(2)) { setStep(2); return }
    setIsSubmitting(true)
    try {
      const tagsArray = form.tags
        ? form.tags.split(",").map((t) => t.trim()).filter(Boolean)
        : []

      const res = await fetch("/api/documents", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: form.name,
          documentType: form.documentType,
          category: form.category || form.documentType,
          description: form.description || null,
          fileUrl: form.fileUrl,
          fileKey: form.fileUrl,          // URL doubles as key for manual uploads
          mimeType: null,
          fileSize: null,
          tags: tagsArray,
          propertyId: form.propertyId || null,
          tenantId: form.tenantId || null,
          vendorId: form.vendorId || null,
          leaseId: null,
        }),
      })
      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.error || "Failed to save document")
      }
      toast({ title: "Document saved", description: `"${form.name}" has been saved successfully.` })
      handleClose()
      onSuccess()
    } catch (err: any) {
      toast({ title: "Error", description: err.message || "Failed to save document.", variant: "destructive" })
    } finally {
      setIsSubmitting(false)
    }
  }

  const docTypeLabel = DOC_TYPE_LABELS[form.documentType]
  const propertyName = properties.find((p) => p.id === form.propertyId)?.name

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-2xl p-0 gap-0 flex flex-col max-h-[90vh]">
        {/* ── Header ── */}
        <div className="px-6 pt-5 pb-4 border-b flex-shrink-0">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="text-lg font-semibold">{STEPS[step - 1].title}</h2>
              <p className="text-sm text-muted-foreground">{STEPS[step - 1].description}</p>
            </div>
            <span className="text-xs text-muted-foreground">Step {step} of {STEPS.length}</span>
          </div>

          {/* Stepper */}
          <div className="flex items-center gap-0">
            {STEPS.map((s, i) => {
              const Icon = s.icon
              const done = step > s.id
              const active = step === s.id
              return (
                <React.Fragment key={s.id}>
                  <button
                    type="button"
                    onClick={() => done ? setStep(s.id) : undefined}
                    className={cn(
                      "flex items-center gap-1.5 px-2 py-1 rounded-md text-xs font-medium transition-colors",
                      active && "bg-primary text-primary-foreground",
                      done && "text-primary cursor-pointer hover:bg-primary/10",
                      !active && !done && "text-muted-foreground",
                    )}
                  >
                    {done ? <Check className="h-3.5 w-3.5" /> : <Icon className="h-3.5 w-3.5" />}
                    <span className="hidden sm:inline">{s.label}</span>
                  </button>
                  {i < STEPS.length - 1 && (
                    <div className={cn("flex-1 h-px mx-1", step > s.id ? "bg-primary" : "bg-border")} />
                  )}
                </React.Fragment>
              )
            })}
          </div>
        </div>

        {/* ── Body ── */}
        <div className="flex-1 overflow-y-auto px-6 py-5">

          {/* Step 1 — Document Info */}
          {step === 1 && (
            <div className="space-y-5">
              <div>
                <label className="text-sm font-medium">Document Name <span className="text-destructive">*</span></label>
                <Input className="mt-1.5" placeholder="e.g., Lease Agreement - Unit 204" value={form.name} onChange={(e) => set("name", e.target.value)} />
                {errors.name && <p className="text-xs text-destructive mt-1">{errors.name}</p>}
              </div>

              <div>
                <SectionHeader title="Document Type" description="Select the type that best describes this document" />
                <div className="grid grid-cols-4 gap-2">
                  {DOC_TYPES.map((dt) => {
                    const Icon = dt.icon
                    return (
                      <button
                        key={dt.value}
                        type="button"
                        onClick={() => set("documentType", dt.value)}
                        className={cn(
                          "flex flex-col items-center gap-1.5 rounded-lg border-2 p-2.5 text-xs font-medium transition-all",
                          dt.color,
                          form.documentType === dt.value && "ring-2 ring-offset-1 ring-primary scale-[1.02]",
                          form.documentType !== dt.value && "opacity-70 hover:opacity-100",
                        )}
                      >
                        <Icon className="h-5 w-5" />
                        <span className="text-center leading-tight">{dt.label}</span>
                      </button>
                    )
                  })}
                </div>
                {errors.documentType && <p className="text-xs text-destructive mt-2">{errors.documentType}</p>}
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-sm font-medium">Category</label>
                  <Input className="mt-1.5" placeholder="e.g., legal, financial" value={form.category} onChange={(e) => set("category", e.target.value)} />
                </div>
                <div>
                  <label className="text-sm font-medium flex items-center gap-1.5">
                    <Tag className="h-3.5 w-3.5 text-muted-foreground" /> Tags
                  </label>
                  <Input className="mt-1.5" placeholder="tag1, tag2, tag3" value={form.tags} onChange={(e) => set("tags", e.target.value)} />
                </div>
              </div>

              <div>
                <label className="text-sm font-medium">Description</label>
                <textarea
                  className="mt-1.5 flex min-h-[70px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                  placeholder="Brief description of this document..."
                  value={form.description}
                  onChange={(e) => set("description", e.target.value)}
                />
              </div>
            </div>
          )}

          {/* Step 2 — File & Links */}
          {step === 2 && (
            <div className="space-y-5">
              <div>
                <SectionHeader title="File URL" description="Paste a public URL to the document file" />
                <Input
                  placeholder="https://storage.example.com/documents/file.pdf"
                  value={form.fileUrl}
                  onChange={(e) => set("fileUrl", e.target.value)}
                />
                {errors.fileUrl && <p className="text-xs text-destructive mt-1">{errors.fileUrl}</p>}
                <p className="text-xs text-muted-foreground mt-1.5">Paste a shareable URL from Google Drive, Dropbox, S3, or any public host</p>
              </div>

              <div>
                <SectionHeader title="Link to Entity" description="Optionally associate this document with a property or tenant (all optional)" />
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="text-sm font-medium">Property</label>
                    <Select value={form.propertyId} onValueChange={(v) => set("propertyId", v)}>
                      <SelectTrigger className="mt-1.5">
                        <SelectValue placeholder="Select property (optional)" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="">None</SelectItem>
                        {properties.map((p) => (
                          <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <label className="text-sm font-medium">Tenant ID</label>
                    <Input
                      className="mt-1.5"
                      placeholder="Paste tenant UUID (optional)"
                      value={form.tenantId}
                      onChange={(e) => set("tenantId", e.target.value)}
                    />
                  </div>
                </div>
                <div className="mt-4">
                  <label className="text-sm font-medium">Vendor ID</label>
                  <Input
                    className="mt-1.5"
                    placeholder="Paste vendor UUID (optional)"
                    value={form.vendorId}
                    onChange={(e) => set("vendorId", e.target.value)}
                  />
                </div>
              </div>
            </div>
          )}

          {/* Step 3 — Review */}
          {step === 3 && (
            <div className="space-y-4">
              <div className="rounded-lg border p-4">
                <h4 className="text-sm font-semibold mb-2">Document Details</h4>
                <ReviewRow label="Name" value={form.name} />
                <ReviewRow label="Type" value={docTypeLabel} />
                <ReviewRow label="Category" value={form.category} />
                <ReviewRow label="Description" value={form.description} />
                <ReviewRow label="Tags" value={form.tags} />
              </div>
              <div className="rounded-lg border p-4">
                <h4 className="text-sm font-semibold mb-2">File & Links</h4>
                <ReviewRow label="File URL" value={form.fileUrl} />
                <ReviewRow label="Property" value={propertyName} />
                {form.tenantId && <ReviewRow label="Tenant ID" value={form.tenantId} />}
                {form.vendorId && <ReviewRow label="Vendor ID" value={form.vendorId} />}
              </div>
            </div>
          )}
        </div>

        {/* ── Footer ── */}
        <div className="px-6 py-4 border-t flex justify-between flex-shrink-0">
          <Button type="button" variant="outline" onClick={step === 1 ? handleClose : handleBack}>
            {step === 1 ? "Cancel" : <><ChevronLeft className="h-4 w-4 mr-1" /> Back</>}
          </Button>
          {step < STEPS.length ? (
            <Button type="button" onClick={handleNext}>
              Next <ChevronRight className="h-4 w-4 ml-1" />
            </Button>
          ) : (
            <Button type="button" onClick={handleSubmit} disabled={isSubmitting}>
              {isSubmitting ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Saving…</> : "Save Document"}
            </Button>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}
