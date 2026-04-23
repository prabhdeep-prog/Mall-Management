"use client"

import * as React from "react"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { Checkbox } from "@/components/ui/checkbox"
import { Textarea } from "@/components/ui/textarea"
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
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion"
import {
  Shield,
  Plus,
  Search,
  MoreHorizontal,
  RefreshCw,
  Loader2,
  Eye,
  Edit,
  Trash2,
  Users,
  Lock,
  Check,
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
} from "lucide-react"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { useToast } from "@/components/ui/use-toast"
import { PermissionGate, PERMISSIONS } from "@/components/auth/permission-gate"
import { usePermissions } from "@/hooks/use-permissions"
import { formatDistanceToNow } from "date-fns"

interface Role {
  id: string
  name: string
  description: string | null
  permissions: string[]
  isDefault?: boolean
  createdAt: string
  updatedAt: string
}

// Permission categories for better organization in the UI
const PERMISSION_CATEGORIES = {
  properties: {
    label: "Properties",
    permissions: [
      { key: "properties:view", label: "View Properties" },
      { key: "properties:create", label: "Create Properties" },
      { key: "properties:edit", label: "Edit Properties" },
      { key: "properties:delete", label: "Delete Properties" },
    ],
  },
  tenants: {
    label: "Tenants",
    permissions: [
      { key: "tenants:view", label: "View Tenants" },
      { key: "tenants:create", label: "Create Tenants" },
      { key: "tenants:edit", label: "Edit Tenants" },
      { key: "tenants:delete", label: "Delete Tenants" },
    ],
  },
  leases: {
    label: "Leases",
    permissions: [
      { key: "leases:view", label: "View Leases" },
      { key: "leases:create", label: "Create Leases" },
      { key: "leases:edit", label: "Edit Leases" },
      { key: "leases:delete", label: "Delete Leases" },
    ],
  },
  invoices: {
    label: "Invoices",
    permissions: [
      { key: "invoices:view", label: "View Invoices" },
      { key: "invoices:create", label: "Create Invoices" },
      { key: "invoices:edit", label: "Edit Invoices" },
      { key: "invoices:delete", label: "Delete Invoices" },
    ],
  },
  workOrders: {
    label: "Work Orders",
    permissions: [
      { key: "work_orders:view", label: "View Work Orders" },
      { key: "work_orders:create", label: "Create Work Orders" },
      { key: "work_orders:edit", label: "Edit Work Orders" },
      { key: "work_orders:delete", label: "Delete Work Orders" },
      { key: "work_orders:assign", label: "Assign Work Orders" },
    ],
  },
  agents: {
    label: "AI Agents",
    permissions: [
      { key: "agents:view", label: "View Agent Activity" },
      { key: "agents:configure", label: "Configure Agents" },
      { key: "agents:approve", label: "Approve Agent Actions" },
      { key: "agents:reject", label: "Reject Agent Actions" },
    ],
  },
  analytics: {
    label: "Analytics",
    permissions: [
      { key: "analytics:view", label: "View Analytics" },
      { key: "analytics:export", label: "Export Reports" },
    ],
  },
  settings: {
    label: "Settings",
    permissions: [
      { key: "settings:view", label: "View Settings" },
      { key: "settings:edit", label: "Edit Settings" },
    ],
  },
  users: {
    label: "User Management",
    permissions: [
      { key: "users:view", label: "View Users" },
      { key: "users:create", label: "Create Users" },
      { key: "users:edit", label: "Edit Users" },
      { key: "users:delete", label: "Delete Users" },
    ],
  },
}

const roleColors: Record<string, string> = {
  super_admin: "bg-purple-100 text-purple-800 border-purple-200",
  organization_admin: "bg-blue-100 text-blue-800 border-blue-200",
  property_manager: "bg-green-100 text-green-800 border-green-200",
  accountant: "bg-yellow-100 text-yellow-800 border-yellow-200",
  maintenance_staff: "bg-orange-100 text-orange-800 border-orange-200",
  tenant_user: "bg-cyan-100 text-cyan-800 border-cyan-200",
  viewer: "bg-gray-100 text-gray-800 border-gray-200",
}

