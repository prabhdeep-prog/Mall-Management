"use client"

import * as React from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Badge } from "@/components/ui/badge"
import { Textarea } from "@/components/ui/textarea"
import { Switch } from "@/components/ui/switch"
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
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import {
  Plus,
  MoreHorizontal,
  Loader2,
  RefreshCw,
  Mail,
  MessageCircle,
  Smartphone,
  Eye,
  Send,
  Pencil,
  Trash2,
  Variable,
} from "lucide-react"
import { useToast } from "@/components/ui/use-toast"

// ── Types ────────────────────────────────────────────────────────────────────

interface Template {
  id: string
  name: string
  channel: string
  eventType: string
  subject: string | null
  body: string
  isActive: boolean
  createdAt: string
}

// ── Constants (mirrored from variables.ts for client use) ────────────────────

const EVENT_TYPE_LABELS: Record<string, string> = {
  invoice_created: "Invoice Created",
  payment_due: "Payment Due",
  lease_expiry: "Lease Expiry",
  cam_generated: "CAM Generated",
}

const CHANNEL_CONFIG: Record<string, { label: string; icon: React.ReactNode }> = {
  email: { label: "Email", icon: <Mail className="h-3.5 w-3.5" /> },
  whatsapp: { label: "WhatsApp", icon: <MessageCircle className="h-3.5 w-3.5" /> },
  sms: { label: "SMS", icon: <Smartphone className="h-3.5 w-3.5" /> },
}

interface VarDef {
  key: string
  label: string
  description: string
}

const VARIABLES_BY_EVENT: Record<string, VarDef[]> = {
  invoice_created: [
    { key: "tenant_name", label: "Tenant Name", description: "Business name" },
    { key: "property_name", label: "Property Name", description: "Mall/property name" },
    { key: "invoice_number", label: "Invoice Number", description: "Invoice reference" },
    { key: "invoice_amount", label: "Invoice Amount", description: "Total amount" },
    { key: "due_date", label: "Due Date", description: "Payment due date" },
  ],
  payment_due: [
    { key: "tenant_name", label: "Tenant Name", description: "Business name" },
    { key: "property_name", label: "Property Name", description: "Mall/property name" },
    { key: "invoice_number", label: "Invoice Number", description: "Invoice reference" },
    { key: "invoice_amount", label: "Invoice Amount", description: "Amount due" },
    { key: "due_date", label: "Due Date", description: "Payment due date" },
    { key: "days_overdue", label: "Days Overdue", description: "Days past due" },
  ],
  lease_expiry: [
    { key: "tenant_name", label: "Tenant Name", description: "Business name" },
    { key: "property_name", label: "Property Name", description: "Mall/property name" },
    { key: "lease_end_date", label: "Lease End Date", description: "Expiry date" },
    { key: "unit_number", label: "Unit Number", description: "Unit identifier" },
    { key: "days_until_expiry", label: "Days Until Expiry", description: "Days remaining" },
  ],
  cam_generated: [
    { key: "tenant_name", label: "Tenant Name", description: "Business name" },
    { key: "property_name", label: "Property Name", description: "Mall/property name" },
    { key: "cam_category", label: "CAM Category", description: "Expense category" },
    { key: "cam_amount", label: "CAM Amount", description: "Allocated amount" },
    { key: "cam_period", label: "CAM Period", description: "Charge period" },
  ],
}

// ── Component ────────────────────────────────────────────────────────────────

