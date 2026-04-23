"use client"

import * as React from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  Wrench,
  Plus,
  Clock,
  CheckCircle2,
  AlertCircle,
  UserCheck,
  Loader2,
  Zap,
} from "lucide-react"
import { cn } from "@/lib/utils/index"
import { formatDistanceToNow } from "date-fns"

interface SupportRequest {
  id: string
  workOrderNumber: string
  title: string
  description: string | null
  category: string | null
  priority: string | null
  status: string | null
  location: string | null
  createdAt: string
  completedAt: string | null
}

const STATUS_CONFIG: Record<string, { label: string; icon: typeof Clock; className: string }> = {
  open:        { label: "Open",        icon: AlertCircle,  className: "bg-yellow-100 text-yellow-700" },
  assigned:    { label: "Assigned",    icon: UserCheck,    className: "bg-blue-100 text-blue-700" },
  in_progress: { label: "In Progress", icon: Zap,          className: "bg-indigo-100 text-indigo-700" },
  completed:   { label: "Completed",   icon: CheckCircle2, className: "bg-green-100 text-green-700" },
  cancelled:   { label: "Cancelled",   icon: Clock,        className: "bg-slate-100 text-slate-700" },
}

const PRIORITY_CONFIG: Record<string, string> = {
  low: "bg-slate-100 text-slate-700",
  medium: "bg-amber-100 text-amber-700",
  high: "bg-red-100 text-red-700",
  critical: "bg-red-200 text-red-800",
}

const CATEGORIES = [
  { value: "hvac", label: "HVAC / Air Conditioning" },
  { value: "electrical", label: "Electrical" },
  { value: "plumbing", label: "Plumbing" },
  { value: "general", label: "General Maintenance" },
  { value: "cleaning", label: "Cleaning" },
  { value: "security", label: "Security" },
  { value: "other", label: "Other" },
]

export default function TenantSupportPage() {
  const [requests, setRequests] = React.useState<SupportRequest[]>([])
  const [loading, setLoading] = React.useState(true)
  const [dialogOpen, setDialogOpen] = React.useState(false)
  const [submitting, setSubmitting] = React.useState(false)
  const [form, setForm] = React.useState({
    title: "",
    description: "",
    category: "general",
    priority: "medium",
  })

  const fetchRequests = React.useCallback(async () => {
    try {
      const res = await fetch("/api/tenant/support-requests")
      if (res.ok) {
        const data = await res.json()
        setRequests(data.data ?? [])
      }
    } catch {}
    setLoading(false)
  }, [])

  React.useEffect(() => {
    fetchRequests()
  }, [fetchRequests])

  const handleSubmit = async () => {
    if (!form.title.trim() || !form.category) return
    setSubmitting(true)
    try {
      const res = await fetch("/api/tenant/support-requests", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      })
      if (res.ok) {
        setDialogOpen(false)
        setForm({ title: "", description: "", category: "general", priority: "medium" })
        fetchRequests()
      }
    } catch {}
    setSubmitting(false)
  }

  const openCount = requests.filter((r) => r.status !== "completed" && r.status !== "cancelled").length

  if (loading) {
    return (
      <div className="space-y-4">
        <div className="h-8 w-48 animate-pulse rounded bg-muted" />
        {[1, 2, 3].map((i) => (
          <div key={i} className="h-24 animate-pulse rounded-lg bg-muted" />
        ))}
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Support</h1>
          <p className="text-sm text-muted-foreground mt-1">
            {openCount > 0 ? `${openCount} open request${openCount > 1 ? "s" : ""}` : "No open requests"}
          </p>
        </div>
        <Button onClick={() => setDialogOpen(true)}>
          <Plus className="h-4 w-4 mr-1.5" />
          New Request
        </Button>
      </div>

      {requests.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-16 text-muted-foreground">
            <Wrench className="h-10 w-10 mb-3 opacity-40" />
            <p className="text-sm font-medium">No support requests</p>
            <p className="text-xs mt-1">Submit a request for maintenance or help</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {requests.map((req) => {
            const s = STATUS_CONFIG[req.status ?? "open"] ?? STATUS_CONFIG.open
            const StatusIcon = s.icon
            return (
              <Card key={req.id}>
                <CardContent className="flex items-start gap-4 p-4">
                  <div className={cn("flex h-9 w-9 items-center justify-center rounded-lg flex-shrink-0", s.className)}>
                    <StatusIcon className="h-4 w-4" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="text-sm font-semibold">{req.title}</p>
                      <Badge variant="outline" className={cn("text-[10px]", s.className)}>
                        {s.label}
                      </Badge>
                      {req.priority && (
                        <Badge variant="outline" className={cn("text-[10px]", PRIORITY_CONFIG[req.priority] ?? "")}>
                          {req.priority}
                        </Badge>
                      )}
                    </div>
                    {req.description && (
                      <p className="text-sm text-muted-foreground mt-1 line-clamp-2">{req.description}</p>
                    )}
                    <div className="flex items-center gap-4 mt-2 text-xs text-muted-foreground">
                      <span>{req.workOrderNumber}</span>
                      <span>{req.category}</span>
                      {req.location && <span>{req.location}</span>}
                      <span>{formatDistanceToNow(new Date(req.createdAt), { addSuffix: true })}</span>
                    </div>
                  </div>
                </CardContent>
              </Card>
            )
          })}
        </div>
      )}

      {/* New Request Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>New Support Request</DialogTitle>
            <DialogDescription>
              Submit a maintenance or support request to mall management.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <label className="text-sm font-medium">Title</label>
              <Input
                placeholder="Brief description of the issue..."
                value={form.title}
                onChange={(e) => setForm({ ...form, title: e.target.value })}
              />
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium">Description</label>
              <Textarea
                placeholder="Provide more details about the issue..."
                rows={3}
                value={form.description}
                onChange={(e) => setForm({ ...form, description: e.target.value })}
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <label className="text-sm font-medium">Category</label>
                <Select value={form.category} onValueChange={(v) => setForm({ ...form, category: v })}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {CATEGORIES.map((c) => (
                      <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium">Priority</label>
                <Select value={form.priority} onValueChange={(v) => setForm({ ...form, priority: v })}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="low">Low</SelectItem>
                    <SelectItem value="medium">Medium</SelectItem>
                    <SelectItem value="high">High</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleSubmit} disabled={submitting || !form.title.trim()}>
              {submitting && <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />}
              Submit Request
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
