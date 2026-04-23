"use client"

import * as React from "react"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
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
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form"
import {
  Users,
  Plus,
  Search,
  Filter,
  MoreHorizontal,
  TrendingUp,
  TrendingDown,
  RefreshCw,
  Loader2,
  Eye,
  Pencil,
  Trash2,
  Mail,
  Phone,
  MessageSquare,
  FileText,
  Bot,
  FileBarChart,
  Building2,
  AlertTriangle,
  KeyRound,
  Wifi,
  WifiOff,
  ShoppingCart,
  Zap,
  BarChart2,
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
} from "lucide-react"
import { cn, formatCurrency } from "@/lib/utils"
import Link from "next/link"
import { Textarea } from "@/components/ui/textarea"
import { useToast } from "@/components/ui/use-toast"
import { useRouter, useSearchParams, usePathname } from "next/navigation"
import { tenantUpdateSchema, type TenantUpdateFormData } from "@/lib/validations/tenant"
import { usePropertyStore } from "@/stores/property-store"
import { AddTenantDialog } from "@/components/tenants/add-tenant-dialog"
import { GrantPortalAccessDialog } from "@/components/tenants/grant-portal-access-dialog"

interface Tenant {
  id: string
  businessName: string
  legalEntityName: string | null
  category: string | null
  contactPerson: string | null
  email: string | null
  phone: string | null
  gstin: string | null
  status: string | null
  sentimentScore: string | null
  riskScore: string | null
  satisfactionScore: string | null
  lease: {
    id: string
    unitNumber: string
    floor: number | null
    areaSqft: string
    baseRent: string | null
    startDate: string
    endDate: string
    status: string | null
  } | null
}

interface POSIntegrationSummary {
  id: string
  tenantId: string
  provider: string
  storeId: string | null
  status: string | null
}

interface POSSaleSummary {
  tenantId: string
  grossSales: string
  netSales: string
  transactionCount: number | null
  salesDate: string
}

// ── Category taxonomy (single source of truth) ─────────────────────────────
// Extend this list to add a new tenant category — it flows through filters,
// badges, and the edit form automatically.

const CATEGORIES: { value: string; label: string; shortLabel?: string; badge: string }[] = [
  { value: "fashion",          label: "Fashion",             badge: "bg-pink-100 text-pink-700 dark:bg-pink-500/15 dark:text-pink-300" },
  { value: "food_beverage",    label: "Food & Beverage",     shortLabel: "F&B",         badge: "bg-orange-100 text-orange-700 dark:bg-orange-500/15 dark:text-orange-300" },
  { value: "electronics",      label: "Electronics",         badge: "bg-blue-100 text-blue-700 dark:bg-blue-500/15 dark:text-blue-300" },
  { value: "entertainment",    label: "Entertainment",       badge: "bg-purple-100 text-purple-700 dark:bg-purple-500/15 dark:text-purple-300" },
  { value: "health_beauty",    label: "Health & Beauty",     shortLabel: "Health & Beauty", badge: "bg-rose-100 text-rose-700 dark:bg-rose-500/15 dark:text-rose-300" },
  { value: "jewelry",          label: "Jewelry",             badge: "bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300" },
  { value: "sports",           label: "Sports",              badge: "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300" },
  { value: "home_lifestyle",   label: "Home & Lifestyle",    shortLabel: "Home",        badge: "bg-teal-100 text-teal-700 dark:bg-teal-500/15 dark:text-teal-300" },
  { value: "books_stationery", label: "Books & Stationery",  shortLabel: "Books",       badge: "bg-indigo-100 text-indigo-700 dark:bg-indigo-500/15 dark:text-indigo-300" },
  { value: "services",         label: "Services",            badge: "bg-green-100 text-green-700 dark:bg-green-500/15 dark:text-green-300" },
  { value: "other",            label: "Other",               badge: "bg-slate-100 text-slate-700 dark:bg-slate-500/15 dark:text-slate-300" },
]

const CATEGORY_BY_VALUE: Record<string, (typeof CATEGORIES)[number]> =
  CATEGORIES.reduce((acc, c) => { acc[c.value] = c; return acc }, {} as Record<string, (typeof CATEGORIES)[number]>)

const categoryColors: Record<string, string> =
  CATEGORIES.reduce((acc, c) => { acc[c.value] = c.badge; return acc }, {} as Record<string, string>)

const getCategoryLabel = (category: string | null) => {
  if (!category) return "Other"
  const cfg = CATEGORY_BY_VALUE[category]
  return cfg?.shortLabel || cfg?.label || category
}

// ── Status taxonomy ────────────────────────────────────────────────────────

const TENANT_STATUSES: {
  value:     string
  label:     string
  badgeCls:  string
  dotCls:    string
}[] = [
  { value: "active",      label: "Active",      badgeCls: "bg-emerald-100 text-emerald-700 border-emerald-200 dark:bg-emerald-500/15 dark:text-emerald-400 dark:border-emerald-500/30", dotCls: "bg-emerald-500" },
  { value: "pending",     label: "Pending",     badgeCls: "bg-blue-100 text-blue-700 border-blue-200 dark:bg-blue-500/15 dark:text-blue-400 dark:border-blue-500/30",                     dotCls: "bg-blue-500"    },
  { value: "inactive",    label: "Inactive",    badgeCls: "bg-slate-100 text-slate-700 border-slate-200 dark:bg-slate-500/20 dark:text-slate-300 dark:border-slate-500/30",               dotCls: "bg-slate-500"   },
  { value: "suspended",   label: "Suspended",   badgeCls: "bg-amber-100 text-amber-700 border-amber-200 dark:bg-amber-500/15 dark:text-amber-400 dark:border-amber-500/30",               dotCls: "bg-amber-500"   },
  { value: "terminated",  label: "Terminated",  badgeCls: "bg-red-100 text-red-700 border-red-200 dark:bg-red-500/15 dark:text-red-400 dark:border-red-500/30",                            dotCls: "bg-red-500"     },
]

