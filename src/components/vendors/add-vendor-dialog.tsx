"use client"

import * as React from "react"
import {
  Check,
  ChevronLeft,
  ChevronRight,
  Building2,
  Phone,
  FileText,
  ClipboardList,
  Loader2,
  Truck,
  Thermometer,
  Zap,
  Droplets,
  Sparkles,
  Shield,
  Trees,
  Activity,
  Bug,
  Cpu,
  Wrench,
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

// ── Types ─────────────────────────────────────────────────────────────────────

interface AddVendorDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onSuccess: () => void
}

interface VendorForm {
  name: string
  category: string
  contractExpiry: string
  contactPerson: string
  email: string
  phone: string
  address: string
  gstNumber: string
  panNumber: string
  bankName: string
  accountName: string
  accountNumber: string
  ifscCode: string
}

const EMPTY_FORM: VendorForm = {
  name: "", category: "", contractExpiry: "",
  contactPerson: "", email: "", phone: "", address: "",
  gstNumber: "", panNumber: "",
  bankName: "", accountName: "", accountNumber: "", ifscCode: "",
}

// ── Step definitions ──────────────────────────────────────────────────────────

const STEPS = [
  { id: 1, key: "company",  label: "Company",   icon: Building2,     title: "Company Information",    description: "Basic details about the vendor" },
  { id: 2, key: "contact",  label: "Contact",   icon: Phone,         title: "Contact Details",        description: "Primary contact and address information" },
  { id: 3, key: "tax",      label: "Tax & Bank",icon: FileText,      title: "Tax & Banking Details",  description: "Compliance and payment information" },
  { id: 4, key: "review",   label: "Review",    icon: ClipboardList, title: "Review & Submit",        description: "Confirm all details before adding the vendor" },
]

// ── Category cards ────────────────────────────────────────────────────────────

