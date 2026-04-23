"use client"

import * as React from "react"
import {
  Check,
  ChevronLeft,
  ChevronRight,
  ClipboardList,
  MapPin,
  FileText,
  Loader2,
  Wrench,
  Thermometer,
  Droplets,
  Zap,
  Sparkles,
  Shield,
  AlertCircle,
  AlertTriangle,
  TrendingUp,
  Minus,
} from "lucide-react"
import { Dialog, DialogContent } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Separator } from "@/components/ui/separator"
import { cn } from "@/lib/utils"
import { useToast } from "@/components/ui/use-toast"

// ── Types ─────────────────────────────────────────────────────────────────────

interface CreateWorkOrderDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  selectedPropertyId?: string
  onSuccess: () => void
}

interface WorkOrderForm {
  category: string
  priority: string
  title: string
  location: string
  description: string
}

const EMPTY_FORM: WorkOrderForm = {
  category: "",
  priority: "medium",
  title: "",
  location: "",
  description: "",
}

// ── Step definitions ──────────────────────────────────────────────────────────

const STEPS = [
  { id: 1, key: "type",    label: "Type & Priority", icon: ClipboardList, title: "Issue Type & Priority",      description: "Select the category and urgency of this work order" },
  { id: 2, key: "details", label: "Details",          icon: FileText,      title: "Issue Details",               description: "Describe the problem and its location" },
  { id: 3, key: "review",  label: "Review",           icon: Check,         title: "Review & Submit",             description: "Confirm all details before creating the work order" },
]

// ── Category & Priority options ───────────────────────────────────────────────

const CATEGORIES = [
  { value: "hvac",       label: "HVAC",       icon: Thermometer, color: "bg-blue-50 border-blue-200 text-blue-700 hover:border-blue-400" },
  { value: "plumbing",   label: "Plumbing",   icon: Droplets,    color: "bg-cyan-50 border-cyan-200 text-cyan-700 hover:border-cyan-400" },
  { value: "electrical", label: "Electrical", icon: Zap,         color: "bg-yellow-50 border-yellow-200 text-yellow-700 hover:border-yellow-400" },
  { value: "cleaning",   label: "Cleaning",   icon: Sparkles,    color: "bg-green-50 border-green-200 text-green-700 hover:border-green-400" },
  { value: "security",   label: "Security",   icon: Shield,      color: "bg-red-50 border-red-200 text-red-700 hover:border-red-400" },
  { value: "general",    label: "General",    icon: Wrench,      color: "bg-gray-50 border-gray-200 text-gray-700 hover:border-gray-400" },
]

const PRIORITIES = [
  { value: "low",      label: "Low",      icon: Minus,         desc: "Can be scheduled",          color: "bg-gray-50 border-gray-200 text-gray-700 hover:border-gray-400" },
  { value: "medium",   label: "Medium",   icon: TrendingUp,    desc: "Address within a few days",  color: "bg-blue-50 border-blue-200 text-blue-700 hover:border-blue-400" },
  { value: "high",     label: "High",     icon: AlertTriangle, desc: "Needs prompt attention",     color: "bg-orange-50 border-orange-200 text-orange-700 hover:border-orange-400" },
  { value: "critical", label: "Critical", icon: AlertCircle,   desc: "Immediate action required",  color: "bg-red-50 border-red-200 text-red-700 hover:border-red-400" },
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
    <div className="flex justify-between py-1.5 text-sm">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-medium text-right max-w-[60%]">{value || "—"}</span>
    </div>
  )
}

// ── Main Component ────────────────────────────────────────────────────────────

