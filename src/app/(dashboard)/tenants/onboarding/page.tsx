"use client"

import * as React from "react"
import { useRouter } from "next/navigation"
import {
  CheckCircle2,
  Circle,
  Clock,
  AlertCircle,
  XCircle,
  ChevronRight,
  Plus,
  Search,
  ArrowLeft,
  Building2,
  FileText,
  Shield,
  Wrench,
  Rocket,
  User,
  Mail,
  Phone,
  MapPin,
  Calendar,
  Upload,
  RefreshCw,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Badge } from "@/components/ui/badge"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Textarea } from "@/components/ui/textarea"
import { Separator } from "@/components/ui/separator"
import { Progress } from "@/components/ui/progress"
import { cn } from "@/lib/utils"

// ─── Types ────────────────────────────────────────────────────────────────────

type OnboardingStatus =
  | "LEAD_CREATED"
  | "DOCUMENTS_PENDING"
  | "LEASE_PENDING"
  | "APPROVAL_PENDING"
  | "SETUP_PENDING"
  | "GO_LIVE_READY"
  | "ACTIVE"

interface ChecklistItem {
  id: string
  item: string
  label: string
  required: boolean
  completed: boolean
  completedAt?: string | null
}

interface Approval {
  id: string
  approverRole: string
  status: "pending" | "approved" | "rejected"
  approvedAt?: string | null
  comments?: string | null
}

interface OnboardingTenant {
  id: string
  businessName: string
  brandName?: string | null
  contactPerson?: string | null
  email?: string | null
  phone?: string | null
  onboardingStatus: OnboardingStatus
  targetOpeningDate?: string | null
  onboardingStartedAt?: string | null
  checklist: ChecklistItem[]
  approvals: Approval[]
  stageIndex: number
  goLiveFlags?: {
    documentsComplete: boolean
    leaseSigned: boolean
    approvalsComplete: boolean
    billingConfigured: boolean
    posConnected: boolean
    openingDateSet: boolean
  }
}

// ─── Constants ────────────────────────────────────────────────────────────────

const STAGES: { key: OnboardingStatus; label: string; icon: React.ElementType }[] = [
  { key: "LEAD_CREATED",       label: "Lead Created",       icon: User },
  { key: "DOCUMENTS_PENDING",  label: "Documents",          icon: FileText },
  { key: "LEASE_PENDING",      label: "Lease",              icon: Building2 },
  { key: "APPROVAL_PENDING",   label: "Approvals",          icon: Shield },
  { key: "SETUP_PENDING",      label: "Setup",              icon: Wrench },
  { key: "GO_LIVE_READY",      label: "Go Live",            icon: Rocket },
  { key: "ACTIVE",             label: "Active",             icon: CheckCircle2 },
]

const STATUS_COLORS: Record<OnboardingStatus, string> = {
  LEAD_CREATED:      "bg-gray-100 text-gray-700",
  DOCUMENTS_PENDING: "bg-yellow-100 text-yellow-700",
  LEASE_PENDING:     "bg-blue-100 text-blue-700",
  APPROVAL_PENDING:  "bg-purple-100 text-purple-700",
  SETUP_PENDING:     "bg-orange-100 text-orange-700",
  GO_LIVE_READY:     "bg-emerald-100 text-emerald-700",
  ACTIVE:            "bg-green-100 text-green-700",
}

const APPROVAL_ROLE_LABELS: Record<string, string> = {
  leasing_manager:    "Leasing Manager",
  finance_manager:    "Finance Manager",
  operations_manager: "Operations Manager",
}

// ─── Progress Bar ─────────────────────────────────────────────────────────────

