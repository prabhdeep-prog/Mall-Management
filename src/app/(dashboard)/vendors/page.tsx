"use client"

import * as React from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { Progress } from "@/components/ui/progress"
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
  DialogTrigger,
} from "@/components/ui/dialog"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import {
  Truck,
  Plus,
  Search,
  Filter,
  MoreHorizontal,
  RefreshCw,
  Loader2,
  Eye,
  Edit,
  Trash2,
  Star,
  Phone,
  Mail,
  MapPin,
  FileText,
  CheckCircle2,
  Clock,
  DollarSign,
  TrendingUp,
  AlertTriangle,
  Award,
} from "lucide-react"
import { useToast } from "@/components/ui/use-toast"
import { format } from "date-fns"

interface Vendor {
  id: string
  organizationId: string
  name: string
  category: string
  contactPerson: string | null
  email: string | null
  phone: string | null
  address: string | null
  gstNumber: string | null
  panNumber: string | null
  bankDetails: {
    accountName?: string
    accountNumber?: string
    bankName?: string
    ifscCode?: string
  } | null
  performanceRating: number
  totalWorkOrders: number
  completedWorkOrders: number
  avgResponseTime: number | null
  avgCompletionTime: number | null
  totalAmountPaid: number
  status: string
  contractExpiry: string | null
  createdAt: string
}

const categoryConfig: Record<string, { label: string; icon: React.ReactNode; color: string }> = {
  hvac: { label: "HVAC", icon: <Truck className="h-4 w-4" />, color: "bg-blue-100 text-blue-800" },
  electrical: { label: "Electrical", icon: <Truck className="h-4 w-4" />, color: "bg-yellow-100 text-yellow-800" },
  plumbing: { label: "Plumbing", icon: <Truck className="h-4 w-4" />, color: "bg-cyan-100 text-cyan-800" },
  cleaning: { label: "Cleaning", icon: <Truck className="h-4 w-4" />, color: "bg-green-100 text-green-800" },
  security: { label: "Security", icon: <Truck className="h-4 w-4" />, color: "bg-red-100 text-red-800" },
  landscaping: { label: "Landscaping", icon: <Truck className="h-4 w-4" />, color: "bg-emerald-100 text-emerald-800" },
  elevator: { label: "Elevator", icon: <Truck className="h-4 w-4" />, color: "bg-purple-100 text-purple-800" },
  general: { label: "General", icon: <Truck className="h-4 w-4" />, color: "bg-gray-100 text-gray-800" },
  pest_control: { label: "Pest Control", icon: <Truck className="h-4 w-4" />, color: "bg-orange-100 text-orange-800" },
  it: { label: "IT Services", icon: <Truck className="h-4 w-4" />, color: "bg-indigo-100 text-indigo-800" },
}

const statusConfig: Record<string, { label: string; color: string }> = {
  active: { label: "Active", color: "bg-green-100 text-green-800" },
  inactive: { label: "Inactive", color: "bg-gray-100 text-gray-800" },
  suspended: { label: "Suspended", color: "bg-red-100 text-red-800" },
  pending: { label: "Pending", color: "bg-yellow-100 text-yellow-800" },
}

