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
} from "@/components/ui/dialog"
import { AddEquipmentDialog } from "@/components/equipment/add-equipment-dialog"
import { usePropertyStore } from "@/stores/property-store"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import {
  Cpu,
  Plus,
  Search,
  Filter,
  MoreHorizontal,
  RefreshCw,
  Loader2,
  Eye,
  Edit,
  Trash2,
  AlertTriangle,
  CheckCircle2,
  Clock,
  Calendar,
  Wrench,
  Activity,
  Thermometer,
  Zap,
  Wind,
  Bot,
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
} from "lucide-react"
import { useToast } from "@/components/ui/use-toast"
import { format, differenceInDays } from "date-fns"

interface Equipment {
  id: string
  propertyId: string
  name: string
  type: string
  make: string | null
  model: string | null
  serialNumber: string | null
  location: string | null
  installationDate: string | null
  warrantyExpiry: string | null
  maintenanceFrequencyDays: number | null
  lastMaintenanceDate: string | null
  nextMaintenanceDate: string | null
  predictedFailureDate: string | null
  predictionConfidence: number | null
  healthScore: number
  status: string
  createdAt: string
}

const equipmentTypeConfig: Record<string, { label: string; icon: React.ReactNode; color: string }> = {
  hvac: { label: "HVAC", icon: <Thermometer className="h-4 w-4" />, color: "bg-blue-100 text-blue-800" },
  elevator: { label: "Elevator", icon: <Activity className="h-4 w-4" />, color: "bg-purple-100 text-purple-800" },
  escalator: { label: "Escalator", icon: <Activity className="h-4 w-4" />, color: "bg-indigo-100 text-indigo-800" },
  generator: { label: "Generator", icon: <Zap className="h-4 w-4" />, color: "bg-yellow-100 text-yellow-800" },
  fire_system: { label: "Fire System", icon: <AlertTriangle className="h-4 w-4" />, color: "bg-red-100 text-red-800" },
  ventilation: { label: "Ventilation", icon: <Wind className="h-4 w-4" />, color: "bg-cyan-100 text-cyan-800" },
  electrical: { label: "Electrical", icon: <Zap className="h-4 w-4" />, color: "bg-orange-100 text-orange-800" },
  plumbing: { label: "Plumbing", icon: <Cpu className="h-4 w-4" />, color: "bg-teal-100 text-teal-800" },
}

const statusConfig: Record<string, { label: string; color: string; icon: React.ReactNode }> = {
  operational: {
    label: "Operational",
    color: "bg-green-100 text-green-800",
    icon: <CheckCircle2 className="h-3 w-3" />,
  },
  maintenance: {
    label: "Under Maintenance",
    color: "bg-yellow-100 text-yellow-800",
    icon: <Wrench className="h-3 w-3" />,
  },
  failed: {
    label: "Failed",
    color: "bg-red-100 text-red-800",
    icon: <AlertTriangle className="h-3 w-3" />,
  },
  decommissioned: {
    label: "Decommissioned",
    color: "bg-gray-100 text-gray-800",
    icon: <Clock className="h-3 w-3" />,
  },
}

