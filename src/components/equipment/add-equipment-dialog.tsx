"use client"

import * as React from "react"
import {
  Check,
  ChevronLeft,
  ChevronRight,
  Cpu,
  MapPin,
  ClipboardList,
  Loader2,
  Thermometer,
  Activity,
  Zap,
  AlertTriangle,
  Wind,
  Wrench,
  Droplets,
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

interface AddEquipmentDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  properties: Property[]
  selectedPropertyId?: string
  onSuccess: () => void
}

interface EquipmentForm {
  name: string
  type: string
  make: string
  model: string
  serialNumber: string
  propertyId: string
  location: string
  installationDate: string
  warrantyExpiry: string
  maintenanceFrequencyDays: string
}

const EMPTY_FORM: EquipmentForm = {
  name: "", type: "", make: "", model: "", serialNumber: "",
  propertyId: "", location: "", installationDate: "",
  warrantyExpiry: "", maintenanceFrequencyDays: "90",
}

// ── Step definitions ──────────────────────────────────────────────────────────

const STEPS = [
  { id: 1, key: "identity",  label: "Identity",   icon: Cpu,         title: "Equipment Identity",      description: "Name, type and manufacturer details" },
  { id: 2, key: "location",  label: "Location",   icon: MapPin,      title: "Location & Maintenance",  description: "Where it's installed and maintenance schedule" },
  { id: 3, key: "review",    label: "Review",     icon: ClipboardList, title: "Review & Submit",       description: "Confirm all details before adding the equipment" },
]

// ── Equipment type cards ──────────────────────────────────────────────────────

const EQUIPMENT_TYPES = [
  { value: "hvac",       label: "HVAC",        icon: Thermometer },
  { value: "elevator",   label: "Elevator",    icon: Activity },
  { value: "escalator",  label: "Escalator",   icon: Activity },
  { value: "generator",  label: "Generator",   icon: Zap },
  { value: "fire_system",label: "Fire System", icon: AlertTriangle },
  { value: "ventilation",label: "Ventilation", icon: Wind },
  { value: "electrical", label: "Electrical",  icon: Zap },
  { value: "plumbing",   label: "Plumbing",    icon: Droplets },
  { value: "general",    label: "General",     icon: Wrench },
]

const MAINTENANCE_FREQ = [
  { value: "30",  label: "Monthly (30 days)" },
  { value: "45",  label: "Every 45 days" },
  { value: "60",  label: "Every 2 months" },
  { value: "90",  label: "Quarterly (90 days)" },
  { value: "180", label: "Half-yearly (180 days)" },
  { value: "365", label: "Annually (365 days)" },
]

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
      <span className="font-medium text-right max-w-[60%]">{value || "—"}</span>
    </div>
  )
}

// ── Main Component ────────────────────────────────────────────────────────────