// Demo vendor data
const demoVendors: Vendor[] = [
  {
    id: "1",
    organizationId: "org-1",
    name: "CoolTech HVAC Solutions",
    category: "hvac",
    contactPerson: "Rajesh Kumar",
    email: "rajesh@cooltech.in",
    phone: "+91 98765 43210",
    address: "123, Industrial Area, Phase 2, Gurgaon",
    gstNumber: "27AABCU9603R1ZM",
    panNumber: "AABCU9603R",
    bankDetails: {
      accountName: "CoolTech HVAC Solutions Pvt Ltd",
      accountNumber: "12345678901234",
      bankName: "HDFC Bank",
      ifscCode: "HDFC0001234",
    },
    performanceRating: 4.5,
    totalWorkOrders: 156,
    completedWorkOrders: 148,
    avgResponseTime: 2.5,
    avgCompletionTime: 6.2,
    totalAmountPaid: 4850000,
    status: "active",
    contractExpiry: "2026-12-31",
    createdAt: "2022-03-15",
  },
  {
    id: "2",
    organizationId: "org-1",
    name: "PowerGrid Electrical Services",
    category: "electrical",
    contactPerson: "Suresh Menon",
    email: "suresh@powergrid.in",
    phone: "+91 87654 32109",
    address: "456, Sector 18, Noida",
    gstNumber: "09AABCP9603R1ZM",
    panNumber: "AABCP9603R",
    bankDetails: null,
    performanceRating: 4.2,
    totalWorkOrders: 89,
    completedWorkOrders: 85,
    avgResponseTime: 1.8,
    avgCompletionTime: 4.5,
    totalAmountPaid: 2340000,
    status: "active",
    contractExpiry: "2026-06-30",
    createdAt: "2023-01-10",
  },
  {
    id: "3",
    organizationId: "org-1",
    name: "AquaFlow Plumbing",
    category: "plumbing",
    contactPerson: "Anil Sharma",
    email: "anil@aquaflow.in",
    phone: "+91 76543 21098",
    address: "789, DLF Cyber City, Gurgaon",
    gstNumber: "06AABCA9603R1ZM",
    panNumber: "AABCA9603R",
    bankDetails: {
      accountName: "AquaFlow Plumbing",
      accountNumber: "98765432109876",
      bankName: "ICICI Bank",
      ifscCode: "ICIC0001234",
    },
    performanceRating: 3.8,
    totalWorkOrders: 67,
    completedWorkOrders: 58,
    avgResponseTime: 3.2,
    avgCompletionTime: 8.1,
    totalAmountPaid: 1560000,
    status: "active",
    contractExpiry: "2025-09-30",
    createdAt: "2023-06-20",
  },
  {
    id: "4",
    organizationId: "org-1",
    name: "CleanSweep Facilities",
    category: "cleaning",
    contactPerson: "Priya Singh",
    email: "priya@cleansweep.in",
    phone: "+91 65432 10987",
    address: "321, Connaught Place, New Delhi",
    gstNumber: "07AABCC9603R1ZM",
    panNumber: "AABCC9603R",
    bankDetails: null,
    performanceRating: 4.7,
    totalWorkOrders: 245,
    completedWorkOrders: 243,
    avgResponseTime: 0.5,
    avgCompletionTime: 2.0,
    totalAmountPaid: 3200000,
    status: "active",
    contractExpiry: "2026-03-31",
    createdAt: "2021-08-01",
  },
  {
    id: "5",
    organizationId: "org-1",
    name: "SecureShield Security",
    category: "security",
    contactPerson: "Major Vikram Rao (Retd)",
    email: "vikram@secureshield.in",
    phone: "+91 54321 09876",
    address: "567, Defence Colony, New Delhi",
    gstNumber: "07AABCS9603R1ZM",
    panNumber: "AABCS9603R",
    bankDetails: {
      accountName: "SecureShield Security Pvt Ltd",
      accountNumber: "11223344556677",
      bankName: "State Bank of India",
      ifscCode: "SBIN0001234",
    },
    performanceRating: 4.9,
    totalWorkOrders: 12,
    completedWorkOrders: 12,
    avgResponseTime: 0.2,
    avgCompletionTime: 1.0,
    totalAmountPaid: 8500000,
    status: "active",
    contractExpiry: "2027-01-31",
    createdAt: "2020-05-15",
  },
  {
    id: "6",
    organizationId: "org-1",
    name: "OTIS Elevator Company",
    category: "elevator",
    contactPerson: "Deepak Verma",
    email: "deepak.verma@otis.com",
    phone: "+91 43210 98765",
    address: "890, Industrial Park, Chennai",
    gstNumber: "33AABCO9603R1ZM",
    panNumber: "AABCO9603R",
    bankDetails: null,
    performanceRating: 4.6,
    totalWorkOrders: 34,
    completedWorkOrders: 32,
    avgResponseTime: 1.5,
    avgCompletionTime: 5.0,
    totalAmountPaid: 2100000,
    status: "active",
    contractExpiry: "2026-08-15",
    createdAt: "2022-11-01",
  },
]

