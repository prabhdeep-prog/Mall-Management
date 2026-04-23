"use client"

import * as React from "react"
import {
  Check,
  ChevronLeft,
  ChevronRight,
  Building2,
  Users,
  LayoutGrid,
  IndianRupee,
  CalendarDays,
  Wifi,
  WifiOff,
  ClipboardList,
  Loader2,
  CheckCircle,
  Zap,
  ShoppingCart,
  ExternalLink,
} from "lucide-react"
import { Dialog, DialogContent } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
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

interface Tenant {
  id: string
  businessName: string
  contactPerson: string | null
}

interface LeaseForm {
  tenantId: string
  propertyId: string
  unitNumber: string
  floor: string
  zone: string
  areaSqft: string
  leaseType: string
  baseRent: string
  revenueSharePercentage: string
  camCharges: string
  securityDeposit: string
  startDate: string
  endDate: string
  escalationRate: string
  escalationFrequency: string
  lockInPeriod: string
  terminationNoticeDays: string
  fitOutPeriod: string
  rentFreePeriod: string
  posProvider: string
  posStoreId: string
  posApiKey: string
  posSyncFrequency: string
}

interface CreateLeaseDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  properties: Property[]
  selectedPropertyId?: string
  onSuccess: () => void
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function SectionHeader({ title, description }: { title: string; description?: string }) {
  return (
    <div className="mb-4">
      <h3 className="text-sm font-semibold text-foreground">{title}</h3>
      {description && <p className="text-xs text-muted-foreground mt-0.5">{description}</p>}
      <Separator className="mt-3" />
    </div>
  )
}

function ReviewRow({ label, value }: { label: string; value?: string | null }) {
  if (!value) return null
  return (
    <div className="flex justify-between items-start gap-4 py-1.5">
      <span className="text-xs text-muted-foreground min-w-[160px]">{label}</span>
      <span className="text-xs font-medium text-right">{value}</span>
    </div>
  )
}

function ReviewSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="mb-4">
      <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">{title}</p>
      <div className="bg-muted/40 rounded-lg px-3 py-1 border border-border/50">
        {children}
      </div>
    </div>
  )
}

const LEASE_TYPE_LABELS: Record<string, string> = {
  fixed_rent: "Fixed Rent",
  revenue_share: "Revenue Share",
  hybrid: "Hybrid",
  minimum_guarantee: "Minimum Guarantee",
}

const ESCALATION_LABELS: Record<string, string> = {
  "12": "Annually (12 months)",
  "24": "Bi-annually (24 months)",
  "36": "Every 3 years (36 months)",
}

const SYNC_LABELS: Record<string, string> = {
  real_time: "Real-time",
  hourly: "Hourly",
  daily: "Daily",
}

const FLOOR_LABELS: Record<string, string> = {
  basement: "Basement",
  ground: "Ground Floor",
  "1": "1st Floor",
  "2": "2nd Floor",
  "3": "3rd Floor",
  "4": "4th Floor",
  "5": "5th Floor",
  "6": "6th Floor",
}

const INITIAL_FORM: LeaseForm = {
  tenantId: "",
  propertyId: "",
  unitNumber: "",
  floor: "",
  zone: "",
  areaSqft: "",
  leaseType: "fixed_rent",
  baseRent: "",
  revenueSharePercentage: "",
  camCharges: "",
  securityDeposit: "",
  startDate: "",
  endDate: "",
  escalationRate: "",
  escalationFrequency: "12",
  lockInPeriod: "",
  terminationNoticeDays: "90",
  fitOutPeriod: "",
  rentFreePeriod: "",
  posProvider: "",
  posStoreId: "",
  posApiKey: "",
  posSyncFrequency: "daily",
}

// ── Main Component ────────────────────────────────────────────────────────────

