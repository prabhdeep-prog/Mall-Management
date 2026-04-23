"use client"

import * as React from "react"
import { useParams, useRouter } from "next/navigation"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Skeleton } from "@/components/ui/skeleton"
import { Checkbox } from "@/components/ui/checkbox"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
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
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
  FormDescription,
} from "@/components/ui/form"
import {
  Building2,
  Users,
  Wrench,
  BarChart3,
  ArrowLeft,
  Edit,
  Phone,
  Mail,
  MapPin,
  Calendar,
  FileText,
  AlertCircle,
  CheckCircle,
  Clock,
  Loader2,
  RefreshCw,
  Plus,
  IndianRupee,
  Receipt,
  Shield,
  Star,
  User,
  Building,
  CreditCard,
  AlertTriangle,
  Eye,
  Landmark,
  FileCheck,
  Upload,
  CheckCircle2,
  XCircle,
  ExternalLink,
  Download,
  Wifi,
  WifiOff,
  Zap,
  Bell,
  Send,
  ShoppingCart,
  TrendingUp,
  Activity,
  ArrowUpRight,
  ArrowDownRight,
  FileSignature,
} from "lucide-react"
import Link from "next/link"
import { cn, formatCurrency } from "@/lib/utils"
import { useToast } from "@/components/ui/use-toast"
import { z } from "zod"
import { format, addDays } from "date-fns"

// ============ Types ============
interface Tenant {
  id: string
  businessName: string
  legalEntityName: string | null
  brandName: string | null
  category: string | null
  subcategory: string | null
  businessType: string | null
  contactPerson: string | null
  designation: string | null
  email: string | null
  phone: string | null
  alternatePhone: string | null
  authorizedSignatory: string | null
  signatoryPhone: string | null
  signatoryEmail: string | null
  gstin: string | null
  pan: string | null
  tan: string | null
  cin: string | null
  fssaiLicense: string | null
  tradeLicense: string | null
  shopEstablishmentNumber: string | null
  registeredAddress: string | null
  registeredCity: string | null
  registeredState: string | null
  registeredPincode: string | null
  bankName: string | null
  bankBranch: string | null
  accountNumber: string | null
  ifscCode: string | null
  accountHolderName: string | null
  emergencyContactName: string | null
  emergencyContactPhone: string | null
  website: string | null
  status: string | null
  sentimentScore: string | null
  riskScore: string | null
  satisfactionScore: string | null
  propertyId: string
  property: {
    id: string
    name: string
    code: string
    city: string | null
    state: string | null
    address: string | null
  } | null
  metadata: Record<string, unknown> | null
  createdAt: string
  updatedAt: string
}

interface LeaseTerms {
  lockInPeriod?: number | null
  fitOutPeriod?: number | null
  rentFreePeriod?: number | null
  terminationNoticeDays?: number | null
  maintenanceCharges?: number | string | null
}

interface Lease {
  id: string
  unitNumber: string
  floor: number | null
  zone: string | null
  areaSqft: string | null
  baseRent: string | null
  revenueSharePercentage: string | null
  maintenanceCharges: string | null
  camCharges: string | null
  securityDeposit: string | null
  startDate: string
  endDate: string
  status: string | null
  rentEscalationPercentage: string | null
  escalationRate: string | null
  escalationFrequency: string | null
  leaseType: string | null
  terms: LeaseTerms | null
  property: { id: string; name: string; code: string } | null
}

interface Invoice {
  id: string
  invoiceNumber: string
  billingMonth: string
  dueDate: string
  baseAmount: string | null
  taxAmount: string | null
  totalAmount: string | null
  status: string | null
  createdAt: string
}

interface WorkOrder {
  id: string
  workOrderNumber: string
  title: string
  description: string | null
  category: string | null
  priority: string | null
  status: string | null
  createdAt: string
  resolvedAt: string | null
}

interface TenantDetails extends Tenant {
  leases: Lease[]
  invoices: Invoice[]
  workOrders: WorkOrder[]
  activeLease: Lease | null
  financialSummary: {
    monthlyRent: number
    totalInvoiced: number
    totalPaid: number
    totalPending: number
    collectionRate: string
  }
  workOrderSummary: {
    total: number
    open: number
    resolved: number
  }
}

interface POSIntegration {
  id: string
  provider: string
  storeId: string | null
  locationId: string | null
  status: string | null
  syncFrequency: string | null
  lastSyncAt: string | null
  lastSyncStatus: string | null
  totalTransactionsSynced: number | null
  revenueSharePercentage: string | null
  createdAt: string
}

interface POSSale {
  id: string
  salesDate: string
  grossSales: string
  netSales: string
  refunds: string
  discounts: string
  transactionCount: number | null
  avgTransactionValue: string | null
  categoryBreakdown: Record<string, number> | null
  source: string | null
}

// ============ Constants ============
const categoryLabels: Record<string, string> = {
  fashion: "Fashion & Apparel",
  food_beverage: "Food & Beverage",
  electronics: "Electronics",
  entertainment: "Entertainment",
  services: "Services",
  health_beauty: "Health & Beauty",
  home_lifestyle: "Home & Lifestyle",
  jewelry: "Jewelry & Watches",
  sports: "Sports & Fitness",
  books_stationery: "Books & Stationery",
}

const businessTypeLabels: Record<string, string> = {
  sole_proprietorship: "Sole Proprietorship",
  partnership: "Partnership",
  llp: "Limited Liability Partnership (LLP)",
  pvt_ltd: "Private Limited",
  public_ltd: "Public Limited",
  opc: "One Person Company (OPC)",
}

const statusColors: Record<string, string> = {
  active: "bg-emerald-100 text-emerald-700",
  inactive: "bg-gray-100 text-gray-700",
  suspended: "bg-red-100 text-red-700",
  onboarding: "bg-blue-100 text-blue-700",
  pending: "bg-yellow-100 text-yellow-700",
  paid: "bg-emerald-100 text-emerald-700",
  overdue: "bg-red-100 text-red-700",
  open: "bg-blue-100 text-blue-700",
  in_progress: "bg-yellow-100 text-yellow-700",
  resolved: "bg-emerald-100 text-emerald-700",
  closed: "bg-gray-100 text-gray-700",
}

const indianStates = [
  "Andhra Pradesh", "Arunachal Pradesh", "Assam", "Bihar", "Chhattisgarh",
  "Goa", "Gujarat", "Haryana", "Himachal Pradesh", "Jharkhand", "Karnataka",
  "Kerala", "Madhya Pradesh", "Maharashtra", "Manipur", "Meghalaya", "Mizoram",
  "Nagaland", "Odisha", "Punjab", "Rajasthan", "Sikkim", "Tamil Nadu",
  "Telangana", "Tripura", "Uttar Pradesh", "Uttarakhand", "West Bengal",
  "Delhi", "Jammu & Kashmir", "Ladakh"
]

// ============ Validation Schemas ============
const editTenantSchema = z.object({
  // Basic Info
  businessName: z.string().min(2, "Required").max(100),
  legalEntityName: z.string().optional().or(z.literal("")),
  brandName: z.string().optional().or(z.literal("")),
  category: z.string().optional(),
  subcategory: z.string().optional().or(z.literal("")),
  businessType: z.string().optional(),
  status: z.string().optional(),
  
  // Primary Contact
  contactPerson: z.string().optional().or(z.literal("")),
  designation: z.string().optional().or(z.literal("")),
  email: z.string().email("Invalid email").optional().or(z.literal("")),
  phone: z.string().optional().or(z.literal("")),
  alternatePhone: z.string().optional().or(z.literal("")),
  
  // Authorized Signatory
  authorizedSignatory: z.string().optional().or(z.literal("")),
  signatoryPhone: z.string().optional().or(z.literal("")),
  signatoryEmail: z.string().email("Invalid email").optional().or(z.literal("")),
  
  // Tax & Compliance
  gstin: z.string().optional().or(z.literal("")),
  pan: z.string().optional().or(z.literal("")),
  tan: z.string().optional().or(z.literal("")),
  cin: z.string().optional().or(z.literal("")),
  fssaiLicense: z.string().optional().or(z.literal("")),
  tradeLicense: z.string().optional().or(z.literal("")),
  shopEstablishmentNumber: z.string().optional().or(z.literal("")),
  
  // Registered Address
  registeredAddress: z.string().optional().or(z.literal("")),
  registeredCity: z.string().optional().or(z.literal("")),
  registeredState: z.string().optional().or(z.literal("")),
  registeredPincode: z.string().optional().or(z.literal("")),
  
  // Banking
  bankName: z.string().optional().or(z.literal("")),
  bankBranch: z.string().optional().or(z.literal("")),
  accountNumber: z.string().optional().or(z.literal("")),
  ifscCode: z.string().optional().or(z.literal("")),
  accountHolderName: z.string().optional().or(z.literal("")),
  
  // Emergency
  emergencyContactName: z.string().optional().or(z.literal("")),
  emergencyContactPhone: z.string().optional().or(z.literal("")),
  
  // Other
  website: z.string().optional().or(z.literal("")),
})

// Lease creation now uses plain state (matching the lease module) to support
// all fields including POS integration. See leaseFormDefaults below.

type EditTenantFormData = z.infer<typeof editTenantSchema>

const leaseFormDefaults = {
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
  // POS Integration fields
  posProvider: "",
  posStoreId: "",
  posApiKey: "",
  posSyncFrequency: "daily",
}

// ============ KYC Document Status Component ============
function KYCDocumentStatus({ label, submitted, verified }: { label: string; submitted: boolean; verified: boolean }) {
  return (
    <div className="flex items-center justify-between p-3 border rounded-lg">
      <div className="flex items-center gap-2">
        <FileCheck className="h-4 w-4 text-muted-foreground" />
        <span className="text-sm font-medium">{label}</span>
      </div>
      <div className="flex items-center gap-2">
        {!submitted ? (
          <Badge variant="outline" className="text-gray-500">
            <XCircle className="h-3 w-3 mr-1" />
            Not Submitted
          </Badge>
        ) : verified ? (
          <Badge className="bg-emerald-100 text-emerald-700">
            <CheckCircle2 className="h-3 w-3 mr-1" />
            Verified
          </Badge>
        ) : (
          <Badge className="bg-yellow-100 text-yellow-700">
            <Clock className="h-3 w-3 mr-1" />
            Pending Verification
          </Badge>
        )}
      </div>
    </div>
  )
}

// ============ Loading Skeleton ============
function LoadingSkeleton() {
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Skeleton className="h-10 w-10 rounded-md" />
          <div>
            <Skeleton className="h-8 w-64 mb-2" />
            <Skeleton className="h-4 w-48" />
          </div>
        </div>
        <div className="flex gap-2">
          <Skeleton className="h-10 w-24" />
          <Skeleton className="h-10 w-24" />
        </div>
      </div>
      <div className="grid grid-cols-5 gap-4">
        {[1, 2, 3, 4, 5].map((i) => (
          <Skeleton key={i} className="h-24 rounded-lg" />
        ))}
      </div>
      <Skeleton className="h-[500px] w-full" />
    </div>
  )
}

