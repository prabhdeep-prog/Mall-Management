"use client"

import * as React from "react"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
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
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form"
import { Checkbox } from "@/components/ui/checkbox"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import {
  Building2,
  Plus,
  Search,
  MapPin,
  Users,
  Ruler,
  TrendingUp,
  TrendingDown,
  DollarSign,
  Footprints,
  ChevronRight,
  MoreVertical,
  Edit,
  Settings,
  BarChart3,
  RefreshCw,
  Loader2,
  Clock,
  CheckCircle2,
  Building,
  Map,
  LayoutGrid,
  Calendar,
} from "lucide-react"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { cn } from "@/lib/utils"
import { useToast } from "@/components/ui/use-toast"
import Link from "next/link"
import { useRouter } from "next/navigation"
import {
  propertySchema,
  propertyUpdateSchema,
  type PropertyFormData,
  type PropertyUpdateFormData,
  COMMON_AMENITIES,
  INDIAN_STATES,
  DAYS_OF_WEEK,
} from "@/lib/validations/property"
import { usePropertyStore } from "@/stores/property-store"

interface Property {
  id: string
  name: string
  code: string
  address: string
  city: string
  state: string
  type: string
  totalAreaSqft: string | null  // API returns totalAreaSqft
  totalArea?: string | null     // Backward compatibility
  status: string | null
  tenantCount: number
  activeLeases: number
  metrics: {
    occupancyRate: string | null
    collectionRate: string | null
    revenue: string | null
    footTraffic: number | null
  } | null
}

function PropertyCard({ property, onEdit }: { property: Property; onEdit: (property: Property) => void }) {
  const router = useRouter()
  const occupancy = parseFloat(property.metrics?.occupancyRate || "0")
  const revenue = parseFloat(property.metrics?.revenue || "0")

  return (
    <Card className="group relative overflow-hidden transition-all hover:shadow-lg hover:shadow-emerald-100 dark:hover:shadow-emerald-900/20">
      {/* Status indicator */}
      <div className={cn(
        "absolute left-0 top-0 h-full w-1",
        property.status === "active" ? "bg-emerald-500" : 
        property.status === "under_construction" ? "bg-amber-500" : "bg-slate-300"
      )} />
      
      <CardHeader className="flex-row items-start justify-between space-y-0 pb-4">
        <div className="flex items-start gap-4">
          <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-gradient-to-br from-emerald-500 to-teal-600 text-white shadow-lg">
            <Building2 className="h-6 w-6" />
          </div>
          <div>
            <CardTitle className="text-lg">{property.name}</CardTitle>
            <div className="mt-1 flex items-center gap-2 text-sm text-muted-foreground">
              <MapPin className="h-3.5 w-3.5" />
              {property.city}, {property.state}
            </div>
            <Badge variant={property.status === "active" ? "default" : "secondary"} className="mt-2">
              {property.status === "active" ? "Active" : 
               property.status === "under_construction" ? "Under Construction" : "Closed"}
            </Badge>
          </div>
        </div>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" className="h-8 w-8">
              <MoreVertical className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onClick={() => onEdit(property)}>
              <Edit className="mr-2 h-4 w-4" /> Edit Property
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => router.push(`/analytics?propertyId=${property.id}`)}>
              <BarChart3 className="mr-2 h-4 w-4" /> View Analytics
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={() => router.push(`/tenants?propertyId=${property.id}`)}>
              <Users className="mr-2 h-4 w-4" /> View Tenants
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => router.push(`/work-orders?propertyId=${property.id}`)}>
              <Settings className="mr-2 h-4 w-4" /> View Work Orders
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </CardHeader>
      
      <CardContent className="space-y-4">
        {/* Key Metrics Grid */}
        <div className="grid grid-cols-2 gap-4">
          <div className="rounded-lg bg-slate-50 p-3 dark:bg-slate-800/50">
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Users className="h-4 w-4" />
              Tenants
            </div>
            <p className="mt-1 text-2xl font-bold">{property.tenantCount}</p>
            <p className="text-xs text-muted-foreground">{property.activeLeases} active leases</p>
          </div>
          <div className="rounded-lg bg-slate-50 p-3 dark:bg-slate-800/50">
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Ruler className="h-4 w-4" />
              Area
            </div>
            <p className="mt-1 text-2xl font-bold">
              {(property.totalAreaSqft || property.totalArea) ? parseInt(property.totalAreaSqft || property.totalArea || "0").toLocaleString() : "N/A"}
            </p>
            <p className="text-xs text-muted-foreground">sq ft</p>
          </div>
        </div>

        {/* Performance Metrics */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-sm text-muted-foreground">Occupancy</span>
            <div className="flex items-center gap-2">
              <span className="font-semibold">{occupancy}%</span>
              {occupancy >= 90 ? (
                <TrendingUp className="h-4 w-4 text-emerald-500" />
              ) : (
                <TrendingDown className="h-4 w-4 text-amber-500" />
              )}
            </div>
          </div>
          <div className="h-2 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
            <div
              className={cn(
                "h-full rounded-full transition-all",
                occupancy >= 90 ? "bg-emerald-500" : occupancy >= 80 ? "bg-amber-500" : "bg-red-500"
              )}
              style={{ width: `${occupancy}%` }}
            />
          </div>
        </div>

        <div className="flex items-center justify-between border-t pt-4">
          <div className="flex items-center gap-1 text-sm">
            <DollarSign className="h-4 w-4 text-emerald-600" />
            <span className="font-semibold">₹{(revenue / 100000).toFixed(1)}L</span>
            <span className="text-muted-foreground">/month</span>
          </div>
          <div className="flex items-center gap-1 text-sm text-muted-foreground">
            <Footprints className="h-4 w-4" />
            {property.metrics?.footTraffic?.toLocaleString() || "N/A"}/day
          </div>
        </div>

        <Button variant="outline" className="w-full gap-2 group-hover:bg-emerald-50 group-hover:text-emerald-700 dark:group-hover:bg-emerald-950 dark:group-hover:text-emerald-400" asChild>
          <Link href={`/properties/${property.id}`}>
            View Details
            <ChevronRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
          </Link>
        </Button>
      </CardContent>
    </Card>
  )
}