export default function RolesPage() {
  const { toast } = useToast()
  const { isAdmin, isSuperAdmin } = usePermissions()
  const [roles, setRoles] = React.useState<Role[]>([])
  const [isLoading, setIsLoading] = React.useState(true)
  const [searchQuery, setSearchQuery] = React.useState("")
  const [currentPage, setCurrentPage] = React.useState(1)
  const [pageSize, setPageSize] = React.useState(10)

  // Dialog states
  const [addRoleDialogOpen, setAddRoleDialogOpen] = React.useState(false)
  const [viewRoleDialogOpen, setViewRoleDialogOpen] = React.useState(false)
  const [editRoleDialogOpen, setEditRoleDialogOpen] = React.useState(false)
  const [deleteRoleDialogOpen, setDeleteRoleDialogOpen] = React.useState(false)
  const [selectedRole, setSelectedRole] = React.useState<Role | null>(null)
  const [isSubmitting, setIsSubmitting] = React.useState(false)

  // Form state
  const [formData, setFormData] = React.useState({
    name: "",
    description: "",
    permissions: [] as string[],
  })

  const fetchRoles = React.useCallback(async () => {
    setIsLoading(true)
    try {
      const response = await fetch("/api/roles")
      if (!response.ok) throw new Error("Failed to fetch roles")
      const result = await response.json()
      setRoles(result.data || result || [])
    } catch (error) {
      console.error("Error fetching roles:", error)
      toast({
        title: "Error",
        description: "Failed to load roles. Please try again.",
        variant: "destructive",
      })
    } finally {
      setIsLoading(false)
    }
  }, [toast])

  React.useEffect(() => {
    fetchRoles()
  }, [fetchRoles])

  const handleCreateRole = async (e: React.FormEvent) => {
    e.preventDefault()
    setIsSubmitting(true)
    try {
      const response = await fetch("/api/roles", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(formData),
      })

      if (!response.ok) {
        const error = await response.json()
        throw new Error(error.error || "Failed to create role")
      }

      toast({
        title: "Success",
        description: "Role created successfully!",
      })
      setAddRoleDialogOpen(false)
      resetForm()
      fetchRoles()
    } catch (error: any) {
      console.error("Error creating role:", error)
      toast({
        title: "Error",
        description: error.message || "Failed to create role. Please try again.",
        variant: "destructive",
      })
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleUpdateRole = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!selectedRole) return
    setIsSubmitting(true)
    try {
      const response = await fetch(`/api/roles/${selectedRole.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(formData),
      })

      if (!response.ok) {
        const error = await response.json()
        throw new Error(error.error || "Failed to update role")
      }

      toast({
        title: "Success",
        description: "Role updated successfully!",
      })
      setEditRoleDialogOpen(false)
      resetForm()
      fetchRoles()
    } catch (error: any) {
      console.error("Error updating role:", error)
      toast({
        title: "Error",
        description: error.message || "Failed to update role. Please try again.",
        variant: "destructive",
      })
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleDeleteRole = async () => {
    if (!selectedRole) return
    setIsSubmitting(true)
    try {
      const response = await fetch(`/api/roles/${selectedRole.id}`, {
        method: "DELETE",
      })

      if (!response.ok) {
        const error = await response.json()
        throw new Error(error.error || "Failed to delete role")
      }

      toast({
        title: "Success",
        description: "Role deleted successfully!",
      })
      setDeleteRoleDialogOpen(false)
      fetchRoles()
    } catch (error: any) {
      console.error("Error deleting role:", error)
      toast({
        title: "Error",
        description: error.message || "Failed to delete role. Please try again.",
        variant: "destructive",
      })
    } finally {
      setIsSubmitting(false)
    }
  }

  const resetForm = () => {
    setFormData({
      name: "",
      description: "",
      permissions: [],
    })
    setSelectedRole(null)
  }

  const openEditDialog = (role: Role) => {
    if (role.isDefault) {
      toast({
        title: "Cannot Edit",
        description: "Default system roles cannot be edited.",
        variant: "destructive",
      })
      return
    }
    setSelectedRole(role)
    setFormData({
      name: role.name,
      description: role.description || "",
      permissions: role.permissions || [],
    })
    setEditRoleDialogOpen(true)
  }

  const openViewDialog = (role: Role) => {
    setSelectedRole(role)
    setViewRoleDialogOpen(true)
  }

  const openDeleteDialog = (role: Role) => {
    if (role.isDefault) {
      toast({
        title: "Cannot Delete",
        description: "Default system roles cannot be deleted.",
        variant: "destructive",
      })
      return
    }
    setSelectedRole(role)
    setDeleteRoleDialogOpen(true)
  }

  const togglePermission = (permission: string) => {
    setFormData((prev) => ({
      ...prev,
      permissions: prev.permissions.includes(permission)
        ? prev.permissions.filter((p) => p !== permission)
        : [...prev.permissions, permission],
    }))
  }

  const toggleCategoryPermissions = (categoryKey: string) => {
    const category = PERMISSION_CATEGORIES[categoryKey as keyof typeof PERMISSION_CATEGORIES]
    const categoryPermissions = category.permissions.map((p) => p.key)
    const allSelected = categoryPermissions.every((p) => formData.permissions.includes(p))

    setFormData((prev) => ({
      ...prev,
      permissions: allSelected
        ? prev.permissions.filter((p) => !categoryPermissions.includes(p))
        : Array.from(new Set([...prev.permissions, ...categoryPermissions])),
    }))
  }

  const filteredRoles = roles.filter((role) => {
    if (searchQuery) {
      const searchLower = searchQuery.toLowerCase()
      if (
        !role.name.toLowerCase().includes(searchLower) &&
        !role.description?.toLowerCase().includes(searchLower)
      ) {
        return false
      }
    }
    return true
  })

  const totalPages = Math.ceil(filteredRoles.length / pageSize)
  const paginatedRoles = filteredRoles.slice(
    (currentPage - 1) * pageSize,
    currentPage * pageSize
  )

  React.useEffect(() => {
    setCurrentPage(1)
  }, [searchQuery])

  const stats = {
    total: roles.length,
    default: roles.filter((r) => r.isDefault).length,
    custom: roles.filter((r) => !r.isDefault).length,
  }

  const formatRoleName = (name: string) => {
    return name.replace(/_/g, " ").replace(/\b\w/g, (l) => l.toUpperCase())
  }

  return (
    <PermissionGate 
      permissions={[PERMISSIONS.USERS_VIEW, PERMISSIONS.SETTINGS_VIEW]} 
      showAccessDenied
    >
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Roles & Permissions</h1>
            <p className="text-muted-foreground">
              Manage user roles and their access permissions
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" onClick={fetchRoles} disabled={isLoading}>
              <RefreshCw className={`h-4 w-4 mr-2 ${isLoading ? "animate-spin" : ""}`} />
              Refresh
            </Button>
            {isAdmin && (
              <Dialog open={addRoleDialogOpen} onOpenChange={setAddRoleDialogOpen}>
                <DialogTrigger asChild>
                  <Button className="gap-2">
                    <Plus className="h-4 w-4" />
                    Create Role
                  </Button>
                </DialogTrigger>
                <DialogContent className="sm:max-w-[600px] max-h-[90vh] overflow-y-auto">
                  <form onSubmit={handleCreateRole}>
                    <DialogHeader>
                      <DialogTitle>Create New Role</DialogTitle>
                      <DialogDescription>
                        Define a new role with specific permissions.
                      </DialogDescription>
                    </DialogHeader>
                    <div className="grid gap-4 py-4">
                      <div className="grid gap-2">
                        <label htmlFor="name" className="text-sm font-medium">
                          Role Name *
                        </label>
                        <Input
                          id="name"
                          placeholder="e.g., custom_manager"
                          value={formData.name}
                          onChange={(e) =>
                            setFormData((prev) => ({
                              ...prev,
                              name: e.target.value.toLowerCase().replace(/\s+/g, "_"),
                            }))
                          }
                          required
                        />
                        <p className="text-xs text-muted-foreground">
                          Use lowercase with underscores (e.g., custom_manager)
                        </p>
                      </div>
                      <div className="grid gap-2">
                        <label htmlFor="description" className="text-sm font-medium">
                          Description
                        </label>
                        <Textarea
                          id="description"
                          placeholder="Describe the role's responsibilities..."
                          value={formData.description}
                          onChange={(e) =>
                            setFormData((prev) => ({ ...prev, description: e.target.value }))
                          }
                        />
                      </div>
                      <div className="grid gap-2">
                        <label className="text-sm font-medium">Permissions</label>
                        <Accordion type="multiple" className="w-full">
                          {Object.entries(PERMISSION_CATEGORIES).map(([key, category]) => {
                            const categoryPermissions = category.permissions.map((p) => p.key)
                            const selectedCount = categoryPermissions.filter((p) =>
                              formData.permissions.includes(p)
                            ).length
                            const allSelected = selectedCount === categoryPermissions.length

                            return (
                              <AccordionItem key={key} value={key}>
                                <AccordionTrigger className="hover:no-underline">
                                  <div className="flex items-center gap-3">
                                    <Checkbox
                                      checked={allSelected}
                                      onCheckedChange={() => toggleCategoryPermissions(key)}
                                      onClick={(e) => e.stopPropagation()}
                                    />
                                    <span>{category.label}</span>
                                    <Badge variant="secondary" className="ml-auto mr-2">
                                      {selectedCount}/{categoryPermissions.length}
                                    </Badge>
                                  </div>
                                </AccordionTrigger>
                                <AccordionContent>
                                  <div className="grid gap-2 pl-7">
                                    {category.permissions.map((permission) => (
                                      <div
                                        key={permission.key}
                                        className="flex items-center gap-2"
                                      >
                                        <Checkbox
                                          id={permission.key}
                                          checked={formData.permissions.includes(permission.key)}
                                          onCheckedChange={() => togglePermission(permission.key)}
                                        />
                                        <label
                                          htmlFor={permission.key}
                                          className="text-sm cursor-pointer"
                                        >
                                          {permission.label}
                                        </label>
                                      </div>
                                    ))}
                                  </div>
                                </AccordionContent>
                              </AccordionItem>
                            )
                          })}
                        </Accordion>
                      </div>
                    </div>
                    <DialogFooter>
                      <Button
                        type="button"
                        variant="outline"
                        onClick={() => {
                          setAddRoleDialogOpen(false)
                          resetForm()
                        }}
                      >
                        Cancel
                      </Button>
                      <Button type="submit" disabled={isSubmitting}>
                        {isSubmitting && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                        Create Role
                      </Button>
                    </DialogFooter>
                  </form>
                </DialogContent>
              </Dialog>
            )}
          </div>
        </div>

        {/* Stats */}
        <div className="grid gap-4 md:grid-cols-3">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Total Roles</CardTitle>
              <Shield className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stats.total}</div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">System Roles</CardTitle>
              <Lock className="h-4 w-4 text-purple-600" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-purple-600">{stats.default}</div>
              <p className="text-xs text-muted-foreground">Cannot be modified</p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Custom Roles</CardTitle>
              <Users className="h-4 w-4 text-green-600" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-green-600">{stats.custom}</div>
              <p className="text-xs text-muted-foreground">Organization-specific</p>
            </CardContent>
          </Card>
        </div>

        {/* Search */}
        <div className="flex items-center gap-4">
          <div className="relative flex-1 max-w-sm">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search roles..."
              className="pl-8"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>
        </div>

        {/* Roles Table */}
        <Card>
          <CardContent className="p-0">
            {isLoading ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
              </div>
            ) : filteredRoles.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 text-center">
                <Shield className="h-12 w-12 text-muted-foreground/50 mb-4" />
                <h3 className="text-lg font-semibold">No roles found</h3>
                <p className="text-muted-foreground">
                  {roles.length === 0
                    ? "Create your first custom role to get started"
                    : "Try adjusting your search"}
                </p>
              </div>
            ) : (
              <>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Role</TableHead>
                      <TableHead>Description</TableHead>
                      <TableHead>Permissions</TableHead>
                      <TableHead>Type</TableHead>
                      <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {paginatedRoles.map((role) => (
                      <TableRow key={role.id}>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <Shield className="h-4 w-4 text-muted-foreground" />
                            <Badge className={roleColors[role.name] || "bg-gray-100 text-gray-800"}>
                              {formatRoleName(role.name)}
                            </Badge>
                          </div>
                        </TableCell>
                        <TableCell className="max-w-[300px]">
                          <span className="text-sm text-muted-foreground line-clamp-2">
                            {role.description || "—"}
                          </span>
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline">
                            {role.permissions?.length || 0} permissions
                          </Badge>
                        </TableCell>
                        <TableCell>
                          {role.isDefault ? (
                            <Badge variant="secondary" className="gap-1">
                              <Lock className="h-3 w-3" />
                              System
                            </Badge>
                          ) : (
                            <Badge variant="outline" className="gap-1">
                              <Check className="h-3 w-3" />
                              Custom
                            </Badge>
                          )}
                        </TableCell>
                        <TableCell className="text-right">
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button variant="ghost" size="icon">
                                <MoreHorizontal className="h-4 w-4" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end" className="w-48">
                              <DropdownMenuLabel>Actions</DropdownMenuLabel>
                              <DropdownMenuSeparator />
                              <DropdownMenuItem onClick={() => openViewDialog(role)}>
                                <Eye className="mr-2 h-4 w-4" />
                                View Permissions
                              </DropdownMenuItem>
                              {!role.isDefault && isAdmin && (
                                <>
                                  <DropdownMenuItem onClick={() => openEditDialog(role)}>
                                    <Edit className="mr-2 h-4 w-4" />
                                    Edit Role
                                  </DropdownMenuItem>
                                  {isSuperAdmin && (
                                    <>
                                      <DropdownMenuSeparator />
                                      <DropdownMenuItem
                                        onClick={() => openDeleteDialog(role)}
                                        className="text-red-600"
                                      >
                                        <Trash2 className="mr-2 h-4 w-4" />
                                        Delete Role
                                      </DropdownMenuItem>
                                    </>
                                  )}
                                </>
                              )}
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
                {filteredRoles.length > 0 && (
                  <div className="flex items-center justify-between border-t pt-4 mt-4 px-4 pb-4">
                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                      <span>
                        Showing {(currentPage - 1) * pageSize + 1}–{Math.min(currentPage * pageSize, filteredRoles.length)} of {filteredRoles.length}
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

        {/* View Role Dialog */}
        <Dialog open={viewRoleDialogOpen} onOpenChange={setViewRoleDialogOpen}>
          <DialogContent className="sm:max-w-[600px] max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>
                <div className="flex items-center gap-2">
                  <Shield className="h-5 w-5" />
                  {selectedRole && formatRoleName(selectedRole.name)}
                </div>
              </DialogTitle>
              <DialogDescription>
                {selectedRole?.description || "No description provided"}
              </DialogDescription>
            </DialogHeader>
            {selectedRole && (
              <div className="py-4">
                <h4 className="text-sm font-medium mb-3">Assigned Permissions</h4>
                <div className="grid gap-3">
                  {Object.entries(PERMISSION_CATEGORIES).map(([key, category]) => {
                    const hasPermissions = category.permissions.some((p) =>
                      selectedRole.permissions?.includes(p.key)
                    )
                    if (!hasPermissions) return null

                    return (
                      <Card key={key} className="p-3">
                        <h5 className="font-medium text-sm mb-2">{category.label}</h5>
                        <div className="flex flex-wrap gap-1">
                          {category.permissions
                            .filter((p) => selectedRole.permissions?.includes(p.key))
                            .map((p) => (
                              <Badge key={p.key} variant="secondary" className="text-xs">
                                {p.label}
                              </Badge>
                            ))}
                        </div>
                      </Card>
                    )
                  })}
                  {(!selectedRole.permissions || selectedRole.permissions.length === 0) && (
                    <p className="text-sm text-muted-foreground">
                      No permissions assigned to this role.
                    </p>
                  )}
                </div>
              </div>
            )}
            <DialogFooter>
              <Button variant="outline" onClick={() => setViewRoleDialogOpen(false)}>
                Close
              </Button>
              {selectedRole && !selectedRole.isDefault && isAdmin && (
                <Button
                  onClick={() => {
                    setViewRoleDialogOpen(false)
                    openEditDialog(selectedRole)
                  }}
                >
                  Edit Role
                </Button>
              )}
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Edit Role Dialog */}
        <Dialog open={editRoleDialogOpen} onOpenChange={setEditRoleDialogOpen}>
          <DialogContent className="sm:max-w-[600px] max-h-[90vh] overflow-y-auto">
            <form onSubmit={handleUpdateRole}>
              <DialogHeader>
                <DialogTitle>Edit Role</DialogTitle>
                <DialogDescription>
                  Update the role's permissions and description.
                </DialogDescription>
              </DialogHeader>
              <div className="grid gap-4 py-4">
                <div className="grid gap-2">
                  <label htmlFor="editName" className="text-sm font-medium">
                    Role Name
                  </label>
                  <Input
                    id="editName"
                    value={formData.name}
                    onChange={(e) =>
                      setFormData((prev) => ({
                        ...prev,
                        name: e.target.value.toLowerCase().replace(/\s+/g, "_"),
                      }))
                    }
                  />
                </div>
                <div className="grid gap-2">
                  <label htmlFor="editDescription" className="text-sm font-medium">
                    Description
                  </label>
                  <Textarea
                    id="editDescription"
                    value={formData.description}
                    onChange={(e) =>
                      setFormData((prev) => ({ ...prev, description: e.target.value }))
                    }
                  />
                </div>
                <div className="grid gap-2">
                  <label className="text-sm font-medium">Permissions</label>
                  <Accordion type="multiple" className="w-full">
                    {Object.entries(PERMISSION_CATEGORIES).map(([key, category]) => {
                      const categoryPermissions = category.permissions.map((p) => p.key)
                      const selectedCount = categoryPermissions.filter((p) =>
                        formData.permissions.includes(p)
                      ).length
                      const allSelected = selectedCount === categoryPermissions.length

                      return (
                        <AccordionItem key={key} value={key}>
                          <AccordionTrigger className="hover:no-underline">
                            <div className="flex items-center gap-3">
                              <Checkbox
                                checked={allSelected}
                                onCheckedChange={() => toggleCategoryPermissions(key)}
                                onClick={(e) => e.stopPropagation()}
                              />
                              <span>{category.label}</span>
                              <Badge variant="secondary" className="ml-auto mr-2">
                                {selectedCount}/{categoryPermissions.length}
                              </Badge>
                            </div>
                          </AccordionTrigger>
                          <AccordionContent>
                            <div className="grid gap-2 pl-7">
                              {category.permissions.map((permission) => (
                                <div key={permission.key} className="flex items-center gap-2">
                                  <Checkbox
                                    id={`edit-${permission.key}`}
                                    checked={formData.permissions.includes(permission.key)}
                                    onCheckedChange={() => togglePermission(permission.key)}
                                  />
                                  <label
                                    htmlFor={`edit-${permission.key}`}
                                    className="text-sm cursor-pointer"
                                  >
                                    {permission.label}
                                  </label>
                                </div>
                              ))}
                            </div>
                          </AccordionContent>
                        </AccordionItem>
                      )
                    })}
                  </Accordion>
                </div>
              </div>
              <DialogFooter>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => {
                    setEditRoleDialogOpen(false)
                    resetForm()
                  }}
                >
                  Cancel
                </Button>
                <Button type="submit" disabled={isSubmitting}>
                  {isSubmitting && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                  Save Changes
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>

        {/* Delete Role Dialog */}
        <Dialog open={deleteRoleDialogOpen} onOpenChange={setDeleteRoleDialogOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Delete Role</DialogTitle>
              <DialogDescription>
                Are you sure you want to delete the role{" "}
                <span className="font-semibold">
                  {selectedRole && formatRoleName(selectedRole.name)}
                </span>
                ? This action cannot be undone.
              </DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <Button variant="outline" onClick={() => setDeleteRoleDialogOpen(false)}>
                Cancel
              </Button>
              <Button
                variant="destructive"
                onClick={handleDeleteRole}
                disabled={isSubmitting}
              >
                {isSubmitting && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                Delete
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </PermissionGate>
  )
}