const CATEGORIES = [
  { value: "hvac",        label: "HVAC",        icon: Thermometer },
  { value: "electrical",  label: "Electrical",  icon: Zap },
  { value: "plumbing",    label: "Plumbing",    icon: Droplets },
  { value: "cleaning",    label: "Cleaning",    icon: Sparkles },
  { value: "security",    label: "Security",    icon: Shield },
  { value: "landscaping", label: "Landscaping", icon: Trees },
  { value: "elevator",    label: "Elevator",    icon: Activity },
  { value: "pest_control",label: "Pest Control",icon: Bug },
  { value: "it",          label: "IT Services", icon: Cpu },
  { value: "general",     label: "General",     icon: Wrench },
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

export function AddVendorDialog({ open, onOpenChange, onSuccess }: AddVendorDialogProps) {
  const { toast } = useToast()
  const [step, setStep] = React.useState(1)
  const [form, setForm] = React.useState<VendorForm>(EMPTY_FORM)
  const [isSubmitting, setIsSubmitting] = React.useState(false)
  const [errors, setErrors] = React.useState<Partial<VendorForm>>({})

  const set = (field: keyof VendorForm, value: string) =>
    setForm((prev) => ({ ...prev, [field]: value }))

  const validate = (s: number): boolean => {
    const errs: Partial<VendorForm> = {}
    if (s === 1) {
      if (!form.name.trim()) errs.name = "Company name is required"
      if (!form.category) errs.category = "Please select a category"
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
    setIsSubmitting(true)
    try {
      const res = await fetch("/api/vendors", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: form.name,
          category: form.category,
          contactPerson: form.contactPerson || null,
          email: form.email || null,
          phone: form.phone || null,
          address: form.address || null,
          gstNumber: form.gstNumber || null,
          panNumber: form.panNumber || null,
          contractExpiry: form.contractExpiry || null,
          bankDetails: (form.bankName || form.accountNumber) ? {
            bankName: form.bankName || null,
            accountName: form.accountName || null,
            accountNumber: form.accountNumber || null,
            ifscCode: form.ifscCode || null,
          } : null,
        }),
      })
      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.error || "Failed to create vendor")
      }
      toast({ title: "Vendor added", description: `${form.name} has been added successfully.` })
      handleClose()
      onSuccess()
    } catch (err: any) {
      toast({ title: "Error", description: err.message || "Failed to add vendor.", variant: "destructive" })
    } finally {
      setIsSubmitting(false)
    }
  }

  const categoryLabel = CATEGORIES.find((c) => c.value === form.category)?.label

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

          {/* Step 1 — Company Info */}
          {step === 1 && (
            <div className="space-y-5">
              <div>
                <SectionHeader title="Company Name" />
                <Input
                  placeholder="e.g., CoolTech HVAC Solutions"
                  value={form.name}
                  onChange={(e) => set("name", e.target.value)}
                />
                {errors.name && <p className="text-xs text-destructive mt-1">{errors.name}</p>}
              </div>

              <div>
                <SectionHeader title="Service Category" description="What services does this vendor provide?" />
                <div className="grid grid-cols-5 gap-2">
                  {CATEGORIES.map((cat) => {
                    const Icon = cat.icon
                    return (
                      <button
                        key={cat.value}
                        type="button"
                        onClick={() => set("category", cat.value)}
                        className={cn(
                          "flex flex-col items-center gap-1.5 rounded-lg border-2 p-2.5 text-xs font-medium transition-all",
                          "border-border hover:border-primary/40 hover:bg-primary/5",
                          form.category === cat.value && "border-primary bg-primary/10 text-primary ring-1 ring-primary",
                        )}
                      >
                        <Icon className="h-5 w-5" />
                        <span className="text-center leading-tight">{cat.label}</span>
                      </button>
                    )
                  })}
                </div>
                {errors.category && <p className="text-xs text-destructive mt-2">{errors.category}</p>}
              </div>

              <div>
                <label className="text-sm font-medium">Contract Expiry Date</label>
                <Input
                  className="mt-1.5"
                  type="date"
                  value={form.contractExpiry}
                  onChange={(e) => set("contractExpiry", e.target.value)}
                />
              </div>
            </div>
          )}

          {/* Step 2 — Contact */}
          {step === 2 && (
            <div className="space-y-4">
              <SectionHeader title="Contact Information" description="Primary point of contact for this vendor" />
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-sm font-medium">Contact Person</label>
                  <Input className="mt-1.5" placeholder="Full name" value={form.contactPerson} onChange={(e) => set("contactPerson", e.target.value)} />
                </div>
                <div>
                  <label className="text-sm font-medium">Phone</label>
                  <Input className="mt-1.5" placeholder="+91 98765 43210" value={form.phone} onChange={(e) => set("phone", e.target.value)} />
                </div>
              </div>
              <div>
                <label className="text-sm font-medium">Email</label>
                <Input className="mt-1.5" type="email" placeholder="vendor@example.com" value={form.email} onChange={(e) => set("email", e.target.value)} />
              </div>
              <div>
                <label className="text-sm font-medium">Address</label>
                <textarea
                  className="mt-1.5 flex min-h-[80px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                  placeholder="Full registered address"
                  value={form.address}
                  onChange={(e) => set("address", e.target.value)}
                />
              </div>
            </div>
          )}

          {/* Step 3 — Tax & Bank */}
          {step === 3 && (
            <div className="space-y-5">
              <div>
                <SectionHeader title="Tax & Compliance" />
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="text-sm font-medium">GST Number</label>
                    <Input className="mt-1.5" placeholder="27AABCU9603R1ZM" value={form.gstNumber} onChange={(e) => set("gstNumber", e.target.value.toUpperCase())} />
                  </div>
                  <div>
                    <label className="text-sm font-medium">PAN Number</label>
                    <Input className="mt-1.5" placeholder="AABCU9603R" value={form.panNumber} onChange={(e) => set("panNumber", e.target.value.toUpperCase())} />
                  </div>
                </div>
              </div>

              <div>
                <SectionHeader title="Banking Details" description="For payment processing (optional)" />
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="text-sm font-medium">Bank Name</label>
                    <Input className="mt-1.5" placeholder="e.g., HDFC Bank" value={form.bankName} onChange={(e) => set("bankName", e.target.value)} />
                  </div>
                  <div>
                    <label className="text-sm font-medium">IFSC Code</label>
                    <Input className="mt-1.5" placeholder="HDFC0001234" value={form.ifscCode} onChange={(e) => set("ifscCode", e.target.value.toUpperCase())} />
                  </div>
                  <div>
                    <label className="text-sm font-medium">Account Name</label>
                    <Input className="mt-1.5" placeholder="Registered account name" value={form.accountName} onChange={(e) => set("accountName", e.target.value)} />
                  </div>
                  <div>
                    <label className="text-sm font-medium">Account Number</label>
                    <Input className="mt-1.5" placeholder="Bank account number" value={form.accountNumber} onChange={(e) => set("accountNumber", e.target.value)} />
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Step 4 — Review */}
          {step === 4 && (
            <div className="space-y-4">
              <div className="rounded-lg border p-4">
                <h4 className="text-sm font-semibold mb-2">Company</h4>
                <ReviewRow label="Company Name" value={form.name} />
                <ReviewRow label="Category" value={categoryLabel} />
                <ReviewRow label="Contract Expiry" value={form.contractExpiry || undefined} />
              </div>
              <div className="rounded-lg border p-4">
                <h4 className="text-sm font-semibold mb-2">Contact</h4>
                <ReviewRow label="Contact Person" value={form.contactPerson} />
                <ReviewRow label="Email" value={form.email} />
                <ReviewRow label="Phone" value={form.phone} />
                <ReviewRow label="Address" value={form.address} />
              </div>
              <div className="rounded-lg border p-4">
                <h4 className="text-sm font-semibold mb-2">Tax & Banking</h4>
                <ReviewRow label="GST Number" value={form.gstNumber} />
                <ReviewRow label="PAN Number" value={form.panNumber} />
                <ReviewRow label="Bank Name" value={form.bankName} />
                <ReviewRow label="Account Number" value={form.accountNumber ? `••••${form.accountNumber.slice(-4)}` : undefined} />
                <ReviewRow label="IFSC Code" value={form.ifscCode} />
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
              {isSubmitting ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Adding…</> : "Add Vendor"}
            </Button>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}