function OnboardingProgressBar({ stageIndex }: { stageIndex: number }) {
  const pct = Math.round((stageIndex / (STAGES.length - 1)) * 100)
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between text-sm text-muted-foreground">
        <span>Onboarding Progress</span>
        <span className="font-medium text-foreground">{pct}%</span>
      </div>
      <Progress value={pct} className="h-2" />
      <div className="grid grid-cols-7 gap-1">
        {STAGES.map((stage, idx) => {
          const done    = idx < stageIndex
          const current = idx === stageIndex
          const Icon    = stage.icon
          return (
            <div key={stage.key} className="flex flex-col items-center gap-1">
              <div
                className={cn(
                  "flex h-8 w-8 items-center justify-center rounded-full border-2 transition-colors",
                  done    && "border-primary bg-primary text-white",
                  current && "border-primary bg-primary/10 text-primary",
                  !done && !current && "border-muted-foreground/30 bg-muted text-muted-foreground"
                )}
              >
                {done ? <CheckCircle2 className="h-4 w-4" /> : <Icon className="h-4 w-4" />}
              </div>
              <span className={cn(
                "text-[10px] text-center leading-tight",
                current ? "font-semibold text-primary" : "text-muted-foreground"
              )}>
                {stage.label}
              </span>
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ─── Checklist Panel ──────────────────────────────────────────────────────────

function ChecklistPanel({
  checklist,
  tenantId,
  onRefresh,
}: {
  checklist: ChecklistItem[]
  tenantId: string
  onRefresh: () => void
}) {
  const [loading, setLoading] = React.useState<string | null>(null)

  async function toggleItem(itemId: string, current: boolean) {
    setLoading(itemId)
    try {
      await fetch(`/api/tenants/onboarding/${tenantId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ checklistItem: { id: itemId, completed: !current } }),
      })
      onRefresh()
    } finally {
      setLoading(null)
    }
  }

  const required  = checklist.filter((c) => c.required)
  const optional  = checklist.filter((c) => !c.required)
  const doneCount = required.filter((c) => c.completed).length
  const pct       = required.length ? Math.round((doneCount / required.length) * 100) : 0

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base">Onboarding Checklist</CardTitle>
          <span className="text-sm text-muted-foreground">{doneCount}/{required.length} required</span>
        </div>
        <Progress value={pct} className="h-1.5" />
      </CardHeader>
      <CardContent className="space-y-1">
        {required.map((item) => (
          <button
            key={item.id}
            onClick={() => toggleItem(item.id, item.completed)}
            disabled={loading === item.id}
            className="flex w-full items-center gap-3 rounded-lg px-2 py-2 text-sm hover:bg-muted transition-colors text-left"
          >
            {item.completed
              ? <CheckCircle2 className="h-4 w-4 text-emerald-500 flex-shrink-0" />
              : <Circle className="h-4 w-4 text-muted-foreground flex-shrink-0" />
            }
            <span className={cn("flex-1", item.completed && "line-through text-muted-foreground")}>
              {item.label}
            </span>
            <Badge variant="outline" className="text-[10px] px-1 py-0">Required</Badge>
          </button>
        ))}
        {optional.length > 0 && (
          <>
            <Separator className="my-2" />
            <p className="px-2 text-xs font-medium text-muted-foreground uppercase tracking-wide mb-1">Optional</p>
            {optional.map((item) => (
              <button
                key={item.id}
                onClick={() => toggleItem(item.id, item.completed)}
                disabled={loading === item.id}
                className="flex w-full items-center gap-3 rounded-lg px-2 py-2 text-sm hover:bg-muted transition-colors text-left"
              >
                {item.completed
                  ? <CheckCircle2 className="h-4 w-4 text-emerald-500 flex-shrink-0" />
                  : <Circle className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                }
                <span className={cn("flex-1", item.completed && "line-through text-muted-foreground")}>
                  {item.label}
                </span>
              </button>
            ))}
          </>
        )}
      </CardContent>
    </Card>
  )
}

// ─── Approval Panel ───────────────────────────────────────────────────────────

function ApprovalPanel({
  approvals,
  tenantId,
  onRefresh,
}: {
  approvals: Approval[]
  tenantId: string
  onRefresh: () => void
}) {
  const [decision, setDecision]   = React.useState<"approved" | "rejected">("approved")
  const [comments, setComments]   = React.useState("")
  const [role, setRole]           = React.useState("leasing_manager")
  const [submitting, setSubmitting] = React.useState(false)
  const [open, setOpen]           = React.useState(false)
  const [error, setError]         = React.useState<string | null>(null)

  async function submitApproval() {
    setSubmitting(true)
    setError(null)
    try {
      const res = await fetch("/api/tenants/onboarding/approve", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tenantId, decision, comments, approverRole: role }),
      })
      const json = await res.json()
      if (!res.ok) { setError(json.error || "Failed"); return }
      setOpen(false)
      setComments("")
      onRefresh()
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base">Approval Gates</CardTitle>
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
              <Button size="sm" variant="outline">Record Decision</Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Record Approval Decision</DialogTitle>
                <DialogDescription>
                  Submit your approval or rejection for this tenant onboarding.
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-4 py-2">
                <div className="space-y-1.5">
                  <Label>Your Role</Label>
                  <Select value={role} onValueChange={setRole}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {Object.entries(APPROVAL_ROLE_LABELS).map(([k, v]) => (
                        <SelectItem key={k} value={k}>{v}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label>Decision</Label>
                  <Select value={decision} onValueChange={(v) => setDecision(v as any)}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="approved">Approve</SelectItem>
                      <SelectItem value="rejected">Reject</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label>Comments (optional)</Label>
                  <Textarea
                    value={comments}
                    onChange={(e) => setComments(e.target.value)}
                    placeholder="Add any notes or reasons..."
                    rows={3}
                  />
                </div>
                {error && <p className="text-sm text-destructive">{error}</p>}
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
                <Button
                  onClick={submitApproval}
                  disabled={submitting}
                  variant={decision === "rejected" ? "destructive" : "default"}
                >
                  {submitting ? "Submitting..." : decision === "approved" ? "Approve" : "Reject"}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>
      </CardHeader>
      <CardContent className="space-y-2">
        {approvals.map((ap) => {
          const label = APPROVAL_ROLE_LABELS[ap.approverRole] ?? ap.approverRole
          return (
            <div key={ap.id} className="flex items-center gap-3 rounded-lg border px-3 py-2.5">
              {ap.status === "approved"  && <CheckCircle2 className="h-4 w-4 text-emerald-500 flex-shrink-0" />}
              {ap.status === "rejected"  && <XCircle      className="h-4 w-4 text-destructive flex-shrink-0" />}
              {ap.status === "pending"   && <Clock        className="h-4 w-4 text-muted-foreground flex-shrink-0" />}
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium">{label}</p>
                {ap.comments && <p className="text-xs text-muted-foreground truncate">{ap.comments}</p>}
              </div>
              <Badge
                variant="outline"
                className={cn(
                  "text-[10px] capitalize",
                  ap.status === "approved" && "border-emerald-300 text-emerald-700",
                  ap.status === "rejected" && "border-red-300 text-red-700",
                )}
              >
                {ap.status}
              </Badge>
            </div>
          )
        })}
        {approvals.length === 0 && (
          <p className="text-sm text-muted-foreground text-center py-4">No approval records yet.</p>
        )}
      </CardContent>
    </Card>
  )
}

// ─── Stage Advance Panel ──────────────────────────────────────────────────────

function StageAdvancePanel({
  tenant,
  onRefresh,
}: {
  tenant: OnboardingTenant
  onRefresh: () => void
}) {
  const [advancing, setAdvancing]   = React.useState(false)
  const [activating, setActivating] = React.useState(false)
  const [error, setError]           = React.useState<string | null>(null)

  const nextStageIdx = tenant.stageIndex + 1
  const nextStage    = STAGES[nextStageIdx]
  const isLastStage  = tenant.onboardingStatus === "GO_LIVE_READY"

  async function advanceStage() {
    setAdvancing(true)
    setError(null)
    try {
      const res = await fetch(`/api/tenants/onboarding/${tenant.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ advanceStage: true }),
      })
      const json = await res.json()
      if (!res.ok) setError(json.error || "Failed to advance stage")
      else onRefresh()
    } finally {
      setAdvancing(false)
    }
  }

  async function activateTenant() {
    setActivating(true)
    setError(null)
    try {
      const res = await fetch("/api/tenants/onboarding/activate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tenantId: tenant.id }),
      })
      const json = await res.json()
      if (!res.ok) {
        const missing = json.missing?.join(", ") || json.pending?.join(", ") || ""
        setError(`${json.error}${missing ? `: ${missing}` : ""}`)
      } else onRefresh()
    } finally {
      setActivating(false)
    }
  }

  if (tenant.onboardingStatus === "ACTIVE") {
    return (
      <Card className="border-emerald-200 bg-emerald-50">
        <CardContent className="flex items-center gap-3 pt-6">
          <CheckCircle2 className="h-8 w-8 text-emerald-500" />
          <div>
            <p className="font-semibold text-emerald-800">Tenant is Active</p>
            <p className="text-sm text-emerald-600">Onboarding complete. Store is live.</p>
          </div>
        </CardContent>
      </Card>
    )
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base">Stage Actions</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {/* Go-live flags */}
        {tenant.goLiveFlags && (
          <div className="space-y-1.5 rounded-lg border p-3 bg-muted/50">
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-2">Activation Gates</p>
            {Object.entries({
              "Documents Complete":   tenant.goLiveFlags.documentsComplete,
              "Lease Signed":         tenant.goLiveFlags.leaseSigned,
              "Approvals Complete":   tenant.goLiveFlags.approvalsComplete,
              "Billing Configured":   tenant.goLiveFlags.billingConfigured,
              "Opening Date Set":     tenant.goLiveFlags.openingDateSet,
            }).map(([label, done]) => (
              <div key={label} className="flex items-center gap-2 text-sm">
                {done
                  ? <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" />
                  : <AlertCircle  className="h-3.5 w-3.5 text-amber-500" />
                }
                <span className={done ? "text-foreground" : "text-muted-foreground"}>{label}</span>
              </div>
            ))}
          </div>
        )}

        {error && (
          <div className="flex items-start gap-2 rounded-lg border border-destructive/50 bg-destructive/10 p-3 text-sm text-destructive">
            <AlertCircle className="h-4 w-4 flex-shrink-0 mt-0.5" />
            <p>{error}</p>
          </div>
        )}

        {isLastStage ? (
          <Button className="w-full" onClick={activateTenant} disabled={activating}>
            <Rocket className="mr-2 h-4 w-4" />
            {activating ? "Activating..." : "Activate Tenant"}
          </Button>
        ) : (
          <Button className="w-full" variant="outline" onClick={advanceStage} disabled={advancing}>
            <ChevronRight className="mr-2 h-4 w-4" />
            {advancing ? "Advancing..." : `Advance to ${nextStage?.label ?? "Next Stage"}`}
          </Button>
        )}
      </CardContent>
    </Card>
  )
}

// ─── New Tenant Form ──────────────────────────────────────────────────────────

function NewTenantDialog({ onCreated }: { onCreated: () => void }) {
  const [open, setOpen] = React.useState(false)
  const [loading, setLoading] = React.useState(false)
  const [errors, setErrors]   = React.useState<Record<string, string>>({})
  const [form, setForm] = React.useState({
    businessName: "",
    brandName: "",
    contactPerson: "",
    email: "",
    phone: "",
    gstNumber: "",
    panNumber: "",
    address: "",
    targetOpeningDate: "",
    unitNumber: "",
  })

  function setField(k: string, v: string) {
    setForm((f) => ({ ...f, [k]: v }))
    setErrors((e) => { const n = { ...e }; delete n[k]; return n })
  }

  async function submit() {
    setLoading(true)
    setErrors({})
    try {
      const res = await fetch("/api/tenants/onboarding/start", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      })
      const json = await res.json()
      if (!res.ok) {
        if (json.errors) setErrors(json.errors)
        else setErrors({ _: json.error || "Failed" })
        return
      }
      setOpen(false)
      setForm({ businessName: "", brandName: "", contactPerson: "", email: "", phone: "", gstNumber: "", panNumber: "", address: "", targetOpeningDate: "", unitNumber: "" })
      onCreated()
    } finally {
      setLoading(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button>
          <Plus className="mr-2 h-4 w-4" />
          New Tenant
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Start Tenant Onboarding</DialogTitle>
          <DialogDescription>Add a new tenant to begin the onboarding workflow.</DialogDescription>
        </DialogHeader>
        <div className="grid grid-cols-2 gap-4 py-2">
          {[
            { key: "businessName",      label: "Business Name *",       placeholder: "Acme Retail Pvt Ltd" },
            { key: "brandName",         label: "Brand Name",            placeholder: "Acme" },
            { key: "contactPerson",     label: "Contact Person",        placeholder: "Raj Kumar" },
            { key: "email",             label: "Email *",               placeholder: "raj@acme.com" },
            { key: "phone",             label: "Phone *",               placeholder: "+91 98765 43210" },
            { key: "gstNumber",         label: "GST Number *",          placeholder: "29ABCDE1234F1Z5" },
            { key: "panNumber",         label: "PAN Number *",          placeholder: "ABCDE1234F" },
            { key: "unitNumber",        label: "Unit Number",           placeholder: "G-12" },
          ].map(({ key, label, placeholder }) => (
            <div key={key} className="space-y-1.5">
              <Label className="text-sm">{label}</Label>
              <Input
                placeholder={placeholder}
                value={(form as any)[key]}
                onChange={(e) => setField(key, e.target.value)}
                className={errors[key] ? "border-destructive" : ""}
              />
              {errors[key] && <p className="text-xs text-destructive">{errors[key]}</p>}
            </div>
          ))}
          <div className="space-y-1.5">
            <Label className="text-sm">Target Opening Date</Label>
            <Input
              type="date"
              value={form.targetOpeningDate}
              onChange={(e) => setField("targetOpeningDate", e.target.value)}
            />
          </div>
          <div className="col-span-2 space-y-1.5">
            <Label className="text-sm">Address</Label>
            <Textarea
              placeholder="Registered business address"
              value={form.address}
              onChange={(e) => setField("address", e.target.value)}
              rows={2}
            />
          </div>
          {errors._ && (
            <div className="col-span-2">
              <p className="text-sm text-destructive">{errors._}</p>
            </div>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
          <Button onClick={submit} disabled={loading}>
            {loading ? "Creating..." : "Start Onboarding"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// ─── Detail Panel ─────────────────────────────────────────────────────────────

function TenantDetail({
  tenantId,
  onBack,
}: {
  tenantId: string
  onBack: () => void
}) {
  const [tenant, setTenant] = React.useState<OnboardingTenant | null>(null)
  const [loading, setLoading] = React.useState(true)

  const load = React.useCallback(async () => {
    setLoading(true)
    try {
      const res  = await fetch(`/api/tenants/onboarding/${tenantId}`)
      const json = await res.json()
      if (json.success) setTenant(json.data)
    } finally {
      setLoading(false)
    }
  }, [tenantId])

  React.useEffect(() => { load() }, [load])

  if (loading) return (
    <div className="flex items-center justify-center h-64 text-muted-foreground">
      <RefreshCw className="h-5 w-5 animate-spin mr-2" />Loading...
    </div>
  )

  if (!tenant) return (
    <div className="flex items-center justify-center h-64 text-muted-foreground">
      Tenant not found.
    </div>
  )

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start gap-4">
        <Button variant="ghost" size="icon" onClick={onBack}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div className="flex-1">
          <div className="flex items-center gap-3">
            <h2 className="text-xl font-bold">{tenant.businessName}</h2>
            {tenant.brandName && tenant.brandName !== tenant.businessName && (
              <span className="text-muted-foreground text-sm">({tenant.brandName})</span>
            )}
            <Badge className={STATUS_COLORS[tenant.onboardingStatus]}>
              {tenant.onboardingStatus.replace(/_/g, " ")}
            </Badge>
          </div>
          <div className="flex items-center gap-4 mt-1 text-sm text-muted-foreground">
            {tenant.contactPerson && <span className="flex items-center gap-1"><User className="h-3 w-3" />{tenant.contactPerson}</span>}
            {tenant.email         && <span className="flex items-center gap-1"><Mail className="h-3 w-3" />{tenant.email}</span>}
            {tenant.phone         && <span className="flex items-center gap-1"><Phone className="h-3 w-3" />{tenant.phone}</span>}
          </div>
        </div>
        <Button variant="ghost" size="icon" onClick={load}>
          <RefreshCw className="h-4 w-4" />
        </Button>
      </div>

      {/* Progress */}
      <Card>
        <CardContent className="pt-6">
          <OnboardingProgressBar stageIndex={tenant.stageIndex} />
          {tenant.targetOpeningDate && (
            <div className="flex items-center gap-2 mt-4 text-sm text-muted-foreground border-t pt-4">
              <Calendar className="h-4 w-4" />
              Target Opening: <strong className="text-foreground">{new Date(tenant.targetOpeningDate).toLocaleDateString("en-IN", { day: "numeric", month: "long", year: "numeric" })}</strong>
            </div>
          )}
        </CardContent>
      </Card>

      {/* 3-column grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="lg:col-span-1">
          <ChecklistPanel
            checklist={tenant.checklist}
            tenantId={tenant.id}
            onRefresh={load}
          />
        </div>
        <div className="lg:col-span-1">
          <ApprovalPanel
            approvals={tenant.approvals}
            tenantId={tenant.id}
            onRefresh={load}
          />
        </div>
        <div className="lg:col-span-1">
          <StageAdvancePanel tenant={tenant} onRefresh={load} />
        </div>
      </div>
    </div>
  )
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function OnboardingPage() {
  const [tenants, setTenants]     = React.useState<OnboardingTenant[]>([])
  const [loading, setLoading]     = React.useState(true)
  const [search, setSearch]       = React.useState("")
  const [statusFilter, setStatus] = React.useState<string>("all")
  const [selected, setSelected]   = React.useState<string | null>(null)

  async function loadTenants() {
    setLoading(true)
    try {
      const res  = await fetch("/api/tenants?onboarding=true&limit=100")
      const json = await res.json()
      // Include tenants that have an onboardingStatus
      const all  = (json.data?.tenants ?? json.tenants ?? json.data ?? []) as any[]
      const withOnboarding = all.filter((t: any) => t.onboardingStatus)
      setTenants(withOnboarding)
    } finally {
      setLoading(false)
    }
  }

  React.useEffect(() => { loadTenants() }, [])

  const filtered = tenants.filter((t) => {
    const matchSearch = !search ||
      t.businessName.toLowerCase().includes(search.toLowerCase()) ||
      t.email?.toLowerCase().includes(search.toLowerCase())
    const matchStatus = statusFilter === "all" || t.onboardingStatus === statusFilter
    return matchSearch && matchStatus
  })

  if (selected) {
    return (
      <div className="p-6 max-w-6xl mx-auto">
        <TenantDetail tenantId={selected} onBack={() => { setSelected(null); loadTenants() }} />
      </div>
    )
  }

  return (
    <div className="p-6 max-w-6xl mx-auto space-y-6">
      {/* Page Header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold">Tenant Onboarding</h1>
          <p className="text-muted-foreground text-sm mt-1">
            Manage the full tenant onboarding lifecycle from lead to activation.
          </p>
        </div>
        <NewTenantDialog onCreated={loadTenants} />
      </div>

      {/* Stage Summary Cards */}
      <div className="grid grid-cols-4 gap-3 sm:grid-cols-7">
        {STAGES.map((stage) => {
          const count = tenants.filter((t) => t.onboardingStatus === stage.key).length
          const Icon  = stage.icon
          return (
            <button
              key={stage.key}
              onClick={() => setStatus(statusFilter === stage.key ? "all" : stage.key)}
              className={cn(
                "flex flex-col items-center gap-1 rounded-xl border p-3 text-center transition-colors hover:bg-muted cursor-pointer",
                statusFilter === stage.key && "border-primary bg-primary/5"
              )}
            >
              <Icon className="h-5 w-5 text-muted-foreground" />
              <span className="text-lg font-bold">{count}</span>
              <span className="text-[10px] text-muted-foreground leading-tight">{stage.label}</span>
            </button>
          )
        })}
      </div>

      {/* Filters */}
      <div className="flex gap-3">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search tenants..."
            className="pl-9"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <Select value={statusFilter} onValueChange={setStatus}>
          <SelectTrigger className="w-44">
            <SelectValue placeholder="All stages" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Stages</SelectItem>
            {STAGES.map((s) => (
              <SelectItem key={s.key} value={s.key}>
                {s.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button variant="ghost" size="icon" onClick={loadTenants}>
          <RefreshCw className={cn("h-4 w-4", loading && "animate-spin")} />
        </Button>
      </div>

      {/* Tenant List */}
      {loading ? (
        <div className="flex items-center justify-center h-40 text-muted-foreground">
          <RefreshCw className="h-5 w-5 animate-spin mr-2" />Loading tenants...
        </div>
      ) : filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center h-40 text-center gap-2">
          <Building2 className="h-10 w-10 text-muted-foreground/40" />
          <p className="text-muted-foreground">No onboarding tenants found.</p>
          <p className="text-sm text-muted-foreground">Use "New Tenant" to start the workflow.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {filtered.map((t) => {
            const requiredItems  = t.checklist?.filter((c) => c.required) ?? []
            const completedItems = requiredItems.filter((c) => c.completed)
            const pct = requiredItems.length ? Math.round((completedItems.length / requiredItems.length) * 100) : 0
            const stageIdx = STAGES.findIndex((s) => s.key === t.onboardingStatus)

            return (
              <button
                key={t.id}
                onClick={() => setSelected(t.id)}
                className="w-full text-left rounded-xl border bg-card hover:bg-muted/50 transition-colors p-4"
              >
                <div className="flex items-center gap-4">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-semibold">{t.businessName}</span>
                      {t.brandName && t.brandName !== t.businessName && (
                        <span className="text-sm text-muted-foreground">({t.brandName})</span>
                      )}
                      <Badge className={cn("text-[10px]", STATUS_COLORS[t.onboardingStatus])}>
                        {t.onboardingStatus.replace(/_/g, " ")}
                      </Badge>
                    </div>
                    <div className="flex items-center gap-3 mt-1 text-sm text-muted-foreground">
                      {t.email && <span>{t.email}</span>}
                      {t.targetOpeningDate && (
                        <span className="flex items-center gap-1">
                          <Calendar className="h-3 w-3" />
                          {new Date(t.targetOpeningDate).toLocaleDateString("en-IN")}
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Mini progress */}
                  <div className="hidden sm:flex flex-col items-end gap-1 min-w-[120px]">
                    <div className="flex gap-0.5">
                      {STAGES.map((_, idx) => (
                        <div
                          key={idx}
                          className={cn(
                            "h-1.5 w-4 rounded-full",
                            idx < stageIdx  && "bg-primary",
                            idx === stageIdx && "bg-primary/50",
                            idx > stageIdx  && "bg-muted"
                          )}
                        />
                      ))}
                    </div>
                    <span className="text-xs text-muted-foreground">
                      Checklist {pct}%
                    </span>
                  </div>

                  <ChevronRight className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                </div>
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}