const STATUS_BY_VALUE: Record<string, (typeof TENANT_STATUSES)[number]> =
  TENANT_STATUSES.reduce((acc, s) => { acc[s.value] = s; return acc }, {} as Record<string, (typeof TENANT_STATUSES)[number]>)

const getStatusConfig = (status: string | null) =>
  STATUS_BY_VALUE[status || ""] || { value: status || "unknown", label: status || "Unknown", badgeCls: "bg-muted text-muted-foreground border-border", dotCls: "bg-muted-foreground" }

const getSentimentColor = (score: string | null) => {
  const num = parseFloat(score || "0")
  if (num > 0.1) return "text-green-600"
  if (num < -0.1) return "text-red-600"
  return "text-yellow-600"
}

const getSentimentLabel = (score: string | null) => {
  const num = parseFloat(score || "0")
  if (num > 0.1) return "Positive"
  if (num < -0.1) return "Negative"
  return "Neutral"
}

const getRiskBadge = (score: string | null) => {
  const num = parseFloat(score || "0")
  if (num <= 0.2) return { label: "Low Risk", variant: "success" as const }
  if (num <= 0.5) return { label: "Medium Risk", variant: "warning" as const }
  return { label: "High Risk", variant: "destructive" as const }
}

export default function TenantsPage() {
  return (
    <React.Suspense fallback={
      <div className="flex items-center justify-center py-24">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    }>
      <TenantsPageInner />
    </React.Suspense>
  )
}