// ============ Main Component ============
export default function TenantDetailsPage() {
  const params = useParams()
  const router = useRouter()
  const { toast } = useToast()
  
  // State
  const [tenant, setTenant] = React.useState<TenantDetails | null>(null)
  const [isLoading, setIsLoading] = React.useState(true)
  const [error, setError] = React.useState<string | null>(null)
  const [isRefreshing, setIsRefreshing] = React.useState(false)
  
  // Dialog states
  const [editDialogOpen, setEditDialogOpen] = React.useState(false)
  const [createLeaseDialogOpen, setCreateLeaseDialogOpen] = React.useState(false)
  const [viewLeaseDialogOpen, setViewLeaseDialogOpen] = React.useState(false)
  const [viewInvoiceDialogOpen, setViewInvoiceDialogOpen] = React.useState(false)
  const [viewWorkOrderDialogOpen, setViewWorkOrderDialogOpen] = React.useState(false)
  const [createInvoiceDialogOpen, setCreateInvoiceDialogOpen] = React.useState(false)
  const [createWorkOrderDialogOpen, setCreateWorkOrderDialogOpen] = React.useState(false)
  const [notifyDialogOpen, setNotifyDialogOpen] = React.useState(false)
  const [notifyForm, setNotifyForm] = React.useState({ type: "announcement", title: "", content: "" })
  const [notifySending, setNotifySending] = React.useState(false)
  
  // Selected items for view dialogs
  const [selectedLease, setSelectedLease] = React.useState<Lease | null>(null)
  const [selectedInvoice, setSelectedInvoice] = React.useState<Invoice | null>(null)
  const [selectedWorkOrder, setSelectedWorkOrder] = React.useState<WorkOrder | null>(null)
  
  const [isSubmitting, setIsSubmitting] = React.useState(false)
  const [editTab, setEditTab] = React.useState("basic")

  const tenantId = params.id as string

  // Forms
  const editForm = useForm<EditTenantFormData>({
    resolver: zodResolver(editTenantSchema),
    defaultValues: {
      businessName: "",
      legalEntityName: "",
      brandName: "",
      category: "",
      subcategory: "",
      businessType: "",
      status: "active",
      contactPerson: "",
      designation: "",
      email: "",
      phone: "",
      alternatePhone: "",
      authorizedSignatory: "",
      signatoryPhone: "",
      signatoryEmail: "",
      gstin: "",
      pan: "",
      tan: "",
      cin: "",
      fssaiLicense: "",
      tradeLicense: "",
      shopEstablishmentNumber: "",
      registeredAddress: "",
      registeredCity: "",
      registeredState: "",
      registeredPincode: "",
      bankName: "",
      bankBranch: "",
      accountNumber: "",
      ifscCode: "",
      accountHolderName: "",
      emergencyContactName: "",
      emergencyContactPhone: "",
      website: "",
    },
  })

  const [leaseForm, setLeaseForm] = React.useState({ ...leaseFormDefaults })
  const [posTestStatus, setPosTestStatus] = React.useState<"idle" | "testing" | "success" | "error">("idle")
  const [posTestMessage, setPosTestMessage] = React.useState("")
  const isRevShareLease = leaseForm.leaseType === "revenue_share" || leaseForm.leaseType === "hybrid" || leaseForm.leaseType === "minimum_guarantee"

  // POS Sales tab state
  const [posIntegration, setPosIntegration] = React.useState<POSIntegration | null>(null)
  const [posSales, setPosSales] = React.useState<POSSale[]>([])
  const [posLoading, setPosLoading] = React.useState(false)
  const [posLoaded, setPosLoaded] = React.useState(false)

  // Fetch tenant data
  const fetchTenantData = React.useCallback(async (showRefreshSpinner = false) => {
    if (!tenantId) return

    if (showRefreshSpinner) {
      setIsRefreshing(true)
    } else {
      setIsLoading(true)
    }
    setError(null)

    try {
      const response = await fetch(`/api/tenants/${tenantId}`)
      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.error || "Failed to fetch tenant")
      }

      setTenant(data.data)
    } catch (error) {
      console.error("Error fetching tenant:", error)
      setError(error instanceof Error ? error.message : "Failed to load tenant")
    } finally {
      setIsLoading(false)
      setIsRefreshing(false)
    }
  }, [tenantId])

  React.useEffect(() => {
    fetchTenantData()
  }, [fetchTenantData])

  // Fetch POS data for this tenant
  const fetchPOSData = React.useCallback(async () => {
    if (!tenantId || posLoaded) return
    setPosLoading(true)
    try {
      // Fetch integration
      const [intRes, salesRes] = await Promise.all([
        fetch(`/api/pos/connect?tenantId=${tenantId}`),
        fetch(`/api/pos/sales?tenantId=${tenantId}`),
      ])
      if (intRes.ok) {
        const intJson = await intRes.json()
        const intList = intJson.data || intJson
        setPosIntegration(Array.isArray(intList) ? intList[0] || null : intList || null)
      }
      if (salesRes.ok) {
        const salesJson = await salesRes.json()
        setPosSales(salesJson.data || [])
      }
      setPosLoaded(true)
    } catch (e) {
      console.error("POS data fetch error:", e)
    } finally {
      setPosLoading(false)
    }
  }, [tenantId, posLoaded])

  // Open edit dialog and populate form
  const handleEditTenant = () => {
    if (tenant) {
      editForm.reset({
        businessName: tenant.businessName || "",
        legalEntityName: tenant.legalEntityName || "",
        brandName: tenant.brandName || "",
        category: tenant.category || "",
        subcategory: tenant.subcategory || "",
        businessType: tenant.businessType || "",
        status: tenant.status || "active",
        contactPerson: tenant.contactPerson || "",
        designation: tenant.designation || "",
        email: tenant.email || "",
        phone: tenant.phone || "",
        alternatePhone: tenant.alternatePhone || "",
        authorizedSignatory: tenant.authorizedSignatory || "",
        signatoryPhone: tenant.signatoryPhone || "",
        signatoryEmail: tenant.signatoryEmail || "",
        gstin: tenant.gstin || "",
        pan: tenant.pan || "",
        tan: tenant.tan || "",
        cin: tenant.cin || "",
        fssaiLicense: tenant.fssaiLicense || "",
        tradeLicense: tenant.tradeLicense || "",
        shopEstablishmentNumber: tenant.shopEstablishmentNumber || "",
        registeredAddress: tenant.registeredAddress || "",
        registeredCity: tenant.registeredCity || "",
        registeredState: tenant.registeredState || "",
        registeredPincode: tenant.registeredPincode || "",
        bankName: tenant.bankName || "",
        bankBranch: tenant.bankBranch || "",
        accountNumber: tenant.accountNumber || "",
        ifscCode: tenant.ifscCode || "",
        accountHolderName: tenant.accountHolderName || "",
        emergencyContactName: tenant.emergencyContactName || "",
        emergencyContactPhone: tenant.emergencyContactPhone || "",
        website: tenant.website || "",
      })
      setEditTab("basic")
      setEditDialogOpen(true)
    }
  }

  // Update tenant
  const handleUpdateTenant = async (data: EditTenantFormData) => {
    setIsSubmitting(true)
    try {
      const response = await fetch(`/api/tenants/${tenantId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      })

      if (!response.ok) {
        const errorData = await response.json()
        throw new Error(errorData.error || "Failed to update tenant")
      }

      toast({ title: "Success", description: "Tenant updated successfully" })
      setEditDialogOpen(false)
      fetchTenantData(true)
    } catch (error) {
      console.error("Error updating tenant:", error)
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "Failed to update tenant",
        variant: "destructive",
      })
    } finally {
      setIsSubmitting(false)
    }
  }

  // Test POS connection
  const handleTestPOSConnection = async () => {
    if (!leaseForm.posProvider || !leaseForm.posStoreId || !leaseForm.posApiKey) {
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
        body: JSON.stringify({
          provider: leaseForm.posProvider,
          storeId: leaseForm.posStoreId,
          apiKey: leaseForm.posApiKey,
        }),
      })
      const result = await res.json()
      if (result.success) {
        setPosTestStatus("success")
        setPosTestMessage(result.data.message || "Connection successful!")
      } else {
        setPosTestStatus("error")
        setPosTestMessage(result.error || "Connection failed")
      }
    } catch {
      setPosTestStatus("error")
      setPosTestMessage("Failed to test connection")
    }
  }

  // Create lease
  const handleCreateLease = async (e: React.FormEvent) => {
    e.preventDefault()
    if (isSubmitting) return // Prevent double submission
    if (!leaseForm.unitNumber || !leaseForm.areaSqft || !leaseForm.startDate || !leaseForm.endDate) {
      toast({ title: "Error", description: "Please fill in all required fields (unit, area, dates)", variant: "destructive" })
      return
    }
    setIsSubmitting(true)
    try {
      const response = await fetch("/api/leases", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...leaseForm,
          tenantId: tenantId,
          propertyId: tenant?.propertyId,
          status: "active",
          areaSqft: parseFloat(leaseForm.areaSqft),
          baseRent: leaseForm.baseRent ? parseFloat(leaseForm.baseRent) : null,
          revenueSharePercentage: leaseForm.revenueSharePercentage ? parseFloat(leaseForm.revenueSharePercentage) : null,
          camCharges: leaseForm.camCharges ? parseFloat(leaseForm.camCharges) : null,
          securityDeposit: leaseForm.securityDeposit ? parseFloat(leaseForm.securityDeposit) : null,
          escalationRate: leaseForm.escalationRate ? parseFloat(leaseForm.escalationRate) : null,
          escalationFrequency: leaseForm.escalationFrequency ? parseInt(leaseForm.escalationFrequency) : null,
          lockInPeriod: leaseForm.lockInPeriod ? parseInt(leaseForm.lockInPeriod) : null,
          terminationNoticeDays: leaseForm.terminationNoticeDays ? parseInt(leaseForm.terminationNoticeDays) : null,
          fitOutPeriod: leaseForm.fitOutPeriod ? parseInt(leaseForm.fitOutPeriod) : null,
          rentFreePeriod: leaseForm.rentFreePeriod ? parseInt(leaseForm.rentFreePeriod) : null,
        }),
      })

      if (!response.ok) {
        const errorData = await response.json()
        throw new Error(errorData.error || "Failed to create lease")
      }

      toast({ title: "Success", description: "Lease created successfully" })
      setCreateLeaseDialogOpen(false)
      setPosTestStatus("idle")
      setPosTestMessage("")
      setLeaseForm({ ...leaseFormDefaults })
      fetchTenantData(true)
    } catch (error) {
      console.error("Error creating lease:", error)
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "Failed to create lease",
        variant: "destructive",
      })
    } finally {
      setIsSubmitting(false)
    }
  }

  // View handlers
  const handleViewLease = (lease: Lease) => {
    setSelectedLease(lease)
    setViewLeaseDialogOpen(true)
  }

  const handleViewInvoice = (invoice: Invoice) => {
    setSelectedInvoice(invoice)
    setViewInvoiceDialogOpen(true)
  }

  const handleViewWorkOrder = (wo: WorkOrder) => {
    setSelectedWorkOrder(wo)
    setViewWorkOrderDialogOpen(true)
  }

  // Generate full lease document in new tab
  const handleGenerateLeaseDocument = (lease: Lease | null) => {
    if (!lease || !tenant) return
    
    // Import the lease document generator dynamically
    import("@/lib/documents/lease-agreement").then(({ openLeaseDocument }) => {
      openLeaseDocument({
        lease: {
          ...lease,
          terms: lease.terms || null
        },
        tenant: {
          businessName: tenant.businessName,
          legalEntityName: tenant.legalEntityName,
          contactPerson: tenant.contactPerson,
          email: tenant.email,
          phone: tenant.phone,
          gstin: tenant.gstin,
          pan: tenant.pan,
          registeredAddress: tenant.registeredAddress,
          registeredCity: tenant.registeredCity,
          registeredState: tenant.registeredState,
          registeredPincode: tenant.registeredPincode,
        },
        property: {
          name: tenant.property?.name || "Property",
          address: tenant.property?.address || null,
          city: tenant.property?.city || null,
          state: tenant.property?.state || null,
        }
      })
      
      toast({ 
        title: "Lease Document Generated", 
        description: "A printable lease agreement has been opened in a new tab. Use Ctrl+P to print or save as PDF." 
      })
    })
  }
  
  // Quick download lease summary as text
  const handleDownloadLeaseSummary = (lease: Lease | null) => {
    if (!lease || !tenant) return
    
    const leaseContent = `
LEASE AGREEMENT SUMMARY
========================

TENANT: ${tenant.businessName}
LEGAL ENTITY: ${tenant.legalEntityName || tenant.businessName}
PROPERTY: ${tenant.property?.name || "N/A"}

UNIT DETAILS
------------
Unit Number: ${lease.unitNumber}
Floor: ${lease.floor ?? "Ground"}
Area: ${lease.areaSqft ? `${parseFloat(lease.areaSqft).toLocaleString()} sq.ft` : "N/A"}

FINANCIAL TERMS
---------------
Monthly Base Rent: ₹${parseFloat(lease.baseRent || "0").toLocaleString("en-IN")}
Maintenance Charges: ₹${parseFloat(lease.maintenanceCharges || lease.camCharges || String(lease.terms?.maintenanceCharges || 0)).toLocaleString("en-IN")}
Security Deposit: ₹${parseFloat(lease.securityDeposit || "0").toLocaleString("en-IN")}

DURATION
--------
Start Date: ${format(new Date(lease.startDate), "dd MMM yyyy")}
End Date: ${format(new Date(lease.endDate), "dd MMM yyyy")}
Escalation: ${lease.escalationRate ? `${lease.escalationRate}% per annum` : "As per agreement"}

TERMS
-----
Lock-in Period: ${lease.terms?.lockInPeriod || 12} months
Fit-out Period: ${lease.terms?.fitOutPeriod || 0} days
Rent-free Period: ${lease.terms?.rentFreePeriod || 0} days
Notice Period: ${lease.terms?.terminationNoticeDays || 90} days

Status: ${(lease.status || "active").toUpperCase()}

---
This is a summary document. For the full lease agreement, use "Generate Full Document".
Generated on: ${format(new Date(), "dd MMM yyyy HH:mm")}
    `.trim()

    const blob = new Blob([leaseContent], { type: "text/plain" })
    const url = URL.createObjectURL(blob)
    const a = document.createElement("a")
    a.href = url
    a.download = `Lease_Summary_${lease.unitNumber}_${tenant.businessName.replace(/\s+/g, "_")}.txt`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
    
    toast({ title: "Downloaded", description: "Lease summary downloaded successfully" })
  }

  // Download invoice as PDF
  const handleDownloadInvoice = (invoice: Invoice | null) => {
    if (!invoice || !tenant) return
    
    const invoiceContent = `
INVOICE
=======

Invoice Number: ${invoice.invoiceNumber}
Billing Month: ${invoice.billingMonth}
Due Date: ${format(new Date(invoice.dueDate), "dd MMM yyyy")}
Status: ${invoice.status || "pending"}

BILL TO
-------
${tenant.businessName}
${tenant.legalEntityName || ""}
GSTIN: ${tenant.gstin || "N/A"}

DETAILS
-------
Base Amount: ₹${parseFloat(invoice.baseAmount || "0").toLocaleString("en-IN")}
Tax Amount: ₹${parseFloat(invoice.taxAmount || "0").toLocaleString("en-IN")}
----------------------------------------
TOTAL: ₹${parseFloat(invoice.totalAmount || "0").toLocaleString("en-IN")}

---
Generated on: ${format(new Date(), "dd MMM yyyy HH:mm")}
    `.trim()

    const blob = new Blob([invoiceContent], { type: "text/plain" })
    const url = URL.createObjectURL(blob)
    const a = document.createElement("a")
    a.href = url
    a.download = `Invoice_${invoice.invoiceNumber}.txt`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
    
    toast({ title: "Downloaded", description: "Invoice downloaded successfully" })
  }

  // KYC Document upload handler
  const [uploadingKyc, setUploadingKyc] = React.useState(false)
  const [uploadedFiles, setUploadedFiles] = React.useState<Array<{name: string; size: number; type: string}>>([])
  
  const handleKycUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files
    if (!files || files.length === 0) return
    
    setUploadingKyc(true)
    
    // Simulate upload - in production, this would upload to Vercel Blob or similar
    const newFiles = Array.from(files).map(file => ({
      name: file.name,
      size: file.size,
      type: file.type,
    }))
    
    // Simulate upload delay
    await new Promise(resolve => setTimeout(resolve, 1500))
    
    setUploadedFiles(prev => [...prev, ...newFiles])
    setUploadingKyc(false)
    
    toast({
      title: "Files Uploaded",
      description: `${files.length} file(s) uploaded successfully. Pending verification.`,
    })
    
    // Reset the input
    event.target.value = ""
  }

  // Create Invoice handler
  const [invoiceForm, setInvoiceForm] = React.useState({
    billingMonth: format(new Date(), "MMMM yyyy"),
    dueDate: format(addDays(new Date(), 15), "yyyy-MM-dd"),
    description: "Monthly rent and maintenance charges",
  })

  const handleCreateInvoice = async () => {
    if (!tenant || !tenant.activeLease) {
      toast({ title: "Error", description: "No active lease found", variant: "destructive" })
      return
    }
    
    setIsSubmitting(true)
    try {
      const baseAmount = parseFloat(tenant.activeLease.baseRent || "0")
      const maintenance = parseFloat(
        tenant.activeLease.maintenanceCharges || 
        tenant.activeLease.camCharges || 
        String((tenant.activeLease.terms as LeaseTerms)?.maintenanceCharges || 0)
      )
      const taxRate = 0.18 // 18% GST
      const taxAmount = baseAmount * taxRate
      const totalAmount = baseAmount + maintenance + taxAmount

      const response = await fetch("/api/invoices", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          leaseId: tenant.activeLease.id,
          tenantId: tenantId,
          propertyId: tenant.propertyId,
          invoiceNumber: `INV-${Date.now().toString(36).toUpperCase()}`,
          billingMonth: invoiceForm.billingMonth,
          dueDate: invoiceForm.dueDate,
          baseAmount: baseAmount.toString(),
          taxAmount: taxAmount.toString(),
          totalAmount: totalAmount.toString(),
          description: invoiceForm.description,
          status: "pending",
        }),
      })

      if (!response.ok) {
        const errorData = await response.json()
        throw new Error(errorData.error || "Failed to create invoice")
      }

      toast({ title: "Success", description: "Invoice created successfully" })
      setCreateInvoiceDialogOpen(false)
      fetchTenantData(true)
    } catch (error) {
      console.error("Error creating invoice:", error)
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "Failed to create invoice",
        variant: "destructive",
      })
    } finally {
      setIsSubmitting(false)
    }
  }

  // Create Work Order handler
  const [workOrderForm, setWorkOrderForm] = React.useState({
    title: "",
    description: "",
    category: "maintenance",
    priority: "medium",
  })

  const handleCreateWorkOrder = async () => {
    if (!tenant) {
      toast({ title: "Error", description: "Tenant not loaded", variant: "destructive" })
      return
    }
    if (!workOrderForm.title) {
      toast({ title: "Error", description: "Title is required", variant: "destructive" })
      return
    }
    
    setIsSubmitting(true)
    try {
      const response = await fetch("/api/work-orders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tenantId: tenantId,
          propertyId: tenant.propertyId,
          workOrderNumber: `WO-${Date.now().toString(36).toUpperCase()}`,
          title: workOrderForm.title,
          description: workOrderForm.description,
          category: workOrderForm.category,
          priority: workOrderForm.priority,
          status: "open",
        }),
      })

      if (!response.ok) {
        const errorData = await response.json()
        throw new Error(errorData.error || "Failed to create work order")
      }

      toast({ title: "Success", description: "Work order created successfully" })
      setCreateWorkOrderDialogOpen(false)
      setWorkOrderForm({ title: "", description: "", category: "maintenance", priority: "medium" })
      fetchTenantData(true)
    } catch (error) {
      console.error("Error creating work order:", error)
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "Failed to create work order",
        variant: "destructive",
      })
    } finally {
      setIsSubmitting(false)
    }
  }

  if (isLoading) {
    return (
      <div className="container mx-auto p-6">
        <LoadingSkeleton />
      </div>
    )
  }

  if (error || !tenant) {
    return (
      <div className="container mx-auto p-6">
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12">
            <AlertCircle className="h-12 w-12 text-red-500 mb-4" />
            <h3 className="text-lg font-semibold mb-2">Error Loading Tenant</h3>
            <p className="text-muted-foreground mb-4">{error || "Tenant not found"}</p>
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => router.push("/tenants")}>
                <ArrowLeft className="h-4 w-4 mr-2" /> Back to Tenants
              </Button>
              <Button onClick={() => fetchTenantData()}>
                <RefreshCw className="h-4 w-4 mr-2" /> Retry
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    )
  }

  const riskScore = parseFloat(tenant.riskScore || "0")
  const sentimentScore = parseFloat(tenant.sentimentScore || "0")
  const satisfactionScore = parseFloat(tenant.satisfactionScore || "0")

  // Calculate KYC completion
  const kycDocs = {
    pan: { submitted: !!tenant.pan, verified: !!tenant.pan },
    gstin: { submitted: !!tenant.gstin, verified: !!tenant.gstin },
    tradeLicense: { submitted: !!tenant.tradeLicense, verified: !!tenant.tradeLicense },
    bankDetails: { submitted: !!(tenant.accountNumber && tenant.ifscCode), verified: !!(tenant.accountNumber && tenant.ifscCode) },
    address: { submitted: !!tenant.registeredAddress, verified: !!tenant.registeredAddress },
  }
  const kycCompleted = Object.values(kycDocs).filter(d => d.verified).length
  const kycTotal = Object.values(kycDocs).length
  const kycPercentage = Math.round((kycCompleted / kycTotal) * 100)

  return (
    <div className="container mx-auto p-6 space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" onClick={() => router.push("/tenants")}>
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-2xl font-bold">{tenant.businessName}</h1>
              <Badge className={cn(statusColors[tenant.status || "active"])}>
                {tenant.status || "active"}
              </Badge>
              {tenant.category && (
                <Badge variant="outline">
                  {categoryLabels[tenant.category] || tenant.category}
                </Badge>
              )}
            </div>
            <div className="flex items-center gap-4 text-muted-foreground mt-1">
              {tenant.property && (
                <span className="flex items-center gap-1">
                  <Building2 className="h-4 w-4" />
                  {tenant.property.name}
                </span>
              )}
              {tenant.activeLease && (
                <span className="flex items-center gap-1">
                  <MapPin className="h-4 w-4" />
                  Unit {tenant.activeLease.unitNumber}, Floor {tenant.activeLease.floor ?? "G"}
                </span>
              )}
            </div>
          </div>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => fetchTenantData(true)} disabled={isRefreshing}>
            <RefreshCw className={cn("h-4 w-4 mr-2", isRefreshing && "animate-spin")} />
            Refresh
          </Button>
          <Button
            variant="outline"
            onClick={() => window.open(`/tenant/dashboard`, "_blank")}
          >
            <ExternalLink className="h-4 w-4 mr-2" />
            View Portal
          </Button>
          <Button
            variant="outline"
            onClick={() => setNotifyDialogOpen(true)}
          >
            <Bell className="h-4 w-4 mr-2" />
            Notify
          </Button>
          <Button onClick={handleEditTenant} className="bg-blue-600 hover:bg-blue-700">
            <Edit className="h-4 w-4 mr-2" />
            Edit Tenant
          </Button>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        <Card className="bg-gradient-to-br from-emerald-50 to-white border-emerald-100">
          <CardContent className="pt-4">
            <div className="flex items-center gap-2 text-sm text-muted-foreground mb-1">
              <IndianRupee className="h-4 w-4 text-emerald-600" />
              Monthly Rent
            </div>
            <div className="text-xl font-bold text-emerald-700">
              {formatCurrency(tenant.financialSummary.monthlyRent)}
            </div>
          </CardContent>
        </Card>

        <Card className="bg-gradient-to-br from-blue-50 to-white border-blue-100">
          <CardContent className="pt-4">
            <div className="flex items-center gap-2 text-sm text-muted-foreground mb-1">
              <Receipt className="h-4 w-4 text-blue-600" />
              Collection Rate
            </div>
            <div className="text-xl font-bold text-blue-700">
              {tenant.financialSummary.collectionRate}%
            </div>
          </CardContent>
        </Card>

        <Card className="bg-gradient-to-br from-amber-50 to-white border-amber-100">
          <CardContent className="pt-4">
            <div className="flex items-center gap-2 text-sm text-muted-foreground mb-1">
              <AlertCircle className="h-4 w-4 text-amber-600" />
              Pending
            </div>
            <div className="text-xl font-bold text-amber-700">
              {formatCurrency(tenant.financialSummary.totalPending)}
            </div>
          </CardContent>
        </Card>

        <Card className="bg-gradient-to-br from-purple-50 to-white border-purple-100">
          <CardContent className="pt-4">
            <div className="flex items-center gap-2 text-sm text-muted-foreground mb-1">
              <Wrench className="h-4 w-4 text-purple-600" />
              Work Orders
            </div>
            <div className="text-xl font-bold text-purple-700">
              {tenant.workOrderSummary.open} open
            </div>
          </CardContent>
        </Card>

        <Card className="bg-gradient-to-br from-pink-50 to-white border-pink-100">
          <CardContent className="pt-4">
            <div className="flex items-center gap-2 text-sm text-muted-foreground mb-1">
              <FileCheck className="h-4 w-4 text-pink-600" />
              KYC Status
            </div>
            <div className="text-xl font-bold text-pink-700">
              {kycPercentage}% Complete
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Tabs */}
      <Tabs defaultValue="overview" className="space-y-4">
        <TabsList>
          <TabsTrigger value="overview" className="gap-2">
            <User className="h-4 w-4" /> Overview
          </TabsTrigger>
          <TabsTrigger value="kyc" className="gap-2">
            <FileCheck className="h-4 w-4" /> KYC & Documents
          </TabsTrigger>
          <TabsTrigger value="lease" className="gap-2">
            <FileText className="h-4 w-4" /> Lease ({tenant.leases.length})
          </TabsTrigger>
          <TabsTrigger value="financials" className="gap-2">
            <IndianRupee className="h-4 w-4" /> Financials ({tenant.invoices.length})
          </TabsTrigger>
          <TabsTrigger value="workorders" className="gap-2">
            <Wrench className="h-4 w-4" /> Work Orders ({tenant.workOrders.length})
          </TabsTrigger>
          <TabsTrigger value="analytics" className="gap-2">
            <BarChart3 className="h-4 w-4" /> Analytics
          </TabsTrigger>
          <TabsTrigger value="pos" className="gap-2" onClick={fetchPOSData}>
            <ShoppingCart className="h-4 w-4" /> Sales & POS
          </TabsTrigger>
        </TabsList>

        {/* Overview Tab */}
        <TabsContent value="overview">
          <div className="grid md:grid-cols-2 gap-6">
            {/* Contact Information */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <User className="h-5 w-5" /> Contact Information
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <div className="text-sm text-muted-foreground">Contact Person</div>
                    <div className="font-medium">{tenant.contactPerson || "—"}</div>
                    {tenant.designation && <div className="text-xs text-muted-foreground">{tenant.designation}</div>}
                  </div>
                  <div>
                    <div className="text-sm text-muted-foreground">Phone</div>
                    <div className="font-medium">
                      {tenant.phone ? (
                        <a href={`tel:${tenant.phone}`} className="text-blue-600 hover:underline flex items-center gap-1">
                          <Phone className="h-3 w-3" /> {tenant.phone}
                        </a>
                      ) : "—"}
                    </div>
                  </div>
                  <div>
                    <div className="text-sm text-muted-foreground">Email</div>
                    <div className="font-medium">
                      {tenant.email ? (
                        <a href={`mailto:${tenant.email}`} className="text-blue-600 hover:underline flex items-center gap-1">
                          <Mail className="h-3 w-3" /> {tenant.email}
                        </a>
                      ) : "—"}
                    </div>
                  </div>
                  <div>
                    <div className="text-sm text-muted-foreground">Alternate Phone</div>
                    <div className="font-medium">{tenant.alternatePhone || "—"}</div>
                  </div>
                </div>
                <hr />
                <div className="text-sm font-medium text-muted-foreground">Authorized Signatory</div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <div className="text-sm text-muted-foreground">Name</div>
                    <div className="font-medium">{tenant.authorizedSignatory || "—"}</div>
                  </div>
                  <div>
                    <div className="text-sm text-muted-foreground">Phone</div>
                    <div className="font-medium">{tenant.signatoryPhone || "—"}</div>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Business Information */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Building className="h-5 w-5" /> Business Information
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <div className="text-sm text-muted-foreground">Legal Entity</div>
                    <div className="font-medium">{tenant.legalEntityName || tenant.businessName}</div>
                  </div>
                  <div>
                    <div className="text-sm text-muted-foreground">Business Type</div>
                    <div className="font-medium">{tenant.businessType ? businessTypeLabels[tenant.businessType] || tenant.businessType : "—"}</div>
                  </div>
                  <div>
                    <div className="text-sm text-muted-foreground">Category</div>
                    <div className="font-medium">{tenant.category ? categoryLabels[tenant.category] || tenant.category : "—"}</div>
                  </div>
                  <div>
                    <div className="text-sm text-muted-foreground">Brand Name</div>
                    <div className="font-medium">{tenant.brandName || "—"}</div>
                  </div>
                  <div>
                    <div className="text-sm text-muted-foreground">Website</div>
                    <div className="font-medium">
                      {tenant.website ? (
                        <a href={tenant.website} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline flex items-center gap-1">
                          <ExternalLink className="h-3 w-3" /> Visit
                        </a>
                      ) : "—"}
                    </div>
                  </div>
                  <div>
                    <div className="text-sm text-muted-foreground">Tenant Since</div>
                    <div className="font-medium">{format(new Date(tenant.createdAt), "dd MMM yyyy")}</div>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Tax & Compliance */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Shield className="h-5 w-5" /> Tax & Compliance
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <div className="text-sm text-muted-foreground">GSTIN</div>
                    <div className="font-mono text-sm font-medium">{tenant.gstin || "—"}</div>
                  </div>
                  <div>
                    <div className="text-sm text-muted-foreground">PAN</div>
                    <div className="font-mono text-sm font-medium">{tenant.pan || "—"}</div>
                  </div>
                  <div>
                    <div className="text-sm text-muted-foreground">TAN</div>
                    <div className="font-mono text-sm font-medium">{tenant.tan || "—"}</div>
                  </div>
                  <div>
                    <div className="text-sm text-muted-foreground">CIN</div>
                    <div className="font-mono text-sm font-medium">{tenant.cin || "—"}</div>
                  </div>
                  <div>
                    <div className="text-sm text-muted-foreground">Trade License</div>
                    <div className="font-medium">{tenant.tradeLicense || "—"}</div>
                  </div>
                  <div>
                    <div className="text-sm text-muted-foreground">FSSAI License</div>
                    <div className="font-medium">{tenant.fssaiLicense || "—"}</div>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Banking Details */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Landmark className="h-5 w-5" /> Banking Details
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <div className="text-sm text-muted-foreground">Bank Name</div>
                    <div className="font-medium">{tenant.bankName || "—"}</div>
                  </div>
                  <div>
                    <div className="text-sm text-muted-foreground">Branch</div>
                    <div className="font-medium">{tenant.bankBranch || "—"}</div>
                  </div>
                  <div>
                    <div className="text-sm text-muted-foreground">Account Number</div>
                    <div className="font-mono text-sm font-medium">{tenant.accountNumber || "—"}</div>
                  </div>
                  <div>
                    <div className="text-sm text-muted-foreground">IFSC Code</div>
                    <div className="font-mono text-sm font-medium">{tenant.ifscCode || "—"}</div>
                  </div>
                  <div className="col-span-2">
                    <div className="text-sm text-muted-foreground">Account Holder Name</div>
                    <div className="font-medium">{tenant.accountHolderName || "—"}</div>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* KYC & Documents Tab */}
        <TabsContent value="kyc">
          <div className="grid md:grid-cols-2 gap-6">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <FileCheck className="h-5 w-5" /> KYC Status
                </CardTitle>
                <CardDescription>
                  {kycCompleted} of {kycTotal} documents verified ({kycPercentage}% complete)
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                <KYCDocumentStatus label="PAN Card" submitted={kycDocs.pan.submitted} verified={kycDocs.pan.verified} />
                <KYCDocumentStatus label="GST Certificate" submitted={kycDocs.gstin.submitted} verified={kycDocs.gstin.verified} />
                <KYCDocumentStatus label="Trade License" submitted={kycDocs.tradeLicense.submitted} verified={kycDocs.tradeLicense.verified} />
                <KYCDocumentStatus label="Bank Account Details" submitted={kycDocs.bankDetails.submitted} verified={kycDocs.bankDetails.verified} />
                <KYCDocumentStatus label="Registered Address Proof" submitted={kycDocs.address.submitted} verified={kycDocs.address.verified} />
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Upload className="h-5 w-5" /> Upload Documents
                </CardTitle>
                <CardDescription>
                  Upload required documents for KYC verification
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                {/* Upload Area */}
                <div className="border-2 border-dashed rounded-lg p-6 text-center hover:border-primary/50 transition-colors">
                  <input
                    type="file"
                    id="kyc-upload"
                    multiple
                    accept=".pdf,.jpg,.jpeg,.png"
                    onChange={handleKycUpload}
                    className="hidden"
                  />
                  <label htmlFor="kyc-upload" className="cursor-pointer">
                    {uploadingKyc ? (
                      <Loader2 className="h-10 w-10 text-primary mx-auto mb-3 animate-spin" />
                    ) : (
                      <Upload className="h-10 w-10 text-muted-foreground mx-auto mb-3" />
                    )}
                    <p className="text-muted-foreground mb-1">
                      {uploadingKyc ? "Uploading..." : "Click to upload or drag & drop"}
                    </p>
                    <p className="text-xs text-muted-foreground">PDF, JPG, PNG (max 5MB each)</p>
                  </label>
                </div>

                {/* Uploaded Files List */}
                {uploadedFiles.length > 0 && (
                  <div className="space-y-2">
                    <h4 className="text-sm font-medium">Uploaded Files ({uploadedFiles.length})</h4>
                    <div className="space-y-2">
                      {uploadedFiles.map((file, index) => (
                        <div key={index} className="flex items-center justify-between p-2 bg-muted/30 rounded-lg">
                          <div className="flex items-center gap-2">
                            <FileCheck className="h-4 w-4 text-emerald-500" />
                            <span className="text-sm font-medium">{file.name}</span>
                            <span className="text-xs text-muted-foreground">
                              ({(file.size / 1024).toFixed(1)} KB)
                            </span>
                          </div>
                          <Badge variant="outline" className="text-amber-600 border-amber-300">
                            Pending Verification
                          </Badge>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Required Documents */}
                <div className="text-xs text-muted-foreground">
                  <p className="font-medium mb-1">Required documents:</p>
                  <ul className="list-disc list-inside space-y-0.5">
                    <li>PAN Card copy</li>
                    <li>GST Registration Certificate</li>
                    <li>Trade License</li>
                    <li>Cancelled Cheque / Bank Statement</li>
                    <li>Address Proof</li>
                  </ul>
                </div>
              </CardContent>
            </Card>

            <Card className="md:col-span-2">
              <CardHeader>
                <CardTitle>Registered Address</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid md:grid-cols-4 gap-4">
                  <div className="md:col-span-2">
                    <div className="text-sm text-muted-foreground">Address</div>
                    <div className="font-medium">{tenant.registeredAddress || "—"}</div>
                  </div>
                  <div>
                    <div className="text-sm text-muted-foreground">City</div>
                    <div className="font-medium">{tenant.registeredCity || "—"}</div>
                  </div>
                  <div>
                    <div className="text-sm text-muted-foreground">State</div>
                    <div className="font-medium">{tenant.registeredState || "—"}</div>
                  </div>
                  <div>
                    <div className="text-sm text-muted-foreground">PIN Code</div>
                    <div className="font-medium">{tenant.registeredPincode || "—"}</div>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* Lease Tab */}
        <TabsContent value="lease">
          <div className="space-y-4">
            {/* Active Lease Summary Card */}
            {tenant.activeLease && (
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <Card className="bg-gradient-to-br from-emerald-50 to-white border-emerald-100">
                  <CardContent className="pt-4">
                    <p className="text-xs text-muted-foreground flex items-center gap-1 mb-1"><MapPin className="h-3 w-3" /> Unit / Floor</p>
                    <p className="text-lg font-bold text-emerald-700">
                      {tenant.activeLease.unitNumber}
                      {tenant.activeLease.floor != null && ` · Flr ${tenant.activeLease.floor}`}
                      {tenant.activeLease.zone && ` · ${tenant.activeLease.zone}`}
                    </p>
                  </CardContent>
                </Card>
                <Card className="bg-gradient-to-br from-blue-50 to-white border-blue-100">
                  <CardContent className="pt-4">
                    <p className="text-xs text-muted-foreground flex items-center gap-1 mb-1"><IndianRupee className="h-3 w-3" /> Monthly Rent</p>
                    <p className="text-lg font-bold text-blue-700">{formatCurrency(parseFloat(tenant.activeLease.baseRent || "0"))}</p>
                    {tenant.activeLease.revenueSharePercentage && (
                      <p className="text-xs text-muted-foreground mt-0.5">+ {tenant.activeLease.revenueSharePercentage}% rev-share</p>
                    )}
                  </CardContent>
                </Card>
                <Card className="bg-gradient-to-br from-purple-50 to-white border-purple-100">
                  <CardContent className="pt-4">
                    <p className="text-xs text-muted-foreground flex items-center gap-1 mb-1"><Calendar className="h-3 w-3" /> Lease Period</p>
                    <p className="text-sm font-semibold text-purple-700">
                      {format(new Date(tenant.activeLease.startDate), "dd MMM yy")} –<br />
                      {format(new Date(tenant.activeLease.endDate), "dd MMM yy")}
                    </p>
                  </CardContent>
                </Card>
                <Card className="bg-gradient-to-br from-amber-50 to-white border-amber-100">
                  <CardContent className="pt-4">
                    <p className="text-xs text-muted-foreground flex items-center gap-1 mb-1"><FileSignature className="h-3 w-3" /> Lease Type</p>
                    <p className="text-sm font-semibold text-amber-700 capitalize">
                      {(tenant.activeLease.leaseType || "fixed_rent").replace(/_/g, " ")}
                    </p>
                    {(tenant.activeLease.rentEscalationPercentage || tenant.activeLease.escalationRate) && (
                      <p className="text-xs text-muted-foreground mt-0.5">
                        {tenant.activeLease.rentEscalationPercentage || tenant.activeLease.escalationRate}% escalation
                      </p>
                    )}
                  </CardContent>
                </Card>
              </div>
            )}

            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <CardTitle>Lease Agreements</CardTitle>
                  <Button className="gap-2 bg-emerald-500 hover:bg-emerald-600" onClick={() => setCreateLeaseDialogOpen(true)}>
                    <Plus className="h-4 w-4" /> Create Lease
                  </Button>
                </div>
              </CardHeader>
              <CardContent>
                {tenant.leases.length === 0 ? (
                  <div className="text-center py-12">
                    <FileText className="h-12 w-12 text-muted-foreground/50 mx-auto mb-4" />
                    <h3 className="text-lg font-semibold">No Leases Yet</h3>
                    <p className="text-muted-foreground mb-4">Create a lease agreement for this tenant.</p>
                    <Button className="gap-2 bg-emerald-500 hover:bg-emerald-600" onClick={() => setCreateLeaseDialogOpen(true)}>
                      <Plus className="h-4 w-4" /> Create First Lease
                    </Button>
                  </div>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Property / Unit</TableHead>
                        <TableHead>Lease Type</TableHead>
                        <TableHead>Rent</TableHead>
                        <TableHead>Rev-Share</TableHead>
                        <TableHead>Start</TableHead>
                        <TableHead>End</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead>Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {tenant.leases.map((lease) => (
                        <TableRow key={lease.id}>
                          <TableCell>
                            <div className="font-medium">{lease.unitNumber}</div>
                            {lease.property && (
                              <div className="text-xs text-muted-foreground flex items-center gap-1 mt-0.5">
                                <Building2 className="h-3 w-3" />{lease.property.name}
                              </div>
                            )}
                            {(lease.floor != null || lease.zone) && (
                              <div className="text-xs text-muted-foreground">
                                {lease.floor != null && `Floor ${lease.floor}`}
                                {lease.floor != null && lease.zone && " · "}
                                {lease.zone}
                              </div>
                            )}
                          </TableCell>
                          <TableCell className="capitalize">
                            {(lease.leaseType || "fixed_rent").replace(/_/g, " ")}
                          </TableCell>
                          <TableCell>{formatCurrency(parseFloat(lease.baseRent || "0"))}</TableCell>
                          <TableCell>
                            {lease.revenueSharePercentage
                              ? <span className="font-medium text-emerald-700">{lease.revenueSharePercentage}%</span>
                              : <span className="text-muted-foreground">—</span>
                            }
                          </TableCell>
                          <TableCell className="text-sm whitespace-nowrap">
                            {format(new Date(lease.startDate), "dd MMM yyyy")}
                          </TableCell>
                          <TableCell className="text-sm whitespace-nowrap">
                            {format(new Date(lease.endDate), "dd MMM yyyy")}
                          </TableCell>
                          <TableCell>
                            <Badge className={cn(statusColors[lease.status || "active"])}>{lease.status || "active"}</Badge>
                          </TableCell>
                          <TableCell>
                            <div className="flex gap-1">
                              <Button variant="ghost" size="sm" onClick={() => handleViewLease(lease)}>
                                <Eye className="h-4 w-4" />
                              </Button>
                              <Link href={`/leases/${lease.id}`}>
                                <Button variant="ghost" size="sm" title="Open full lease detail">
                                  <ExternalLink className="h-4 w-4" />
                                </Button>
                              </Link>
                            </div>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* Financials Tab */}
        <TabsContent value="financials">
          <div className="space-y-4">
            <div className="grid grid-cols-4 gap-4">
              <Card>
                <CardContent className="pt-4">
                  <div className="text-sm text-muted-foreground">Total Invoiced</div>
                  <div className="text-2xl font-bold text-emerald-600">{formatCurrency(tenant.financialSummary.totalInvoiced)}</div>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="pt-4">
                  <div className="text-sm text-muted-foreground">Total Paid</div>
                  <div className="text-2xl font-bold text-blue-600">{formatCurrency(tenant.financialSummary.totalPaid)}</div>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="pt-4">
                  <div className="text-sm text-muted-foreground">Total Pending</div>
                  <div className="text-2xl font-bold text-amber-600">{formatCurrency(tenant.financialSummary.totalPending)}</div>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="pt-4">
                  <div className="text-sm text-muted-foreground">Collection Rate</div>
                  <div className="text-2xl font-bold text-purple-600">{tenant.financialSummary.collectionRate}%</div>
                </CardContent>
              </Card>
            </div>

            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <CardTitle>Recent Invoices</CardTitle>
                  <Button className="gap-2 bg-emerald-500 hover:bg-emerald-600" onClick={() => setCreateInvoiceDialogOpen(true)}>
                    <Plus className="h-4 w-4" /> Create Invoice
                  </Button>
                </div>
              </CardHeader>
              <CardContent>
                {tenant.invoices.length === 0 ? (
                  <div className="text-center py-12">
                    <Receipt className="h-12 w-12 text-muted-foreground/50 mx-auto mb-4" />
                    <h3 className="text-lg font-semibold">No Invoices Yet</h3>
                    <p className="text-muted-foreground">Invoices will appear here once generated.</p>
                  </div>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Invoice #</TableHead>
                        <TableHead>Billing Month</TableHead>
                        <TableHead>Due Date</TableHead>
                        <TableHead>Base Amount</TableHead>
                        <TableHead>Tax</TableHead>
                        <TableHead>Total</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead>Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {tenant.invoices.map((invoice) => (
                        <TableRow key={invoice.id}>
                          <TableCell className="font-mono text-sm">{invoice.invoiceNumber}</TableCell>
                          <TableCell>{invoice.billingMonth}</TableCell>
                          <TableCell>{format(new Date(invoice.dueDate), "dd MMM yyyy")}</TableCell>
                          <TableCell>{formatCurrency(parseFloat(invoice.baseAmount || "0"))}</TableCell>
                          <TableCell>{formatCurrency(parseFloat(invoice.taxAmount || "0"))}</TableCell>
                          <TableCell className="font-medium">{formatCurrency(parseFloat(invoice.totalAmount || "0"))}</TableCell>
                          <TableCell>
                            <Badge className={cn(statusColors[invoice.status || "pending"])}>{invoice.status || "pending"}</Badge>
                          </TableCell>
                          <TableCell>
                            <Button variant="ghost" size="sm" onClick={() => handleViewInvoice(invoice)}>
                              <Eye className="h-4 w-4 mr-1" /> View
                            </Button>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* Work Orders Tab */}
        <TabsContent value="workorders">
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle>Work Orders</CardTitle>
                  <CardDescription>{tenant.workOrderSummary.open} open, {tenant.workOrderSummary.resolved} resolved</CardDescription>
                </div>
                <Button className="gap-2 bg-emerald-500 hover:bg-emerald-600" onClick={() => setCreateWorkOrderDialogOpen(true)}>
                  <Plus className="h-4 w-4" /> Create Work Order
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              {tenant.workOrders.length === 0 ? (
                <div className="text-center py-12">
                  <Wrench className="h-12 w-12 text-muted-foreground/50 mx-auto mb-4" />
                  <h3 className="text-lg font-semibold">No Work Orders</h3>
                  <p className="text-muted-foreground">Work orders for this tenant will appear here.</p>
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>WO #</TableHead>
                      <TableHead>Title</TableHead>
                      <TableHead>Category</TableHead>
                      <TableHead>Priority</TableHead>
                      <TableHead>Created</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {tenant.workOrders.map((wo) => (
                      <TableRow key={wo.id}>
                        <TableCell className="font-mono text-sm">{wo.workOrderNumber}</TableCell>
                        <TableCell>
                          <div className="font-medium">{wo.title}</div>
                          {wo.description && <div className="text-sm text-muted-foreground line-clamp-1">{wo.description}</div>}
                        </TableCell>
                        <TableCell>{wo.category || "—"}</TableCell>
                        <TableCell>
                          <Badge variant={wo.priority === "critical" ? "destructive" : wo.priority === "high" ? "default" : "secondary"}>
                            {wo.priority || "low"}
                          </Badge>
                        </TableCell>
                        <TableCell>{format(new Date(wo.createdAt), "dd MMM yyyy")}</TableCell>
                        <TableCell>
                          <Badge className={cn(statusColors[wo.status || "open"])}>{wo.status || "open"}</Badge>
                        </TableCell>
                        <TableCell>
                          <Button variant="ghost" size="sm" onClick={() => handleViewWorkOrder(wo)}>
                            <Eye className="h-4 w-4 mr-1" /> View
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Analytics Tab */}
        <TabsContent value="analytics">
          <div className="grid md:grid-cols-2 gap-6">
            <Card>
              <CardHeader>
                <CardTitle>Risk & Performance Scores</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <div className="flex justify-between mb-1">
                    <span className="text-sm text-muted-foreground">Risk Score</span>
                    <span className={cn("text-sm font-medium", riskScore <= 0.3 ? "text-emerald-600" : riskScore <= 0.6 ? "text-amber-600" : "text-red-600")}>
                      {riskScore <= 0.3 ? "Low" : riskScore <= 0.6 ? "Medium" : "High"}
                    </span>
                  </div>
                  <div className="h-2 rounded-full bg-gray-100">
                    <div className={cn("h-full rounded-full", riskScore <= 0.3 ? "bg-emerald-500" : riskScore <= 0.6 ? "bg-amber-500" : "bg-red-500")}
                      style={{ width: `${Math.max(riskScore * 100, 5)}%` }} />
                  </div>
                </div>
                <div>
                  <div className="flex justify-between mb-1">
                    <span className="text-sm text-muted-foreground">Sentiment Score</span>
                    <span className={cn("text-sm font-medium", sentimentScore >= 0.7 ? "text-emerald-600" : sentimentScore >= 0.4 ? "text-amber-600" : "text-red-600")}>
                      {(sentimentScore * 100).toFixed(0)}%
                    </span>
                  </div>
                  <div className="h-2 rounded-full bg-gray-100">
                    <div className={cn("h-full rounded-full", sentimentScore >= 0.7 ? "bg-emerald-500" : sentimentScore >= 0.4 ? "bg-amber-500" : "bg-red-500")}
                      style={{ width: `${Math.max(sentimentScore * 100, 5)}%` }} />
                  </div>
                </div>
                <div>
                  <div className="flex justify-between mb-1">
                    <span className="text-sm text-muted-foreground">Satisfaction Score</span>
                    <span className={cn("text-sm font-medium", satisfactionScore >= 0.7 ? "text-emerald-600" : satisfactionScore >= 0.4 ? "text-amber-600" : "text-red-600")}>
                      {(satisfactionScore * 100).toFixed(0)}%
                    </span>
                  </div>
                  <div className="h-2 rounded-full bg-gray-100">
                    <div className={cn("h-full rounded-full", satisfactionScore >= 0.7 ? "bg-emerald-500" : satisfactionScore >= 0.4 ? "bg-amber-500" : "bg-red-500")}
                      style={{ width: `${Math.max(satisfactionScore * 100, 5)}%` }} />
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>AI Insights</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="flex items-start gap-3 p-4 rounded-lg bg-blue-50 border border-blue-100">
                  <CheckCircle className="h-5 w-5 text-blue-600 mt-0.5" />
                  <div>
                    <div className="font-medium text-blue-900">Payment Reliability</div>
                    <div className="text-sm text-blue-700">
                      Collection rate: {tenant.financialSummary.collectionRate}%.
                      {parseFloat(tenant.financialSummary.collectionRate) >= 90 ? " Excellent payment history!" : " Consider following up on pending payments."}
                    </div>
                  </div>
                </div>
                
                {riskScore > 0.5 && (
                  <div className="flex items-start gap-3 p-4 rounded-lg bg-amber-50 border border-amber-100">
                    <AlertTriangle className="h-5 w-5 text-amber-600 mt-0.5" />
                    <div>
                      <div className="font-medium text-amber-900">Risk Alert</div>
                      <div className="text-sm text-amber-700">Medium-high risk score. Monitor for signs of financial distress.</div>
                    </div>
                  </div>
                )}

                {kycPercentage < 100 && (
                  <div className="flex items-start gap-3 p-4 rounded-lg bg-orange-50 border border-orange-100">
                    <FileCheck className="h-5 w-5 text-orange-600 mt-0.5" />
                    <div>
                      <div className="font-medium text-orange-900">KYC Incomplete</div>
                      <div className="text-sm text-orange-700">
                        Only {kycPercentage}% of KYC documents verified. Request missing documents to complete onboarding.
                      </div>
                    </div>
                  </div>
                )}

                {tenant.workOrderSummary.open > 0 && (
                  <div className="flex items-start gap-3 p-4 rounded-lg bg-purple-50 border border-purple-100">
                    <Wrench className="h-5 w-5 text-purple-600 mt-0.5" />
                    <div>
                      <div className="font-medium text-purple-900">Maintenance Attention</div>
                      <div className="text-sm text-purple-700">
                        {tenant.workOrderSummary.open} open work order(s). Prioritize resolution to improve tenant satisfaction.
                      </div>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* ── Sales & POS Tab ── */}
        <TabsContent value="pos">
          {posLoading ? (
            <div className="flex items-center justify-center py-20">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
          ) : (
            <div className="space-y-6">
              {/* POS Integration Card */}
              <Card>
                <CardHeader className="flex flex-row items-center justify-between pb-3">
                  <div>
                    <CardTitle className="flex items-center gap-2">
                      <Zap className="h-5 w-5 text-primary" /> POS Integration
                    </CardTitle>
                    <CardDescription>Point-of-sale connection status for revenue tracking</CardDescription>
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    className="gap-2"
                    onClick={() => router.push(`/pos-simulator?tenantId=${tenantId}`)}
                  >
                    <ExternalLink className="h-4 w-4" /> Open POS Simulator
                  </Button>
                </CardHeader>
                <CardContent>
                  {posIntegration ? (
                    <div className="space-y-4">
                      <div className={cn(
                        "flex items-center gap-3 p-3 rounded-lg border",
                        posIntegration.status === "connected"
                          ? "bg-green-50 border-green-200"
                          : "bg-yellow-50 border-yellow-200"
                      )}>
                        {posIntegration.status === "connected"
                          ? <Wifi className="h-5 w-5 text-green-600 flex-shrink-0" />
                          : <WifiOff className="h-5 w-5 text-yellow-600 flex-shrink-0" />}
                        <div className="flex-1">
                          <p className="text-sm font-medium">
                            {posIntegration.status === "connected" ? "Connected" : "Disconnected"}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            Provider: <span className="font-semibold capitalize">{posIntegration.provider}</span>
                            {posIntegration.storeId && ` · Store ID: ${posIntegration.storeId}`}
                          </p>
                        </div>
                        <Badge className={posIntegration.status === "connected" ? "bg-green-100 text-green-700" : "bg-yellow-100 text-yellow-700"}>
                          {posIntegration.status === "connected" ? "Live" : "Offline"}
                        </Badge>
                      </div>

                      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                        <div className="rounded-lg border p-3 space-y-0.5">
                          <p className="text-xs text-muted-foreground">Sync Frequency</p>
                          <p className="text-sm font-medium capitalize">{(posIntegration.syncFrequency || "daily").replace("_", " ")}</p>
                        </div>
                        <div className="rounded-lg border p-3 space-y-0.5">
                          <p className="text-xs text-muted-foreground">Last Synced</p>
                          <p className="text-sm font-medium">
                            {posIntegration.lastSyncAt
                              ? new Date(posIntegration.lastSyncAt).toLocaleDateString("en-IN")
                              : "Never"}
                          </p>
                        </div>
                        <div className="rounded-lg border p-3 space-y-0.5">
                          <p className="text-xs text-muted-foreground">Total Transactions</p>
                          <p className="text-sm font-medium">{(posIntegration.totalTransactionsSynced || 0).toLocaleString()}</p>
                        </div>
                        <div className="rounded-lg border p-3 space-y-0.5">
                          <p className="text-xs text-muted-foreground">Revenue Share</p>
                          <p className="text-sm font-medium">
                            {posIntegration.revenueSharePercentage
                              ? `${posIntegration.revenueSharePercentage}%`
                              : tenant?.activeLease?.leaseType === "revenue_share" ? "Rev-Share" : "Fixed"}
                          </p>
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div className="flex flex-col items-center gap-3 py-8 text-center">
                      <WifiOff className="h-10 w-10 text-muted-foreground/40" />
                      <div>
                        <p className="font-medium text-muted-foreground">No POS integration configured</p>
                        <p className="text-sm text-muted-foreground mt-1">
                          Connect a POS system when creating a revenue-share lease, or use the POS simulator to test.
                        </p>
                      </div>
                      <Button
                        variant="outline"
                        size="sm"
                        className="gap-2 mt-1"
                        onClick={() => router.push("/pos-simulator")}
                      >
                        <ShoppingCart className="h-4 w-4" /> Open POS Simulator
                      </Button>
                    </div>
                  )}
                </CardContent>
              </Card>

              {/* Sales Summary */}
              {posSales.length > 0 && (() => {
                const totalGross = posSales.reduce((s, r) => s + parseFloat(r.grossSales || "0"), 0)
                const totalNet   = posSales.reduce((s, r) => s + parseFloat(r.netSales || "0"), 0)
                const totalTxns  = posSales.reduce((s, r) => s + (r.transactionCount || 0), 0)
                const totalRefunds = posSales.reduce((s, r) => s + parseFloat(r.refunds || "0"), 0)
                const avgTxn = totalTxns > 0 ? totalNet / totalTxns : 0
                const latest = [...posSales].sort((a, b) => b.salesDate.localeCompare(a.salesDate))[0]
                const prev   = posSales.length > 1 ? posSales[posSales.length - 2] : null
                const trend  = prev ? (parseFloat(latest.grossSales) - parseFloat(prev.grossSales)) : 0
                return (
                  <>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                      <Card className="border-0 shadow-sm bg-gradient-to-br from-blue-50 to-white">
                        <CardContent className="pt-4 pb-3">
                          <p className="text-xs text-muted-foreground flex items-center gap-1"><TrendingUp className="h-3 w-3" /> Total Gross Sales</p>
                          <p className="text-2xl font-bold mt-1">{formatCurrency(totalGross)}</p>
                          <p className="text-xs text-muted-foreground mt-0.5">{posSales.length} days tracked</p>
                        </CardContent>
                      </Card>
                      <Card className="border-0 shadow-sm bg-gradient-to-br from-green-50 to-white">
                        <CardContent className="pt-4 pb-3">
                          <p className="text-xs text-muted-foreground flex items-center gap-1"><IndianRupee className="h-3 w-3" /> Net Revenue</p>
                          <p className="text-2xl font-bold mt-1">{formatCurrency(totalNet)}</p>
                          <p className="text-xs text-muted-foreground mt-0.5">After refunds & discounts</p>
                        </CardContent>
                      </Card>
                      <Card className="border-0 shadow-sm bg-gradient-to-br from-purple-50 to-white">
                        <CardContent className="pt-4 pb-3">
                          <p className="text-xs text-muted-foreground flex items-center gap-1"><Activity className="h-3 w-3" /> Transactions</p>
                          <p className="text-2xl font-bold mt-1">{totalTxns.toLocaleString()}</p>
                          <p className="text-xs text-muted-foreground mt-0.5">Avg {formatCurrency(avgTxn)} / txn</p>
                        </CardContent>
                      </Card>
                      <Card className="border-0 shadow-sm bg-gradient-to-br from-rose-50 to-white">
                        <CardContent className="pt-4 pb-3">
                          <p className="text-xs text-muted-foreground flex items-center gap-1"><Receipt className="h-3 w-3" /> Refunds</p>
                          <p className="text-2xl font-bold mt-1">{formatCurrency(totalRefunds)}</p>
                          <p className="text-xs text-muted-foreground mt-0.5">
                            {totalGross > 0 ? ((totalRefunds / totalGross) * 100).toFixed(1) : "0"}% refund rate
                          </p>
                        </CardContent>
                      </Card>
                    </div>

                    {/* Latest Day Highlight */}
                    <Card>
                      <CardHeader className="pb-2">
                        <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                          <Calendar className="h-4 w-4" /> Latest Sales Day — {new Date(latest.salesDate).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })}
                          {trend !== 0 && (
                            <span className={cn("flex items-center gap-0.5 text-xs font-semibold ml-auto", trend > 0 ? "text-green-600" : "text-red-600")}>
                              {trend > 0 ? <ArrowUpRight className="h-3.5 w-3.5" /> : <ArrowDownRight className="h-3.5 w-3.5" />}
                              {Math.abs(trend / parseFloat(prev!.grossSales) * 100).toFixed(1)}% vs prev day
                            </span>
                          )}
                        </CardTitle>
                      </CardHeader>
                      <CardContent>
                        <div className="grid grid-cols-3 gap-4 text-sm">
                          <div>
                            <p className="text-muted-foreground">Gross Sales</p>
                            <p className="font-semibold text-base">{formatCurrency(parseFloat(latest.grossSales))}</p>
                          </div>
                          <div>
                            <p className="text-muted-foreground">Transactions</p>
                            <p className="font-semibold text-base">{(latest.transactionCount || 0).toLocaleString()}</p>
                          </div>
                          <div>
                            <p className="text-muted-foreground">Avg Txn Value</p>
                            <p className="font-semibold text-base">{formatCurrency(parseFloat(latest.avgTransactionValue || "0"))}</p>
                          </div>
                        </div>

                        {/* Category Breakdown */}
                        {latest.categoryBreakdown && Object.keys(latest.categoryBreakdown).length > 0 && (
                          <div className="mt-4">
                            <p className="text-xs font-medium text-muted-foreground mb-2">Category Breakdown</p>
                            <div className="space-y-2">
                              {Object.entries(latest.categoryBreakdown)
                                .sort(([, a], [, b]) => b - a)
                                .slice(0, 5)
                                .map(([cat, amount]) => {
                                  const pct = totalGross > 0 ? (amount / parseFloat(latest.grossSales)) * 100 : 0
                                  return (
                                    <div key={cat}>
                                      <div className="flex justify-between text-xs mb-0.5">
                                        <span className="capitalize text-muted-foreground">{cat.replace(/_/g, " ")}</span>
                                        <span className="font-medium">{formatCurrency(amount)} <span className="text-muted-foreground">({pct.toFixed(0)}%)</span></span>
                                      </div>
                                      <div className="h-1.5 rounded-full bg-gray-100">
                                        <div className="h-full rounded-full bg-primary/70" style={{ width: `${Math.max(pct, 2)}%` }} />
                                      </div>
                                    </div>
                                  )
                                })}
                            </div>
                          </div>
                        )}
                      </CardContent>
                    </Card>

                    {/* Sales History Table */}
                    <Card>
                      <CardHeader className="pb-3">
                        <CardTitle className="flex items-center gap-2">
                          <BarChart3 className="h-5 w-5 text-primary" /> Sales History
                        </CardTitle>
                        <CardDescription>Daily POS sales records (most recent first)</CardDescription>
                      </CardHeader>
                      <CardContent className="p-0">
                        <Table>
                          <TableHeader>
                            <TableRow>
                              <TableHead>Date</TableHead>
                              <TableHead className="text-right">Gross Sales</TableHead>
                              <TableHead className="text-right">Net Sales</TableHead>
                              <TableHead className="text-right">Transactions</TableHead>
                              <TableHead className="text-right">Avg Txn</TableHead>
                              <TableHead className="text-right">Refunds</TableHead>
                              <TableHead>Source</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {[...posSales]
                              .sort((a, b) => b.salesDate.localeCompare(a.salesDate))
                              .slice(0, 30)
                              .map((sale) => (
                                <TableRow key={sale.id}>
                                  <TableCell className="font-medium">
                                    {new Date(sale.salesDate).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })}
                                  </TableCell>
                                  <TableCell className="text-right font-semibold">{formatCurrency(parseFloat(sale.grossSales || "0"))}</TableCell>
                                  <TableCell className="text-right">{formatCurrency(parseFloat(sale.netSales || "0"))}</TableCell>
                                  <TableCell className="text-right">{(sale.transactionCount || 0).toLocaleString()}</TableCell>
                                  <TableCell className="text-right">{sale.avgTransactionValue ? formatCurrency(parseFloat(sale.avgTransactionValue)) : "—"}</TableCell>
                                  <TableCell className="text-right text-red-600">{parseFloat(sale.refunds || "0") > 0 ? formatCurrency(parseFloat(sale.refunds)) : "—"}</TableCell>
                                  <TableCell>
                                    <Badge variant="outline" className="text-xs capitalize">{sale.source || "pos_api"}</Badge>
                                  </TableCell>
                                </TableRow>
                              ))}
                          </TableBody>
                        </Table>
                      </CardContent>
                    </Card>
                  </>
                )
              })()}

              {/* No Sales Data */}
              {!posLoading && posSales.length === 0 && (
                <Card>
                  <CardContent className="flex flex-col items-center gap-3 py-12 text-center">
                    <ShoppingCart className="h-12 w-12 text-muted-foreground/30" />
                    <div>
                      <p className="font-medium">No sales data yet</p>
                      <p className="text-sm text-muted-foreground mt-1">
                        Use the POS Simulator to enter daily sales data for this tenant.
                      </p>
                    </div>
                    <Button
                      variant="outline"
                      size="sm"
                      className="gap-2 mt-1"
                      onClick={() => router.push("/pos-simulator")}
                    >
                      <Zap className="h-4 w-4" /> Open POS Simulator
                    </Button>
                  </CardContent>
                </Card>
              )}
            </div>
          )}
        </TabsContent>
      </Tabs>

      {/* ============ DIALOGS ============ */}

      {/* Edit Tenant Dialog */}
      <Dialog open={editDialogOpen} onOpenChange={setEditDialogOpen}>
        <DialogContent className="sm:max-w-[800px] max-h-[90vh] overflow-y-auto">
          <Form {...editForm}>
            <form onSubmit={editForm.handleSubmit(handleUpdateTenant)}>
              <DialogHeader>
                <DialogTitle>Edit Tenant</DialogTitle>
                <DialogDescription>Update tenant information</DialogDescription>
              </DialogHeader>

              <Tabs value={editTab} onValueChange={setEditTab} className="mt-4">
                <TabsList className="grid w-full grid-cols-5">
                  <TabsTrigger value="basic">Basic</TabsTrigger>
                  <TabsTrigger value="contact">Contact</TabsTrigger>
                  <TabsTrigger value="tax">Tax & Compliance</TabsTrigger>
                  <TabsTrigger value="bank">Banking</TabsTrigger>
                  <TabsTrigger value="address">Address</TabsTrigger>
                </TabsList>

                <TabsContent value="basic" className="space-y-4 mt-4">
                  <div className="grid grid-cols-2 gap-4">
                    <FormField control={editForm.control} name="businessName"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Business Name *</FormLabel>
                          <FormControl><Input {...field} /></FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField control={editForm.control} name="legalEntityName"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Legal Entity Name</FormLabel>
                          <FormControl><Input {...field} /></FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField control={editForm.control} name="brandName"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Brand Name</FormLabel>
                          <FormControl><Input {...field} /></FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField control={editForm.control} name="category"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Category</FormLabel>
                          <Select onValueChange={field.onChange} value={field.value}>
                            <FormControl>
                              <SelectTrigger><SelectValue placeholder="Select category" /></SelectTrigger>
                            </FormControl>
                            <SelectContent>
                              {Object.entries(categoryLabels).map(([key, label]) => (
                                <SelectItem key={key} value={key}>{label}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField control={editForm.control} name="businessType"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Business Type</FormLabel>
                          <Select onValueChange={field.onChange} value={field.value}>
                            <FormControl>
                              <SelectTrigger><SelectValue placeholder="Select type" /></SelectTrigger>
                            </FormControl>
                            <SelectContent>
                              {Object.entries(businessTypeLabels).map(([key, label]) => (
                                <SelectItem key={key} value={key}>{label}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField control={editForm.control} name="status"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Status</FormLabel>
                          <Select onValueChange={field.onChange} value={field.value}>
                            <FormControl>
                              <SelectTrigger><SelectValue /></SelectTrigger>
                            </FormControl>
                            <SelectContent>
                              <SelectItem value="active">Active</SelectItem>
                              <SelectItem value="inactive">Inactive</SelectItem>
                              <SelectItem value="onboarding">Onboarding</SelectItem>
                              <SelectItem value="suspended">Suspended</SelectItem>
                            </SelectContent>
                          </Select>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField control={editForm.control} name="website"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Website</FormLabel>
                          <FormControl><Input type="url" placeholder="https://" {...field} /></FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>
                </TabsContent>

                <TabsContent value="contact" className="space-y-4 mt-4">
                  <div className="text-sm font-medium text-muted-foreground mb-2">Primary Contact</div>
                  <div className="grid grid-cols-2 gap-4">
                    <FormField control={editForm.control} name="contactPerson"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Contact Person</FormLabel>
                          <FormControl><Input {...field} /></FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField control={editForm.control} name="designation"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Designation</FormLabel>
                          <FormControl><Input {...field} /></FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField control={editForm.control} name="email"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Email</FormLabel>
                          <FormControl><Input type="email" {...field} /></FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField control={editForm.control} name="phone"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Phone</FormLabel>
                          <FormControl><Input maxLength={10} {...field} /></FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField control={editForm.control} name="alternatePhone"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Alternate Phone</FormLabel>
                          <FormControl><Input maxLength={10} {...field} /></FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>
                  
                  <hr className="my-4" />
                  <div className="text-sm font-medium text-muted-foreground mb-2">Authorized Signatory</div>
                  <div className="grid grid-cols-2 gap-4">
                    <FormField control={editForm.control} name="authorizedSignatory"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Name</FormLabel>
                          <FormControl><Input {...field} /></FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField control={editForm.control} name="signatoryPhone"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Phone</FormLabel>
                          <FormControl><Input maxLength={10} {...field} /></FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField control={editForm.control} name="signatoryEmail"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Email</FormLabel>
                          <FormControl><Input type="email" {...field} /></FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>

                  <hr className="my-4" />
                  <div className="text-sm font-medium text-muted-foreground mb-2">Emergency Contact</div>
                  <div className="grid grid-cols-2 gap-4">
                    <FormField control={editForm.control} name="emergencyContactName"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Name</FormLabel>
                          <FormControl><Input {...field} /></FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField control={editForm.control} name="emergencyContactPhone"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Phone</FormLabel>
                          <FormControl><Input maxLength={10} {...field} /></FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>
                </TabsContent>

                <TabsContent value="tax" className="space-y-4 mt-4">
                  <div className="grid grid-cols-2 gap-4">
                    <FormField control={editForm.control} name="gstin"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>GSTIN</FormLabel>
                          <FormControl><Input className="font-mono uppercase" maxLength={15} {...field} /></FormControl>
                          <FormDescription>15-character GST Identification Number</FormDescription>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField control={editForm.control} name="pan"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>PAN</FormLabel>
                          <FormControl><Input className="font-mono uppercase" maxLength={10} {...field} /></FormControl>
                          <FormDescription>10-character Permanent Account Number</FormDescription>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField control={editForm.control} name="tan"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>TAN</FormLabel>
                          <FormControl><Input className="font-mono uppercase" maxLength={10} {...field} /></FormControl>
                          <FormDescription>Tax Deduction Account Number</FormDescription>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField control={editForm.control} name="cin"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>CIN</FormLabel>
                          <FormControl><Input className="font-mono uppercase" maxLength={21} {...field} /></FormControl>
                          <FormDescription>Corporate Identification Number</FormDescription>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField control={editForm.control} name="tradeLicense"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Trade License</FormLabel>
                          <FormControl><Input {...field} /></FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField control={editForm.control} name="fssaiLicense"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>FSSAI License</FormLabel>
                          <FormControl><Input {...field} /></FormControl>
                          <FormDescription>For F&B businesses</FormDescription>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField control={editForm.control} name="shopEstablishmentNumber"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Shop & Establishment</FormLabel>
                          <FormControl><Input {...field} /></FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>
                </TabsContent>

                <TabsContent value="bank" className="space-y-4 mt-4">
                  <div className="grid grid-cols-2 gap-4">
                    <FormField control={editForm.control} name="bankName"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Bank Name</FormLabel>
                          <FormControl><Input {...field} /></FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField control={editForm.control} name="bankBranch"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Branch</FormLabel>
                          <FormControl><Input {...field} /></FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField control={editForm.control} name="accountNumber"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Account Number</FormLabel>
                          <FormControl><Input className="font-mono" {...field} /></FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField control={editForm.control} name="ifscCode"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>IFSC Code</FormLabel>
                          <FormControl><Input className="font-mono uppercase" maxLength={11} {...field} /></FormControl>
                          <FormDescription>11-character bank IFSC code</FormDescription>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField control={editForm.control} name="accountHolderName"
                      render={({ field }) => (
                        <FormItem className="col-span-2">
                          <FormLabel>Account Holder Name</FormLabel>
                          <FormControl><Input {...field} /></FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>
                </TabsContent>

                <TabsContent value="address" className="space-y-4 mt-4">
                  <div className="grid grid-cols-2 gap-4">
                    <FormField control={editForm.control} name="registeredAddress"
                      render={({ field }) => (
                        <FormItem className="col-span-2">
                          <FormLabel>Registered Address</FormLabel>
                          <FormControl><Textarea rows={3} {...field} /></FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField control={editForm.control} name="registeredCity"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>City</FormLabel>
                          <FormControl><Input {...field} /></FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField control={editForm.control} name="registeredState"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>State</FormLabel>
                          <Select onValueChange={field.onChange} value={field.value}>
                            <FormControl>
                              <SelectTrigger><SelectValue placeholder="Select state" /></SelectTrigger>
                            </FormControl>
                            <SelectContent>
                              {indianStates.map((state) => (
                                <SelectItem key={state} value={state}>{state}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField control={editForm.control} name="registeredPincode"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>PIN Code</FormLabel>
                          <FormControl><Input maxLength={6} {...field} /></FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>
                </TabsContent>
              </Tabs>

              <DialogFooter className="mt-6">
                <Button type="button" variant="outline" onClick={() => setEditDialogOpen(false)}>Cancel</Button>
                <Button type="submit" disabled={isSubmitting} className="bg-blue-600 hover:bg-blue-700">
                  {isSubmitting && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                  Save Changes
                </Button>
              </DialogFooter>
            </form>
          </Form>
        </DialogContent>
      </Dialog>

      {/* Create Lease Dialog — Full tabbed form matching the Lease module */}
      <Dialog open={createLeaseDialogOpen} onOpenChange={setCreateLeaseDialogOpen}>
        <DialogContent className="sm:max-w-[700px] max-h-[90vh] overflow-y-auto">
          <form onSubmit={handleCreateLease}>
            <DialogHeader>
              <DialogTitle>Create New Lease</DialogTitle>
              <DialogDescription>Set up a lease agreement for {tenant.businessName}</DialogDescription>
            </DialogHeader>

            <Tabs defaultValue="basic" className="mt-4">
              <TabsList className={cn("grid w-full", isRevShareLease ? "grid-cols-4" : "grid-cols-3")}>
                <TabsTrigger value="basic">Basic Info</TabsTrigger>
                <TabsTrigger value="financial">Financial Terms</TabsTrigger>
                <TabsTrigger value="terms">Lease Terms</TabsTrigger>
                {isRevShareLease && (
                  <TabsTrigger value="pos" className="gap-1">
                    <Wifi className="h-3 w-3" /> POS Integration
                  </TabsTrigger>
                )}
              </TabsList>

              {/* Basic Info Tab */}
              <TabsContent value="basic" className="space-y-4 mt-4">
                <div className="grid grid-cols-3 gap-4">
                  <div className="space-y-2">
                    <label className="text-sm font-medium">Unit Number *</label>
                    <Input value={leaseForm.unitNumber} onChange={(e) => setLeaseForm({...leaseForm, unitNumber: e.target.value})} placeholder="e.g., G-12" />
                  </div>
                  <div className="space-y-2">
                    <label className="text-sm font-medium">Floor</label>
                    <Select value={leaseForm.floor} onValueChange={(v) => setLeaseForm({...leaseForm, floor: v})}>
                      <SelectTrigger>
                        <SelectValue placeholder="Select floor" />
                      </SelectTrigger>
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
                    <label className="text-sm font-medium">Zone</label>
                    <Input value={leaseForm.zone} onChange={(e) => setLeaseForm({...leaseForm, zone: e.target.value})} placeholder="e.g., A" />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <label className="text-sm font-medium">Area (sq.ft) *</label>
                    <Input type="number" value={leaseForm.areaSqft} onChange={(e) => setLeaseForm({...leaseForm, areaSqft: e.target.value})} placeholder="1000" />
                  </div>
                  <div className="space-y-2">
                    <label className="text-sm font-medium">Lease Type</label>
                    <Select value={leaseForm.leaseType} onValueChange={(v) => setLeaseForm({...leaseForm, leaseType: v})}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="fixed_rent">Fixed Rent</SelectItem>
                        <SelectItem value="revenue_share">Revenue Share</SelectItem>
                        <SelectItem value="hybrid">Hybrid</SelectItem>
                        <SelectItem value="minimum_guarantee">Minimum Guarantee</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              </TabsContent>

              {/* Financial Terms Tab */}
              <TabsContent value="financial" className="space-y-4 mt-4">
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <label className="text-sm font-medium">Base Rent (₹/month)</label>
                    <Input type="number" value={leaseForm.baseRent} onChange={(e) => setLeaseForm({...leaseForm, baseRent: e.target.value})} placeholder="50000" />
                  </div>
                  <div className="space-y-2">
                    <label className="text-sm font-medium">Revenue Share (%)</label>
                    <Input type="number" value={leaseForm.revenueSharePercentage} onChange={(e) => setLeaseForm({...leaseForm, revenueSharePercentage: e.target.value})} placeholder="10" />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <label className="text-sm font-medium">CAM Charges (₹/month)</label>
                    <Input type="number" value={leaseForm.camCharges} onChange={(e) => setLeaseForm({...leaseForm, camCharges: e.target.value})} placeholder="5000" />
                  </div>
                  <div className="space-y-2">
                    <label className="text-sm font-medium">Security Deposit (₹)</label>
                    <Input type="number" value={leaseForm.securityDeposit} onChange={(e) => setLeaseForm({...leaseForm, securityDeposit: e.target.value})} placeholder="150000" />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <label className="text-sm font-medium">Escalation Rate (%/year)</label>
                    <Input type="number" value={leaseForm.escalationRate} onChange={(e) => setLeaseForm({...leaseForm, escalationRate: e.target.value})} placeholder="10" />
                  </div>
                  <div className="space-y-2">
                    <label className="text-sm font-medium">Escalation Frequency (months)</label>
                    <Select value={leaseForm.escalationFrequency} onValueChange={(v) => setLeaseForm({...leaseForm, escalationFrequency: v})}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="12">Annually (12 months)</SelectItem>
                        <SelectItem value="24">Bi-annually (24 months)</SelectItem>
                        <SelectItem value="36">Every 3 years (36 months)</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              </TabsContent>

              {/* Lease Terms Tab */}
              <TabsContent value="terms" className="space-y-4 mt-4">
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <label className="text-sm font-medium">Start Date *</label>
                    <Input type="date" value={leaseForm.startDate} onChange={(e) => setLeaseForm({...leaseForm, startDate: e.target.value})} />
                  </div>
                  <div className="space-y-2">
                    <label className="text-sm font-medium">End Date *</label>
                    <Input type="date" value={leaseForm.endDate} onChange={(e) => setLeaseForm({...leaseForm, endDate: e.target.value})} />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <label className="text-sm font-medium">Lock-in Period (months)</label>
                    <Input type="number" value={leaseForm.lockInPeriod} onChange={(e) => setLeaseForm({...leaseForm, lockInPeriod: e.target.value})} placeholder="12" />
                  </div>
                  <div className="space-y-2">
                    <label className="text-sm font-medium">Termination Notice (days)</label>
                    <Input type="number" value={leaseForm.terminationNoticeDays} onChange={(e) => setLeaseForm({...leaseForm, terminationNoticeDays: e.target.value})} placeholder="90" />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <label className="text-sm font-medium">Fit-out Period (days)</label>
                    <Input type="number" value={leaseForm.fitOutPeriod} onChange={(e) => setLeaseForm({...leaseForm, fitOutPeriod: e.target.value})} placeholder="30" />
                  </div>
                  <div className="space-y-2">
                    <label className="text-sm font-medium">Rent-Free Period (days)</label>
                    <Input type="number" value={leaseForm.rentFreePeriod} onChange={(e) => setLeaseForm({...leaseForm, rentFreePeriod: e.target.value})} placeholder="0" />
                  </div>
                </div>
              </TabsContent>

              {/* POS Integration Tab — Only for revenue_share/hybrid/minimum_guarantee leases */}
              {isRevShareLease && (
                <TabsContent value="pos" className="space-y-4 mt-4">
                  <div className="rounded-lg border border-blue-200 bg-blue-50/50 p-3 mb-2">
                    <div className="flex items-center gap-2 text-sm text-blue-700">
                      <Zap className="h-4 w-4" />
                      <span className="font-medium">Connect POS to auto-calculate revenue share from actual sales data</span>
                    </div>
                    <p className="text-xs text-blue-600 mt-1 ml-6">
                      Once connected, daily sales data is pulled automatically and revenue share invoices are generated from real POS transactions.
                    </p>
                  </div>

                  {/* Dev / Demo Sample Banner */}
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
                          setLeaseForm({
                            ...leaseForm,
                            posProvider: "square",
                            posStoreId: `sq_dev-${tenantId.slice(0, 8)}`,
                            posApiKey: "dev-simulator-key",
                            posSyncFrequency: "real_time",
                          })
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

                  <div className="space-y-2">
                    <label className="text-sm font-medium">POS Provider</label>
                    <Select value={leaseForm.posProvider} onValueChange={(v) => { setLeaseForm({...leaseForm, posProvider: v}); setPosTestStatus("idle"); }}>
                      <SelectTrigger>
                        <SelectValue placeholder="Select POS system" />
                      </SelectTrigger>
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
                        value={leaseForm.posStoreId}
                        onChange={(e) => { setLeaseForm({...leaseForm, posStoreId: e.target.value}); setPosTestStatus("idle"); }}
                        placeholder="e.g., store-123 or LOC-456"
                      />
                    </div>
                    <div className="space-y-2">
                      <label className="text-sm font-medium">API Key / Access Token</label>
                      <Input
                        type="password"
                        value={leaseForm.posApiKey}
                        onChange={(e) => { setLeaseForm({...leaseForm, posApiKey: e.target.value}); setPosTestStatus("idle"); }}
                        placeholder="Enter API key"
                      />
                    </div>
                  </div>

                  <div className="space-y-2">
                    <label className="text-sm font-medium">Sync Frequency</label>
                    <Select value={leaseForm.posSyncFrequency} onValueChange={(v) => setLeaseForm({...leaseForm, posSyncFrequency: v})}>
                      <SelectTrigger className="w-[200px]">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="real_time">Real-time</SelectItem>
                        <SelectItem value="hourly">Hourly</SelectItem>
                        <SelectItem value="daily">Daily</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  {/* Test Connection */}
                  <div className="flex items-center gap-3 pt-2">
                    <Button
                      type="button"
                      variant="outline"
                      onClick={handleTestPOSConnection}
                      disabled={posTestStatus === "testing" || !leaseForm.posProvider || !leaseForm.posStoreId || !leaseForm.posApiKey}
                      className="gap-2"
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
                      {posTestStatus === "testing" ? "Testing..." : "Test Connection"}
                    </Button>
                    {posTestMessage && (
                      <span className={cn("text-sm", posTestStatus === "success" ? "text-emerald-600" : "text-red-600")}>
                        {posTestMessage}
                      </span>
                    )}
                  </div>
                </TabsContent>
              )}
            </Tabs>

            <DialogFooter className="mt-6">
              <Button type="button" variant="outline" onClick={() => setCreateLeaseDialogOpen(false)}>Cancel</Button>
              <Button type="submit" disabled={isSubmitting} className="bg-emerald-500 hover:bg-emerald-600">
                {isSubmitting && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                Create Lease
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* View Lease Dialog */}
      <Dialog open={viewLeaseDialogOpen} onOpenChange={setViewLeaseDialogOpen}>
        <DialogContent className="sm:max-w-[600px] max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <FileText className="h-5 w-5" /> Lease Agreement Details
            </DialogTitle>
            <DialogDescription>Unit {selectedLease?.unitNumber} - {tenant.businessName}</DialogDescription>
          </DialogHeader>
          {selectedLease && (
            <div className="space-y-6">
              {/* Basic Info */}
              <div>
                <h4 className="text-sm font-semibold text-muted-foreground mb-3">UNIT DETAILS</h4>
                <div className="grid grid-cols-3 gap-4">
                  <div className="bg-muted/30 p-3 rounded-lg">
                    <div className="text-xs text-muted-foreground">Unit Number</div>
                    <div className="font-semibold">{selectedLease.unitNumber}</div>
                  </div>
                  <div className="bg-muted/30 p-3 rounded-lg">
                    <div className="text-xs text-muted-foreground">Floor</div>
                    <div className="font-semibold">{selectedLease.floor ?? "Ground"}</div>
                  </div>
                  <div className="bg-muted/30 p-3 rounded-lg">
                    <div className="text-xs text-muted-foreground">Carpet Area</div>
                    <div className="font-semibold">{selectedLease.areaSqft ? `${parseFloat(selectedLease.areaSqft).toLocaleString()} sq.ft` : "—"}</div>
                  </div>
                </div>
              </div>

              {/* Financial Details */}
              <div>
                <h4 className="text-sm font-semibold text-muted-foreground mb-3">FINANCIAL TERMS</h4>
                <div className="grid grid-cols-2 gap-4">
                  <div className="bg-emerald-50 p-3 rounded-lg border border-emerald-100">
                    <div className="text-xs text-emerald-600">Monthly Base Rent</div>
                    <div className="text-lg font-bold text-emerald-700">{formatCurrency(parseFloat(selectedLease.baseRent || "0"))}</div>
                  </div>
                  <div className="bg-blue-50 p-3 rounded-lg border border-blue-100">
                    <div className="text-xs text-blue-600">Maintenance Charges</div>
                    <div className="text-lg font-bold text-blue-700">
                      {formatCurrency(parseFloat(
                        selectedLease.maintenanceCharges || 
                        selectedLease.camCharges || 
                        String(selectedLease.terms?.maintenanceCharges || 0)
                      ))}
                    </div>
                  </div>
                  <div className="bg-purple-50 p-3 rounded-lg border border-purple-100">
                    <div className="text-xs text-purple-600">Security Deposit</div>
                    <div className="text-lg font-bold text-purple-700">{formatCurrency(parseFloat(selectedLease.securityDeposit || "0"))}</div>
                  </div>
                  <div className="bg-orange-50 p-3 rounded-lg border border-orange-100">
                    <div className="text-xs text-orange-600">Total Monthly</div>
                    <div className="text-lg font-bold text-orange-700">
                      {formatCurrency(
                        parseFloat(selectedLease.baseRent || "0") + 
                        parseFloat(selectedLease.maintenanceCharges || selectedLease.camCharges || String(selectedLease.terms?.maintenanceCharges || 0))
                      )}
                    </div>
                  </div>
                </div>
              </div>

              {/* Duration & Escalation */}
              <div>
                <h4 className="text-sm font-semibold text-muted-foreground mb-3">LEASE DURATION & ESCALATION</h4>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <div className="text-xs text-muted-foreground">Start Date</div>
                    <div className="font-medium">{format(new Date(selectedLease.startDate), "dd MMM yyyy")}</div>
                  </div>
                  <div>
                    <div className="text-xs text-muted-foreground">End Date</div>
                    <div className="font-medium">{format(new Date(selectedLease.endDate), "dd MMM yyyy")}</div>
                  </div>
                  <div>
                    <div className="text-xs text-muted-foreground">Escalation Rate</div>
                    <div className="font-medium">{selectedLease.escalationRate ? `${selectedLease.escalationRate}% per year` : "—"}</div>
                  </div>
                  <div>
                    <div className="text-xs text-muted-foreground">Escalation Frequency</div>
                    <div className="font-medium">{selectedLease.escalationFrequency || "Annual"}</div>
                  </div>
                </div>
              </div>

              {/* Terms */}
              <div>
                <h4 className="text-sm font-semibold text-muted-foreground mb-3">LEASE TERMS</h4>
                <div className="grid grid-cols-4 gap-3">
                  <div className="text-center p-2 bg-muted/30 rounded-lg">
                    <div className="text-xs text-muted-foreground">Lock-in</div>
                    <div className="font-semibold">{selectedLease.terms?.lockInPeriod || 12} mo</div>
                  </div>
                  <div className="text-center p-2 bg-muted/30 rounded-lg">
                    <div className="text-xs text-muted-foreground">Fit-out</div>
                    <div className="font-semibold">{selectedLease.terms?.fitOutPeriod || 0} days</div>
                  </div>
                  <div className="text-center p-2 bg-muted/30 rounded-lg">
                    <div className="text-xs text-muted-foreground">Rent-free</div>
                    <div className="font-semibold">{selectedLease.terms?.rentFreePeriod || 0} days</div>
                  </div>
                  <div className="text-center p-2 bg-muted/30 rounded-lg">
                    <div className="text-xs text-muted-foreground">Notice</div>
                    <div className="font-semibold">{selectedLease.terms?.terminationNoticeDays || 90} days</div>
                  </div>
                </div>
              </div>

              {/* Status */}
              <div className="flex items-center justify-between pt-4 border-t">
                <div className="flex items-center gap-2">
                  <span className="text-sm text-muted-foreground">Status:</span>
                  <Badge className={cn(statusColors[selectedLease.status || "active"])}>{selectedLease.status || "active"}</Badge>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-sm text-muted-foreground">Type:</span>
                  <Badge variant="outline">{selectedLease.leaseType || "Fixed Rent"}</Badge>
                </div>
              </div>
            </div>
          )}
          <DialogFooter className="flex flex-wrap gap-2">
            <Button onClick={() => handleGenerateLeaseDocument(selectedLease)}>
              <FileText className="h-4 w-4 mr-2" /> Generate Full Document
            </Button>
            <Button variant="outline" onClick={() => handleDownloadLeaseSummary(selectedLease)}>
              <Download className="h-4 w-4 mr-2" /> Download Summary
            </Button>
            <Button variant="ghost" onClick={() => setViewLeaseDialogOpen(false)}>Close</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* View Invoice Dialog */}
      <Dialog open={viewInvoiceDialogOpen} onOpenChange={setViewInvoiceDialogOpen}>
        <DialogContent className="sm:max-w-[500px]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Receipt className="h-5 w-5" /> Invoice Details
            </DialogTitle>
            <DialogDescription>{selectedInvoice?.invoiceNumber}</DialogDescription>
          </DialogHeader>
          {selectedInvoice && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <div className="text-sm text-muted-foreground">Invoice Number</div>
                  <div className="font-mono font-medium">{selectedInvoice.invoiceNumber}</div>
                </div>
                <div>
                  <div className="text-sm text-muted-foreground">Billing Month</div>
                  <div className="font-medium">{selectedInvoice.billingMonth}</div>
                </div>
                <div>
                  <div className="text-sm text-muted-foreground">Due Date</div>
                  <div className="font-medium">{format(new Date(selectedInvoice.dueDate), "dd MMM yyyy")}</div>
                </div>
                <div>
                  <div className="text-sm text-muted-foreground">Status</div>
                  <Badge className={cn(statusColors[selectedInvoice.status || "pending"])}>{selectedInvoice.status || "pending"}</Badge>
                </div>
                <div>
                  <div className="text-sm text-muted-foreground">Base Amount</div>
                  <div className="font-medium">{formatCurrency(parseFloat(selectedInvoice.baseAmount || "0"))}</div>
                </div>
                <div>
                  <div className="text-sm text-muted-foreground">Tax Amount</div>
                  <div className="font-medium">{formatCurrency(parseFloat(selectedInvoice.taxAmount || "0"))}</div>
                </div>
                <div className="col-span-2 pt-2 border-t">
                  <div className="text-sm text-muted-foreground">Total Amount</div>
                  <div className="text-2xl font-bold text-emerald-600">{formatCurrency(parseFloat(selectedInvoice.totalAmount || "0"))}</div>
                </div>
              </div>
            </div>
          )}
          <DialogFooter className="flex gap-2">
            <Button variant="outline" onClick={() => handleDownloadInvoice(selectedInvoice)}>
              <FileText className="h-4 w-4 mr-2" /> Download
            </Button>
            <Button variant="outline" onClick={() => setViewInvoiceDialogOpen(false)}>Close</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* View Work Order Dialog */}
      <Dialog open={viewWorkOrderDialogOpen} onOpenChange={setViewWorkOrderDialogOpen}>
        <DialogContent className="sm:max-w-[500px]">
          <DialogHeader>
            <DialogTitle>Work Order Details</DialogTitle>
            <DialogDescription>{selectedWorkOrder?.workOrderNumber}</DialogDescription>
          </DialogHeader>
          {selectedWorkOrder && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="col-span-2">
                  <div className="text-sm text-muted-foreground">Title</div>
                  <div className="font-medium">{selectedWorkOrder.title}</div>
                </div>
                {selectedWorkOrder.description && (
                  <div className="col-span-2">
                    <div className="text-sm text-muted-foreground">Description</div>
                    <div className="font-medium">{selectedWorkOrder.description}</div>
                  </div>
                )}
                <div>
                  <div className="text-sm text-muted-foreground">Category</div>
                  <div className="font-medium">{selectedWorkOrder.category || "—"}</div>
                </div>
                <div>
                  <div className="text-sm text-muted-foreground">Priority</div>
                  <Badge variant={selectedWorkOrder.priority === "critical" ? "destructive" : selectedWorkOrder.priority === "high" ? "default" : "secondary"}>
                    {selectedWorkOrder.priority || "low"}
                  </Badge>
                </div>
                <div>
                  <div className="text-sm text-muted-foreground">Status</div>
                  <Badge className={cn(statusColors[selectedWorkOrder.status || "open"])}>{selectedWorkOrder.status || "open"}</Badge>
                </div>
                <div>
                  <div className="text-sm text-muted-foreground">Created</div>
                  <div className="font-medium">{format(new Date(selectedWorkOrder.createdAt), "dd MMM yyyy")}</div>
                </div>
                {selectedWorkOrder.resolvedAt && (
                  <div>
                    <div className="text-sm text-muted-foreground">Resolved</div>
                    <div className="font-medium">{format(new Date(selectedWorkOrder.resolvedAt), "dd MMM yyyy")}</div>
                  </div>
                )}
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setViewWorkOrderDialogOpen(false)}>Close</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Create Invoice Dialog */}
      <Dialog open={createInvoiceDialogOpen} onOpenChange={setCreateInvoiceDialogOpen}>
        <DialogContent className="sm:max-w-[500px]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Receipt className="h-5 w-5" /> Create Invoice
            </DialogTitle>
            <DialogDescription>Generate a new invoice for {tenant.businessName}</DialogDescription>
          </DialogHeader>
          
          {!tenant.activeLease ? (
            <div className="py-8 text-center">
              <AlertCircle className="h-12 w-12 text-amber-500 mx-auto mb-4" />
              <p className="text-muted-foreground mb-2">No active lease found.</p>
              <p className="text-sm text-amber-600">Please create a lease first before generating invoices.</p>
            </div>
          ) : (
            <div className="space-y-4 py-4">
              {/* Invoice Preview */}
              <div className="bg-muted/30 rounded-lg p-4 space-y-2">
                <h4 className="text-sm font-semibold">Invoice Summary</h4>
                <div className="grid grid-cols-2 gap-2 text-sm">
                  <div>Base Rent:</div>
                  <div className="text-right font-medium">{formatCurrency(parseFloat(tenant.activeLease.baseRent || "0"))}</div>
                  <div>Maintenance:</div>
                  <div className="text-right font-medium">
                    {formatCurrency(parseFloat(
                      tenant.activeLease.maintenanceCharges || 
                      tenant.activeLease.camCharges || 
                      String((tenant.activeLease.terms as LeaseTerms)?.maintenanceCharges || 0)
                    ))}
                  </div>
                  <div>GST (18%):</div>
                  <div className="text-right font-medium">{formatCurrency(parseFloat(tenant.activeLease.baseRent || "0") * 0.18)}</div>
                  <div className="border-t pt-1 font-semibold">Total:</div>
                  <div className="border-t pt-1 text-right font-bold text-emerald-600">
                    {formatCurrency(
                      parseFloat(tenant.activeLease.baseRent || "0") + 
                      parseFloat(tenant.activeLease.maintenanceCharges || tenant.activeLease.camCharges || String((tenant.activeLease.terms as LeaseTerms)?.maintenanceCharges || 0)) +
                      parseFloat(tenant.activeLease.baseRent || "0") * 0.18
                    )}
                  </div>
                </div>
              </div>

              {/* Form Fields */}
              <div className="space-y-3">
                <div>
                  <label className="text-sm font-medium">Billing Month</label>
                  <Input 
                    value={invoiceForm.billingMonth}
                    onChange={(e) => setInvoiceForm(prev => ({ ...prev, billingMonth: e.target.value }))}
                    placeholder="January 2026"
                  />
                </div>
                <div>
                  <label className="text-sm font-medium">Due Date</label>
                  <Input 
                    type="date"
                    value={invoiceForm.dueDate}
                    onChange={(e) => setInvoiceForm(prev => ({ ...prev, dueDate: e.target.value }))}
                  />
                </div>
                <div>
                  <label className="text-sm font-medium">Description</label>
                  <Textarea 
                    value={invoiceForm.description}
                    onChange={(e) => setInvoiceForm(prev => ({ ...prev, description: e.target.value }))}
                    placeholder="Invoice description..."
                    rows={2}
                  />
                </div>
              </div>
            </div>
          )}
          
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateInvoiceDialogOpen(false)}>Cancel</Button>
            {tenant.activeLease && (
              <Button 
                className="bg-emerald-500 hover:bg-emerald-600"
                onClick={handleCreateInvoice}
                disabled={isSubmitting}
              >
                {isSubmitting ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Receipt className="h-4 w-4 mr-2" />}
                Generate Invoice
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Create Work Order Dialog */}
      <Dialog open={createWorkOrderDialogOpen} onOpenChange={setCreateWorkOrderDialogOpen}>
        <DialogContent className="sm:max-w-[500px]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Wrench className="h-5 w-5" /> Create Work Order
            </DialogTitle>
            <DialogDescription>Create a maintenance request for {tenant.businessName}</DialogDescription>
          </DialogHeader>
          
          <div className="space-y-4 py-4">
            <div>
              <label className="text-sm font-medium">Title *</label>
              <Input 
                value={workOrderForm.title}
                onChange={(e) => setWorkOrderForm(prev => ({ ...prev, title: e.target.value }))}
                placeholder="e.g., AC not working, Water leakage..."
              />
            </div>
            
            <div>
              <label className="text-sm font-medium">Description</label>
              <Textarea 
                value={workOrderForm.description}
                onChange={(e) => setWorkOrderForm(prev => ({ ...prev, description: e.target.value }))}
                placeholder="Detailed description of the issue..."
                rows={3}
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="text-sm font-medium">Category</label>
                <Select 
                  value={workOrderForm.category}
                  onValueChange={(v) => setWorkOrderForm(prev => ({ ...prev, category: v }))}
                >
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="maintenance">Maintenance</SelectItem>
                    <SelectItem value="electrical">Electrical</SelectItem>
                    <SelectItem value="plumbing">Plumbing</SelectItem>
                    <SelectItem value="hvac">HVAC</SelectItem>
                    <SelectItem value="cleaning">Cleaning</SelectItem>
                    <SelectItem value="security">Security</SelectItem>
                    <SelectItem value="other">Other</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <label className="text-sm font-medium">Priority</label>
                <Select 
                  value={workOrderForm.priority}
                  onValueChange={(v) => setWorkOrderForm(prev => ({ ...prev, priority: v }))}
                >
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="low">Low</SelectItem>
                    <SelectItem value="medium">Medium</SelectItem>
                    <SelectItem value="high">High</SelectItem>
                    <SelectItem value="critical">Critical</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>
          
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateWorkOrderDialogOpen(false)}>Cancel</Button>
            <Button 
              className="bg-orange-500 hover:bg-orange-600"
              onClick={handleCreateWorkOrder}
              disabled={isSubmitting || !workOrderForm.title}
            >
              {isSubmitting ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Wrench className="h-4 w-4 mr-2" />}
              Create Work Order
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Send Notification Dialog ──────────────────────────────────────── */}
      <Dialog open={notifyDialogOpen} onOpenChange={setNotifyDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Send Notification to Tenant</DialogTitle>
            <DialogDescription>
              This notification will appear in the tenant&apos;s portal.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <label className="text-sm font-medium">Type</label>
              <Select
                value={notifyForm.type}
                onValueChange={(v) => {
                  const titles: Record<string, string> = {
                    payment_reminder: "Payment Reminder",
                    announcement: "Announcement",
                    maintenance_update: "Maintenance Update",
                    lease_notice: "Lease Notice",
                    custom: "",
                  }
                  setNotifyForm({ ...notifyForm, type: v, title: titles[v] ?? "" })
                }}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="payment_reminder">Payment Reminder</SelectItem>
                  <SelectItem value="announcement">Announcement</SelectItem>
                  <SelectItem value="maintenance_update">Maintenance Update</SelectItem>
                  <SelectItem value="lease_notice">Lease Notice</SelectItem>
                  <SelectItem value="custom">Custom</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium">Title</label>
              <Input
                placeholder="Notification title..."
                value={notifyForm.title}
                onChange={(e) => setNotifyForm({ ...notifyForm, title: e.target.value })}
              />
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium">Message</label>
              <Textarea
                placeholder="Write your message to the tenant..."
                rows={4}
                value={notifyForm.content}
                onChange={(e) => setNotifyForm({ ...notifyForm, content: e.target.value })}
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setNotifyDialogOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={async () => {
                if (!notifyForm.title.trim() || !notifyForm.content.trim() || !tenant) return
                setNotifySending(true)
                try {
                  const res = await fetch("/api/notifications", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                      recipientId: tenant.id,
                      type: notifyForm.type,
                      title: notifyForm.title,
                      content: notifyForm.content,
                    }),
                  })
                  if (res.ok) {
                    toast({ title: "Notification sent", description: `Sent to ${tenant.businessName}` })
                    setNotifyDialogOpen(false)
                    setNotifyForm({ type: "announcement", title: "", content: "" })
                  } else {
                    toast({ title: "Failed to send", variant: "destructive" })
                  }
                } catch {
                  toast({ title: "Failed to send", variant: "destructive" })
                }
                setNotifySending(false)
              }}
              disabled={notifySending || !notifyForm.title.trim() || !notifyForm.content.trim()}
            >
              {notifySending ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Send className="h-4 w-4 mr-2" />}
              Send Notification
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