export default function VendorsPage() {
  const { toast } = useToast()
  const [vendors, setVendors] = React.useState<Vendor[]>(demoVendors)
  const [isLoading, setIsLoading] = React.useState(false)
  const [searchQuery, setSearchQuery] = React.useState("")
  const [statusFilter, setStatusFilter] = React.useState<string>("all")
  const [categoryFilter, setCategoryFilter] = React.useState<string>("all")

  // Dialog states
  const [addDialogOpen, setAddDialogOpen] = React.useState(false)
  const [viewDialogOpen, setViewDialogOpen] = React.useState(false)
  const [selectedVendor, setSelectedVendor] = React.useState<Vendor | null>(null)
  const [isSubmitting, setIsSubmitting] = React.useState(false)

  // Form state
  const [formData, setFormData] = React.useState({
    name: "",
    category: "",
    contactPerson: "",
    email: "",
    phone: "",
    address: "",
    gstNumber: "",
    panNumber: "",
    contractExpiry: "",
  })

  const getRatingStars = (rating: number) => {
    const fullStars = Math.floor(rating)
    const hasHalfStar = rating % 1 >= 0.5
    return { fullStars, hasHalfStar }
  }

  const getRatingColor = (rating: number) => {
    if (rating >= 4.5) return "text-green-600"
    if (rating >= 4.0) return "text-blue-600"
    if (rating >= 3.5) return "text-yellow-600"
    return "text-red-600"
  }

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat("en-IN", {
      style: "currency",
      currency: "INR",
      maximumFractionDigits: 0,
    }).format(amount)
  }

  const filteredVendors = vendors.filter((vendor) => {
    if (searchQuery) {
      const searchLower = searchQuery.toLowerCase()
      if (
        !vendor.name.toLowerCase().includes(searchLower) &&
        !vendor.contactPerson?.toLowerCase().includes(searchLower) &&
        !vendor.email?.toLowerCase().includes(searchLower)
      ) {
        return false
      }
    }
    if (statusFilter !== "all" && vendor.status !== statusFilter) return false
    if (categoryFilter !== "all" && vendor.category !== categoryFilter) return false
    return true
  })

  const stats = {
    total: vendors.length,
    active: vendors.filter((v) => v.status === "active").length,
    avgRating: vendors.reduce((acc, v) => acc + v.performanceRating, 0) / vendors.length,
    totalPaid: vendors.reduce((acc, v) => acc + v.totalAmountPaid, 0),
    totalWorkOrders: vendors.reduce((acc, v) => acc + v.totalWorkOrders, 0),
    completionRate:
      (vendors.reduce((acc, v) => acc + v.completedWorkOrders, 0) /
        vendors.reduce((acc, v) => acc + v.totalWorkOrders, 0)) *
      100,
  }

  const handleCreateVendor = async (e: React.FormEvent) => {
    e.preventDefault()
    setIsSubmitting(true)
    try {
      await new Promise((resolve) => setTimeout(resolve, 1000))

      const newVendor: Vendor = {
        id: crypto.randomUUID(),
        organizationId: "org-1",
        ...formData,
        bankDetails: null,
        performanceRating: 0,
        totalWorkOrders: 0,
        completedWorkOrders: 0,
        avgResponseTime: null,
        avgCompletionTime: null,
        totalAmountPaid: 0,
        status: "pending",
        createdAt: new Date().toISOString(),
      }

      setVendors((prev) => [newVendor, ...prev])
      toast({
        title: "Success",
        description: "Vendor added successfully!",
      })
      setAddDialogOpen(false)
      setFormData({
        name: "",
        category: "",
        contactPerson: "",
        email: "",
        phone: "",
        address: "",
        gstNumber: "",
        panNumber: "",
        contractExpiry: "",
      })
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to add vendor. Please try again.",
        variant: "destructive",
      })
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Vendor Management</h1>
          <p className="text-muted-foreground">
            Manage service providers, track performance, and maintain vendor relationships
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" onClick={() => setIsLoading(true)} disabled={isLoading}>
            <RefreshCw className={`h-4 w-4 mr-2 ${isLoading ? "animate-spin" : ""}`} />
            Refresh
          </Button>
          <Dialog open={addDialogOpen} onOpenChange={setAddDialogOpen}>
            <DialogTrigger asChild>
              <Button className="gap-2">
                <Plus className="h-4 w-4" />
                Add Vendor
              </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-[550px]">
              <form onSubmit={handleCreateVendor}>
                <DialogHeader>
                  <DialogTitle>Add New Vendor</DialogTitle>
                  <DialogDescription>Register a new service provider or contractor.</DialogDescription>
                </DialogHeader>
                <div className="grid gap-4 py-4">
                  <div className="grid gap-2">
                    <Label htmlFor="name">Company Name *</Label>
                    <Input
                      id="name"
                      placeholder="e.g., CoolTech HVAC Solutions"
                      value={formData.name}
                      onChange={(e) => setFormData((prev) => ({ ...prev, name: e.target.value }))}
                      required
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="grid gap-2">
                      <Label htmlFor="category">Category *</Label>
                      <Select
                        value={formData.category}
                        onValueChange={(value) => setFormData((prev) => ({ ...prev, category: value }))}
                        required
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="Select category" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="hvac">HVAC</SelectItem>
                          <SelectItem value="electrical">Electrical</SelectItem>
                          <SelectItem value="plumbing">Plumbing</SelectItem>
                          <SelectItem value="cleaning">Cleaning</SelectItem>
                          <SelectItem value="security">Security</SelectItem>
                          <SelectItem value="landscaping">Landscaping</SelectItem>
                          <SelectItem value="elevator">Elevator</SelectItem>
                          <SelectItem value="pest_control">Pest Control</SelectItem>
                          <SelectItem value="it">IT Services</SelectItem>
                          <SelectItem value="general">General</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="grid gap-2">
                      <Label htmlFor="contactPerson">Contact Person</Label>
                      <Input
                        id="contactPerson"
                        placeholder="Primary contact name"
                        value={formData.contactPerson}
                        onChange={(e) => setFormData((prev) => ({ ...prev, contactPerson: e.target.value }))}
                      />
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="grid gap-2">
                      <Label htmlFor="email">Email</Label>
                      <Input
                        id="email"
                        type="email"
                        placeholder="vendor@example.com"
                        value={formData.email}
                        onChange={(e) => setFormData((prev) => ({ ...prev, email: e.target.value }))}
                      />
                    </div>
                    <div className="grid gap-2">
                      <Label htmlFor="phone">Phone</Label>
                      <Input
                        id="phone"
                        placeholder="+91 98765 43210"
                        value={formData.phone}
                        onChange={(e) => setFormData((prev) => ({ ...prev, phone: e.target.value }))}
                      />
                    </div>
                  </div>
                  <div className="grid gap-2">
                    <Label htmlFor="address">Address</Label>
                    <Textarea
                      id="address"
                      placeholder="Full address"
                      value={formData.address}
                      onChange={(e) => setFormData((prev) => ({ ...prev, address: e.target.value }))}
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="grid gap-2">
                      <Label htmlFor="gstNumber">GST Number</Label>
                      <Input
                        id="gstNumber"
                        placeholder="27AABCU9603R1ZM"
                        value={formData.gstNumber}
                        onChange={(e) => setFormData((prev) => ({ ...prev, gstNumber: e.target.value }))}
                      />
                    </div>
                    <div className="grid gap-2">
                      <Label htmlFor="panNumber">PAN Number</Label>
                      <Input
                        id="panNumber"
                        placeholder="AABCU9603R"
                        value={formData.panNumber}
                        onChange={(e) => setFormData((prev) => ({ ...prev, panNumber: e.target.value }))}
                      />
                    </div>
                  </div>
                  <div className="grid gap-2">
                    <Label htmlFor="contractExpiry">Contract Expiry Date</Label>
                    <Input
                      id="contractExpiry"
                      type="date"
                      value={formData.contractExpiry}
                      onChange={(e) => setFormData((prev) => ({ ...prev, contractExpiry: e.target.value }))}
                    />
                  </div>
                </div>
                <DialogFooter>
                  <Button type="button" variant="outline" onClick={() => setAddDialogOpen(false)}>
                    Cancel
                  </Button>
                  <Button type="submit" disabled={isSubmitting}>
                    {isSubmitting && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                    Add Vendor
                  </Button>
                </DialogFooter>
              </form>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      {/* Stats */}
      <div className="grid gap-4 md:grid-cols-6">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Vendors</CardTitle>
            <Truck className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.total}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Active</CardTitle>
            <CheckCircle2 className="h-4 w-4 text-green-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-600">{stats.active}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Avg Rating</CardTitle>
            <Star className="h-4 w-4 text-yellow-500" />
          </CardHeader>
          <CardContent>
            <div className={`text-2xl font-bold ${getRatingColor(stats.avgRating)}`}>
              {stats.avgRating.toFixed(1)}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Paid</CardTitle>
            <DollarSign className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{formatCurrency(stats.totalPaid)}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Work Orders</CardTitle>
            <FileText className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.totalWorkOrders}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Completion Rate</CardTitle>
            <TrendingUp className="h-4 w-4 text-green-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-600">{stats.completionRate.toFixed(1)}%</div>
          </CardContent>
        </Card>
      </div>

      {/* Top Performers */}
      <Card className="border-green-200 bg-green-50/30 dark:border-green-900 dark:bg-green-950/20">
        <CardHeader className="pb-3">
          <div className="flex items-center gap-2">
            <Award className="h-5 w-5 text-green-600 dark:text-green-400" />
            <CardTitle className="text-base">Top Performing Vendors</CardTitle>
          </div>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 md:grid-cols-3">
            {vendors
              .filter((v) => v.status === "active")
              .sort((a, b) => b.performanceRating - a.performanceRating)
              .slice(0, 3)
              .map((vendor, idx) => (
                <div key={vendor.id} className="flex items-start gap-3 p-3 bg-card rounded-lg border">
                  <div
                    className={`flex items-center justify-center w-8 h-8 rounded-full text-white font-bold ${
                      idx === 0 ? "bg-yellow-500" : idx === 1 ? "bg-gray-400" : "bg-orange-400"
                    }`}
                  >
                    {idx + 1}
                  </div>
                  <div className="flex-1">
                    <p className="font-medium">{vendor.name}</p>
                    <div className="flex items-center gap-1 mt-1">
                      <Star className="h-3.5 w-3.5 fill-yellow-500 text-yellow-500" />
                      <span className="text-sm font-medium">{vendor.performanceRating.toFixed(1)}</span>
                      <span className="text-xs text-muted-foreground">
                        • {vendor.completedWorkOrders}/{vendor.totalWorkOrders} jobs
                      </span>
                    </div>
                  </div>
                </div>
              ))}
          </div>
        </CardContent>
      </Card>

      {/* Filters */}
      <div className="flex items-center gap-4">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search vendors..."
            className="pl-8"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-[150px]">
            <Filter className="h-4 w-4 mr-2" />
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Status</SelectItem>
            <SelectItem value="active">Active</SelectItem>
            <SelectItem value="inactive">Inactive</SelectItem>
            <SelectItem value="suspended">Suspended</SelectItem>
            <SelectItem value="pending">Pending</SelectItem>
          </SelectContent>
        </Select>
        <Select value={categoryFilter} onValueChange={setCategoryFilter}>
          <SelectTrigger className="w-[150px]">
            <SelectValue placeholder="Category" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Categories</SelectItem>
            <SelectItem value="hvac">HVAC</SelectItem>
            <SelectItem value="electrical">Electrical</SelectItem>
            <SelectItem value="plumbing">Plumbing</SelectItem>
            <SelectItem value="cleaning">Cleaning</SelectItem>
            <SelectItem value="security">Security</SelectItem>
            <SelectItem value="landscaping">Landscaping</SelectItem>
            <SelectItem value="elevator">Elevator</SelectItem>
            <SelectItem value="pest_control">Pest Control</SelectItem>
            <SelectItem value="it">IT Services</SelectItem>
            <SelectItem value="general">General</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Vendor Table */}
      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Vendor</TableHead>
                <TableHead>Category</TableHead>
                <TableHead>Contact</TableHead>
                <TableHead>Rating</TableHead>
                <TableHead>Work Orders</TableHead>
                <TableHead>Total Paid</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredVendors.map((vendor) => {
                const category = categoryConfig[vendor.category]
                const status = statusConfig[vendor.status]
                const { fullStars, hasHalfStar } = getRatingStars(vendor.performanceRating)

                return (
                  <TableRow key={vendor.id}>
                    <TableCell>
                      <div>
                        <div className="font-medium">{vendor.name}</div>
                        <div className="text-xs text-muted-foreground">{vendor.contactPerson}</div>
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge className={`gap-1 ${category?.color || "bg-gray-100 text-gray-800"}`}>
                        {category?.label || vendor.category}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <div className="space-y-1">
                        {vendor.email && (
                          <div className="flex items-center gap-1 text-xs text-muted-foreground">
                            <Mail className="h-3 w-3" />
                            {vendor.email}
                          </div>
                        )}
                        {vendor.phone && (
                          <div className="flex items-center gap-1 text-xs text-muted-foreground">
                            <Phone className="h-3 w-3" />
                            {vendor.phone}
                          </div>
                        )}
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1">
                        {[...Array(5)].map((_, i) => (
                          <Star
                            key={i}
                            className={`h-3.5 w-3.5 ${
                              i < fullStars
                                ? "fill-yellow-500 text-yellow-500"
                                : i === fullStars && hasHalfStar
                                ? "fill-yellow-500/50 text-yellow-500"
                                : "text-gray-300"
                            }`}
                          />
                        ))}
                        <span className="ml-1 text-sm font-medium">{vendor.performanceRating.toFixed(1)}</span>
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="text-sm">
                        <span className="font-medium">{vendor.completedWorkOrders}</span>
                        <span className="text-muted-foreground">/{vendor.totalWorkOrders}</span>
                      </div>
                      <div className="w-16 h-1.5 bg-gray-200 rounded-full mt-1">
                        <div
                          className="h-full bg-green-500 rounded-full"
                          style={{
                            width: `${(vendor.completedWorkOrders / Math.max(vendor.totalWorkOrders, 1)) * 100}%`,
                          }}
                        />
                      </div>
                    </TableCell>
                    <TableCell className="font-medium">{formatCurrency(vendor.totalAmountPaid)}</TableCell>
                    <TableCell>
                      <Badge className={status?.color || "bg-gray-100 text-gray-800"}>
                        {status?.label || vendor.status}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon">
                            <MoreHorizontal className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuLabel>Actions</DropdownMenuLabel>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem
                            onClick={() => {
                              setSelectedVendor(vendor)
                              setViewDialogOpen(true)
                            }}
                          >
                            <Eye className="mr-2 h-4 w-4" />
                            View Details
                          </DropdownMenuItem>
                          <DropdownMenuItem>
                            <Edit className="mr-2 h-4 w-4" />
                            Edit
                          </DropdownMenuItem>
                          <DropdownMenuItem>
                            <FileText className="mr-2 h-4 w-4" />
                            View Work Orders
                          </DropdownMenuItem>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem className="text-red-600">
                            <Trash2 className="mr-2 h-4 w-4" />
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
        </CardContent>
      </Card>

      {/* View Dialog */}
      <Dialog open={viewDialogOpen} onOpenChange={setViewDialogOpen}>
        <DialogContent className="sm:max-w-[600px]">
          <DialogHeader>
            <DialogTitle>{selectedVendor?.name}</DialogTitle>
            <DialogDescription>Vendor details and performance metrics</DialogDescription>
          </DialogHeader>
          {selectedVendor && (
            <Tabs defaultValue="details" className="w-full">
              <TabsList className="grid w-full grid-cols-3">
                <TabsTrigger value="details">Details</TabsTrigger>
                <TabsTrigger value="performance">Performance</TabsTrigger>
                <TabsTrigger value="financial">Financial</TabsTrigger>
              </TabsList>
              <TabsContent value="details" className="space-y-4">
                <div className="flex items-center gap-4 pt-4">
                  <Badge className={categoryConfig[selectedVendor.category]?.color}>
                    {categoryConfig[selectedVendor.category]?.label}
                  </Badge>
                  <Badge className={statusConfig[selectedVendor.status]?.color}>
                    {statusConfig[selectedVendor.status]?.label}
                  </Badge>
                </div>

                <div className="grid grid-cols-2 gap-4 pt-4 border-t">
                  <div>
                    <span className="text-sm text-muted-foreground">Contact Person</span>
                    <p className="font-medium">{selectedVendor.contactPerson || "—"}</p>
                  </div>
                  <div>
                    <span className="text-sm text-muted-foreground">Email</span>
                    <p className="font-medium">{selectedVendor.email || "—"}</p>
                  </div>
                  <div>
                    <span className="text-sm text-muted-foreground">Phone</span>
                    <p className="font-medium">{selectedVendor.phone || "—"}</p>
                  </div>
                  <div>
                    <span className="text-sm text-muted-foreground">Contract Expiry</span>
                    <p className="font-medium">
                      {selectedVendor.contractExpiry
                        ? format(new Date(selectedVendor.contractExpiry), "MMM d, yyyy")
                        : "—"}
                    </p>
                  </div>
                </div>

                <div className="pt-4 border-t">
                  <span className="text-sm text-muted-foreground">Address</span>
                  <p className="font-medium">{selectedVendor.address || "—"}</p>
                </div>

                <div className="grid grid-cols-2 gap-4 pt-4 border-t">
                  <div>
                    <span className="text-sm text-muted-foreground">GST Number</span>
                    <p className="font-medium">{selectedVendor.gstNumber || "—"}</p>
                  </div>
                  <div>
                    <span className="text-sm text-muted-foreground">PAN Number</span>
                    <p className="font-medium">{selectedVendor.panNumber || "—"}</p>
                  </div>
                </div>
              </TabsContent>

              <TabsContent value="performance" className="space-y-4 pt-4">
                <div className="flex items-center justify-center gap-2 p-4 bg-muted rounded-lg">
                  {[...Array(5)].map((_, i) => (
                    <Star
                      key={i}
                      className={`h-8 w-8 ${
                        i < Math.floor(selectedVendor.performanceRating)
                          ? "fill-yellow-500 text-yellow-500"
                          : "text-gray-300"
                      }`}
                    />
                  ))}
                  <span className={`text-3xl font-bold ml-2 ${getRatingColor(selectedVendor.performanceRating)}`}>
                    {selectedVendor.performanceRating.toFixed(1)}
                  </span>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="p-3 bg-muted rounded-lg text-center">
                    <span className="text-xs text-muted-foreground">Total Work Orders</span>
                    <p className="text-2xl font-bold">{selectedVendor.totalWorkOrders}</p>
                  </div>
                  <div className="p-3 bg-muted rounded-lg text-center">
                    <span className="text-xs text-muted-foreground">Completed</span>
                    <p className="text-2xl font-bold text-green-600">{selectedVendor.completedWorkOrders}</p>
                  </div>
                  <div className="p-3 bg-muted rounded-lg text-center">
                    <span className="text-xs text-muted-foreground">Avg Response Time</span>
                    <p className="text-2xl font-bold">{selectedVendor.avgResponseTime?.toFixed(1) || "—"} hrs</p>
                  </div>
                  <div className="p-3 bg-muted rounded-lg text-center">
                    <span className="text-xs text-muted-foreground">Avg Completion Time</span>
                    <p className="text-2xl font-bold">{selectedVendor.avgCompletionTime?.toFixed(1) || "—"} hrs</p>
                  </div>
                </div>

                <div className="pt-4 border-t">
                  <h4 className="text-sm font-medium mb-2">Completion Rate</h4>
                  <Progress
                    value={(selectedVendor.completedWorkOrders / Math.max(selectedVendor.totalWorkOrders, 1)) * 100}
                    className="h-3"
                  />
                  <p className="text-sm text-muted-foreground mt-1 text-right">
                    {((selectedVendor.completedWorkOrders / Math.max(selectedVendor.totalWorkOrders, 1)) * 100).toFixed(
                      1
                    )}
                    %
                  </p>
                </div>
              </TabsContent>

              <TabsContent value="financial" className="space-y-4 pt-4">
                <div className="p-4 bg-muted rounded-lg text-center">
                  <span className="text-sm text-muted-foreground">Total Amount Paid</span>
                  <p className="text-3xl font-bold">{formatCurrency(selectedVendor.totalAmountPaid)}</p>
                </div>

                {selectedVendor.bankDetails && (
                  <div className="pt-4 border-t">
                    <h4 className="text-sm font-medium mb-3">Bank Details</h4>
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <span className="text-sm text-muted-foreground">Account Name</span>
                        <p className="font-medium">{selectedVendor.bankDetails.accountName}</p>
                      </div>
                      <div>
                        <span className="text-sm text-muted-foreground">Account Number</span>
                        <p className="font-medium">{selectedVendor.bankDetails.accountNumber}</p>
                      </div>
                      <div>
                        <span className="text-sm text-muted-foreground">Bank Name</span>
                        <p className="font-medium">{selectedVendor.bankDetails.bankName}</p>
                      </div>
                      <div>
                        <span className="text-sm text-muted-foreground">IFSC Code</span>
                        <p className="font-medium">{selectedVendor.bankDetails.ifscCode}</p>
                      </div>
                    </div>
                  </div>
                )}
              </TabsContent>
            </Tabs>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setViewDialogOpen(false)}>
              Close
            </Button>
            <Button>Create Work Order</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