function TenantsPageInner() {
  const { toast } = useToast()
  const router = useRouter()
  const searchParams = useSearchParams()
  const pathname = usePathname()
  const { selectedProperty, properties, fetchProperties } = usePropertyStore()
  const [tenants, setTenants] = React.useState<Tenant[]>([])
  const [isLoading, setIsLoading] = React.useState(true)
  const [searchQuery, setSearchQuery] = React.useState("")
  const [categoryFilter, setCategoryFilter] = React.useState<string>("all")
  const [statusFilter, setStatusFilter] = React.useState<string>("all")
  const [currentPage, setCurrentPage] = React.useState(1)
  const [pageSize, setPageSize] = React.useState(10)
  const [dialogOpen, setDialogOpen] = React.useState(false)
  const [viewDialogOpen, setViewDialogOpen] = React.useState(false)
  const [editDialogOpen, setEditDialogOpen] = React.useState(false)
  const [deleteDialogOpen, setDeleteDialogOpen] = React.useState(false)
  const [portalAccessDialogOpen, setPortalAccessDialogOpen] = React.useState(false)
  const [selectedTenant, setSelectedTenant] = React.useState<Tenant | null>(null)
  const [isSubmitting, setIsSubmitting] = React.useState(false)

  // Email compose dialog state
  const [emailDialogOpen, setEmailDialogOpen] = React.useState(false)
  const [emailTenant, setEmailTenant]         = React.useState<Tenant | null>(null)
  const [emailSubject, setEmailSubject]       = React.useState("")
  const [emailMessage, setEmailMessage]       = React.useState("")
  const [emailSending, setEmailSending]       = React.useState(false)
  const [emailTemplate, setEmailTemplate]     = React.useState<string>("none")

  // Email template content map
  const emailTemplates: Record<string, { subject: string; message: string }> = {
    rent_reminder: {
      subject: "Friendly Rent Reminder",
      message:
        "Dear Tenant,\n\nThis is a friendly reminder that your monthly rent payment is due. Please ensure your payment is processed by the due date to avoid any late fees.\n\nIf you have already made the payment, please disregard this message.\n\nThank you for your prompt attention.",
    },
    maintenance_notice: {
      subject: "Scheduled Maintenance Notice",
      message:
        "Dear Tenant,\n\nWe would like to inform you of scheduled maintenance work in your area. Our team will be conducting necessary upkeep to ensure the best possible environment for your business.\n\nWe apologise for any inconvenience this may cause and appreciate your understanding.\n\nPlease contact us if you have any questions.",
    },
    lease_renewal: {
      subject: "Lease Renewal — Action Required",
      message:
        "Dear Tenant,\n\nYour current lease is approaching its expiry date. We value your presence at our property and would like to discuss the terms for a lease renewal.\n\nPlease reach out to us at your earliest convenience so we can begin the renewal process and ensure continuity of your business operations.\n\nWe look forward to continuing our partnership.",
    },
    general: {
      subject: "",
      message: "",
    },
  }

  // POS data maps: tenantId → integration / today's sale
  const [posIntegrations, setPosIntegrations] = React.useState<Record<string, POSIntegrationSummary>>({})
  const [posTodaySales, setPosTodaySales] = React.useState<Record<string, POSSaleSummary>>({})

  // Form for editing tenant
  const editForm = useForm<TenantUpdateFormData>({
    resolver: zodResolver(tenantUpdateSchema),
    defaultValues: {
      businessName: "",
      category: undefined,
      contactPerson: "",
      email: "",
      phone: "",
      gstin: "",
    },
  })

  // Ensure properties are loaded (header also does this, but cover direct navigation)
  React.useEffect(() => {
    fetchProperties()
  }, [fetchProperties])

  // Auto-open dialog when ?action=add is in the URL
  React.useEffect(() => {
    if (searchParams.get("action") === "add") {
      setDialogOpen(true)
    }
  }, [searchParams])

  // Fetch tenants from API - filtered by selected property
  const fetchTenants = React.useCallback(async (signal?: AbortSignal) => {
    console.log("[TenantsPage] fetchTenants called, selectedProperty:", selectedProperty?.id, selectedProperty?.name)
    setIsLoading(true)
    try {
      const url = selectedProperty
        ? `/api/tenants?propertyId=${selectedProperty.id}`
        : "/api/tenants"
      console.log("[TenantsPage] fetching:", url)
      const response = await fetch(url, { signal })
      if (!response.ok) throw new Error(`Failed to fetch tenants: ${response.status}`)
      const result = await response.json()
      const data = result.data || result || []
      console.log("[TenantsPage] got", data.length, "tenants")
      setTenants(data)
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") return
      console.error("[TenantsPage] Error fetching tenants:", error)
      toast({
        title: "Error",
        description: "Failed to load tenants. Please try again.",
        variant: "destructive",
      })
    } finally {
      setIsLoading(false)
    }
  }, [selectedProperty])

  // Re-fetch tenants when selectedProperty changes or on navigation (pathname acts as mount key)
  React.useEffect(() => {
    const controller = new AbortController()
    fetchTenants(controller.signal)
    return () => controller.abort()
  }, [fetchTenants, pathname])

  // Fetch POS integrations + today's sales for all tenants
  const fetchPOSData = React.useCallback(async () => {
    try {
      const today = new Date().toISOString().split("T")[0]
      const [intRes, salesRes] = await Promise.all([
        fetch("/api/pos/connect"),
        fetch(`/api/pos/sales?startDate=${today}&endDate=${today}`),
      ])
      if (intRes.ok) {
        const intJson = await intRes.json()
        const list: POSIntegrationSummary[] = intJson.data || []
        const map: Record<string, POSIntegrationSummary> = {}
        list.forEach((i) => { map[i.tenantId] = i })
        setPosIntegrations(map)
      }
      if (salesRes.ok) {
        const salesJson = await salesRes.json()
        const list: POSSaleSummary[] = salesJson.data || []
        const map: Record<string, POSSaleSummary> = {}
        list.forEach((s) => { map[s.tenantId] = s })
        setPosTodaySales(map)
      }
    } catch (e) {
      console.error("POS data fetch error:", e)
    }
  }, [])

  React.useEffect(() => {
    if (tenants.length > 0) fetchPOSData()
  }, [tenants, fetchPOSData])

  const filteredTenants = tenants.filter((tenant) => {
    const matchesSearch =
      tenant.businessName.toLowerCase().includes(searchQuery.toLowerCase()) ||
      tenant.contactPerson?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      tenant.lease?.unitNumber.toLowerCase().includes(searchQuery.toLowerCase())

    const matchesCategory = categoryFilter === "all" || tenant.category === categoryFilter
    const matchesStatus = statusFilter === "all" || tenant.status === statusFilter

    return matchesSearch && matchesCategory && matchesStatus
  })

  // Pagination
  const totalPages = Math.ceil(filteredTenants.length / pageSize)
  const paginatedTenants = filteredTenants.slice(
    (currentPage - 1) * pageSize,
    currentPage * pageSize
  )

  // Reset to page 1 when filters change
  React.useEffect(() => {
    setCurrentPage(1)
  }, [searchQuery, categoryFilter, statusFilter, selectedProperty])

  // Action handlers
  const handleViewTenant = (tenant: Tenant) => {
    // Navigate to tenant details page
    router.push(`/tenants/${tenant.id}`)
  }

  const handleEditTenant = (tenant: Tenant) => {
    setSelectedTenant(tenant)
    editForm.reset({
      businessName: tenant.businessName,
      category: tenant.category as TenantUpdateFormData["category"],
      contactPerson: tenant.contactPerson || "",
      email: tenant.email || "",
      phone: tenant.phone || "",
      gstin: tenant.gstin || "",
    })
    setEditDialogOpen(true)
  }

  const handleDeleteTenant = async (tenant: Tenant) => {
    setSelectedTenant(tenant)
    setDeleteDialogOpen(true)
  }

  const confirmDeleteTenant = async () => {
    if (!selectedTenant) return
    
    try {
      const response = await fetch(`/api/tenants/${selectedTenant.id}`, {
        method: "DELETE",
      })
      
      if (!response.ok) throw new Error("Failed to delete tenant")
      
      toast({
        title: "Success",
        description: "Tenant deleted successfully!",
      })
      
      setDeleteDialogOpen(false)
      setSelectedTenant(null)
      fetchTenants()
    } catch (error) {
      console.error("Error deleting tenant:", error)
      toast({
        title: "Error",
        description: "Failed to delete tenant. Please try again.",
        variant: "destructive",
      })
    }
  }

  const handleUpdateTenant = async (data: TenantUpdateFormData) => {
    if (!selectedTenant) return
    
    setIsSubmitting(true)
    try {
      const response = await fetch(`/api/tenants/${selectedTenant.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      })
      
      if (!response.ok) {
        const error = await response.json()
        throw new Error(error.error || "Failed to update tenant")
      }
      
      toast({
        title: "Success",
        description: "Tenant updated successfully!",
      })
      
      setEditDialogOpen(false)
      setSelectedTenant(null)
      fetchTenants()
    } catch (error) {
      console.error("Error updating tenant:", error)
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "Failed to update tenant. Please try again.",
        variant: "destructive",
      })
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleSendEmail = (tenant: Tenant) => {
    if (!tenant.email) {
      toast({
        title: "No Email",
        description: "This tenant doesn't have an email address on file.",
        variant: "destructive",
      })
      return
    }
    setEmailTenant(tenant)
    setEmailTemplate("none")
    setEmailSubject("")
    setEmailMessage("")
    setEmailDialogOpen(true)
  }

  const handleEmailTemplateChange = (tpl: string) => {
    setEmailTemplate(tpl)
    if (tpl !== "none" && emailTemplates[tpl]) {
      setEmailSubject(emailTemplates[tpl].subject)
      setEmailMessage(emailTemplates[tpl].message)
    }
  }

  const handleEmailSend = async () => {
    if (!emailTenant) return
    if (!emailSubject.trim() || !emailMessage.trim()) {
      toast({ title: "Missing fields", description: "Subject and message are required.", variant: "destructive" })
      return
    }
    setEmailSending(true)
    try {
      const res = await fetch("/api/email/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          to:       emailTenant.email,
          subject:  emailSubject.trim(),
          message:  emailMessage.trim(),
          tenantId: emailTenant.id,
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || "Failed to send email")
      toast({ title: "Email sent", description: `Message delivered to ${emailTenant.email}` })
      setEmailDialogOpen(false)
    } catch (err) {
      toast({
        title: "Send failed",
        description: err instanceof Error ? err.message : "Unknown error",
        variant: "destructive",
      })
    } finally {
      setEmailSending(false)
    }
  }

  const handleCall = (tenant: Tenant) => {
    if (tenant.phone) {
      window.location.href = `tel:${tenant.phone}`
    } else {
      toast({
        title: "No Phone",
        description: "This tenant doesn't have a phone number on file.",
        variant: "destructive",
      })
    }
  }

  // Calculate stats
  const totalRevenue = tenants.reduce(
    (sum, t) => sum + parseFloat(t.lease?.baseRent || "0"),
    0
  )
  const avgSatisfaction = tenants.length > 0
    ? tenants.reduce((sum, t) => {
        // satisfactionScore is stored as 0-5 scale (mapped from 0-100)
        const raw = parseFloat(t.satisfactionScore || "0")
        return sum + Math.round((raw / 5) * 100)
      }, 0) / tenants.length
    : 0
  const atRiskCount = tenants.filter((t) => parseFloat(t.riskScore || "0") > 0.3).length

  // Helper function to format phone input (restrict to 10 digits)
  const handlePhoneInput = (value: string, onChange: (val: string) => void) => {
    // Remove all non-digits except + at the start
    let cleaned = value.replace(/[^\d+]/g, "")
    // If starts with +91, keep it, otherwise just keep digits
    if (cleaned.startsWith("+91")) {
      cleaned = "+91" + cleaned.slice(3).replace(/\D/g, "").slice(0, 10)
    } else {
      cleaned = cleaned.replace(/\D/g, "").slice(0, 10)
    }
    onChange(cleaned)
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Tenants</h1>
          <p className="text-muted-foreground">
            Manage tenant relationships and monitor performance
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => fetchTenants()} disabled={isLoading}>
            <RefreshCw className={`h-4 w-4 mr-2 ${isLoading ? "animate-spin" : ""}`} />
            Refresh
          </Button>
          <Button className="gap-2" onClick={() => setDialogOpen(true)}>
            <Plus className="h-4 w-4" />
            Add Tenant
          </Button>
          <AddTenantDialog
            open={dialogOpen}
            onOpenChange={setDialogOpen}
            properties={properties}
            selectedPropertyId={selectedProperty?.id}
            onSuccess={fetchTenants}
          />
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Tenants</CardTitle>
            <Users className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{tenants.length}</div>
            <p className="text-xs text-muted-foreground">
              {tenants.filter((t) => t.status === "active").length} active
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Monthly Revenue</CardTitle>
            <TrendingUp className="h-4 w-4 text-green-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{formatCurrency(totalRevenue)}</div>
            <p className="text-xs text-green-600">From active leases</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Avg Satisfaction</CardTitle>
            <TrendingUp className="h-4 w-4 text-green-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{Math.round(avgSatisfaction)}/100</div>
            <p className="text-xs text-green-600">Calculated score</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">At Risk</CardTitle>
            <TrendingDown className="h-4 w-4 text-red-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{atRiskCount}</div>
            <p className="text-xs text-red-600">Requires attention</p>
          </CardContent>
        </Card>
      </div>

      {/* Filters */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-base">Tenant Directory</CardTitle>
            <div className="flex items-center gap-2">
              <div className="relative">
                <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search tenants..."
                  className="pl-8 w-[250px]"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                />
              </div>
              <Select value={categoryFilter} onValueChange={setCategoryFilter}>
                <SelectTrigger className="w-[180px]">
                  <Filter className="h-4 w-4 mr-2" />
                  <SelectValue placeholder="Category" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Categories</SelectItem>
                  {CATEGORIES.map((c) => (
                    <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger className="w-[150px]">
                  <SelectValue placeholder="Status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Statuses</SelectItem>
                  {TENANT_STATUSES.map((s) => (
                    <SelectItem key={s.value} value={s.value}>
                      <span className="flex items-center gap-2">
                        <span className={cn("h-2 w-2 rounded-full", s.dotCls)} />
                        {s.label}
                      </span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
          ) : filteredTenants.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <Users className="h-12 w-12 text-muted-foreground/50 mb-4" />
              <h3 className="text-lg font-semibold">No tenants found</h3>
              <p className="text-muted-foreground">
                {tenants.length === 0
                  ? "Add your first tenant to get started"
                  : "Try adjusting your search or filters"}
              </p>
            </div>
          ) : (
            <>
            <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[200px] min-w-[200px]">Tenant</TableHead>
                  <TableHead className="w-[140px] min-w-[140px]">Unit</TableHead>
                  <TableHead className="w-[130px] min-w-[130px]">Category</TableHead>
                  <TableHead className="w-[110px] min-w-[110px]">Status</TableHead>
                  <TableHead className="w-[120px] min-w-[120px]">Monthly Rent</TableHead>
                  <TableHead className="w-[180px] min-w-[180px]">POS / Today&apos;s Sales</TableHead>
                  <TableHead className="w-[150px] min-w-[150px]">Sentiment</TableHead>
                  <TableHead className="w-[110px] min-w-[110px]">Risk</TableHead>
                  <TableHead className="w-[150px] min-w-[150px]">Satisfaction</TableHead>
                  <TableHead className="w-[120px] min-w-[120px] text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {paginatedTenants.map((tenant) => {
                  const risk = getRiskBadge(tenant.riskScore)
                  return (
                    <TableRow key={tenant.id} className="h-12">
                      <TableCell className="whitespace-nowrap py-2">
                        <div className="flex items-center gap-2 max-w-[200px]">
                          <Avatar className="h-8 w-8 flex-shrink-0">
                            <AvatarFallback className="bg-primary/10 text-primary text-xs">
                              {tenant.businessName.charAt(0)}
                            </AvatarFallback>
                          </Avatar>
                          <div className="overflow-hidden">
                            <Link
                              href={`/tenants/${tenant.id}/revenue`}
                              className="font-medium hover:text-primary hover:underline underline-offset-2 transition-colors block truncate"
                              onClick={e => e.stopPropagation()}
                              title={tenant.businessName}
                            >
                              {tenant.businessName}
                            </Link>
                            <span className="text-xs text-muted-foreground truncate block" title={tenant.contactPerson || "No contact"}>
                              {tenant.contactPerson || "No contact"}
                            </span>
                          </div>
                        </div>
                      </TableCell>
                      <TableCell className="whitespace-nowrap py-2">
                        {tenant.lease ? (
                          <div className="flex items-center gap-1">
                            <Building2 className="h-3.5 w-3.5 text-muted-foreground flex-shrink-0" />
                            <span className="font-medium">{tenant.lease.unitNumber}</span>
                            <span className="text-muted-foreground text-xs">(Floor {tenant.lease.floor || "G"})</span>
                            <span className="text-muted-foreground text-xs">· {tenant.lease.areaSqft} sqft</span>
                          </div>
                        ) : (
                          <span className="text-muted-foreground text-sm">No lease</span>
                        )}
                      </TableCell>
                      <TableCell className="whitespace-nowrap py-2">
                        <Badge
                          variant="secondary"
                          className={categoryColors[tenant.category || ""] || "bg-slate-100 text-slate-700 dark:bg-slate-500/15 dark:text-slate-300"}
                        >
                          {getCategoryLabel(tenant.category)}
                        </Badge>
                      </TableCell>
                      <TableCell className="whitespace-nowrap py-2">
                        {(() => {
                          const s = getStatusConfig(tenant.status)
                          return (
                            <Badge variant="outline" className={cn("gap-1.5 border font-medium", s.badgeCls)}>
                              <span className={cn("h-1.5 w-1.5 rounded-full", s.dotCls)} />
                              {s.label}
                            </Badge>
                          )
                        })()}
                      </TableCell>
                      <TableCell className="whitespace-nowrap py-2 font-medium">
                        {formatCurrency(tenant.lease?.baseRent || "0")}
                      </TableCell>
                      <TableCell className="whitespace-nowrap py-2">
                        {(() => {
                          const integration = posIntegrations[tenant.id]
                          const todaySale   = posTodaySales[tenant.id]
                          if (!integration) {
                            return (
                              <span className="flex items-center gap-1 text-xs text-muted-foreground">
                                <WifiOff className="h-3.5 w-3.5" /> No POS
                              </span>
                            )
                          }
                          return (
                            <div className="flex items-center gap-1.5">
                              <Wifi className="h-3.5 w-3.5 text-green-500 flex-shrink-0" />
                              <span className="text-xs font-medium capitalize text-green-700">{integration.provider.replace("_", " ")}</span>
                              {todaySale ? (
                                <>
                                  <span className="text-muted-foreground">·</span>
                                  <span className="text-xs font-semibold">{formatCurrency(parseFloat(todaySale.grossSales))}</span>
                                  <span className="text-muted-foreground text-xs">({todaySale.transactionCount || 0})</span>
                                </>
                              ) : (
                                <span className="text-xs text-muted-foreground">· No sales</span>
                              )}
                            </div>
                          )
                        })()}
                      </TableCell>
                      <TableCell className="whitespace-nowrap py-2">
                        <div className="flex items-center gap-1">
                          <Bot className="h-3.5 w-3.5 text-muted-foreground flex-shrink-0" />
                          <span className={`font-medium text-sm ${getSentimentColor(tenant.sentimentScore)}`}>
                            {getSentimentLabel(tenant.sentimentScore)}
                          </span>
                          <span className="text-muted-foreground text-xs">
                            ({parseFloat(tenant.sentimentScore || "0").toFixed(2)})
                          </span>
                        </div>
                      </TableCell>
                      <TableCell className="whitespace-nowrap py-2">
                        <Badge variant={risk.variant}>{risk.label}</Badge>
                      </TableCell>
                      <TableCell className="whitespace-nowrap py-2">
                        {(() => {
                          if (!tenant.satisfactionScore) return <span className="text-muted-foreground">N/A</span>
                          const score = Math.round((parseFloat(tenant.satisfactionScore) / 5) * 100)
                          const color = score >= 70 ? "text-green-600" : score >= 40 ? "text-yellow-600" : "text-red-600"
                          const label = score >= 70 ? "High" : score >= 40 ? "Medium" : "Low"
                          return (
                            <div className="flex items-center gap-1">
                              <span className={`font-medium ${color}`}>{score}</span>
                              <span className="text-muted-foreground text-xs">/ 100</span>
                              <Badge variant={score >= 70 ? "success" : score >= 40 ? "warning" : "destructive"} className="text-[10px] px-1 py-0">
                                {label}
                              </Badge>
                            </div>
                          )
                        })()}
                      </TableCell>
                      <TableCell className="whitespace-nowrap py-2 text-right">
                        <div className="flex items-center justify-end gap-0.5">
                          <Button
                            variant="ghost"
                            size="icon"
                            title={tenant.email ? `Email ${tenant.businessName}` : "No email on file"}
                            onClick={() => handleSendEmail(tenant)}
                          >
                            <MessageSquare className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            title={tenant.lease ? `View lease ${tenant.lease.unitNumber}` : "No active lease"}
                            onClick={() => {
                              if (tenant.lease) {
                                router.push(`/leases/${tenant.lease.id}`)
                              } else {
                                toast({
                                  title: "No Lease",
                                  description: `${tenant.businessName} does not have an active lease.`,
                                  variant: "destructive",
                                })
                              }
                            }}
                          >
                            <FileText className="h-4 w-4" />
                          </Button>
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button variant="ghost" size="icon">
                                <MoreHorizontal className="h-4 w-4" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end" className="w-48">
                              <DropdownMenuLabel>Actions</DropdownMenuLabel>
                              <DropdownMenuSeparator />
                              <DropdownMenuItem onClick={() => handleViewTenant(tenant)}>
                                <Eye className="h-4 w-4 mr-2" />
                                View Details
                              </DropdownMenuItem>
                              <DropdownMenuItem asChild>
                                <Link href={`/tenants/${tenant.id}/revenue`}>
                                  <BarChart2 className="h-4 w-4 mr-2" />
                                  Revenue Intelligence
                                </Link>
                              </DropdownMenuItem>
                              <DropdownMenuItem onClick={() => handleEditTenant(tenant)}>
                                <Pencil className="h-4 w-4 mr-2" />
                                Edit Tenant
                              </DropdownMenuItem>
                              <DropdownMenuItem onClick={() => { setSelectedTenant(tenant); setPortalAccessDialogOpen(true) }}>
                                <KeyRound className="h-4 w-4 mr-2" />
                                Portal Access
                              </DropdownMenuItem>
                              <DropdownMenuSeparator />
                              <DropdownMenuItem onClick={() => handleSendEmail(tenant)}>
                                <Mail className="h-4 w-4 mr-2" />
                                Send Email
                              </DropdownMenuItem>
                              <DropdownMenuItem onClick={() => handleCall(tenant)}>
                                <Phone className="h-4 w-4 mr-2" />
                                Call Tenant
                              </DropdownMenuItem>
                              <DropdownMenuSeparator />
                              <DropdownMenuItem asChild>
                                <Link href={`/financials?tenantId=${tenant.id}`}>
                                  <FileBarChart className="h-4 w-4 mr-2" />
                                  View Invoices
                                </Link>
                              </DropdownMenuItem>
                              <DropdownMenuItem asChild>
                                <Link href={`/work-orders?tenantId=${tenant.id}`}>
                                  <AlertTriangle className="h-4 w-4 mr-2" />
                                  View Work Orders
                                </Link>
                              </DropdownMenuItem>
                              {posIntegrations[tenant.id] && (
                                <DropdownMenuItem asChild>
                                  <Link href={`/pos-simulator?tenantId=${tenant.id}`}>
                                    <ShoppingCart className="h-4 w-4 mr-2" />
                                    POS Simulator
                                  </Link>
                                </DropdownMenuItem>
                              )}
                              <DropdownMenuSeparator />
                              <DropdownMenuItem
                                onClick={() => handleDeleteTenant(tenant)}
                                className="text-red-600 focus:text-red-600"
                              >
                                <Trash2 className="h-4 w-4 mr-2" />
                                Delete Tenant
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </div>
                      </TableCell>
                    </TableRow>
                  )
                })}
              </TableBody>
            </Table>
            </div>

            {/* Pagination */}
            {filteredTenants.length > 0 && (
              <div className="flex items-center justify-between border-t pt-4 mt-4">
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <span>
                    Showing {(currentPage - 1) * pageSize + 1}–{Math.min(currentPage * pageSize, filteredTenants.length)} of {filteredTenants.length}
                  </span>
                  <Select value={String(pageSize)} onValueChange={(v) => { setPageSize(Number(v)); setCurrentPage(1) }}>
                    <SelectTrigger className="h-8 w-[70px]">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="10">10</SelectItem>
                      <SelectItem value="20">20</SelectItem>
                      <SelectItem value="50">50</SelectItem>
                      <SelectItem value="100">100</SelectItem>
                    </SelectContent>
                  </Select>
                  <span>per page</span>
                </div>
                <div className="flex items-center gap-1">
                  <Button variant="outline" size="icon" className="h-8 w-8" disabled={currentPage <= 1} onClick={() => setCurrentPage(1)}>
                    <ChevronsLeft className="h-4 w-4" />
                  </Button>
                  <Button variant="outline" size="icon" className="h-8 w-8" disabled={currentPage <= 1} onClick={() => setCurrentPage((p) => p - 1)}>
                    <ChevronLeft className="h-4 w-4" />
                  </Button>
                  <span className="px-3 text-sm font-medium">
                    {currentPage} / {totalPages || 1}
                  </span>
                  <Button variant="outline" size="icon" className="h-8 w-8" disabled={currentPage >= totalPages} onClick={() => setCurrentPage((p) => p + 1)}>
                    <ChevronRight className="h-4 w-4" />
                  </Button>
                  <Button variant="outline" size="icon" className="h-8 w-8" disabled={currentPage >= totalPages} onClick={() => setCurrentPage(totalPages)}>
                    <ChevronsRight className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            )}
          </>
          )}
        </CardContent>
      </Card>

      {/* View Tenant Dialog */}
      <Dialog open={viewDialogOpen} onOpenChange={setViewDialogOpen}>
        <DialogContent className="sm:max-w-[600px]">
          <DialogHeader>
            <DialogTitle>Tenant Details</DialogTitle>
            <DialogDescription>
              Complete information about {selectedTenant?.businessName}
            </DialogDescription>
          </DialogHeader>
          {selectedTenant && (
            <div className="grid gap-4 py-4">
              <div className="flex items-center gap-4">
                <Avatar className="h-16 w-16">
                  <AvatarFallback className="bg-primary/10 text-primary text-xl">
                    {selectedTenant.businessName.charAt(0)}
                  </AvatarFallback>
                </Avatar>
                <div>
                  <h3 className="text-lg font-semibold">{selectedTenant.businessName}</h3>
                  {selectedTenant.legalEntityName && (
                    <p className="text-sm text-muted-foreground">{selectedTenant.legalEntityName}</p>
                  )}
                  {(() => {
                    const s = getStatusConfig(selectedTenant.status)
                    return (
                      <Badge variant="outline" className={cn("gap-1.5 border font-medium", s.badgeCls)}>
                        <span className={cn("h-1.5 w-1.5 rounded-full", s.dotCls)} />
                        {s.label}
                      </Badge>
                    )
                  })()}
                </div>
              </div>
              
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-sm font-medium text-muted-foreground">Contact Person</label>
                  <p className="text-sm">{selectedTenant.contactPerson || "Not specified"}</p>
                </div>
                <div>
                  <label className="text-sm font-medium text-muted-foreground">Category</label>
                  <p className="text-sm">{getCategoryLabel(selectedTenant.category)}</p>
                </div>
                <div>
                  <label className="text-sm font-medium text-muted-foreground">Email</label>
                  <p className="text-sm">{selectedTenant.email || "Not specified"}</p>
                </div>
                <div>
                  <label className="text-sm font-medium text-muted-foreground">Phone</label>
                  <p className="text-sm">{selectedTenant.phone || "Not specified"}</p>
                </div>
                <div>
                  <label className="text-sm font-medium text-muted-foreground">GSTIN</label>
                  <p className="text-sm">{selectedTenant.gstin || "Not specified"}</p>
                </div>
                <div>
                  <label className="text-sm font-medium text-muted-foreground">Risk Score</label>
                  <p className="text-sm">
                    <Badge variant={getRiskBadge(selectedTenant.riskScore).variant}>
                      {getRiskBadge(selectedTenant.riskScore).label}
                    </Badge>
                  </p>
                </div>
              </div>

              {selectedTenant.lease && (
                <>
                  <div className="border-t pt-4">
                    <h4 className="font-medium mb-2">Lease Information</h4>
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className="text-sm font-medium text-muted-foreground">Unit</label>
                        <p className="text-sm">{selectedTenant.lease.unitNumber} (Floor {selectedTenant.lease.floor || "G"})</p>
                      </div>
                      <div>
                        <label className="text-sm font-medium text-muted-foreground">Area</label>
                        <p className="text-sm">{selectedTenant.lease.areaSqft} sq.ft</p>
                      </div>
                      <div>
                        <label className="text-sm font-medium text-muted-foreground">Base Rent</label>
                        <p className="text-sm">{formatCurrency(selectedTenant.lease.baseRent || "0")}/month</p>
                      </div>
                      <div>
                        <label className="text-sm font-medium text-muted-foreground">Lease Period</label>
                        <p className="text-sm">
                          {new Date(selectedTenant.lease.startDate).toLocaleDateString()} - {new Date(selectedTenant.lease.endDate).toLocaleDateString()}
                        </p>
                      </div>
                    </div>
                  </div>
                </>
              )}
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setViewDialogOpen(false)}>
              Close
            </Button>
            <Button onClick={() => {
              setViewDialogOpen(false)
              if (selectedTenant) handleEditTenant(selectedTenant)
            }}>
              Edit Tenant
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit Tenant Dialog */}
      <Dialog open={editDialogOpen} onOpenChange={(open) => {
        setEditDialogOpen(open)
        if (!open) {
          editForm.reset()
          setSelectedTenant(null)
        }
      }}>
        <DialogContent className="sm:max-w-[500px]">
          <Form {...editForm}>
            <form onSubmit={editForm.handleSubmit(handleUpdateTenant)}>
              <DialogHeader>
                <DialogTitle>Edit Tenant</DialogTitle>
                <DialogDescription>
                  Update the tenant information for {selectedTenant?.businessName}
                </DialogDescription>
              </DialogHeader>
              <div className="grid gap-4 py-4">
                <FormField
                  control={editForm.control}
                  name="businessName"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Business Name *</FormLabel>
                      <FormControl>
                        <Input placeholder="Enter business name" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={editForm.control}
                  name="category"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Category</FormLabel>
                      <Select onValueChange={field.onChange} value={field.value || ""}>
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder="Select category" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {CATEGORIES.filter((c) => c.value !== "other").map((c) => (
                            <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <div className="grid grid-cols-2 gap-4">
                  <FormField
                    control={editForm.control}
                    name="contactPerson"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Contact Person</FormLabel>
                        <FormControl>
                          <Input placeholder="Contact name" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={editForm.control}
                    name="phone"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Phone</FormLabel>
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
                  control={editForm.control}
                  name="email"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Email</FormLabel>
                      <FormControl>
                        <Input
                          type="email"
                          placeholder="email@example.com"
                          {...field}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={editForm.control}
                  name="gstin"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>GSTIN</FormLabel>
                      <FormControl>
                        <Input
                          placeholder="15-character GSTIN"
                          {...field}
                          onChange={(e) => field.onChange(e.target.value.toUpperCase())}
                          maxLength={15}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => setEditDialogOpen(false)}>
                  Cancel
                </Button>
                <Button type="submit" disabled={isSubmitting}>
                  {isSubmitting && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                  Save Changes
                </Button>
              </DialogFooter>
            </form>
          </Form>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <DialogContent className="sm:max-w-[400px]">
          <DialogHeader>
            <DialogTitle>Delete Tenant</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete {selectedTenant?.businessName}? This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteDialogOpen(false)}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={confirmDeleteTenant}>
              Delete Tenant
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Portal Access Dialog */}
      {selectedTenant && (
        <GrantPortalAccessDialog
          open={portalAccessDialogOpen}
          onOpenChange={setPortalAccessDialogOpen}
          tenant={{
            id:            selectedTenant.id,
            businessName:  selectedTenant.businessName,
            email:         selectedTenant.email,
            contactPerson: selectedTenant.contactPerson,
          }}
        />
      )}

      {/* ── Send Email Dialog ─────────────────────────────── */}
      <Dialog
        open={emailDialogOpen}
        onOpenChange={(open) => {
          if (!emailSending) {
            setEmailDialogOpen(open)
            if (!open) setEmailTenant(null)
          }
        }}
      >
        <DialogContent className="sm:max-w-[520px]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Mail className="h-5 w-5 text-primary" />
              Send Email
            </DialogTitle>
            <DialogDescription>
              Compose a message to{" "}
              <span className="font-medium text-foreground">
                {emailTenant?.businessName}
              </span>
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-4 py-2">
            {/* Template picker */}
            <div className="grid gap-1.5">
              <label className="text-sm font-medium">Template</label>
              <Select value={emailTemplate} onValueChange={handleEmailTemplateChange}>
                <SelectTrigger>
                  <SelectValue placeholder="Choose a template (optional)" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">No template — write from scratch</SelectItem>
                  <SelectItem value="rent_reminder">Rent Reminder</SelectItem>
                  <SelectItem value="maintenance_notice">Maintenance Notice</SelectItem>
                  <SelectItem value="lease_renewal">Lease Renewal</SelectItem>
                  <SelectItem value="general">General Message</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* To (readonly) */}
            <div className="grid gap-1.5">
              <label className="text-sm font-medium">To</label>
              <Input
                value={emailTenant?.email ?? ""}
                readOnly
                className="bg-muted text-muted-foreground cursor-not-allowed"
              />
            </div>

            {/* Subject */}
            <div className="grid gap-1.5">
              <label className="text-sm font-medium">
                Subject <span className="text-destructive">*</span>
              </label>
              <Input
                placeholder="Enter email subject"
                value={emailSubject}
                onChange={(e) => setEmailSubject(e.target.value)}
                disabled={emailSending}
              />
            </div>

            {/* Message */}
            <div className="grid gap-1.5">
              <label className="text-sm font-medium">
                Message <span className="text-destructive">*</span>
              </label>
              <Textarea
                placeholder="Write your message here…"
                value={emailMessage}
                onChange={(e) => setEmailMessage(e.target.value)}
                disabled={emailSending}
                rows={7}
                className="resize-none"
              />
              <p className="text-xs text-muted-foreground text-right">
                {emailMessage.length} characters
              </p>
            </div>
          </div>

          <DialogFooter className="gap-2">
            <Button
              variant="outline"
              onClick={() => setEmailDialogOpen(false)}
              disabled={emailSending}
            >
              Cancel
            </Button>
            <Button onClick={handleEmailSend} disabled={emailSending}>
              {emailSending ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Sending…
                </>
              ) : (
                <>
                  <Mail className="h-4 w-4 mr-2" />
                  Send Email
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
