"use client"

import * as React from "react"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import {
  Check,
  Building2,
  Users,
  FileText,
  Landmark,
  MapPin,
  ClipboardList,
  Loader2,
  ChevronRight,
  ChevronLeft,
} from "lucide-react"
import { Dialog, DialogContent } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form"
import { Separator } from "@/components/ui/separator"
import { Badge } from "@/components/ui/badge"
import { cn } from "@/lib/utils"
import { tenantSchema, type TenantFormData } from "@/lib/validations/tenant"
import { useToast } from "@/components/ui/use-toast"
import type { Property } from "@/stores/property-store"

// ── Step definitions ──────────────────────────────────────────────────────────

const STEPS = [
  {
    id: 1,
    key: "business",
    label: "Business",
    icon: Building2,
    title: "Business Details",
    description: "Core business information and property assignment",
  },
  {
    id: 2,
    key: "contact",
    label: "Contact",
    icon: Users,
    title: "Contact Information",
    description: "Primary contacts, authorized signatories and emergency contact",
  },
  {
    id: 3,
    key: "tax",
    label: "Tax & Compliance",
    icon: FileText,
    title: "Tax & Compliance",
    description: "GST, PAN and other regulatory licenses",
  },
  {
    id: 4,
    key: "banking",
    label: "Banking",
    icon: Landmark,
    title: "Banking Details",
    description: "Bank account information for rent and payment processing",
  },
  {
    id: 5,
    key: "address",
    label: "Address",
    icon: MapPin,
    title: "Registered Address",
    description: "Registered office address and additional notes",
  },
  {
    id: 6,
    key: "review",
    label: "Review",
    icon: ClipboardList,
    title: "Review & Submit",
    description: "Confirm all details before creating the tenant",
  },
]

// Fields to validate per step
const STEP_FIELDS: Record<number, (keyof TenantFormData)[]> = {
  1: ["propertyId", "businessName", "legalEntityName", "brandName", "category", "subcategory", "businessType", "website", "status"],
  2: ["contactPerson", "designation", "email", "phone", "alternatePhone", "authorizedSignatory", "signatoryPhone", "signatoryEmail", "emergencyContactName", "emergencyContactPhone"],
  3: ["gstin", "pan", "tan", "cin", "fssaiLicense", "tradeLicense", "shopEstablishmentNumber"],
  4: ["bankName", "bankBranch", "accountNumber", "ifscCode", "accountHolderName"],
  5: ["registeredAddress", "registeredCity", "registeredState", "registeredPincode", "notes"],
}

// ── Component props ───────────────────────────────────────────────────────────

interface AddTenantDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  properties: Property[]
  selectedPropertyId?: string
  onSuccess: () => void
}

// ── Helper: section divider ───────────────────────────────────────────────────

function SectionHeader({ title, description }: { title: string; description?: string }) {
  return (
    <div className="mb-4">
      <h3 className="text-sm font-semibold text-foreground">{title}</h3>
      {description && <p className="text-xs text-muted-foreground mt-0.5">{description}</p>}
      <Separator className="mt-3" />
    </div>
  )
}

// ── Helper: review row ────────────────────────────────────────────────────────