export function AddEquipmentDialog({ open, onOpenChange, properties, selectedPropertyId, onSuccess }: AddEquipmentDialogProps) {
  const { toast } = useToast()
  const [step, setStep] = React.useState(1)
  const [form, setForm] = React.useState<EquipmentForm>({ ...EMPTY_FORM, propertyId: selectedPropertyId || "" })
  const [isSubmitting, setIsSubmitting] = React.useState(false)
  const [errors, setErrors] = React.useState<Partial<EquipmentForm>>({})

  // Sync selectedPropertyId into form when dialog opens
  React.useEffect(() => {
    if (open) {
      setForm((prev) => ({ ...prev, propertyId: selectedPropertyId || "" }))
    }
  }, [open, selectedPropertyId])

  const set = (field: keyof EquipmentForm, value: string) =>
    setForm((prev) => ({ ...prev, [field]: value }))

  const validate = (s: number): boolean => {
    const errs: Partial<EquipmentForm> = {}
    if (s === 1) {
      if (!form.name.trim()) errs.name = "Equipment name is required"
      if (!form.type) errs.type = "Please select an equipment type"
    }
    if (s === 2) {
      if (!form.propertyId) errs.propertyId = "Please select a property"
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
    setForm({ ...EMPTY_FORM, propertyId: selectedPropertyId || "" })
    setErrors({})
    onOpenChange(false)
  }

  const handleSubmit = async () => {
    if (!validate(1)) { setStep(1); return }
    if (!validate(2)) { setStep(2); return }
    setIsSubmitting(true)
    try {
      const res = await fetch("/api/equipment", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          propertyId: form.propertyId,
          name: form.name,
          type: form.type,
          make: form.make || null,
          model: form.model || null,
          serialNumber: form.serialNumber || null,
          location: form.location || null,
          installationDate: form.installationDate || null,
          warrantyExpiry: form.warrantyExpiry || null,
          maintenanceFrequencyDays: form.maintenanceFrequencyDays ? parseInt(form.maintenanceFrequencyDays) : null,
        }),
      })
      if (!res.ok) {
        const data = await res.json()
        throw new Error(
          Array.isArray(data.error) ? data.error.map((e: any) => e.message).join(", ") : data.error || "Failed to add equipment"
        )
      }
      toast({ title: "Equipment added", description: `${form.name} has been added successfully.` })
      handleClose()
      onSuccess()
    } catch (err: any) {
      toast({ title: "Error", description: err.message || "Failed to add equipment.", variant: "destructive" })
    } finally {
      setIsSubmitting(false)
    }
  }

  const typeLabel = EQUIPMENT_TYPES.find((t) => t.value === form.type)?.label
  const propertyName = properties.find((p) => p.id === form.propertyId)?.name
  const freqLabel = MAINTENANCE_FREQ.find((f) => f.value === form.maintenanceFrequencyDays)?.label

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

          {/* Step 1 — Identity */}
          {step === 1 && (
            <div className="space-y-5">
              <div>
                <label className="text-sm font-medium">Equipment Name <span className="text-destructive">*</span></label>
                <Input className="mt-1.5" placeholder="e.g., Central HVAC Unit #1" value={form.name} onChange={(e) => set("name", e.target.value)} />
                {errors.name && <p className="text-xs text-destructive mt-1">{errors.name}</p>}
              </div>

              <div>
                <SectionHeader title="Equipment Type" description="Select the type of equipment" />
                <div className="grid grid-cols-3 gap-2">
                  {EQUIPMENT_TYPES.map((et) => {
                    const Icon = et.icon
                    return (
                      <button
                        key={et.value}
                        type="button"
                        onClick={() => set("type", et.value)}
                        className={cn(
                          "flex items-center gap-2 rounded-lg border-2 p-2.5 text-sm font-medium transition-all text-left",
                          "border-border hover:border-primary/40 hover:bg-primary/5",
                          form.type === et.value && "border-primary bg-primary/10 text-primary ring-1 ring-primary",
                        )}
                      >
                        <Icon className="h-4 w-4 flex-shrink-0" />
                        {et.label}
                      </button>
                    )
                  })}
                </div>
                {errors.type && <p className="text-xs text-destructive mt-2">{errors.type}</p>}
              </div>

              <div className="grid grid-cols-3 gap-4">
                <div>
                  <label className="text-sm font-medium">Make / Brand</label>
                  <Input className="mt-1.5" placeholder="e.g., Carrier" value={form.make} onChange={(e) => set("make", e.target.value)} />
                </div>
                <div>
                  <label className="text-sm font-medium">Model</label>
                  <Input className="mt-1.5" placeholder="e.g., 30XA 400" value={form.model} onChange={(e) => set("model", e.target.value)} />
                </div>
                <div>
                  <label className="text-sm font-medium">Serial Number</label>
                  <Input className="mt-1.5" placeholder="e.g., CAR-2023-001" value={form.serialNumber} onChange={(e) => set("serialNumber", e.target.value)} />
                </div>
              </div>
            </div>
          )}

          {/* Step 2 — Location & Schedule */}
          {step === 2 && (
            <div className="space-y-4">
              <div>
                <SectionHeader title="Property & Location" />
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="text-sm font-medium">Property <span className="text-destructive">*</span></label>
                    <Select value={form.propertyId} onValueChange={(v) => set("propertyId", v)}>
                      <SelectTrigger className="mt-1.5">
                        <SelectValue placeholder="Select property" />
                      </SelectTrigger>
                      <SelectContent>
                        {properties.map((p) => (
                          <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    {errors.propertyId && <p className="text-xs text-destructive mt-1">{errors.propertyId}</p>}
                  </div>
                  <div>
                    <label className="text-sm font-medium">Location</label>
                    <Input className="mt-1.5" placeholder="e.g., Rooftop Zone A" value={form.location} onChange={(e) => set("location", e.target.value)} />
                  </div>
                </div>
              </div>

              <div>
                <SectionHeader title="Dates & Maintenance" />
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="text-sm font-medium">Installation Date</label>
                    <Input className="mt-1.5" type="date" value={form.installationDate} onChange={(e) => set("installationDate", e.target.value)} />
                  </div>
                  <div>
                    <label className="text-sm font-medium">Warranty Expiry</label>
                    <Input className="mt-1.5" type="date" value={form.warrantyExpiry} onChange={(e) => set("warrantyExpiry", e.target.value)} />
                  </div>
                </div>
                <div className="mt-4">
                  <label className="text-sm font-medium">Maintenance Frequency</label>
                  <Select value={form.maintenanceFrequencyDays} onValueChange={(v) => set("maintenanceFrequencyDays", v)}>
                    <SelectTrigger className="mt-1.5">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {MAINTENANCE_FREQ.map((f) => (
                        <SelectItem key={f.value} value={f.value}>{f.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </div>
          )}

          {/* Step 3 — Review */}
          {step === 3 && (
            <div className="space-y-4">
              <div className="rounded-lg border p-4">
                <h4 className="text-sm font-semibold mb-2">Equipment Details</h4>
                <ReviewRow label="Name" value={form.name} />
                <ReviewRow label="Type" value={typeLabel} />
                <ReviewRow label="Make / Brand" value={form.make} />
                <ReviewRow label="Model" value={form.model} />
                <ReviewRow label="Serial Number" value={form.serialNumber} />
              </div>
              <div className="rounded-lg border p-4">
                <h4 className="text-sm font-semibold mb-2">Location & Schedule</h4>
                <ReviewRow label="Property" value={propertyName} />
                <ReviewRow label="Location" value={form.location} />
                <ReviewRow label="Installation Date" value={form.installationDate} />
                <ReviewRow label="Warranty Expiry" value={form.warrantyExpiry} />
                <ReviewRow label="Maintenance Frequency" value={freqLabel} />
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
              {isSubmitting ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Adding…</> : "Add Equipment"}
            </Button>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}