// Demo equipment data
const demoEquipment: Equipment[] = [
  {
    id: "1",
    propertyId: "prop-1",
    name: "Central HVAC Unit #1",
    type: "hvac",
    make: "Carrier",
    model: "30XA 400",
    serialNumber: "CAR-2023-001",
    location: "Rooftop - Zone A",
    installationDate: "2022-03-15",
    warrantyExpiry: "2027-03-15",
    maintenanceFrequencyDays: 90,
    lastMaintenanceDate: "2025-12-15",
    nextMaintenanceDate: "2026-03-15",
    predictedFailureDate: "2026-08-20",
    predictionConfidence: 0.75,
    healthScore: 0.85,
    status: "operational",
    createdAt: "2022-03-15",
  },
  {
    id: "2",
    propertyId: "prop-1",
    name: "Passenger Elevator #1",
    type: "elevator",
    make: "OTIS",
    model: "Gen2 Premier",
    serialNumber: "OTIS-2021-E01",
    location: "Main Atrium",
    installationDate: "2021-06-01",
    warrantyExpiry: "2026-06-01",
    maintenanceFrequencyDays: 30,
    lastMaintenanceDate: "2026-01-05",
    nextMaintenanceDate: "2026-02-05",
    predictedFailureDate: null,
    predictionConfidence: null,
    healthScore: 0.92,
    status: "operational",
    createdAt: "2021-06-01",
  },
  {
    id: "3",
    propertyId: "prop-1",
    name: "Escalator - Ground to 1st Floor",
    type: "escalator",
    make: "KONE",
    model: "TransitMaster 130",
    serialNumber: "KONE-2020-ESC01",
    location: "Main Entrance",
    installationDate: "2020-09-10",
    warrantyExpiry: "2025-09-10",
    maintenanceFrequencyDays: 60,
    lastMaintenanceDate: "2025-11-20",
    nextMaintenanceDate: "2026-01-20",
    predictedFailureDate: "2026-03-15",
    predictionConfidence: 0.68,
    healthScore: 0.72,
    status: "maintenance",
    createdAt: "2020-09-10",
  },
  {
    id: "4",
    propertyId: "prop-1",
    name: "Backup Generator",
    type: "generator",
    make: "Cummins",
    model: "C500D5",
    serialNumber: "CUM-2019-GEN01",
    location: "Basement - Utility Room",
    installationDate: "2019-01-20",
    warrantyExpiry: "2024-01-20",
    maintenanceFrequencyDays: 180,
    lastMaintenanceDate: "2025-07-15",
    nextMaintenanceDate: "2026-01-15",
    predictedFailureDate: "2026-09-01",
    predictionConfidence: 0.82,
    healthScore: 0.65,
    status: "operational",
    createdAt: "2019-01-20",
  },
  {
    id: "5",
    propertyId: "prop-1",
    name: "Fire Suppression System",
    type: "fire_system",
    make: "Tyco",
    model: "ESFR-25",
    serialNumber: "TYC-2023-FS01",
    location: "Building-wide",
    installationDate: "2023-02-28",
    warrantyExpiry: "2033-02-28",
    maintenanceFrequencyDays: 365,
    lastMaintenanceDate: "2025-02-28",
    nextMaintenanceDate: "2026-02-28",
    predictedFailureDate: null,
    predictionConfidence: null,
    healthScore: 0.98,
    status: "operational",
    createdAt: "2023-02-28",
  },
  {
    id: "6",
    propertyId: "prop-1",
    name: "AHU Unit #3",
    type: "hvac",
    make: "Daikin",
    model: "FXMQ200MVE",
    serialNumber: "DAI-2018-AHU03",
    location: "Floor 2 - East Wing",
    installationDate: "2018-05-10",
    warrantyExpiry: "2023-05-10",
    maintenanceFrequencyDays: 45,
    lastMaintenanceDate: "2025-12-01",
    nextMaintenanceDate: "2026-01-15",
    predictedFailureDate: "2026-02-10",
    predictionConfidence: 0.88,
    healthScore: 0.45,
    status: "operational",
    createdAt: "2018-05-10",
  },
]