function ReviewRow({ label, value }: { label: string; value?: string | null }) {
  if (!value) return null
  return (
    <div className="flex justify-between items-start gap-4 py-1.5">
      <span className="text-xs text-muted-foreground min-w-[140px]">{label}</span>
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

// ── Phone input helper ────────────────────────────────────────────────────────

function handlePhoneInput(value: string, onChange: (v: string) => void) {
  let cleaned = value.replace(/[^\d+]/g, "")
  if (cleaned.startsWith("+91")) {
    cleaned = "+91" + cleaned.slice(3).replace(/\D/g, "").slice(0, 10)
  } else {
    cleaned = cleaned.replace(/\D/g, "").slice(0, 10)
  }
  onChange(cleaned)
}

// ── Main component ────────────────────────────────────────────────────────────

export function AddTenantDialog({
  open,
  onOpenChange,
  properties,
  selectedPropertyId,
  onSuccess,
}: AddTenantDialogProps) {
  const { toast } = useToast()
  const [currentStep, setCurrentStep] = React.useState(1)
  const [isSubmitting, setIsSubmitting] = React.useState(false)
  const [completedSteps, setCompletedSteps] = React.useState<Set<number>>(new Set())

  const form = useForm<TenantFormData>({
    resolver: zodResolver(tenantSchema),
    defaultValues: {
      businessName: "",
      legalEntityName: "",
      brandName: "",
      category: undefined,
      subcategory: "",
      businessType: undefined,
      website: "",
      status: "onboarding",
      contactPerson: "",
      designation: "",
      email: "",
      phone: "",
      alternatePhone: "",
      authorizedSignatory: "",
      signatoryPhone: "",
      signatoryEmail: "",
      emergencyContactName: "",
      emergencyContactPhone: "",
      gstin: "",
      pan: "",
      tan: "",
      cin: "",
      fssaiLicense: "",
      tradeLicense: "",
      shopEstablishmentNumber: "",
      bankName: "",
      bankBranch: "",
      accountNumber: "",
      ifscCode: "",
      accountHolderName: "",
      registeredAddress: "",
      registeredCity: "",
      registeredState: "",
      registeredPincode: "",
      propertyId: selectedPropertyId || "",
      notes: "",
    },
  })

  // Sync selectedPropertyId when it changes
  React.useEffect(() => {
    if (selectedPropertyId && !form.getValues("propertyId")) {
      form.setValue("propertyId", selectedPropertyId)
    }
  }, [selectedPropertyId, form])

  // Set first property as default when properties load
  React.useEffect(() => {
    if (properties.length > 0 && !form.getValues("propertyId")) {
      form.setValue("propertyId", selectedPropertyId || properties[0].id)
    }
  }, [properties, selectedPropertyId, form])

  const handleClose = () => {
    onOpenChange(false)
    setTimeout(() => {
      form.reset()
      setCurrentStep(1)
      setCompletedSteps(new Set())
    }, 200)
  }

  const handleNext = async () => {
    if (currentStep === STEPS.length) return

    const fields = STEP_FIELDS[currentStep]
    if (fields) {
      const valid = await form.trigger(fields)
      if (!valid) return
    }

    setCompletedSteps((prev) => new Set([...prev, currentStep]))
    setCurrentStep((s) => s + 1)
  }

  const handleBack = () => {
    setCurrentStep((s) => Math.max(1, s - 1))
  }

  const handleSubmit = async () => {
    const valid = await form.trigger()
    if (!valid) {
      toast({
        title: "Validation Error",
        description: "Please check all steps for errors.",
        variant: "destructive",
      })
      return
    }

    const data = form.getValues()
    const propertyId = data.propertyId || properties[0]?.id

    if (!propertyId) {
      toast({ title: "Error", description: "Please select a property.", variant: "destructive" })
      return
    }

    setIsSubmitting(true)
    try {
      const response = await fetch("/api/tenants", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...data, propertyId }),
      })

      if (!response.ok) {
        const err = await response.json()
        throw new Error(err.error || "Failed to create tenant")
      }

      toast({ title: "Tenant Created", description: `${data.businessName} has been onboarded successfully.` })
      handleClose()
      onSuccess()
    } catch (error) {
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "Failed to create tenant.",
        variant: "destructive",
      })
    } finally {
      setIsSubmitting(false)
    }
  }

  const values = form.watch()
  const currentStepDef = STEPS[currentStep - 1]
  const isLastStep = currentStep === STEPS.length

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-3xl p-0 gap-0 overflow-hidden max-h-[92vh] flex flex-col">

        {/* ── Header ── */}
        <div className="px-6 pt-6 pb-4 border-b bg-muted/30 shrink-0">
          <div className="flex items-start justify-between mb-5">
            <div>
              <h2 className="text-lg font-semibold">New Tenant Onboarding</h2>
              <p className="text-sm text-muted-foreground mt-0.5">
                Step {currentStep} of {STEPS.length} — {currentStepDef.title}
              </p>
            </div>
            <Badge variant="outline" className="text-xs">
              {Math.round(((currentStep - 1) / (STEPS.length - 1)) * 100)}% complete
            </Badge>
          </div>

          {/* Stepper */}
          <div className="flex items-center gap-0">
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
                    className={cn(
                      "flex flex-col items-center gap-1 focus:outline-none",
                      isDone ? "cursor-pointer" : "cursor-default"
                    )}
                  >
                    <div
                      className={cn(
                        "w-8 h-8 rounded-full flex items-center justify-center text-xs font-semibold border-2 transition-all",
                        isActive && "border-primary bg-primary text-primary-foreground",
                        isDone && !isActive && "border-primary bg-primary/10 text-primary",
                        !isActive && !isDone && "border-muted-foreground/30 bg-background text-muted-foreground"
                      )}
                    >
                      {isDone && !isActive ? (
                        <Check className="h-3.5 w-3.5" />
                      ) : (
                        <Icon className="h-3.5 w-3.5" />
                      )}
                    </div>
                    <span
                      className={cn(
                        "text-[10px] font-medium whitespace-nowrap hidden sm:block",
                        isActive && "text-primary",
                        isDone && !isActive && "text-primary/70",
                        !isActive && !isDone && "text-muted-foreground"
                      )}
                    >
                      {step.label}
                    </span>
                  </button>
                  {!isLast && (
                    <div
                      className={cn(
                        "flex-1 h-0.5 mt-[-10px] mb-5 mx-1 rounded transition-all",
                        completedSteps.has(step.id) ? "bg-primary/60" : "bg-muted-foreground/20"
                      )}
                    />
                  )}
                </React.Fragment>
              )
            })}
          </div>
        </div>

        {/* ── Form body ── */}
        <div className="flex-1 overflow-y-auto px-6 py-5">
          <Form {...form}>
            <form onSubmit={(e) => e.preventDefault()}>

              {/* ───── Step 1: Business Details ───── */}
              {currentStep === 1 && (
                <div className="space-y-5">
                  <SectionHeader
                    title="Property & Identity"
                    description="Select the property and provide the core business identity"
                  />
                  <FormField
                    control={form.control}
                    name="propertyId"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Property <span className="text-destructive">*</span></FormLabel>
                        <Select onValueChange={field.onChange} value={field.value}>
                          <FormControl>
                            <SelectTrigger>
                              <SelectValue placeholder="Select the mall property" />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            {properties.map((p) => (
                              <SelectItem key={p.id} value={p.id}>
                                {p.name} — {p.city}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <div className="grid grid-cols-2 gap-4">
                    <FormField
                      control={form.control}
                      name="businessName"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Business Name <span className="text-destructive">*</span></FormLabel>
                          <FormControl>
                            <Input placeholder="Trading name of the business" {...field} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={form.control}
                      name="legalEntityName"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Legal Entity Name</FormLabel>
                          <FormControl>
                            <Input placeholder="Registered company name" {...field} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <FormField
                      control={form.control}
                      name="brandName"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Brand Name</FormLabel>
                          <FormControl>
                            <Input placeholder="Consumer-facing brand name" {...field} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={form.control}
                      name="category"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Category</FormLabel>
                          <Select onValueChange={field.onChange} value={field.value || ""}>
                            <FormControl>
                              <SelectTrigger>
                                <SelectValue placeholder="Select business category" />
                              </SelectTrigger>
                            </FormControl>
                            <SelectContent>
                              <SelectItem value="fashion">Fashion & Apparel</SelectItem>
                              <SelectItem value="food_beverage">Food & Beverage</SelectItem>
                              <SelectItem value="electronics">Electronics & Tech</SelectItem>
                              <SelectItem value="entertainment">Entertainment</SelectItem>
                              <SelectItem value="services">Services</SelectItem>
                              <SelectItem value="health_beauty">Health & Beauty</SelectItem>
                              <SelectItem value="home_lifestyle">Home & Lifestyle</SelectItem>
                              <SelectItem value="jewelry">Jewelry & Accessories</SelectItem>
                              <SelectItem value="sports">Sports & Fitness</SelectItem>
                              <SelectItem value="books_stationery">Books & Stationery</SelectItem>
                            </SelectContent>
                          </Select>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <FormField
                      control={form.control}
                      name="businessType"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Business Type</FormLabel>
                          <Select onValueChange={field.onChange} value={field.value || ""}>
                            <FormControl>
                              <SelectTrigger>
                                <SelectValue placeholder="Legal structure" />
                              </SelectTrigger>
                            </FormControl>
                            <SelectContent>
                              <SelectItem value="sole_proprietorship">Sole Proprietorship</SelectItem>
                              <SelectItem value="partnership">Partnership Firm</SelectItem>
                              <SelectItem value="llp">LLP</SelectItem>
                              <SelectItem value="pvt_ltd">Private Limited (Pvt. Ltd.)</SelectItem>
                              <SelectItem value="public_ltd">Public Limited</SelectItem>
                              <SelectItem value="opc">One Person Company (OPC)</SelectItem>
                            </SelectContent>
                          </Select>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={form.control}
                      name="status"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Onboarding Status</FormLabel>
                          <Select onValueChange={field.onChange} value={field.value}>
                            <FormControl>
                              <SelectTrigger>
                                <SelectValue placeholder="Select status" />
                              </SelectTrigger>
                            </FormControl>
                            <SelectContent>
                              <SelectItem value="onboarding">Onboarding</SelectItem>
                              <SelectItem value="active">Active</SelectItem>
                              <SelectItem value="inactive">Inactive</SelectItem>
                              <SelectItem value="suspended">Suspended</SelectItem>
                            </SelectContent>
                          </Select>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>
                  <FormField
                    control={form.control}
                    name="website"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Website</FormLabel>
                        <FormControl>
                          <Input placeholder="https://www.example.com" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>
              )}

              {/* ───── Step 2: Contact Information ───── */}
              {currentStep === 2 && (
                <div className="space-y-5">
                  <SectionHeader
                    title="Primary Contact"
                    description="Main point of contact for day-to-day operations"
                  />
                  <div className="grid grid-cols-2 gap-4">
                    <FormField
                      control={form.control}
                      name="contactPerson"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Full Name</FormLabel>
                          <FormControl>
                            <Input placeholder="Contact person's full name" {...field} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={form.control}
                      name="designation"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Designation</FormLabel>
                          <FormControl>
                            <Input placeholder="e.g., Store Manager, Owner" {...field} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <FormField
                      control={form.control}
                      name="email"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Email Address</FormLabel>
                          <FormControl>
                            <Input type="email" placeholder="contact@business.com" {...field} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={form.control}
                      name="phone"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Mobile Number</FormLabel>
                          <FormControl>
                            <Input
                              placeholder="10-digit Indian mobile"
                              {...field}
                              onChange={(e) => handlePhoneInput(e.target.value, field.onChange)}
                              maxLength={13}
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>
                  <FormField
                    control={form.control}
                    name="alternatePhone"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Alternate Phone</FormLabel>
                        <FormControl>
                          <Input
                            placeholder="Secondary contact number"
                            {...field}
                            onChange={(e) => handlePhoneInput(e.target.value, field.onChange)}
                            maxLength={13}
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <SectionHeader
                    title="Authorized Signatory"
                    description="Person authorized to sign legal documents on behalf of the business"
                  />
                  <div className="grid grid-cols-2 gap-4">
                    <FormField
                      control={form.control}
                      name="authorizedSignatory"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Signatory Name</FormLabel>
                          <FormControl>
                            <Input placeholder="Full legal name" {...field} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={form.control}
                      name="signatoryPhone"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Signatory Phone</FormLabel>
                          <FormControl>
                            <Input
                              placeholder="10-digit mobile"
                              {...field}
                              onChange={(e) => handlePhoneInput(e.target.value, field.onChange)}
                              maxLength={13}
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>
                  <FormField
                    control={form.control}
                    name="signatoryEmail"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Signatory Email</FormLabel>
                        <FormControl>
                          <Input type="email" placeholder="signatory@business.com" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <SectionHeader
                    title="Emergency Contact"
                    description="Reachable outside business hours for urgent matters"
                  />
                  <div className="grid grid-cols-2 gap-4">
                    <FormField
                      control={form.control}
                      name="emergencyContactName"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Contact Name</FormLabel>
                          <FormControl>
                            <Input placeholder="Emergency contact name" {...field} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={form.control}
                      name="emergencyContactPhone"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Contact Phone</FormLabel>
                          <FormControl>
                            <Input
                              placeholder="10-digit mobile"
                              {...field}
                              onChange={(e) => handlePhoneInput(e.target.value, field.onChange)}
                              maxLength={13}
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>
                </div>
              )}

              {/* ───── Step 3: Tax & Compliance ───── */}
              {currentStep === 3 && (
                <div className="space-y-5">
                  <SectionHeader
                    title="Primary Tax Registrations"
                    description="Core government-issued tax identifiers"
                  />
                  <div className="grid grid-cols-2 gap-4">
                    <FormField
                      control={form.control}
                      name="gstin"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>GSTIN</FormLabel>
                          <FormControl>
                            <Input
                              placeholder="15-character GST number"
                              {...field}
                              onChange={(e) => field.onChange(e.target.value.toUpperCase())}
                              maxLength={15}
                              className="font-mono"
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={form.control}
                      name="pan"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>PAN</FormLabel>
                          <FormControl>
                            <Input
                              placeholder="10-character PAN"
                              {...field}
                              onChange={(e) => field.onChange(e.target.value.toUpperCase())}
                              maxLength={10}
                              className="font-mono"
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <FormField
                      control={form.control}
                      name="tan"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>TAN</FormLabel>
                          <FormControl>
                            <Input
                              placeholder="Tax Deduction Account No."
                              {...field}
                              onChange={(e) => field.onChange(e.target.value.toUpperCase())}
                              maxLength={10}
                              className="font-mono"
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={form.control}
                      name="cin"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>CIN</FormLabel>
                          <FormControl>
                            <Input
                              placeholder="Company Identification No."
                              {...field}
                              onChange={(e) => field.onChange(e.target.value.toUpperCase())}
                              maxLength={21}
                              className="font-mono"
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>

                  <SectionHeader
                    title="Operational Licenses"
                    description="Licenses specific to business type and category"
                  />
                  <div className="grid grid-cols-2 gap-4">
                    <FormField
                      control={form.control}
                      name="fssaiLicense"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>FSSAI License</FormLabel>
                          <FormControl>
                            <Input placeholder="Required for F&B businesses" {...field} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={form.control}
                      name="tradeLicense"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Trade License</FormLabel>
                          <FormControl>
                            <Input placeholder="Municipal trade license number" {...field} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>
                  <FormField
                    control={form.control}
                    name="shopEstablishmentNumber"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Shop & Establishment Number</FormLabel>
                        <FormControl>
                          <Input placeholder="S&E Act registration number" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>
              )}

              {/* ───── Step 4: Banking Details ───── */}
              {currentStep === 4 && (
                <div className="space-y-5">
                  <SectionHeader
                    title="Bank Account Details"
                    description="Used for rent collection, security deposit refunds and payments"
                  />
                  <div className="grid grid-cols-2 gap-4">
                    <FormField
                      control={form.control}
                      name="bankName"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Bank Name</FormLabel>
                          <FormControl>
                            <Input placeholder="e.g., HDFC Bank, ICICI Bank" {...field} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={form.control}
                      name="bankBranch"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Branch Name</FormLabel>
                          <FormControl>
                            <Input placeholder="Branch location" {...field} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <FormField
                      control={form.control}
                      name="accountNumber"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Account Number</FormLabel>
                          <FormControl>
                            <Input
                              placeholder="Bank account number"
                              {...field}
                              className="font-mono"
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={form.control}
                      name="ifscCode"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>IFSC Code</FormLabel>
                          <FormControl>
                            <Input
                              placeholder="11-character IFSC"
                              {...field}
                              onChange={(e) => field.onChange(e.target.value.toUpperCase())}
                              maxLength={11}
                              className="font-mono"
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>
                  <FormField
                    control={form.control}
                    name="accountHolderName"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Account Holder Name</FormLabel>
                        <FormControl>
                          <Input placeholder="Name exactly as in bank records" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>
              )}

              {/* ───── Step 5: Address & Notes ───── */}
              {currentStep === 5 && (
                <div className="space-y-5">
                  <SectionHeader
                    title="Registered Office Address"
                    description="Legal registered address of the business entity"
                  />
                  <FormField
                    control={form.control}
                    name="registeredAddress"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Street Address</FormLabel>
                        <FormControl>
                          <Textarea
                            placeholder="Plot / Building, Street, Area"
                            {...field}
                            rows={3}
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <div className="grid grid-cols-3 gap-4">
                    <FormField
                      control={form.control}
                      name="registeredCity"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>City</FormLabel>
                          <FormControl>
                            <Input placeholder="City" {...field} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={form.control}
                      name="registeredState"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>State</FormLabel>
                          <FormControl>
                            <Input placeholder="State" {...field} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={form.control}
                      name="registeredPincode"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>PIN Code</FormLabel>
                          <FormControl>
                            <Input
                              placeholder="6-digit PIN"
                              {...field}
                              maxLength={6}
                              className="font-mono"
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>

                  <SectionHeader title="Additional Notes" />
                  <FormField
                    control={form.control}
                    name="notes"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Internal Notes</FormLabel>
                        <FormControl>
                          <Textarea
                            placeholder="Any special instructions, remarks or context about this tenant..."
                            {...field}
                            rows={4}
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>
              )}

              {/* ───── Step 6: Review ───── */}
              {currentStep === 6 && (
                <div className="space-y-4">
                  <div className="rounded-lg border border-primary/20 bg-primary/5 px-4 py-3 mb-2">
                    <p className="text-sm font-medium text-primary">Ready to submit</p>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      Review the information below. Click a completed step to go back and edit.
                    </p>
                  </div>

                  <ReviewSection title="Business Details">
                    <ReviewRow label="Property" value={properties.find(p => p.id === values.propertyId)?.name} />
                    <ReviewRow label="Business Name" value={values.businessName} />
                    <ReviewRow label="Legal Entity Name" value={values.legalEntityName} />
                    <ReviewRow label="Brand Name" value={values.brandName} />
                    <ReviewRow label="Category" value={values.category} />
                    <ReviewRow label="Business Type" value={values.businessType} />
                    <ReviewRow label="Status" value={values.status} />
                    <ReviewRow label="Website" value={values.website} />
                  </ReviewSection>

                  <ReviewSection title="Contact Information">
                    <ReviewRow label="Contact Person" value={values.contactPerson} />
                    <ReviewRow label="Designation" value={values.designation} />
                    <ReviewRow label="Email" value={values.email} />
                    <ReviewRow label="Phone" value={values.phone} />
                    <ReviewRow label="Alternate Phone" value={values.alternatePhone} />
                    <ReviewRow label="Authorized Signatory" value={values.authorizedSignatory} />
                    <ReviewRow label="Signatory Phone" value={values.signatoryPhone} />
                    <ReviewRow label="Emergency Contact" value={values.emergencyContactName} />
                    <ReviewRow label="Emergency Phone" value={values.emergencyContactPhone} />
                  </ReviewSection>

                  <ReviewSection title="Tax & Compliance">
                    <ReviewRow label="GSTIN" value={values.gstin} />
                    <ReviewRow label="PAN" value={values.pan} />
                    <ReviewRow label="TAN" value={values.tan} />
                    <ReviewRow label="CIN" value={values.cin} />
                    <ReviewRow label="FSSAI License" value={values.fssaiLicense} />
                    <ReviewRow label="Trade License" value={values.tradeLicense} />
                    <ReviewRow label="Shop Establishment No." value={values.shopEstablishmentNumber} />
                  </ReviewSection>

                  <ReviewSection title="Banking Details">
                    <ReviewRow label="Bank" value={values.bankName} />
                    <ReviewRow label="Branch" value={values.bankBranch} />
                    <ReviewRow label="Account Number" value={values.accountNumber ? `••••${values.accountNumber.slice(-4)}` : undefined} />
                    <ReviewRow label="IFSC Code" value={values.ifscCode} />
                    <ReviewRow label="Account Holder" value={values.accountHolderName} />
                  </ReviewSection>

                  <ReviewSection title="Address">
                    <ReviewRow label="Street" value={values.registeredAddress} />
                    <ReviewRow label="City" value={values.registeredCity} />
                    <ReviewRow label="State" value={values.registeredState} />
                    <ReviewRow label="PIN Code" value={values.registeredPincode} />
                    <ReviewRow label="Notes" value={values.notes} />
                  </ReviewSection>
                </div>
              )}

            </form>
          </Form>
        </div>

        {/* ── Footer ── */}
        <div className="px-6 py-4 border-t bg-background shrink-0 flex items-center justify-between">
          <Button
            type="button"
            variant="outline"
            onClick={currentStep === 1 ? handleClose : handleBack}
            disabled={isSubmitting}
          >
            {currentStep === 1 ? (
              "Cancel"
            ) : (
              <>
                <ChevronLeft className="h-4 w-4 mr-1" />
                Back
              </>
            )}
          </Button>

          <div className="flex items-center gap-3">
            <span className="text-xs text-muted-foreground">
              {currentStep} / {STEPS.length}
            </span>
            {isLastStep ? (
              <Button onClick={handleSubmit} disabled={isSubmitting} className="min-w-[140px]">
                {isSubmitting ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Creating...
                  </>
                ) : (
                  <>
                    <Check className="h-4 w-4 mr-2" />
                    Create Tenant
                  </>
                )}
              </Button>
            ) : (
              <Button onClick={handleNext} className="min-w-[120px]">
                Continue
                <ChevronRight className="h-4 w-4 ml-1" />
              </Button>
            )}
          </div>
        </div>

      </DialogContent>
    </Dialog>
  )
}