export function CreateLeaseDialog({
  open,
  onOpenChange,
  properties,
  selectedPropertyId,
  onSuccess,
}: CreateLeaseDialogProps) {
  const { toast } = useToast()
  const [form, setForm] = React.useState<LeaseForm>({ ...INITIAL_FORM, propertyId: selectedPropertyId || "" })
  const [currentStep, setCurrentStep] = React.useState(1)
  const [completedSteps, setCompletedSteps] = React.useState<Set<number>>(new Set())
  const [tenants, setTenants] = React.useState<Tenant[]>([])
  const [isLoadingTenants, setIsLoadingTenants] = React.useState(false)
  const [isSubmitting, setIsSubmitting] = React.useState(false)
  const [posTestStatus, setPosTestStatus] = React.useState<"idle" | "testing" | "success" | "error">("idle")
  const [posTestMessage, setPosTestMessage] = React.useState("")

  const isRevShare = form.leaseType === "revenue_share" || form.leaseType === "hybrid" || form.leaseType === "minimum_guarantee"

  // Steps — POS step only appears for rev-share lease types
  const STEPS = React.useMemo(() => {
    const base = [
      { id: 1, label: "Property & Tenant", icon: Users, title: "Property & Tenant", description: "Select the property, tenant, and lease type" },
      { id: 2, label: "Unit Details", icon: LayoutGrid, title: "Unit Details", description: "Physical location — unit number, floor, zone and area" },
      { id: 3, label: "Financial Terms", icon: IndianRupee, title: "Financial Terms", description: "Rent, deposits, CAM charges and escalation schedule" },
      { id: 4, label: "Lease Terms", icon: CalendarDays, title: "Lease Terms", description: "Duration, lock-in, notice period and special conditions" },
    ]
    if (isRevShare) {
      base.push({ id: 5, label: "POS Integration", icon: Wifi, title: "POS Integration", description: "Connect POS system to auto-calculate revenue share" })
    }
    base.push({ id: isRevShare ? 6 : 5, label: "Review", icon: ClipboardList, title: "Review & Submit", description: "Confirm all details before creating the lease" })
    return base
  }, [isRevShare])

  const totalSteps = STEPS.length
  const isLastStep = currentStep === totalSteps
  const currentStepDef = STEPS[currentStep - 1]

  // Fetch tenants when property changes
  const fetchTenants = React.useCallback(async (propertyId: string) => {
    if (!propertyId) { setTenants([]); return }
    setIsLoadingTenants(true)
    try {
      const res = await fetch(`/api/tenants?propertyId=${propertyId}`)
      if (res.ok) {
        const data = await res.json()
        setTenants(data.data || data || [])
      }
    } catch { setTenants([]) }
    finally { setIsLoadingTenants(false) }
  }, [])

  // Sync selected property on open
  React.useEffect(() => {
    if (open) {
      const propId = selectedPropertyId || ""
      setForm(f => ({ ...f, propertyId: propId }))
      if (propId) fetchTenants(propId)
    }
  }, [open, selectedPropertyId, fetchTenants])

  const set = (key: keyof LeaseForm, value: string) =>
    setForm(f => ({ ...f, [key]: value }))

  const handleClose = () => {
    onOpenChange(false)
    setTimeout(() => {
      setForm({ ...INITIAL_FORM, propertyId: selectedPropertyId || "" })
      setCurrentStep(1)
      setCompletedSteps(new Set())
      setTenants([])
      setPosTestStatus("idle")
      setPosTestMessage("")
    }, 200)
  }

  // Per-step validation — returns error message or null
  const validateStep = (step: number): string | null => {
    switch (step) {
      case 1:
        if (!form.propertyId) return "Please select a property"
        if (!form.tenantId) return "Please select a tenant"
        return null
      case 2:
        if (!form.unitNumber.trim()) return "Unit number is required"
        if (!form.areaSqft || parseFloat(form.areaSqft) <= 0) return "Area must be a positive number"
        return null
      case 3:
        if (!form.baseRent && form.leaseType === "fixed_rent") return "Base rent is required for Fixed Rent leases"
        return null
      case 4:
        if (!form.startDate) return "Start date is required"
        if (!form.endDate) return "End date is required"
        if (form.startDate && form.endDate && form.endDate <= form.startDate) return "End date must be after start date"
        return null
      default:
        return null
    }
  }

  const handleNext = () => {
    const error = validateStep(currentStep)
    if (error) {
      toast({ title: "Incomplete", description: error, variant: "destructive" })
      return
    }
    setCompletedSteps(prev => new Set([...prev, currentStep]))
    setCurrentStep(s => s + 1)
  }

  const handleBack = () => setCurrentStep(s => Math.max(1, s - 1))

  const handleTestPOSConnection = async () => {
    if (!form.posProvider || !form.posStoreId || !form.posApiKey) {
      setPosTestStatus("error")
      setPosTestMessage("Please fill in provider, store ID, and API key")
      return
    }
    setPosTestStatus("testing")
    setPosTestMessage("")
    try {
      const res = await fetch("/api/pos/test-connection", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ provider: form.posProvider, storeId: form.posStoreId, apiKey: form.posApiKey }),
      })
      const result = await res.json()
      if (result.success) {
        setPosTestStatus("success")
        setPosTestMessage(result.data?.message || "Connection successful!")
      } else {
        setPosTestStatus("error")
        setPosTestMessage(result.error || "Connection failed")
      }
    } catch {
      setPosTestStatus("error")
      setPosTestMessage("Failed to test connection")
    }
  }

  const handleSubmit = async () => {
    // Final validation pass
    for (let s = 1; s < totalSteps; s++) {
      const err = validateStep(s)
      if (err) {
        setCurrentStep(s)
        toast({ title: "Incomplete", description: err, variant: "destructive" })
        return
      }
    }

    setIsSubmitting(true)
    try {
      const response = await fetch("/api/leases", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...form,
          areaSqft: parseFloat(form.areaSqft),
          baseRent: form.baseRent ? parseFloat(form.baseRent) : null,
          revenueSharePercentage: form.revenueSharePercentage ? parseFloat(form.revenueSharePercentage) : null,
          camCharges: form.camCharges ? parseFloat(form.camCharges) : null,
          securityDeposit: form.securityDeposit ? parseFloat(form.securityDeposit) : null,
          escalationRate: form.escalationRate ? parseFloat(form.escalationRate) : null,
          escalationFrequency: form.escalationFrequency ? parseInt(form.escalationFrequency) : null,
          lockInPeriod: form.lockInPeriod ? parseInt(form.lockInPeriod) : null,
          terminationNoticeDays: form.terminationNoticeDays ? parseInt(form.terminationNoticeDays) : null,
          fitOutPeriod: form.fitOutPeriod ? parseInt(form.fitOutPeriod) : null,
          rentFreePeriod: form.rentFreePeriod ? parseInt(form.rentFreePeriod) : null,
        }),
      })

      if (!response.ok) {
        const err = await response.json()
        throw new Error(err.error || "Failed to create lease")
      }

      toast({ title: "Lease Created", description: `Lease for unit ${form.unitNumber} has been created successfully.` })
      handleClose()
      onSuccess()
    } catch (error) {
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "Failed to create lease",
        variant: "destructive",
      })
    } finally {
      setIsSubmitting(false)
    }
  }

  const selectedTenant = tenants.find(t => t.id === form.tenantId)
  const selectedProp = properties.find(p => p.id === form.propertyId)

  // ── Render ──────────────────────────────────────────────────────────────────

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-3xl p-0 gap-0 overflow-hidden max-h-[92vh] flex flex-col">

        {/* Header */}
        <div className="px-6 pt-6 pb-4 border-b bg-muted/30 shrink-0">
          <div className="flex items-start justify-between mb-5">
            <div>
              <h2 className="text-lg font-semibold">Create Lease Agreement</h2>
              <p className="text-sm text-muted-foreground mt-0.5">
                Step {currentStep} of {totalSteps} — {currentStepDef?.title}
              </p>
            </div>
            <Badge variant="outline" className="text-xs">
              {Math.round(((currentStep - 1) / (totalSteps - 1)) * 100)}% complete
            </Badge>
          </div>

          {/* Stepper */}
          <div className="flex items-center">
            {STEPS.map((step, idx) => {
              const Icon = step.icon
              const isActive = currentStep === step.id
              const isDone = completedSteps.has(step.id)
              const isLast = idx === STEPS.length - 1

              return (
                <React.Fragment key={step.id}>
                  <button
                    type="button"
                    onClick={() => isDone && setCurrentStep(step.id)}
                    className={cn("flex flex-col items-center gap-1 focus:outline-none", isDone ? "cursor-pointer" : "cursor-default")}
                  >
                    <div className={cn(
                      "w-8 h-8 rounded-full flex items-center justify-center text-xs font-semibold border-2 transition-all",
                      isActive && "border-emerald-600 bg-emerald-600 text-white",
                      isDone && !isActive && "border-emerald-600 bg-emerald-50 text-emerald-600",
                      !isActive && !isDone && "border-muted-foreground/30 bg-background text-muted-foreground"
                    )}>
                      {isDone && !isActive ? <Check className="h-3.5 w-3.5" /> : <Icon className="h-3.5 w-3.5" />}
                    </div>
                    <span className={cn(
                      "text-[10px] font-medium whitespace-nowrap hidden sm:block",
                      isActive && "text-emerald-700",
                      isDone && !isActive && "text-emerald-600/70",
                      !isActive && !isDone && "text-muted-foreground"
                    )}>
                      {step.label}
                    </span>
                  </button>
                  {!isLast && (
                    <div className={cn(
                      "flex-1 h-0.5 mt-[-10px] mb-5 mx-1 rounded transition-all",
                      completedSteps.has(step.id) ? "bg-emerald-500/60" : "bg-muted-foreground/20"
                    )} />
                  )}
                </React.Fragment>
              )
            })}
          </div>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-6 py-5">

          {/* ── Step 1: Property & Tenant ── */}
          {currentStep === 1 && (
            <div className="space-y-5">
              <SectionHeader title="Property & Tenant Selection" description="Choose the property and the tenant for this lease agreement" />
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <label className="text-sm font-medium">Property <span className="text-destructive">*</span></label>
                  <Select
                    value={form.propertyId}
                    onValueChange={(v) => { set("propertyId", v); set("tenantId", ""); fetchTenants(v) }}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select mall property" />
                    </SelectTrigger>
                    <SelectContent>
                      {properties.map(p => (
                        <SelectItem key={p.id} value={p.id}>{p.name} — {p.city}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium">Tenant <span className="text-destructive">*</span></label>
                  <Select
                    value={form.tenantId}
                    onValueChange={v => set("tenantId", v)}
                    disabled={!form.propertyId || isLoadingTenants}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder={
                        !form.propertyId ? "Select property first" :
                        isLoadingTenants ? "Loading tenants…" :
                        tenants.length === 0 ? "No tenants found" :
                        "Select tenant"
                      } />
                    </SelectTrigger>
                    <SelectContent>
                      {tenants.map(t => (
                        <SelectItem key={t.id} value={t.id}>
                          <div>
                            <span>{t.businessName}</span>
                            {t.contactPerson && <span className="text-muted-foreground ml-2 text-xs">({t.contactPerson})</span>}
                          </div>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <SectionHeader title="Lease Type" description="Select how rent will be calculated for this lease" />
              <div className="grid grid-cols-2 gap-3">
                {[
                  { value: "fixed_rent", label: "Fixed Rent", desc: "Fixed monthly rent, optionally with annual escalation" },
                  { value: "revenue_share", label: "Revenue Share", desc: "Rent based on a percentage of tenant's monthly sales" },
                  { value: "hybrid", label: "Hybrid", desc: "Base rent plus revenue share above a minimum threshold" },
                  { value: "minimum_guarantee", label: "Minimum Guarantee", desc: "Higher of minimum guarantee or revenue share" },
                ].map(opt => (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => set("leaseType", opt.value)}
                    className={cn(
                      "text-left rounded-lg border p-3 transition-all",
                      form.leaseType === opt.value
                        ? "border-emerald-500 bg-emerald-50/60 ring-1 ring-emerald-500"
                        : "border-border hover:border-emerald-300 hover:bg-muted/30"
                    )}
                  >
                    <div className="flex items-center justify-between">
                      <p className="text-sm font-medium">{opt.label}</p>
                      {form.leaseType === opt.value && <Check className="h-4 w-4 text-emerald-600" />}
                    </div>
                    <p className="text-xs text-muted-foreground mt-1">{opt.desc}</p>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* ── Step 2: Unit Details ── */}
          {currentStep === 2 && (
            <div className="space-y-5">
              <SectionHeader title="Unit Location" description="Physical details of the leased unit within the mall" />
              <div className="grid grid-cols-3 gap-4">
                <div className="space-y-2">
                  <label className="text-sm font-medium">Unit Number <span className="text-destructive">*</span></label>
                  <Input value={form.unitNumber} onChange={e => set("unitNumber", e.target.value)} placeholder="e.g., G-12, UF-104" />
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium">Floor</label>
                  <Select value={form.floor} onValueChange={v => set("floor", v)}>
                    <SelectTrigger><SelectValue placeholder="Select floor" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="basement">Basement</SelectItem>
                      <SelectItem value="ground">Ground Floor</SelectItem>
                      <SelectItem value="1">1st Floor</SelectItem>
                      <SelectItem value="2">2nd Floor</SelectItem>
                      <SelectItem value="3">3rd Floor</SelectItem>
                      <SelectItem value="4">4th Floor</SelectItem>
                      <SelectItem value="5">5th Floor</SelectItem>
                      <SelectItem value="6">6th Floor</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium">Zone / Wing</label>
                  <Input value={form.zone} onChange={e => set("zone", e.target.value)} placeholder="e.g., A, North Wing" />
                </div>
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">Area (sq.ft) <span className="text-destructive">*</span></label>
                <Input
                  type="number"
                  min="1"
                  value={form.areaSqft}
                  onChange={e => set("areaSqft", e.target.value)}
                  placeholder="e.g., 1500"
                  className="max-w-[200px]"
                />
              </div>
            </div>
          )}

          {/* ── Step 3: Financial Terms ── */}
          {currentStep === 3 && (
            <div className="space-y-5">
              <SectionHeader title="Rent & Charges" description="Monthly rent obligations and deposits" />
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <label className="text-sm font-medium">
                    Base Rent (₹/month)
                    {form.leaseType === "fixed_rent" && <span className="text-destructive"> *</span>}
                  </label>
                  <Input type="number" min="0" value={form.baseRent} onChange={e => set("baseRent", e.target.value)} placeholder="e.g., 50000" />
                </div>
                {isRevShare && (
                  <div className="space-y-2">
                    <label className="text-sm font-medium">Revenue Share (%)</label>
                    <Input type="number" min="0" max="100" step="0.1" value={form.revenueSharePercentage} onChange={e => set("revenueSharePercentage", e.target.value)} placeholder="e.g., 8.5" />
                  </div>
                )}
                <div className="space-y-2">
                  <label className="text-sm font-medium">CAM Charges (₹/month)</label>
                  <Input type="number" min="0" value={form.camCharges} onChange={e => set("camCharges", e.target.value)} placeholder="e.g., 5000" />
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium">Security Deposit (₹)</label>
                  <Input type="number" min="0" value={form.securityDeposit} onChange={e => set("securityDeposit", e.target.value)} placeholder="e.g., 150000" />
                </div>
              </div>

              <SectionHeader title="Rent Escalation" description="Annual or periodic increase in base rent" />
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <label className="text-sm font-medium">Escalation Rate (%)</label>
                  <Input type="number" min="0" max="100" step="0.1" value={form.escalationRate} onChange={e => set("escalationRate", e.target.value)} placeholder="e.g., 10" />
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium">Escalation Frequency</label>
                  <Select value={form.escalationFrequency} onValueChange={v => set("escalationFrequency", v)}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="12">Annually (12 months)</SelectItem>
                      <SelectItem value="24">Bi-annually (24 months)</SelectItem>
                      <SelectItem value="36">Every 3 years (36 months)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </div>
          )}

          {/* ── Step 4: Lease Terms ── */}
          {currentStep === 4 && (
            <div className="space-y-5">
              <SectionHeader title="Lease Duration" description="Start and end dates for the lease agreement" />
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <label className="text-sm font-medium">Start Date <span className="text-destructive">*</span></label>
                  <Input type="date" value={form.startDate} onChange={e => set("startDate", e.target.value)} />
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium">End Date <span className="text-destructive">*</span></label>
                  <Input type="date" value={form.endDate} onChange={e => set("endDate", e.target.value)} min={form.startDate} />
                </div>
              </div>

              <SectionHeader title="Contractual Conditions" description="Lock-in, notice and special periods" />
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <label className="text-sm font-medium">Lock-in Period (months)</label>
                  <Input type="number" min="0" value={form.lockInPeriod} onChange={e => set("lockInPeriod", e.target.value)} placeholder="e.g., 12" />
                  <p className="text-xs text-muted-foreground">Period during which neither party can terminate</p>
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium">Termination Notice (days)</label>
                  <Input type="number" min="0" value={form.terminationNoticeDays} onChange={e => set("terminationNoticeDays", e.target.value)} placeholder="e.g., 90" />
                  <p className="text-xs text-muted-foreground">Advance notice required to terminate after lock-in</p>
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium">Fit-out Period (days)</label>
                  <Input type="number" min="0" value={form.fitOutPeriod} onChange={e => set("fitOutPeriod", e.target.value)} placeholder="e.g., 30" />
                  <p className="text-xs text-muted-foreground">Days for tenant to set up the store before rent begins</p>
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium">Rent-Free Period (days)</label>
                  <Input type="number" min="0" value={form.rentFreePeriod} onChange={e => set("rentFreePeriod", e.target.value)} placeholder="e.g., 0" />
                  <p className="text-xs text-muted-foreground">Additional days with no rent obligation</p>
                </div>
              </div>
            </div>
          )}

          {/* ── Step 5 (rev-share only): POS Integration ── */}
          {currentStep === 5 && isRevShare && (
            <div className="space-y-5">
              <div className="rounded-lg border border-emerald-200 bg-emerald-50/50 px-4 py-3">
                <div className="flex items-center gap-2 text-sm text-emerald-700">
                  <Zap className="h-4 w-4" />
                  <span className="font-medium">Connect POS to auto-calculate revenue share from actual sales</span>
                </div>
                <p className="text-xs text-emerald-600 mt-1 ml-6">
                  Once connected, daily sales data is pulled automatically and revenue share invoices are generated from real POS transactions.
                </p>
              </div>

              {/* Dev / Demo Sample */}
              <div className="rounded-lg border border-dashed border-amber-300 bg-amber-50 p-3">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="flex items-center gap-1.5 text-sm font-semibold text-amber-800">
                      <Zap className="h-3.5 w-3.5" /> Dev / Demo Mode
                    </div>
                    <p className="text-xs text-amber-700 mt-0.5">
                      Auto-fills sample credentials linked to the local POS Simulator. After creating the lease, open the Simulator to push test sales for this tenant.
                    </p>
                  </div>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    className="flex-shrink-0 gap-1.5 border-amber-400 text-amber-800 hover:bg-amber-100 text-xs"
                    onClick={() => {
                      set("posProvider", "square")
                      set("posStoreId", `sq_dev-${(form.tenantId || "demo").slice(0, 8)}`)
                      set("posApiKey", "dev-simulator-key")
                      set("posSyncFrequency", "real_time")
                      setPosTestStatus("idle")
                      setPosTestMessage("")
                    }}
                  >
                    <ShoppingCart className="h-3.5 w-3.5" /> Use Dev Sample
                  </Button>
                </div>
                <div className="mt-2 flex items-center gap-1.5 text-xs text-amber-700">
                  <ExternalLink className="h-3 w-3" />
                  After saving, test at{" "}
                  <a
                    href="/pos-simulator"
                    target="_blank"
                    rel="noreferrer"
                    className="underline font-medium hover:text-amber-900"
                  >
                    localhost:3000/pos-simulator
                  </a>
                </div>
              </div>

              <SectionHeader title="POS System" description="Select your Point-of-Sale provider and enter credentials" />
              <div className="space-y-2">
                <label className="text-sm font-medium">POS Provider</label>
                <Select value={form.posProvider} onValueChange={v => { set("posProvider", v); setPosTestStatus("idle") }}>
                  <SelectTrigger><SelectValue placeholder="Select POS system" /></SelectTrigger>
                  <SelectContent>
                    <div className="px-2 py-1.5 text-xs font-semibold text-muted-foreground">Indian Providers</div>
                    <SelectItem value="pine_labs">🌲 Pine Labs</SelectItem>
                    <SelectItem value="razorpay_pos">⚡ Razorpay POS</SelectItem>
                    <SelectItem value="petpooja">🍽️ Petpooja</SelectItem>
                    <SelectItem value="posist">🏪 POSist</SelectItem>
                    <div className="px-2 py-1.5 text-xs font-semibold text-muted-foreground mt-1">Global Providers</div>
                    <SelectItem value="shopify">🛍️ Shopify POS</SelectItem>
                    <SelectItem value="square">🟦 Square</SelectItem>
                    <SelectItem value="lightspeed">💡 Lightspeed</SelectItem>
                    <SelectItem value="vend">🏷️ Vend</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <label className="text-sm font-medium">Store ID / Location ID</label>
                  <Input
                    value={form.posStoreId}
                    onChange={e => { set("posStoreId", e.target.value); setPosTestStatus("idle") }}
                    placeholder="e.g., store-123 or LOC-456"
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium">API Key / Access Token</label>
                  <Input
                    type="password"
                    value={form.posApiKey}
                    onChange={e => { set("posApiKey", e.target.value); setPosTestStatus("idle") }}
                    placeholder="Enter API key"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <label className="text-sm font-medium">Sync Frequency</label>
                  <Select value={form.posSyncFrequency} onValueChange={v => set("posSyncFrequency", v)}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="real_time">Real-time</SelectItem>
                      <SelectItem value="hourly">Hourly</SelectItem>
                      <SelectItem value="daily">Daily</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2 flex flex-col justify-end">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={handleTestPOSConnection}
                    disabled={posTestStatus === "testing" || !form.posProvider || !form.posStoreId || !form.posApiKey}
                    className="gap-2 w-full"
                  >
                    {posTestStatus === "testing" ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : posTestStatus === "success" ? (
                      <CheckCircle className="h-4 w-4 text-emerald-500" />
                    ) : posTestStatus === "error" ? (
                      <WifiOff className="h-4 w-4 text-red-500" />
                    ) : (
                      <Wifi className="h-4 w-4" />
                    )}
                    {posTestStatus === "testing" ? "Testing…" : "Test Connection"}
                  </Button>
                  {posTestMessage && (
                    <p className={cn("text-xs", posTestStatus === "success" ? "text-emerald-600" : "text-red-600")}>
                      {posTestMessage}
                    </p>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* ── Review Step ── */}
          {isLastStep && (
            <div className="space-y-4">
              <div className="rounded-lg border border-emerald-200/60 bg-emerald-50/50 px-4 py-3 mb-2">
                <p className="text-sm font-medium text-emerald-700">Ready to create lease</p>
                <p className="text-xs text-muted-foreground mt-0.5">Review all details below. Click a completed step to go back and edit.</p>
              </div>

              <ReviewSection title="Property & Tenant">
                <ReviewRow label="Property" value={selectedProp?.name} />
                <ReviewRow label="Tenant" value={selectedTenant?.businessName} />
                <ReviewRow label="Contact Person" value={selectedTenant?.contactPerson} />
                <ReviewRow label="Lease Type" value={LEASE_TYPE_LABELS[form.leaseType]} />
              </ReviewSection>

              <ReviewSection title="Unit Details">
                <ReviewRow label="Unit Number" value={form.unitNumber} />
                <ReviewRow label="Floor" value={FLOOR_LABELS[form.floor] || form.floor} />
                <ReviewRow label="Zone / Wing" value={form.zone} />
                <ReviewRow label="Area" value={form.areaSqft ? `${parseFloat(form.areaSqft).toLocaleString()} sq.ft` : undefined} />
              </ReviewSection>

              <ReviewSection title="Financial Terms">
                <ReviewRow label="Base Rent" value={form.baseRent ? `₹${parseFloat(form.baseRent).toLocaleString()}/month` : undefined} />
                <ReviewRow label="Revenue Share" value={form.revenueSharePercentage ? `${form.revenueSharePercentage}%` : undefined} />
                <ReviewRow label="CAM Charges" value={form.camCharges ? `₹${parseFloat(form.camCharges).toLocaleString()}/month` : undefined} />
                <ReviewRow label="Security Deposit" value={form.securityDeposit ? `₹${parseFloat(form.securityDeposit).toLocaleString()}` : undefined} />
                <ReviewRow label="Escalation" value={form.escalationRate ? `${form.escalationRate}% — ${ESCALATION_LABELS[form.escalationFrequency] || form.escalationFrequency}` : undefined} />
              </ReviewSection>

              <ReviewSection title="Lease Terms">
                <ReviewRow label="Start Date" value={form.startDate} />
                <ReviewRow label="End Date" value={form.endDate} />
                <ReviewRow label="Lock-in Period" value={form.lockInPeriod ? `${form.lockInPeriod} months` : undefined} />
                <ReviewRow label="Termination Notice" value={form.terminationNoticeDays ? `${form.terminationNoticeDays} days` : undefined} />
                <ReviewRow label="Fit-out Period" value={form.fitOutPeriod ? `${form.fitOutPeriod} days` : undefined} />
                <ReviewRow label="Rent-Free Period" value={form.rentFreePeriod ? `${form.rentFreePeriod} days` : undefined} />
              </ReviewSection>

              {isRevShare && form.posProvider && (
                <ReviewSection title="POS Integration">
                  <ReviewRow label="Provider" value={form.posProvider} />
                  <ReviewRow label="Store ID" value={form.posStoreId} />
                  <ReviewRow label="Sync Frequency" value={SYNC_LABELS[form.posSyncFrequency]} />
                </ReviewSection>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t bg-background shrink-0 flex items-center justify-between">
          <Button
            type="button"
            variant="outline"
            onClick={currentStep === 1 ? handleClose : handleBack}
            disabled={isSubmitting}
          >
            {currentStep === 1 ? "Cancel" : <><ChevronLeft className="h-4 w-4 mr-1" />Back</>}
          </Button>

          <div className="flex items-center gap-3">
            <span className="text-xs text-muted-foreground">{currentStep} / {totalSteps}</span>
            {isLastStep ? (
              <Button onClick={handleSubmit} disabled={isSubmitting} className="min-w-[150px] bg-emerald-600 hover:bg-emerald-700">
                {isSubmitting ? (
                  <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Creating…</>
                ) : (
                  <><Check className="h-4 w-4 mr-2" />Create Lease</>
                )}
              </Button>
            ) : (
              <Button onClick={handleNext} className="min-w-[120px] bg-emerald-600 hover:bg-emerald-700">
                Continue<ChevronRight className="h-4 w-4 ml-1" />
              </Button>
            )}
          </div>
        </div>

      </DialogContent>
    </Dialog>
  )
}