export default function NotificationTemplatesPage() {
  const { toast } = useToast()

  const [templates, setTemplates] = React.useState<Template[]>([])
  const [isLoading, setIsLoading] = React.useState(true)

  // Editor dialog
  const [editorOpen, setEditorOpen] = React.useState(false)
  const [editingId, setEditingId] = React.useState<string | null>(null)
  const [isSubmitting, setIsSubmitting] = React.useState(false)
  const [form, setForm] = React.useState({
    name: "",
    channel: "email",
    eventType: "invoice_created",
    subject: "",
    bodyText: "",
  })

  // Preview dialog
  const [previewOpen, setPreviewOpen] = React.useState(false)
  const [previewData, setPreviewData] = React.useState<{ subject: string | null; body: string; channel: string } | null>(null)
  const [previewLoading, setPreviewLoading] = React.useState(false)

  // Textarea ref for variable insertion
  const bodyRef = React.useRef<HTMLTextAreaElement>(null)

  // ── Fetch templates ────────────────────────────────────────────────────

  const fetchTemplates = React.useCallback(async () => {
    setIsLoading(true)
    try {
      const res = await fetch("/api/notifications/templates")
      if (!res.ok) throw new Error("Failed to fetch")
      const json = await res.json()
      setTemplates(json.data || [])
    } catch {
      toast({ title: "Error", description: "Failed to load templates.", variant: "destructive" })
    } finally {
      setIsLoading(false)
    }
  }, [toast])

  React.useEffect(() => {
    fetchTemplates()
  }, [fetchTemplates])

  // ── Open editor ────────────────────────────────────────────────────────

  const openCreate = () => {
    setEditingId(null)
    setForm({ name: "", channel: "email", eventType: "invoice_created", subject: "", bodyText: "" })
    setEditorOpen(true)
  }

  const openEdit = (t: Template) => {
    setEditingId(t.id)
    setForm({
      name: t.name,
      channel: t.channel,
      eventType: t.eventType,
      subject: t.subject || "",
      bodyText: t.body,
    })
    setEditorOpen(true)
  }

  // ── Save template ─────────────────────────────────────────────────────

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault()
    setIsSubmitting(true)
    try {
      const url = editingId
        ? `/api/notifications/templates/${editingId}`
        : "/api/notifications/templates"
      const method = editingId ? "PUT" : "POST"

      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      })

      if (!res.ok) {
        const json = await res.json()
        throw new Error(json.error || "Save failed")
      }

      toast({ title: "Success", description: `Template ${editingId ? "updated" : "created"}.` })
      setEditorOpen(false)
      fetchTemplates()
    } catch (err) {
      toast({
        title: "Error",
        description: err instanceof Error ? err.message : "Failed to save template.",
        variant: "destructive",
      })
    } finally {
      setIsSubmitting(false)
    }
  }

  // ── Delete (soft) ──────────────────────────────────────────────────────

  const handleDelete = async (id: string) => {
    try {
      const res = await fetch(`/api/notifications/templates/${id}`, { method: "DELETE" })
      if (!res.ok) throw new Error("Delete failed")
      toast({ title: "Success", description: "Template deactivated." })
      fetchTemplates()
    } catch {
      toast({ title: "Error", description: "Failed to delete template.", variant: "destructive" })
    }
  }

  // ── Toggle active ──────────────────────────────────────────────────────

  const handleToggle = async (id: string, isActive: boolean) => {
    try {
      const res = await fetch(`/api/notifications/templates/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isActive }),
      })
      if (!res.ok) throw new Error("Toggle failed")
      fetchTemplates()
    } catch {
      toast({ title: "Error", description: "Failed to update.", variant: "destructive" })
    }
  }

  // ── Preview ────────────────────────────────────────────────────────────

  const handlePreview = async (templateId: string) => {
    setPreviewLoading(true)
    setPreviewOpen(true)
    try {
      const res = await fetch("/api/notifications/preview", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ templateId }),
      })
      if (!res.ok) throw new Error("Preview failed")
      const json = await res.json()
      setPreviewData(json.data)
    } catch {
      toast({ title: "Error", description: "Preview failed.", variant: "destructive" })
      setPreviewOpen(false)
    } finally {
      setPreviewLoading(false)
    }
  }

  // ── Test send ──────────────────────────────────────────────────────────

  const handleTestSend = async (templateId: string) => {
    try {
      const res = await fetch("/api/notifications/test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ templateId }),
      })
      if (!res.ok) {
        const json = await res.json()
        throw new Error(json.error || "Test send failed")
      }
      const json = await res.json()
      toast({
        title: json.data.sent ? "Test sent" : "Test failed",
        description: json.data.sent
          ? `Sent via ${json.data.channel} to your account.`
          : json.data.error || "Unknown error",
        variant: json.data.sent ? "default" : "destructive",
      })
    } catch (err) {
      toast({
        title: "Error",
        description: err instanceof Error ? err.message : "Test send failed.",
        variant: "destructive",
      })
    }
  }

  // ── Insert variable at cursor ──────────────────────────────────────────

  const insertVariable = (key: string) => {
    const tag = `{{${key}}}`
    const textarea = bodyRef.current
    if (textarea) {
      const start = textarea.selectionStart
      const end = textarea.selectionEnd
      const before = form.bodyText.slice(0, start)
      const after = form.bodyText.slice(end)
      const newBody = before + tag + after
      setForm((f) => ({ ...f, bodyText: newBody }))
      // Restore cursor position after React re-render
      requestAnimationFrame(() => {
        textarea.focus()
        textarea.setSelectionRange(start + tag.length, start + tag.length)
      })
    } else {
      setForm((f) => ({ ...f, bodyText: f.bodyText + tag }))
    }
  }

  // ── Available variables for current event type ─────────────────────────

  const currentVars = VARIABLES_BY_EVENT[form.eventType] || []

  // ── Render ─────────────────────────────────────────────────────────────

  return (
    <div className="flex-1 space-y-6 p-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Notification Templates</h1>
          <p className="text-muted-foreground">
            Create and manage reusable notification templates for email, WhatsApp, and SMS.
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={fetchTemplates}>
            <RefreshCw className="h-4 w-4 mr-2" />
            Refresh
          </Button>
          <Button size="sm" onClick={openCreate}>
            <Plus className="h-4 w-4 mr-2" />
            New Template
          </Button>
        </div>
      </div>

      {/* Templates Table */}
      <Card>
        <CardHeader>
          <CardTitle>Templates</CardTitle>
          <CardDescription>Manage notification templates across all channels and events</CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : templates.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <Mail className="h-12 w-12 mx-auto mb-4 opacity-20" />
              <p>No templates yet. Create one to get started.</p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Channel</TableHead>
                  <TableHead>Event</TableHead>
                  <TableHead>Active</TableHead>
                  <TableHead className="w-[50px]" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {templates.map((t) => {
                  const ch = CHANNEL_CONFIG[t.channel]
                  return (
                    <TableRow key={t.id} className={!t.isActive ? "opacity-50" : ""}>
                      <TableCell className="font-medium">{t.name}</TableCell>
                      <TableCell>
                        <Badge variant="outline" className="gap-1">
                          {ch?.icon}
                          {ch?.label || t.channel}
                        </Badge>
                      </TableCell>
                      <TableCell>{EVENT_TYPE_LABELS[t.eventType] || t.eventType}</TableCell>
                      <TableCell>
                        <Switch
                          checked={t.isActive}
                          onCheckedChange={(v) => handleToggle(t.id, v)}
                        />
                      </TableCell>
                      <TableCell>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="icon" className="h-8 w-8">
                              <MoreHorizontal className="h-4 w-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem onClick={() => openEdit(t)}>
                              <Pencil className="h-4 w-4 mr-2" />
                              Edit
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={() => handlePreview(t.id)}>
                              <Eye className="h-4 w-4 mr-2" />
                              Preview
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={() => handleTestSend(t.id)}>
                              <Send className="h-4 w-4 mr-2" />
                              Test Send
                            </DropdownMenuItem>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem
                              className="text-destructive focus:text-destructive"
                              onClick={() => handleDelete(t.id)}
                            >
                              <Trash2 className="h-4 w-4 mr-2" />
                              Deactivate
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </TableCell>
                    </TableRow>
                  )
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* ── Template Editor Dialog ────────────────────────────────────────── */}
      <Dialog open={editorOpen} onOpenChange={setEditorOpen}>
        <DialogContent className="sm:max-w-3xl max-h-[85vh] overflow-hidden flex flex-col">
          <DialogHeader>
            <DialogTitle>{editingId ? "Edit Template" : "New Template"}</DialogTitle>
            <DialogDescription>
              Configure the notification template. Use the variable picker to insert dynamic values.
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleSave} className="flex-1 overflow-auto">
            <div className="flex gap-6">
              {/* Left: form fields */}
              <div className="flex-1 space-y-4">
                <div className="space-y-2">
                  <Label>Template Name</Label>
                  <Input
                    placeholder="e.g. Invoice Created – Email"
                    value={form.name}
                    onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                    required
                  />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Channel</Label>
                    <Select
                      value={form.channel}
                      onValueChange={(v) => setForm((f) => ({ ...f, channel: v }))}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="email">Email</SelectItem>
                        <SelectItem value="whatsapp">WhatsApp</SelectItem>
                        <SelectItem value="sms">SMS</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label>Event Type</Label>
                    <Select
                      value={form.eventType}
                      onValueChange={(v) => setForm((f) => ({ ...f, eventType: v }))}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {Object.entries(EVENT_TYPE_LABELS).map(([k, v]) => (
                          <SelectItem key={k} value={k}>{v}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                {form.channel === "email" && (
                  <div className="space-y-2">
                    <Label>Subject</Label>
                    <Input
                      placeholder="e.g. New Invoice {{invoice_number}}"
                      value={form.subject}
                      onChange={(e) => setForm((f) => ({ ...f, subject: e.target.value }))}
                      required={form.channel === "email"}
                    />
                  </div>
                )}

                <div className="space-y-2">
                  <Label>Body</Label>
                  <Textarea
                    ref={bodyRef}
                    placeholder="Write your message here. Use {{variable_name}} for dynamic values."
                    value={form.bodyText}
                    onChange={(e) => setForm((f) => ({ ...f, bodyText: e.target.value }))}
                    rows={10}
                    className="font-mono text-sm"
                    required
                  />
                </div>
              </div>

              {/* Right: variable picker */}
              <div className="w-52 flex-shrink-0 space-y-3">
                <div className="flex items-center gap-1.5 text-sm font-medium">
                  <Variable className="h-4 w-4" />
                  Variables
                </div>
                <p className="text-xs text-muted-foreground">
                  Click to insert into the body at cursor position.
                </p>
                <div className="space-y-1">
                  {currentVars.map((v) => (
                    <button
                      key={v.key}
                      type="button"
                      onClick={() => insertVariable(v.key)}
                      className="w-full text-left rounded-md border px-2.5 py-1.5 text-xs hover:bg-accent transition-colors"
                    >
                      <span className="font-mono text-primary">{`{{${v.key}}}`}</span>
                      <br />
                      <span className="text-muted-foreground">{v.description}</span>
                    </button>
                  ))}
                </div>
              </div>
            </div>

            <DialogFooter className="mt-4">
              <Button type="button" variant="outline" onClick={() => setEditorOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={isSubmitting}>
                {isSubmitting && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                {editingId ? "Update" : "Create"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* ── Preview Dialog ────────────────────────────────────────────────── */}
      <Dialog open={previewOpen} onOpenChange={setPreviewOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Template Preview</DialogTitle>
            <DialogDescription>
              Rendered with sample data
            </DialogDescription>
          </DialogHeader>
          {previewLoading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : previewData ? (
            <div className="space-y-4">
              <div className="flex items-center gap-2">
                <Badge variant="outline" className="gap-1">
                  {CHANNEL_CONFIG[previewData.channel]?.icon}
                  {CHANNEL_CONFIG[previewData.channel]?.label}
                </Badge>
              </div>
              {previewData.subject && (
                <div>
                  <Label className="text-xs text-muted-foreground">Subject</Label>
                  <p className="font-medium">{previewData.subject}</p>
                </div>
              )}
              <div>
                <Label className="text-xs text-muted-foreground">Body</Label>
                <div className="mt-1 rounded-md border bg-muted/50 p-4 text-sm whitespace-pre-wrap">
                  {previewData.body}
                </div>
              </div>
            </div>
          ) : null}
        </DialogContent>
      </Dialog>
    </div>
  )
}
