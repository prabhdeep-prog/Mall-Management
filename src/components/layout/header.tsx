"use client"

import * as React from "react"
import { useRouter } from "next/navigation"
import { Bell, Search, ChevronDown, LogOut, User, Settings, Plus, Building2, Loader2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Badge } from "@/components/ui/badge"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { ThemeToggle } from "@/components/ui/theme-toggle"
import { usePropertyStore } from "@/features/properties/stores/property-store"
import { usePendingApprovals } from "@/features/agents/hooks/use-pending-approvals"
import { signOut, useSession } from "next-auth/react"

export function Header() {
  const router = useRouter()
  const { data: session } = useSession()
  const {
    properties,
    selectedProperty,
    isLoading,
    setSelectedProperty,
    fetchProperties
  } = usePropertyStore()

  const { pendingApprovals, isLoadingApprovals } = usePendingApprovals()

  React.useEffect(() => {
    fetchProperties()
  }, [fetchProperties])

  const handleAddProperty = () => {
    router.push("/properties?action=add")
  }

  const handleLogout = async () => {
    await signOut({ callbackUrl: "/auth/login" })
  }

  const userInitials = session?.user?.name
    ? session.user.name.split(" ").map(n => n[0]).join("").toUpperCase().slice(0, 2)
    : "U"

  return (
    <header className="flex h-16 items-center justify-between border-b bg-background px-6">
      {/* Left Side - Property Selector */}
      <div className="flex items-center gap-4">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" className="gap-2 min-w-[200px] justify-between">
              {isLoading ? (
                <div className="flex items-center gap-2">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  <span>Loading...</span>
                </div>
              ) : selectedProperty ? (
                <div className="flex items-center gap-2">
                  <div className="h-2 w-2 rounded-full bg-green-500" />
                  <span className="font-medium truncate max-w-[120px]">{selectedProperty.name}</span>
                  <span className="text-muted-foreground">({selectedProperty.city})</span>
                </div>
              ) : (
                <div className="flex items-center gap-2">
                  <Building2 className="h-4 w-4 text-muted-foreground" />
                  <span className="text-muted-foreground">Select Property</span>
                </div>
              )}
              <ChevronDown className="h-4 w-4 text-muted-foreground shrink-0" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="w-64">
            <DropdownMenuLabel>Select Property</DropdownMenuLabel>
            <DropdownMenuSeparator />
            {properties.length === 0 && !isLoading ? (
              <div className="px-2 py-4 text-center text-sm text-muted-foreground">
                No properties found
              </div>
            ) : (
              properties.map((property) => (
                <DropdownMenuItem
                  key={property.id}
                  onClick={() => setSelectedProperty(property)}
                  className="cursor-pointer"
                >
                  <div className="flex items-center gap-2 w-full">
                    <div
                      className={`h-2 w-2 rounded-full shrink-0 ${
                        property.id === selectedProperty?.id ? "bg-green-500" : "bg-muted-foreground/30"
                      }`}
                    />
                    <div className="flex-1 min-w-0">
                      <div className="font-medium truncate">{property.name}</div>
                      <div className="text-xs text-muted-foreground">{property.city} • {property.type}</div>
                    </div>
                  </div>
                </DropdownMenuItem>
              ))
            )}
            <DropdownMenuSeparator />
            <DropdownMenuItem
              className="cursor-pointer text-primary"
              onClick={handleAddProperty}
            >
              <Plus className="h-4 w-4 mr-2" />
              Add Property
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>

        {/* Search */}
        <div className="relative hidden md:block">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search tenants, invoices, work orders..."
            className="w-80 pl-9"
          />
        </div>
      </div>

      {/* Right Side - Theme Toggle, Notifications & Profile */}
      <div className="flex items-center gap-2">
        {/* Pending Approvals Badge */}
        {!isLoadingApprovals && pendingApprovals > 0 && (
          <Button variant="outline" size="sm" className="gap-2" asChild>
            <a href="/approvals">
              <Badge variant="warning" className="h-5 w-5 rounded-full p-0 text-xs">
                {pendingApprovals}
              </Badge>
              <span className="hidden sm:inline">Pending Approvals ({pendingApprovals})</span>
            </a>
          </Button>
        )}

        {/* Theme Toggle */}
        <ThemeToggle />

        {/* Notifications */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" className="relative">
              <Bell className="h-5 w-5" />
              <span className="absolute right-1 top-1 h-2 w-2 rounded-full bg-red-500" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-80">
            <DropdownMenuLabel>Notifications</DropdownMenuLabel>
            <DropdownMenuSeparator />
            <div className="max-h-80 overflow-y-auto">
              <DropdownMenuItem className="flex flex-col items-start gap-1 cursor-pointer">
                <div className="flex items-center gap-2">
                  <Badge variant="info" className="h-5 text-[10px]">Agent</Badge>
                  <span className="text-sm font-medium">Tenant Relations</span>
                </div>
                <p className="text-xs text-muted-foreground">
                  Created work order for HVAC repair in Unit 203
                </p>
                <span className="text-[10px] text-muted-foreground">2 min ago</span>
              </DropdownMenuItem>
              <DropdownMenuItem className="flex flex-col items-start gap-1 cursor-pointer">
                <div className="flex items-center gap-2">
                  <Badge variant="warning" className="h-5 text-[10px]">Alert</Badge>
                  <span className="text-sm font-medium">Payment Overdue</span>
                </div>
                <p className="text-xs text-muted-foreground">
                  Fashion Store Ltd has 3 pending invoices
                </p>
                <span className="text-[10px] text-muted-foreground">15 min ago</span>
              </DropdownMenuItem>
              <DropdownMenuItem className="flex flex-col items-start gap-1 cursor-pointer">
                <div className="flex items-center gap-2">
                  <Badge variant="success" className="h-5 text-[10px]">Success</Badge>
                  <span className="text-sm font-medium">Maintenance Complete</span>
                </div>
                <p className="text-xs text-muted-foreground">
                  Elevator #2 maintenance completed successfully
                </p>
                <span className="text-[10px] text-muted-foreground">1 hour ago</span>
              </DropdownMenuItem>
            </div>
            <DropdownMenuSeparator />
            <DropdownMenuItem className="cursor-pointer text-center text-primary">
              View all notifications
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>

        {/* User Profile */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" className="gap-2 px-2">
              <Avatar className="h-8 w-8">
                <AvatarImage src="/placeholder-avatar.jpg" />
                <AvatarFallback className="bg-primary text-primary-foreground text-xs">
                  {userInitials}
                </AvatarFallback>
              </Avatar>
              <div className="hidden flex-col items-start md:flex">
                <span className="text-sm font-medium">{session?.user?.name || "User"}</span>
                <span className="text-[10px] text-muted-foreground capitalize">
                  {session?.user?.role?.replace("_", " ") || "Mall Manager"}
                </span>
              </div>
              <ChevronDown className="h-4 w-4 text-muted-foreground" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-56">
            <DropdownMenuLabel>My Account</DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem className="cursor-pointer">
              <User className="mr-2 h-4 w-4" />
              Profile
            </DropdownMenuItem>
            <DropdownMenuItem className="cursor-pointer">
              <Settings className="mr-2 h-4 w-4" />
              Settings
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem className="cursor-pointer text-red-600" onClick={handleLogout}>
              <LogOut className="mr-2 h-4 w-4" />
              Log out
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  )
}