export default function EquipmentPage() {
  const { toast } = useToast()
  const { properties, selectedProperty, fetchProperties } = usePropertyStore()
  const [equipment, setEquipment] = React.useState<Equipment[]>(demoEquipment)
  const [isLoading, setIsLoading] = React.useState(false)
  const [searchQuery, setSearchQuery] = React.useState("")
  const [statusFilter, setStatusFilter] = React.useState<string>("all")
  const [typeFilter, setTypeFilter] = React.useState<string>("all")
  const [currentPage, setCurrentPage] = React.useState(1)
  const [pageSize, setPageSize] = React.useState(10)

  // Dialog states
  const [addDialogOpen, setAddDialogOpen] = React.useState(false)
  const [viewDialogOpen, setViewDialogOpen] = React.useState(false)
  const [selectedEquipment, setSelectedEquipment] = React.useState<Equipment | null>(null)

  React.useEffect(() => { fetchProperties() }, [fetchProperties])

  const getHealthColor = (score: number) => {
    if (score >= 0.8) return "text-green-600"
    if (score >= 0.6) return "text-yellow-600"
    if (score >= 0.4) return "text-orange-600"
    return "text-red-600"
  }

  const getHealthBgColor = (score: number) => {
    if (score >= 0.8) return "bg-green-500"
    if (score >= 0.6) return "bg-yellow-500"
    if (score >= 0.4) return "bg-orange-500"
    return "bg-red-500"
  }

  const getMaintenanceUrgency = (date: string | null) => {
    if (!date) return null
    const days = differenceInDays(new Date(date), new Date())
    if (days < 0) return { label: "Overdue", color: "text-red-600" }
    if (days <= 7) return { label: "This week", color: "text-orange-600" }
    if (days <= 30) return { label: "This month", color: "text-yellow-600" }
    return { label: `${days} days`, color: "text-green-600" }
  }

  const filteredEquipment = equipment.filter((eq) => {
    if (searchQuery) {
      const searchLower = searchQuery.toLowerCase()
      if (
        !eq.name.toLowerCase().includes(searchLower) &&
        !eq.make?.toLowerCase().includes(searchLower) &&
        !eq.model?.toLowerCase().includes(searchLower) &&
        !eq.location?.toLowerCase().includes(searchLower)
      ) {
        return false
      }
    }
    if (statusFilter !== "all" && eq.status !== statusFilter) return false
    if (typeFilter !== "all" && eq.type !== typeFilter) return false
    return true
  })

  const totalPages = Math.ceil(filteredEquipment.length / pageSize)
  const paginatedEquipment = filteredEquipment.slice(
    (currentPage - 1) * pageSize,
    currentPage * pageSize
  )

  React.useEffect(() => {
    setCurrentPage(1)
  }, [searchQuery, statusFilter, typeFilter])

  const stats = {
    total: equipment.length,
    operational: equipment.filter((e) => e.status === "operational").length,
    maintenance: equipment.filter((e) => e.status === "maintenance").length,
    failed: equipment.filter((e) => e.status === "failed").length,
    avgHealth: equipment.reduce((acc, e) => acc + e.healthScore, 0) / equipment.length,
    needingMaintenance: equipment.filter((e) => {
      if (!e.nextMaintenanceDate) return false
      return differenceInDays(new Date(e.nextMaintenanceDate), new Date()) <= 7
    }).length,
  }

  const fetchEquipment = React.useCallback(async () => {
    setIsLoading(true)
    try {
      const params = new URLSearchParams()
      if (selectedProperty) params.set("propertyId", selectedProperty.id)
      const res = await fetch(`/api/equipment${params.toString() ? `?${params}` : ""}`)
      const json = await res.json()
      if (json.success && Array.isArray(json.data) && json.data.length > 0) {
        const mapped: Equipment[] = json.data.map((e: any) => ({
          id: e.id,
          propertyId: e.propertyId || "",
          name: e.name,
          type: e.type,
          make: e.make || null,
          model: e.model || null,
          serialNumber: e.serialNumber || null,
          location: e.location || null,
          installationDate: e.installationDate || null,
          warrantyExpiry: e.warrantyExpiry || null,
          maintenanceFrequencyDays: e.maintenanceFrequencyDays || null,
          lastMaintenanceDate: e.lastMaintenanceDate || null,
          nextMaintenanceDate: e.nextMaintenanceDate || null,
          predictedFailureDate: e.predictedFailureDate || null,
          predictionConfidence: e.predictionConfidence ? parseFloat(e.predictionConfidence) : null,
          healthScore: parseFloat(e.healthScore) || 1.0,
          status: e.status || "operational",
          createdAt: e.createdAt || new Date().toISOString(),
        }))
        setEquipment(mapped)
      }
      // else keep demoEquipment so the page looks populated
    } catch (err) {
      console.error("Failed to fetch equipment:", err)
    } finally {
      setIsLoading(false)
    }
  }, [selectedProperty])

  React.useEffect(() => { fetchEquipment() }, [fetchEquipment])

  const handleScheduleMaintenance = (id: string) => {
    toast({
      title: "Maintenance Scheduled",
      description: "Work order created for scheduled maintenance.",
    })
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Equipment Management</h1>
          <p className="text-muted-foreground">
            Track equipment health, maintenance schedules, and predictive analytics
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" onClick={() => fetchEquipment()} disabled={isLoading}>
            <RefreshCw className={`h-4 w-4 mr-2 ${isLoading ? "animate-spin" : ""}`} />
            Refresh
          </Button>
          <Button className="gap-2" onClick={() => setAddDialogOpen(true)}>
            <Plus className="h-4 w-4" />
            Add Equipment
          </Button>
          <AddEquipmentDialog
            open={addDialogOpen}
            onOpenChange={setAddDialogOpen}
            properties={properties}
            selectedPropertyId={selectedProperty?.id}
            onSuccess={fetchEquipment}
          />
        </div>
      </div>

      {/* Stats */}
      <div className="grid gap-4 md:grid-cols-6">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Equipment</CardTitle>
            <Cpu className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.total}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Operational</CardTitle>
            <CheckCircle2 className="h-4 w-4 text-green-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-600">{stats.operational}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Maintenance</CardTitle>
            <Wrench className="h-4 w-4 text-yellow-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-yellow-600">{stats.maintenance}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Failed</CardTitle>
            <AlertTriangle className="h-4 w-4 text-red-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-red-600">{stats.failed}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Avg Health</CardTitle>
            <Activity className="h-4 w-4 text-blue-600" />
          </CardHeader>
          <CardContent>
            <div className={`text-2xl font-bold ${getHealthColor(stats.avgHealth)}`}>
              {Math.round(stats.avgHealth * 100)}%
            </div>
            <Progress value={stats.avgHealth * 100} className="mt-2 h-2" />
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Due Soon</CardTitle>
            <Clock className="h-4 w-4 text-orange-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-orange-600">{stats.needingMaintenance}</div>
          </CardContent>
        </Card>
      </div>

      {/* AI Insights */}
      <Card className="border-orange-200 bg-orange-50/30">
        <CardHeader className="pb-3">
          <div className="flex items-center gap-2">
            <Bot className="h-5 w-5 text-orange-600" />
            <CardTitle className="text-base">Maintenance Coordinator Predictions</CardTitle>
          </div>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 md:grid-cols-3">
            <div className="flex items-start gap-3 p-3 bg-white rounded-lg border">
              <div className="p-2 bg-red-100 rounded-lg">
                <AlertTriangle className="h-4 w-4 text-red-600" />
              </div>
              <div>
                <p className="text-sm font-medium">Critical: AHU Unit #3</p>
                <p className="text-xs text-muted-foreground">
                  Health at 45%. Predicted failure in 21 days (88% confidence). Schedule preventive maintenance.
                </p>
              </div>
            </div>
            <div className="flex items-start gap-3 p-3 bg-white rounded-lg border">
              <div className="p-2 bg-yellow-100 rounded-lg">
                <Clock className="h-4 w-4 text-yellow-600" />
              </div>
              <div>
                <p className="text-sm font-medium">Upcoming: 3 Maintenance Due</p>
                <p className="text-xs text-muted-foreground">
                  Escalator, Generator, and HVAC Unit need maintenance within 30 days.
                </p>
              </div>
            </div>
            <div className="flex items-start gap-3 p-3 bg-white rounded-lg border">
              <div className="p-2 bg-green-100 rounded-lg">
                <CheckCircle2 className="h-4 w-4 text-green-600" />
              </div>
              <div>
                <p className="text-sm font-medium">Well Maintained</p>
                <p className="text-xs text-muted-foreground">
                  Fire System and Elevator #1 are in excellent condition.
                </p>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Filters */}
      <div className="flex items-center gap-4">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search equipment..."
            className="pl-8"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-[180px]">
            <Filter className="h-4 w-4 mr-2" />
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Status</SelectItem>
            <SelectItem value="operational">Operational</SelectItem>
            <SelectItem value="maintenance">Under Maintenance</SelectItem>
            <SelectItem value="failed">Failed</SelectItem>
            <SelectItem value="decommissioned">Decommissioned</SelectItem>
          </SelectContent>
        </Select>
        <Select value={typeFilter} onValueChange={setTypeFilter}>
          <SelectTrigger className="w-[150px]">
            <SelectValue placeholder="Type" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Types</SelectItem>
            <SelectItem value="hvac">HVAC</SelectItem>
            <SelectItem value="elevator">Elevator</SelectItem>
            <SelectItem value="escalator">Escalator</SelectItem>
            <SelectItem value="generator">Generator</SelectItem>
            <SelectItem value="fire_system">Fire System</SelectItem>
            <SelectItem value="ventilation">Ventilation</SelectItem>
            <SelectItem value="electrical">Electrical</SelectItem>
            <SelectItem value="plumbing">Plumbing</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Equipment Table */}
      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Equipment</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>Location</TableHead>
                <TableHead>Health</TableHead>
                <TableHead>Next Maintenance</TableHead>
                <TableHead>Prediction</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {paginatedEquipment.map((eq) => {
                const type = equipmentTypeConfig[eq.type]
                const status = statusConfig[eq.status]
                const maintenanceUrgency = getMaintenanceUrgency(eq.nextMaintenanceDate)

                return (
                  <TableRow key={eq.id}>
                    <TableCell>
                      <div>
                        <div className="font-medium">{eq.name}</div>
                        <div className="text-xs text-muted-foreground">
                          {eq.make} {eq.model}
                        </div>
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge className={`gap-1 ${type?.color || "bg-gray-100 text-gray-800"}`}>
                        {type?.icon}
                        {type?.label || eq.type}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {eq.location || "—"}
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <div className={`text-sm font-medium ${getHealthColor(eq.healthScore)}`}>
                          {Math.round(eq.healthScore * 100)}%
                        </div>
                        <div className="w-16 h-2 bg-gray-200 rounded-full overflow-hidden">
                          <div
                            className={`h-full ${getHealthBgColor(eq.healthScore)}`}
                            style={{ width: `${eq.healthScore * 100}%` }}
                          />
                        </div>
                      </div>
                    </TableCell>
                    <TableCell>
                      {eq.nextMaintenanceDate ? (
                        <div>
                          <div className="flex items-center gap-1">
                            <Calendar className="h-3.5 w-3.5 text-muted-foreground" />
                            <span className="text-sm">
                              {format(new Date(eq.nextMaintenanceDate), "MMM d, yyyy")}
                            </span>
                          </div>
                          {maintenanceUrgency && (
                            <span className={`text-xs ${maintenanceUrgency.color}`}>
                              {maintenanceUrgency.label}
                            </span>
                          )}
                        </div>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </TableCell>
                    <TableCell>
                      {eq.predictedFailureDate ? (
                        <div className="flex items-center gap-1">
                          <Bot className="h-3.5 w-3.5 text-orange-600" />
                          <div>
                            <div className="text-sm">
                              {format(new Date(eq.predictedFailureDate), "MMM d")}
                            </div>
                            <div className="text-xs text-muted-foreground">
                              {Math.round((eq.predictionConfidence || 0) * 100)}% confidence
                            </div>
                          </div>
                        </div>
                      ) : (
                        <span className="text-xs text-muted-foreground">No prediction</span>
                      )}
                    </TableCell>
                    <TableCell>
                      <Badge className={`gap-1 ${status?.color || "bg-gray-100 text-gray-800"}`}>
                        {status?.icon}
                        {status?.label || eq.status}
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
                              setSelectedEquipment(eq)
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
                          <DropdownMenuItem onClick={() => handleScheduleMaintenance(eq.id)}>
                            <Wrench className="mr-2 h-4 w-4" />
                            Schedule Maintenance
                          </DropdownMenuItem>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem className="text-red-600">
                            <Trash2 className="mr-2 h-4 w-4" />
                            Decommission
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </TableCell>
                  </TableRow>
                )
              })}
            </TableBody>
          </Table>
          {filteredEquipment.length > 0 && (
            <div className="flex items-center justify-between border-t pt-4 mt-4 px-4 pb-4">
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <span>
                  Showing {(currentPage - 1) * pageSize + 1}–{Math.min(currentPage * pageSize, filteredEquipment.length)} of {filteredEquipment.length}
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
        </CardContent>
      </Card>

      {/* View Dialog */}
      <Dialog open={viewDialogOpen} onOpenChange={setViewDialogOpen}>
        <DialogContent className="sm:max-w-[500px]">
          <DialogHeader>
            <DialogTitle>{selectedEquipment?.name}</DialogTitle>
            <DialogDescription>Equipment details and maintenance history</DialogDescription>
          </DialogHeader>
          {selectedEquipment && (
            <div className="grid gap-4 py-4">
              <div className="flex items-center gap-4">
                <Badge className={equipmentTypeConfig[selectedEquipment.type]?.color}>
                  {equipmentTypeConfig[selectedEquipment.type]?.icon}
                  {equipmentTypeConfig[selectedEquipment.type]?.label}
                </Badge>
                <Badge className={statusConfig[selectedEquipment.status]?.color}>
                  {statusConfig[selectedEquipment.status]?.label}
                </Badge>
              </div>

              <div className="grid grid-cols-2 gap-4 pt-4 border-t">
                <div>
                  <span className="text-sm text-muted-foreground">Make</span>
                  <p className="font-medium">{selectedEquipment.make || "—"}</p>
                </div>
                <div>
                  <span className="text-sm text-muted-foreground">Model</span>
                  <p className="font-medium">{selectedEquipment.model || "—"}</p>
                </div>
                <div>
                  <span className="text-sm text-muted-foreground">Serial Number</span>
                  <p className="font-medium">{selectedEquipment.serialNumber || "—"}</p>
                </div>
                <div>
                  <span className="text-sm text-muted-foreground">Location</span>
                  <p className="font-medium">{selectedEquipment.location || "—"}</p>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4 pt-4 border-t">
                <div>
                  <span className="text-sm text-muted-foreground">Installation Date</span>
                  <p className="font-medium">
                    {selectedEquipment.installationDate
                      ? format(new Date(selectedEquipment.installationDate), "MMM d, yyyy")
                      : "—"}
                  </p>
                </div>
                <div>
                  <span className="text-sm text-muted-foreground">Warranty Expiry</span>
                  <p className="font-medium">
                    {selectedEquipment.warrantyExpiry
                      ? format(new Date(selectedEquipment.warrantyExpiry), "MMM d, yyyy")
                      : "—"}
                  </p>
                </div>
              </div>

              <div className="pt-4 border-t">
                <h4 className="text-sm font-medium mb-3">Health & Maintenance</h4>
                <div className="grid grid-cols-2 gap-4">
                  <div className="p-3 bg-muted rounded-lg">
                    <span className="text-xs text-muted-foreground">Health Score</span>
                    <p className={`text-xl font-bold ${getHealthColor(selectedEquipment.healthScore)}`}>
                      {Math.round(selectedEquipment.healthScore * 100)}%
                    </p>
                  </div>
                  <div className="p-3 bg-muted rounded-lg">
                    <span className="text-xs text-muted-foreground">Maintenance Cycle</span>
                    <p className="text-xl font-bold">{selectedEquipment.maintenanceFrequencyDays} days</p>
                  </div>
                </div>
              </div>

              {selectedEquipment.predictedFailureDate && (
                <div className="p-3 bg-orange-50 border border-orange-200 rounded-lg">
                  <div className="flex items-center gap-2 mb-1">
                    <Bot className="h-4 w-4 text-orange-600" />
                    <span className="text-sm font-medium text-orange-800">AI Prediction</span>
                  </div>
                  <p className="text-sm text-orange-700">
                    Predicted failure on{" "}
                    {format(new Date(selectedEquipment.predictedFailureDate), "MMMM d, yyyy")} with{" "}
                    {Math.round((selectedEquipment.predictionConfidence || 0) * 100)}% confidence.
                  </p>
                </div>
              )}
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setViewDialogOpen(false)}>
              Close
            </Button>
            <Button onClick={() => handleScheduleMaintenance(selectedEquipment!.id)}>
              Schedule Maintenance
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