export default function PropertiesPage() {
  const { toast } = useToast()
  const router = useRouter()
  const { fetchProperties: refreshGlobalPropertyStore } = usePropertyStore()
  const [properties, setProperties] = React.useState<Property[]>([])
  const [searchQuery, setSearchQuery] = React.useState("")
  const [isLoading, setIsLoading] = React.useState(true)
  const [dialogOpen, setDialogOpen] = React.useState(false)
  const [editDialogOpen, setEditDialogOpen] = React.useState(false)
  const [isSubmitting, setIsSubmitting] = React.useState(false)
  const [selectedProperty, setSelectedProperty] = React.useState<Property | null>(null)
  const [activeTab, setActiveTab] = React.useState("basic")
  const [editActiveTab, setEditActiveTab] = React.useState("basic")

  // Form for creating property
  const createForm = useForm<PropertyFormData>({
    resolver: zodResolver(propertySchema),
    defaultValues: {
      name: "",
      code: "",
      type: "mall",
      status: "active",
      address: "",
      city: "",
      state: "",
      country: "India",
      pincode: "",
      totalAreaSqft: "",
      leasableAreaSqft: "",
      floors: "",
      operatingHoursStart: "10:00",
      operatingHoursEnd: "22:00",
      operatingDays: ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"],
      amenities: [],
      managerName: "",
      managerPhone: "",
      managerEmail: "",
    },
  })

  // Form for editing property
  const editForm = useForm<PropertyUpdateFormData>({
    resolver: zodResolver(propertyUpdateSchema),
  })

  // Handle edit property - fetch full data from API
  const handleEditProperty = async (property: Property) => {
    setSelectedProperty(property)
    setEditActiveTab("basic")
    
    try {
      // Fetch full property details from API
      const response = await fetch(`/api/properties/${property.id}`)
      if (response.ok) {
        const result = await response.json()
        const fullProperty = result.data || result
        
        // Parse operating hours if present
        const opHours = fullProperty.operatingHours || {}
        
        editForm.reset({
          name: fullProperty.name || property.name,
          code: fullProperty.code || property.code,
          type: (fullProperty.type || property.type || "mall") as PropertyFormData["type"],
          status: (fullProperty.status || property.status || "active") as PropertyFormData["status"],
          address: fullProperty.address || property.address || "",
          city: fullProperty.city || property.city || "",
          state: fullProperty.state || property.state || "",
          country: fullProperty.country || "India",
          pincode: fullProperty.pincode || "",
          totalAreaSqft: fullProperty.totalAreaSqft?.toString() || property.totalArea || "",
          leasableAreaSqft: fullProperty.leasableAreaSqft?.toString() || "",
          floors: fullProperty.floors?.toString() || "",
          operatingHoursStart: opHours.start || opHours.openingTime || "10:00",
          operatingHoursEnd: opHours.end || opHours.closingTime || "22:00",
          operatingDays: opHours.days || opHours.operatingDays || ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"],
          amenities: fullProperty.amenities || [],
          managerName: fullProperty.metadata?.managerName || fullProperty.metadata?.propertyManager?.name || "",
          managerPhone: fullProperty.metadata?.managerPhone || fullProperty.metadata?.propertyManager?.phone || "",
          managerEmail: fullProperty.metadata?.managerEmail || fullProperty.metadata?.propertyManager?.email || "",
        })
      } else {
        // Fallback to basic data if API fails
        editForm.reset({
          name: property.name,
          code: property.code,
          type: (property.type || "mall") as PropertyFormData["type"],
          status: (property.status || "active") as PropertyFormData["status"],
          address: property.address || "",
          city: property.city || "",
          state: property.state || "",
          country: "India",
          pincode: "",
          totalAreaSqft: property.totalArea || "",
          leasableAreaSqft: "",
          floors: "",
          operatingHoursStart: "10:00",
          operatingHoursEnd: "22:00",
          operatingDays: ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"],
          amenities: [],
          managerName: "",
          managerPhone: "",
          managerEmail: "",
        })
      }
    } catch (error) {
      console.error("Error fetching property details:", error)
      // Fallback to basic data
      editForm.reset({
        name: property.name,
        code: property.code,
        type: (property.type || "mall") as PropertyFormData["type"],
        status: (property.status || "active") as PropertyFormData["status"],
        address: property.address || "",
        city: property.city || "",
        state: property.state || "",
        country: "India",
        totalAreaSqft: property.totalArea || "",
      })
    }
    
    setEditDialogOpen(true)
  }

  const handleUpdateProperty = async (data: PropertyUpdateFormData) => {
    if (!selectedProperty) return
    
    setIsSubmitting(true)
    try {
      // Prepare the data for API - same structure as create
      const apiData = {
        name: data.name,
        code: data.code,
        type: data.type,
        status: data.status,
        address: data.address,
        city: data.city,
        state: data.state,
        country: data.country,
        pincode: data.pincode,
        totalAreaSqft: data.totalAreaSqft,
        leasableAreaSqft: data.leasableAreaSqft,
        floors: data.floors ? parseInt(data.floors) : undefined,
        operatingHours: {
          start: data.operatingHoursStart,
          end: data.operatingHoursEnd,
          days: data.operatingDays,
        },
        amenities: data.amenities,
        metadata: {
          managerName: data.managerName,
          managerPhone: data.managerPhone,
          managerEmail: data.managerEmail,
        },
      }

      const response = await fetch(`/api/properties/${selectedProperty.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(apiData),
      })

      if (!response.ok) {
        const errorData = await response.json()
        throw new Error(errorData.error || "Failed to update property")
      }

      toast({
        title: "Success",
        description: "Property updated successfully!",
      })

      setEditDialogOpen(false)
      setSelectedProperty(null)
      setEditActiveTab("basic")
      fetchProperties(true)
    } catch (error) {
      console.error("Error updating property:", error)
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "Failed to update property. Please try again.",
        variant: "destructive",
      })
    } finally {
      setIsSubmitting(false)
    }
  }

  const fetchProperties = React.useCallback(async (bustCache = false) => {
    setIsLoading(true)
    try {
      const url = bustCache ? "/api/properties?refresh=true" : "/api/properties"
      const response = await fetch(url)
      if (response.ok) {
        const data = await response.json()
        setProperties(data.data || [])
        if (bustCache) {
          // Only refresh the global store when data was actually mutated
          refreshGlobalPropertyStore(true)
        }
      }
    } catch (error) {
      console.error("Error fetching properties:", error)
      toast({
        title: "Error",
        description: "Failed to load properties. Please try again.",
        variant: "destructive",
      })
    } finally {
      setIsLoading(false)
    }
  }, [toast, refreshGlobalPropertyStore])

  React.useEffect(() => {
    fetchProperties()
  }, [fetchProperties])

  const handleSubmit = async (data: PropertyFormData) => {
    setIsSubmitting(true)

    try {
      // Prepare the data for API
      const apiData = {
        name: data.name,
        code: data.code,
        type: data.type,
        status: data.status,
        address: data.address,
        city: data.city,
        state: data.state,
        country: data.country,
        pincode: data.pincode,
        totalArea: data.totalAreaSqft,
        leasableArea: data.leasableAreaSqft,
        floors: data.floors ? parseInt(data.floors) : undefined,
        operatingHours: {
          start: data.operatingHoursStart,
          end: data.operatingHoursEnd,
          days: data.operatingDays,
        },
        amenities: data.amenities,
        metadata: {
          managerName: data.managerName,
          managerPhone: data.managerPhone,
          managerEmail: data.managerEmail,
        },
        organizationId: "default", // Would come from context
      }

      const response = await fetch("/api/properties", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(apiData),
      })

      if (!response.ok) {
        const errorData = await response.json()
        throw new Error(errorData.error || "Failed to create property")
      }

      toast({
        title: "Success",
        description: "Property created successfully!",
      })

      setDialogOpen(false)
      createForm.reset()
      setActiveTab("basic")
      fetchProperties(true)
    } catch (error) {
      console.error("Error creating property:", error)
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "Failed to create property. Please try again.",
        variant: "destructive",
      })
    } finally {
      setIsSubmitting(false)
    }
  }

  const filteredProperties = properties.filter(
    (p) =>
      p.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      p.city.toLowerCase().includes(searchQuery.toLowerCase()) ||
      p.code.toLowerCase().includes(searchQuery.toLowerCase())
  )

  // Calculate summary stats from actual data
  const totalTenants = properties.reduce((sum, p) => sum + (Number(p.tenantCount) || 0), 0)
  
  // Only calculate average from properties that have metrics
  const propertiesWithMetrics = properties.filter(p => p.metrics?.occupancyRate)
  const avgOccupancy = propertiesWithMetrics.length > 0 
    ? propertiesWithMetrics.reduce((sum, p) => sum + parseFloat(p.metrics?.occupancyRate || "0"), 0) / propertiesWithMetrics.length
    : 0
  
  // Only sum revenue from properties with actual metrics
  const totalRevenue = properties.reduce((sum, p) => sum + parseFloat(p.metrics?.revenue || "0"), 0)

  return (
    <div className="space-y-6 p-6">
      {/* Header */}
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Properties</h1>
          <p className="text-muted-foreground">
            Manage your real estate portfolio
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => fetchProperties(true)} disabled={isLoading}>
            <RefreshCw className={`h-4 w-4 mr-2 ${isLoading ? "animate-spin" : ""}`} />
            Refresh
          </Button>
          <Dialog open={dialogOpen} onOpenChange={(open) => {
            setDialogOpen(open)
            if (!open) {
              createForm.reset()
              setActiveTab("basic")
            }
          }}>
            <DialogTrigger asChild>
              <Button className="gap-2 bg-emerald-500 hover:bg-emerald-600">
                <Plus className="h-4 w-4" />
                Add Property
              </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-[700px] max-h-[90vh] overflow-y-auto">
              <Form {...createForm}>
                <form onSubmit={createForm.handleSubmit(handleSubmit)}>
                  <DialogHeader>
                    <DialogTitle>Add New Property</DialogTitle>
                    <DialogDescription>
                      Complete the property details to onboard a new property into the system.
                    </DialogDescription>
                  </DialogHeader>
                  
                  <Tabs value={activeTab} onValueChange={setActiveTab} className="mt-4">
                    <TabsList className="grid w-full grid-cols-4">
                      <TabsTrigger value="basic" className="gap-1">
                        <Building className="h-4 w-4" />
                        <span className="hidden sm:inline">Basic</span>
                      </TabsTrigger>
                      <TabsTrigger value="location" className="gap-1">
                        <Map className="h-4 w-4" />
                        <span className="hidden sm:inline">Location</span>
                      </TabsTrigger>
                      <TabsTrigger value="details" className="gap-1">
                        <LayoutGrid className="h-4 w-4" />
                        <span className="hidden sm:inline">Details</span>
                      </TabsTrigger>
                      <TabsTrigger value="operations" className="gap-1">
                        <Clock className="h-4 w-4" />
                        <span className="hidden sm:inline">Operations</span>
                      </TabsTrigger>
                    </TabsList>
                    
                    {/* Basic Information Tab */}
                    <TabsContent value="basic" className="space-y-4 pt-4">
                      <div className="grid grid-cols-2 gap-4">
                        <FormField
                          control={createForm.control}
                          name="name"
                          render={({ field }) => (
                            <FormItem className="col-span-2">
                              <FormLabel>Property Name *</FormLabel>
                              <FormControl>
                                <Input placeholder="e.g., Phoenix Marketcity Mumbai" {...field} />
                              </FormControl>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                        <FormField
                          control={createForm.control}
                          name="code"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>Property Code *</FormLabel>
                              <FormControl>
                                <Input placeholder="e.g., PHX-MUM-01" {...field} />
                              </FormControl>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                        <FormField
                          control={createForm.control}
                          name="type"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>Property Type *</FormLabel>
                              <Select onValueChange={field.onChange} value={field.value}>
                                <FormControl>
                                  <SelectTrigger>
                                    <SelectValue placeholder="Select type" />
                                  </SelectTrigger>
                                </FormControl>
                                <SelectContent>
                                  <SelectItem value="mall">Shopping Mall</SelectItem>
                                  <SelectItem value="retail_complex">Retail Complex</SelectItem>
                                  <SelectItem value="office">Office Building</SelectItem>
                                  <SelectItem value="mixed_use">Mixed Use Development</SelectItem>
                                </SelectContent>
                              </Select>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                        <FormField
                          control={createForm.control}
                          name="status"
                          render={({ field }) => (
                            <FormItem className="col-span-2">
                              <FormLabel>Status</FormLabel>
                              <Select onValueChange={field.onChange} value={field.value}>
                                <FormControl>
                                  <SelectTrigger>
                                    <SelectValue placeholder="Select status" />
                                  </SelectTrigger>
                                </FormControl>
                                <SelectContent>
                                  <SelectItem value="active">Active - Operational</SelectItem>
                                  <SelectItem value="under_construction">Under Construction</SelectItem>
                                  <SelectItem value="closed">Closed</SelectItem>
                                </SelectContent>
                              </Select>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                      </div>
                    </TabsContent>
                    
                    {/* Location Tab */}
                    <TabsContent value="location" className="space-y-4 pt-4">
                      <FormField
                        control={createForm.control}
                        name="address"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Street Address</FormLabel>
                            <FormControl>
                              <Textarea 
                                placeholder="Enter complete street address"
                                className="min-h-[80px]"
                                {...field} 
                              />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                      <div className="grid grid-cols-2 gap-4">
                        <FormField
                          control={createForm.control}
                          name="city"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>City *</FormLabel>
                              <FormControl>
                                <Input placeholder="e.g., Mumbai" {...field} />
                              </FormControl>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                        <FormField
                          control={createForm.control}
                          name="state"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>State *</FormLabel>
                              <Select onValueChange={field.onChange} value={field.value}>
                                <FormControl>
                                  <SelectTrigger>
                                    <SelectValue placeholder="Select state" />
                                  </SelectTrigger>
                                </FormControl>
                                <SelectContent>
                                  {INDIAN_STATES.map((state) => (
                                    <SelectItem key={state} value={state}>
                                      {state}
                                    </SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                        <FormField
                          control={createForm.control}
                          name="pincode"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>PIN Code</FormLabel>
                              <FormControl>
                                <Input 
                                  placeholder="e.g., 400076" 
                                  maxLength={6}
                                  {...field} 
                                />
                              </FormControl>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                        <FormField
                          control={createForm.control}
                          name="country"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>Country</FormLabel>
                              <FormControl>
                                <Input {...field} disabled />
                              </FormControl>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                      </div>
                    </TabsContent>
                    
                    {/* Details Tab */}
                    <TabsContent value="details" className="space-y-4 pt-4">
                      <div className="grid grid-cols-2 gap-4">
                        <FormField
                          control={createForm.control}
                          name="totalAreaSqft"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>Total Built-up Area (sq ft)</FormLabel>
                              <FormControl>
                                <Input type="number" placeholder="e.g., 500000" {...field} />
                              </FormControl>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                        <FormField
                          control={createForm.control}
                          name="leasableAreaSqft"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>Leasable Area (sq ft)</FormLabel>
                              <FormControl>
                                <Input type="number" placeholder="e.g., 350000" {...field} />
                              </FormControl>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                        <FormField
                          control={createForm.control}
                          name="floors"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>Number of Floors</FormLabel>
                              <FormControl>
                                <Input type="number" placeholder="e.g., 5" {...field} />
                              </FormControl>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                      </div>
                      
                      {/* Amenities */}
                      <FormField
                        control={createForm.control}
                        name="amenities"
                        render={() => (
                          <FormItem>
                            <FormLabel>Amenities & Facilities</FormLabel>
                            <div className="grid grid-cols-2 md:grid-cols-3 gap-2 mt-2">
                              {COMMON_AMENITIES.map((amenity) => (
                                <FormField
                                  key={amenity}
                                  control={createForm.control}
                                  name="amenities"
                                  render={({ field }) => (
                                    <FormItem className="flex items-center space-x-2 space-y-0">
                                      <FormControl>
                                        <Checkbox
                                          checked={field.value?.includes(amenity)}
                                          onCheckedChange={(checked) => {
                                            const current = field.value || []
                                            if (checked) {
                                              field.onChange([...current, amenity])
                                            } else {
                                              field.onChange(current.filter((v) => v !== amenity))
                                            }
                                          }}
                                        />
                                      </FormControl>
                                      <FormLabel className="text-sm font-normal cursor-pointer">
                                        {amenity}
                                      </FormLabel>
                                    </FormItem>
                                  )}
                                />
                              ))}
                            </div>
                          </FormItem>
                        )}
                      />
                    </TabsContent>
                    
                    {/* Operations Tab */}
                    <TabsContent value="operations" className="space-y-4 pt-4">
                      <div className="space-y-4">
                        <div className="grid grid-cols-2 gap-4">
                          <FormField
                            control={createForm.control}
                            name="operatingHoursStart"
                            render={({ field }) => (
                              <FormItem>
                                <FormLabel>Opening Time</FormLabel>
                                <FormControl>
                                  <Input type="time" {...field} />
                                </FormControl>
                                <FormMessage />
                              </FormItem>
                            )}
                          />
                          <FormField
                            control={createForm.control}
                            name="operatingHoursEnd"
                            render={({ field }) => (
                              <FormItem>
                                <FormLabel>Closing Time</FormLabel>
                                <FormControl>
                                  <Input type="time" {...field} />
                                </FormControl>
                                <FormMessage />
                              </FormItem>
                            )}
                          />
                        </div>
                        
                        {/* Operating Days */}
                        <FormField
                          control={createForm.control}
                          name="operatingDays"
                          render={() => (
                            <FormItem>
                              <FormLabel>Operating Days</FormLabel>
                              <div className="flex flex-wrap gap-2 mt-2">
                                {DAYS_OF_WEEK.map((day) => (
                                  <FormField
                                    key={day}
                                    control={createForm.control}
                                    name="operatingDays"
                                    render={({ field }) => (
                                      <FormItem className="flex items-center space-x-1 space-y-0">
                                        <FormControl>
                                          <Checkbox
                                            checked={field.value?.includes(day)}
                                            onCheckedChange={(checked) => {
                                              const current = field.value || []
                                              if (checked) {
                                                field.onChange([...current, day])
                                              } else {
                                                field.onChange(current.filter((v) => v !== day))
                                              }
                                            }}
                                          />
                                        </FormControl>
                                        <FormLabel className="text-sm font-normal cursor-pointer">
                                          {day.slice(0, 3)}
                                        </FormLabel>
                                      </FormItem>
                                    )}
                                  />
                                ))}
                              </div>
                            </FormItem>
                          )}
                        />
                      </div>
                      
                      <div className="border-t pt-4">
                        <h4 className="text-sm font-medium mb-4">Property Manager Contact</h4>
                        <div className="grid grid-cols-2 gap-4">
                          <FormField
                            control={createForm.control}
                            name="managerName"
                            render={({ field }) => (
                              <FormItem className="col-span-2 md:col-span-1">
                                <FormLabel>Manager Name</FormLabel>
                                <FormControl>
                                  <Input placeholder="Full name" {...field} />
                                </FormControl>
                                <FormMessage />
                              </FormItem>
                            )}
                          />
                          <FormField
                            control={createForm.control}
                            name="managerPhone"
                            render={({ field }) => (
                              <FormItem>
                                <FormLabel>Phone</FormLabel>
                                <FormControl>
                                  <Input placeholder="10-digit mobile" maxLength={10} {...field} />
                                </FormControl>
                                <FormMessage />
                              </FormItem>
                            )}
                          />
                          <FormField
                            control={createForm.control}
                            name="managerEmail"
                            render={({ field }) => (
                              <FormItem className="col-span-2">
                                <FormLabel>Email</FormLabel>
                                <FormControl>
                                  <Input type="email" placeholder="email@example.com" {...field} />
                                </FormControl>
                                <FormMessage />
                              </FormItem>
                            )}
                          />
                        </div>
                      </div>
                    </TabsContent>
                  </Tabs>

                  <DialogFooter className="mt-6 gap-2">
                    <Button type="button" variant="outline" onClick={() => setDialogOpen(false)}>
                      Cancel
                    </Button>
                    <Button type="submit" disabled={isSubmitting} className="bg-emerald-500 hover:bg-emerald-600">
                      {isSubmitting && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                      Create Property
                    </Button>
                  </DialogFooter>
                </form>
              </Form>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardContent className="flex items-center gap-4 p-6">
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-emerald-100 dark:bg-emerald-900/30">
              <Building2 className="h-6 w-6 text-emerald-600" />
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Total Properties</p>
              <p className="text-2xl font-bold">{properties.length}</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex items-center gap-4 p-6">
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-blue-100 dark:bg-blue-900/30">
              <Users className="h-6 w-6 text-blue-600" />
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Total Tenants</p>
              <p className="text-2xl font-bold">{totalTenants || 0}</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex items-center gap-4 p-6">
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-amber-100 dark:bg-amber-900/30">
              <TrendingUp className="h-6 w-6 text-amber-600" />
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Avg Occupancy</p>
              <p className="text-2xl font-bold">{avgOccupancy.toFixed(1)}%</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex items-center gap-4 p-6">
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-purple-100 dark:bg-purple-900/30">
              <DollarSign className="h-6 w-6 text-purple-600" />
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Monthly Revenue</p>
              <p className="text-2xl font-bold">₹{(totalRevenue / 100000).toFixed(1)}L</p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Search */}
      <div className="relative max-w-md">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          placeholder="Search properties by name, city, or code..."
          className="pl-10"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
        />
      </div>

      {/* Properties Grid */}
      {isLoading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      ) : (
        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
          {filteredProperties.map((property) => (
            <PropertyCard key={property.id} property={property} onEdit={handleEditProperty} />
          ))}
        </div>
      )}

      {!isLoading && filteredProperties.length === 0 && (
        <div className="flex flex-col items-center justify-center py-12 text-center">
          <Building2 className="mb-4 h-12 w-12 text-muted-foreground/50" />
          <h3 className="text-lg font-semibold">No properties found</h3>
          <p className="text-muted-foreground">
            {searchQuery
              ? "Try adjusting your search query"
              : "Add your first property to get started"}
          </p>
        </div>
      )}

      {/* Edit Property Dialog - Comprehensive 4-Tab Design */}
      <Dialog open={editDialogOpen} onOpenChange={(open) => {
        setEditDialogOpen(open)
        if (!open) {
          setEditActiveTab("basic")
        }
      }}>
        <DialogContent className="sm:max-w-[700px] max-h-[90vh] overflow-y-auto">
          <Form {...editForm}>
            <form onSubmit={editForm.handleSubmit(handleUpdateProperty)}>
              <DialogHeader>
                <DialogTitle>Edit Property</DialogTitle>
                <DialogDescription>
                  Update the property details for {selectedProperty?.name}
                </DialogDescription>
              </DialogHeader>
              
              <Tabs value={editActiveTab} onValueChange={setEditActiveTab} className="mt-4">
                <TabsList className="grid w-full grid-cols-4">
                  <TabsTrigger value="basic" className="gap-1">
                    <Building className="h-4 w-4" />
                    <span className="hidden sm:inline">Basic</span>
                  </TabsTrigger>
                  <TabsTrigger value="location" className="gap-1">
                    <Map className="h-4 w-4" />
                    <span className="hidden sm:inline">Location</span>
                  </TabsTrigger>
                  <TabsTrigger value="details" className="gap-1">
                    <LayoutGrid className="h-4 w-4" />
                    <span className="hidden sm:inline">Details</span>
                  </TabsTrigger>
                  <TabsTrigger value="operations" className="gap-1">
                    <Clock className="h-4 w-4" />
                    <span className="hidden sm:inline">Operations</span>
                  </TabsTrigger>
                </TabsList>
                
                {/* Basic Information Tab */}
                <TabsContent value="basic" className="space-y-4 pt-4">
                  <div className="grid grid-cols-2 gap-4">
                    <FormField
                      control={editForm.control}
                      name="name"
                      render={({ field }) => (
                        <FormItem className="col-span-2">
                          <FormLabel>Property Name *</FormLabel>
                          <FormControl>
                            <Input placeholder="e.g., Phoenix Marketcity Mumbai" {...field} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={editForm.control}
                      name="code"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Property Code *</FormLabel>
                          <FormControl>
                            <Input placeholder="e.g., PHX-MUM-01" {...field} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={editForm.control}
                      name="type"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Property Type *</FormLabel>
                          <Select onValueChange={field.onChange} value={field.value}>
                            <FormControl>
                              <SelectTrigger>
                                <SelectValue placeholder="Select type" />
                              </SelectTrigger>
                            </FormControl>
                            <SelectContent>
                              <SelectItem value="mall">Shopping Mall</SelectItem>
                              <SelectItem value="retail_complex">Retail Complex</SelectItem>
                              <SelectItem value="office">Office Building</SelectItem>
                              <SelectItem value="mixed_use">Mixed Use Development</SelectItem>
                            </SelectContent>
                          </Select>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={editForm.control}
                      name="status"
                      render={({ field }) => (
                        <FormItem className="col-span-2">
                          <FormLabel>Status</FormLabel>
                          <Select onValueChange={field.onChange} value={field.value}>
                            <FormControl>
                              <SelectTrigger>
                                <SelectValue placeholder="Select status" />
                              </SelectTrigger>
                            </FormControl>
                            <SelectContent>
                              <SelectItem value="active">Active - Operational</SelectItem>
                              <SelectItem value="under_construction">Under Construction</SelectItem>
                              <SelectItem value="closed">Closed</SelectItem>
                            </SelectContent>
                          </Select>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>
                </TabsContent>
                
                {/* Location Tab */}
                <TabsContent value="location" className="space-y-4 pt-4">
                  <FormField
                    control={editForm.control}
                    name="address"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Street Address</FormLabel>
                        <FormControl>
                          <Textarea 
                            placeholder="Enter complete street address"
                            className="min-h-[80px]"
                            {...field} 
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <div className="grid grid-cols-2 gap-4">
                    <FormField
                      control={editForm.control}
                      name="city"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>City *</FormLabel>
                          <FormControl>
                            <Input placeholder="e.g., Mumbai" {...field} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={editForm.control}
                      name="state"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>State *</FormLabel>
                          <Select onValueChange={field.onChange} value={field.value}>
                            <FormControl>
                              <SelectTrigger>
                                <SelectValue placeholder="Select state" />
                              </SelectTrigger>
                            </FormControl>
                            <SelectContent>
                              {INDIAN_STATES.map((state) => (
                                <SelectItem key={state} value={state}>
                                  {state}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={editForm.control}
                      name="pincode"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>PIN Code</FormLabel>
                          <FormControl>
                            <Input 
                              placeholder="e.g., 400076" 
                              maxLength={6}
                              {...field} 
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={editForm.control}
                      name="country"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Country</FormLabel>
                          <FormControl>
                            <Input {...field} disabled />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>
                </TabsContent>
                
                {/* Details Tab */}
                <TabsContent value="details" className="space-y-4 pt-4">
                  <div className="grid grid-cols-2 gap-4">
                    <FormField
                      control={editForm.control}
                      name="totalAreaSqft"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Total Built-up Area (sq ft)</FormLabel>
                          <FormControl>
                            <Input type="number" placeholder="e.g., 500000" {...field} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={editForm.control}
                      name="leasableAreaSqft"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Leasable Area (sq ft)</FormLabel>
                          <FormControl>
                            <Input type="number" placeholder="e.g., 350000" {...field} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={editForm.control}
                      name="floors"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Number of Floors</FormLabel>
                          <FormControl>
                            <Input type="number" placeholder="e.g., 5" {...field} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>
                  
                  {/* Amenities */}
                  <FormField
                    control={editForm.control}
                    name="amenities"
                    render={() => (
                      <FormItem>
                        <FormLabel>Amenities & Facilities</FormLabel>
                        <div className="grid grid-cols-2 md:grid-cols-3 gap-2 mt-2">
                          {COMMON_AMENITIES.map((amenity) => (
                            <FormField
                              key={amenity}
                              control={editForm.control}
                              name="amenities"
                              render={({ field }) => (
                                <FormItem className="flex items-center space-x-2 space-y-0">
                                  <FormControl>
                                    <Checkbox
                                      checked={field.value?.includes(amenity)}
                                      onCheckedChange={(checked) => {
                                        const current = field.value || []
                                        if (checked) {
                                          field.onChange([...current, amenity])
                                        } else {
                                          field.onChange(current.filter((v) => v !== amenity))
                                        }
                                      }}
                                    />
                                  </FormControl>
                                  <FormLabel className="text-sm font-normal cursor-pointer">
                                    {amenity}
                                  </FormLabel>
                                </FormItem>
                              )}
                            />
                          ))}
                        </div>
                      </FormItem>
                    )}
                  />
                </TabsContent>
                
                {/* Operations Tab */}
                <TabsContent value="operations" className="space-y-4 pt-4">
                  <div className="space-y-4">
                    <div className="grid grid-cols-2 gap-4">
                      <FormField
                        control={editForm.control}
                        name="operatingHoursStart"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Opening Time</FormLabel>
                            <FormControl>
                              <Input type="time" {...field} />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                      <FormField
                        control={editForm.control}
                        name="operatingHoursEnd"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Closing Time</FormLabel>
                            <FormControl>
                              <Input type="time" {...field} />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    </div>
                    
                    {/* Operating Days */}
                    <FormField
                      control={editForm.control}
                      name="operatingDays"
                      render={() => (
                        <FormItem>
                          <FormLabel>Operating Days</FormLabel>
                          <div className="flex flex-wrap gap-2 mt-2">
                            {DAYS_OF_WEEK.map((day) => (
                              <FormField
                                key={day}
                                control={editForm.control}
                                name="operatingDays"
                                render={({ field }) => (
                                  <FormItem className="flex items-center space-x-1 space-y-0">
                                    <FormControl>
                                      <Checkbox
                                        checked={field.value?.includes(day)}
                                        onCheckedChange={(checked) => {
                                          const current = field.value || []
                                          if (checked) {
                                            field.onChange([...current, day])
                                          } else {
                                            field.onChange(current.filter((v) => v !== day))
                                          }
                                        }}
                                      />
                                    </FormControl>
                                    <FormLabel className="text-sm font-normal cursor-pointer">
                                      {day.slice(0, 3)}
                                    </FormLabel>
                                  </FormItem>
                                )}
                              />
                            ))}
                          </div>
                        </FormItem>
                      )}
                    />
                  </div>
                  
                  <div className="border-t pt-4">
                    <h4 className="text-sm font-medium mb-4">Property Manager Contact</h4>
                    <div className="grid grid-cols-2 gap-4">
                      <FormField
                        control={editForm.control}
                        name="managerName"
                        render={({ field }) => (
                          <FormItem className="col-span-2 md:col-span-1">
                            <FormLabel>Manager Name</FormLabel>
                            <FormControl>
                              <Input placeholder="Full name" {...field} />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                      <FormField
                        control={editForm.control}
                        name="managerPhone"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Phone</FormLabel>
                            <FormControl>
                              <Input placeholder="10-digit mobile" maxLength={10} {...field} />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                      <FormField
                        control={editForm.control}
                        name="managerEmail"
                        render={({ field }) => (
                          <FormItem className="col-span-2">
                            <FormLabel>Email</FormLabel>
                            <FormControl>
                              <Input type="email" placeholder="email@example.com" {...field} />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    </div>
                  </div>
                </TabsContent>
              </Tabs>

              <DialogFooter className="mt-6 gap-2">
                <Button type="button" variant="outline" onClick={() => setEditDialogOpen(false)}>
                  Cancel
                </Button>
                <Button type="submit" disabled={isSubmitting} className="bg-emerald-500 hover:bg-emerald-600">
                  {isSubmitting && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                  Save Changes
                </Button>
              </DialogFooter>
            </form>
          </Form>
        </DialogContent>
      </Dialog>
    </div>
  )
}