export function CreateWorkOrderDialog({ open, onOpenChange, selectedPropertyId, onSuccess }: CreateWorkOrderDialogProps) {
  const { toast } = useToast()
  const [step, setStep] = React.useState(1)
  const [form, setForm] = React.useState<WorkOrderForm>(EMPTY_FORM)
  const [isSubmitting, setIsSubmitting] = React.useState(false)
  const [errors, setErrors] = React.useState<Partial<WorkOrderForm>>({})

  const set = (field: keyof WorkOrderForm, value: string) =>
    setForm((prev) => ({ ...prev, [field]: value }))

  const validate = (s: number): boolean => {
    const errs: Partial<WorkOrderForm> = {}
    if (s === 1 && !form.category) errs.category = "Please select a category"
    if (s === 2 && !form.title.trim()) errs.title = "Title is required"
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
    if (!validate(2)) { setStep(2); return }
    if (!selectedPropertyId) {
      toast({ title: "No property selected", description: "Please select a property from the header first.", variant: "destructive" })
      return
    }
    setIsSubmitting(true)
    try {
      const res = await fetch("/api/work-orders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...form, propertyId: selectedPropertyId }),
      })
      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.error || "Failed to create work order")
      }
      toast({ title: "Work order created", description: `"${form.title}" has been created successfully.` })
      handleClose()
      onSuccess()
    } catch (err: any) {
      toast({ title: "Error", description: err.message || "Failed to create work order.", variant: "destructive" })
    } finally {
      setIsSubmitting(false)
    }
  }

  const categoryLabel = CATEGORIES.find((c) => c.value === form.category)?.label
  const priorityLabel = PRIORITIES.find((p) => p.value === form.priority)?.label

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

          {/* Step 1 */}
          {step === 1 && (
            <div className="space-y-6">
              <div>
                <SectionHeader title="Category" description="What type of issue is this?" />
                <div className="grid grid-cols-3 gap-3">
                  {CATEGORIES.map((cat) => {
                    const Icon = cat.icon
                    return (
                      <button
                        key={cat.value}
                        type="button"
                        onClick={() => set("category", cat.value)}
                        className={cn(
                          "flex flex-col items-center gap-2 rounded-lg border-2 p-3 text-sm font-medium transition-all",
                          cat.color,
                          form.category === cat.value && "ring-2 ring-offset-1 ring-primary scale-[1.02]",
                        )}
                      >
                        <Icon className="h-6 w-6" />
                        {cat.label}
                      </button>
                    )
                  })}
                </div>
                {errors.category && <p className="text-xs text-destructive mt-2">{errors.category}</p>}
              </div>

              <div>
                <SectionHeader title="Priority" description="How urgent is this issue?" />
                <div className="grid grid-cols-2 gap-3">
                  {PRIORITIES.map((pri) => {
                    const Icon = pri.icon
                    return (
                      <button
                        key={pri.value}
                        type="button"
                        onClick={() => set("priority", pri.value)}
                        className={cn(
                          "flex items-center gap-3 rounded-lg border-2 p-3 text-sm transition-all text-left",
                          pri.color,
                          form.priority === pri.value && "ring-2 ring-offset-1 ring-primary scale-[1.01]",
                        )}
                      >
                        <Icon className="h-5 w-5 flex-shrink-0" />
                        <div>
                          <div className="font-semibold">{pri.label}</div>
                          <div className="text-xs opacity-70">{pri.desc}</div>
                        </div>
                      </button>
                    )
                  })}
                </div>
              </div>
            </div>
          )}

          {/* Step 2 */}
          {step === 2 && (
            <div className="space-y-5">
              <div>
                <SectionHeader title="Issue Details" description="Provide the specifics of the problem" />
                <div className="space-y-4">
                  <div>
                    <label className="text-sm font-medium">Title <span className="text-destructive">*</span></label>
                    <Input
                      className="mt-1.5"
                      placeholder="e.g., AC unit not cooling on 2nd floor"
                      value={form.title}
                      onChange={(e) => set("title", e.target.value)}
                    />
                    {errors.title && <p className="text-xs text-destructive mt-1">{errors.title}</p>}
                  </div>
                  <div>
                    <label className="text-sm font-medium flex items-center gap-1.5">
                      <MapPin className="h-3.5 w-3.5 text-muted-foreground" /> Location
                    </label>
                    <Input
                      className="mt-1.5"
                      placeholder="e.g., Unit 203, 2nd Floor East Wing"
                      value={form.location}
                      onChange={(e) => set("location", e.target.value)}
                    />
                  </div>
                  <div>
                    <label className="text-sm font-medium">Description</label>
                    <textarea
                      className="mt-1.5 flex min-h-[100px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                      placeholder="Provide as much detail as possible about the issue..."
                      value={form.description}
                      onChange={(e) => set("description", e.target.value)}
                    />
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Step 3 — Review */}
          {step === 3 && (
            <div className="space-y-4">
              <div className="rounded-lg border p-4">
                <h4 className="text-sm font-semibold mb-2">Issue Type</h4>
                <ReviewRow label="Category" value={categoryLabel} />
                <ReviewRow label="Priority" value={priorityLabel} />
              </div>
              <div className="rounded-lg border p-4">
                <h4 className="text-sm font-semibold mb-2">Details</h4>
                <ReviewRow label="Title" value={form.title} />
                <ReviewRow label="Location" value={form.location} />
                {form.description && (
                  <div className="pt-1.5">
                    <p className="text-xs text-muted-foreground">Description</p>
                    <p className="text-sm mt-0.5">{form.description}</p>
                  </div>
                )}
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
              {isSubmitting ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Creating…</> : "Create Work Order"}
            </Button>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}
