"use client"

import * as React from "react"
import { useRouter } from "next/navigation"
import {
  Bell, ChevronDown, LogOut, User, Settings, Plus, Building2,
  Loader2, Search,
} from "lucide-react"
import { ThemeToggle } from "@/components/ui/theme-toggle"
import { Button } from "@/components/ui/button"
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
import { usePropertyStore } from "@/stores/property-store"
import { signOut, useSession } from "next-auth/react"
import { useWorkspace } from "@/components/nav/workspace-context"
import { cn } from "@/lib/utils"

export function Header() {
  const router            = useRouter()
  const { data: session } = useSession()
  const { openPalette }   = useWorkspace()

  const {
    properties,
    selectedProperty,
    isLoading,
    setSelectedProperty,
    fetchProperties,
  } = usePropertyStore()

  const [pendingApprovals, setPendingApprovals] = React.useState(0)

  interface AdminNotification {
    id: string
    type: string | null
    title: string | null
    content: string | null
    readAt: string | null
    createdAt: string
  }
  const [adminNotifs, setAdminNotifs] = React.useState<AdminNotification[]>([])
  const [adminUnread, setAdminUnread] = React.useState(0)

  // Fetch properties only if stale (staleness managed inside the store)
  React.useEffect(() => { fetchProperties() }, [fetchProperties])

  // Defer non-critical fetches so they don't block initial render
  React.useEffect(() => {
    const timer = setTimeout(async () => {
      try {
        const res = await fetch("/api/agents/actions?status=pending")
        if (res.ok) {
          const data = await res.json()
          setPendingApprovals(data.data?.length ?? 0)
        }
      } catch {}
    }, 2000)
    return () => clearTimeout(timer)
  }, [])

  React.useEffect(() => {
    const fetchNotifications = async () => {
      try {
        const res = await fetch("/api/notifications?recipientType=user&limit=10")
        if (res.ok) {
          const data = await res.json()
          const items = data.data ?? []
          setAdminNotifs(items)
          setAdminUnread(items.filter((n: AdminNotification) => !n.readAt).length)
        }
      } catch {}
    }
    // Delay initial notification fetch to prioritize page content
    const initialTimer = setTimeout(fetchNotifications, 3000)
    const interval = setInterval(fetchNotifications, 30000)
    return () => { clearTimeout(initialTimer); clearInterval(interval) }
  }, [])

  const userInitials = session?.user?.name
    ? session.user.name.split(" ").map((n: string) => n[0]).join("").toUpperCase().slice(0, 2)
    : "U"

  const handleLogout = () => signOut({ callbackUrl: "/auth/login" })

  return (
    <header className="flex h-14 flex-shrink-0 items-center justify-between border-b bg-background px-4 gap-3">

      {/* Left: property selector */}
      <div className="flex items-center gap-3 min-w-0">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" size="sm" className="gap-2 max-w-[220px] justify-between">
              {isLoading ? (
                <span className="flex items-center gap-2">
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  <span>Loading…</span>
                </span>
              ) : selectedProperty ? (
                <span className="flex items-center gap-2 min-w-0">
                  <span className="h-2 w-2 rounded-full bg-green-500 flex-shrink-0" />
                  <span className="truncate font-medium">{selectedProperty.name}</span>
                </span>
              ) : (
                <span className="flex items-center gap-2 text-muted-foreground">
                  <Building2 className="h-3.5 w-3.5" />
                  <span>Select property</span>
                </span>
              )}
              <ChevronDown className="h-3.5 w-3.5 text-muted-foreground flex-shrink-0" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="w-64">
            <DropdownMenuLabel>Select Property</DropdownMenuLabel>
            <DropdownMenuSeparator />
            {properties.length === 0 && !isLoading ? (
              <p className="px-2 py-4 text-center text-sm text-muted-foreground">No properties found</p>
            ) : (
              properties.map((property) => (
                <DropdownMenuItem
                  key={property.id}
                  onClick={() => setSelectedProperty(property)}
                  className="cursor-pointer"
                >
                  <div className="flex items-center gap-2 w-full min-w-0">
                    <span
                      className={cn(
                        "h-2 w-2 rounded-full flex-shrink-0",
                        property.id === selectedProperty?.id ? "bg-green-500" : "bg-muted-foreground/30",
                      )}
                    />
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-medium">{property.name}</p>
                      <p className="text-xs text-muted-foreground">{property.city} · {property.type}</p>
                    </div>
                  </div>
                </DropdownMenuItem>
              ))
            )}
            <DropdownMenuSeparator />
            <DropdownMenuItem
              className="cursor-pointer text-primary"
              onClick={() => router.push("/properties?action=add")}
            >
              <Plus className="h-4 w-4 mr-2" />
              Add Property
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>

        {/* ⌘K trigger — replaces the old search Input */}
        <button
          onClick={() => openPalette()}
          className={cn(
            "hidden md:flex items-center gap-2 rounded-md border bg-muted/40 px-3 py-1.5",
            "text-sm text-muted-foreground transition-colors hover:bg-muted",
            "min-w-[200px] max-w-[300px]",
          )}
          aria-label="Open command palette"
        >
          <Search className="h-3.5 w-3.5 flex-shrink-0" />
          <span className="flex-1 text-left">Search…</span>
          <kbd className="hidden rounded border bg-background px-1.5 font-mono text-[10px] text-muted-foreground sm:inline">
            ⌘K
          </kbd>
        </button>
      </div>

      {/* Right: approvals badge + notifications + profile */}
      <div className="flex items-center gap-2">

        {/* Pending approvals */}
        {pendingApprovals > 0 && (
          <Button variant="outline" size="sm" className="gap-2" asChild>
            <a href="/approvals">
              <Badge variant="warning" className="h-5 w-5 rounded-full p-0 text-xs">
                {pendingApprovals}
              </Badge>
              <span className="hidden sm:inline">Pending</span>
            </a>
          </Button>
        )}

        {/* Theme toggle */}
        <ThemeToggle />

        {/* Notifications */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" className="relative h-8 w-8">
              <Bell className="h-4 w-4" />
              {adminUnread > 0 && (
                <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-destructive px-1 text-[10px] font-bold text-destructive-foreground">
                  {adminUnread > 9 ? "9+" : adminUnread}
                </span>
              )}
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-80">
            <DropdownMenuLabel>Notifications</DropdownMenuLabel>
            <DropdownMenuSeparator />
            <div className="max-h-72 overflow-y-auto divide-y">
              {adminNotifs.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-6 text-muted-foreground">
                  <Bell className="h-5 w-5 mb-1.5 opacity-40" />
                  <p className="text-xs">No notifications</p>
                </div>
              ) : (
                adminNotifs.map((n) => {
                  const badgeMap: Record<string, string> = {
                    support_request: "warning",
                    payment_reminder: "warning",
                    announcement: "info",
                    maintenance_update: "success",
                    invoice_created: "info",
                    work_order_update: "success",
                  }
                  const navMap: Record<string, string> = {
                    support_request: "/work-orders",
                    maintenance_update: "/work-orders",
                    invoice_created: "/financials",
                  }
                  return (
                    <DropdownMenuItem
                      key={n.id}
                      className={cn(
                        "flex flex-col items-start gap-1 cursor-pointer py-3",
                        !n.readAt && "bg-muted/40",
                      )}
                      onClick={() => {
                        if (!n.readAt) {
                          fetch(`/api/notifications/${n.id}/read`, { method: "PATCH" }).catch(() => {})
                          setAdminNotifs((prev) =>
                            prev.map((x) =>
                              x.id === n.id ? { ...x, readAt: new Date().toISOString() } : x,
                            ),
                          )
                          setAdminUnread((prev) => Math.max(0, prev - 1))
                        }
                        const dest = navMap[n.type ?? ""]
                        if (dest) router.push(dest)
                      }}
                    >
                      <div className="flex items-center gap-2 w-full">
                        <Badge variant={(badgeMap[n.type ?? ""] ?? "outline") as "warning" | "info" | "success" | "outline"} className="h-5 text-[10px] capitalize shrink-0">
                          {(n.type ?? "notice").replace(/_/g, " ")}
                        </Badge>
                        <span className={cn("text-sm truncate", !n.readAt && "font-medium")}>{n.title}</span>
                      </div>
                      <p className="text-xs text-muted-foreground line-clamp-2">{n.content}</p>
                      <span className="text-[10px] text-muted-foreground">
                        {new Date(n.createdAt).toLocaleString()}
                      </span>
                    </DropdownMenuItem>
                  )
                })
              )}
            </div>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              className="cursor-pointer justify-center text-primary text-sm"
              onClick={() => router.push("/admin/notifications")}
            >
              View all notifications
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>

        {/* User profile */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="sm" className="gap-2 px-2 h-8">
              <Avatar className="h-7 w-7">
                <AvatarImage src="/placeholder-avatar.jpg" />
                <AvatarFallback className="bg-primary text-primary-foreground text-[10px] font-bold">
                  {userInitials}
                </AvatarFallback>
              </Avatar>
              <div className="hidden flex-col items-start md:flex">
                <span className="text-xs font-medium leading-none">{session?.user?.name ?? "User"}</span>
                <span className="text-[10px] text-muted-foreground capitalize leading-none mt-0.5">
                  {session?.user?.role?.replace(/_/g, " ") ?? "Member"}
                </span>
              </div>
              <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-56">
            <DropdownMenuLabel className="font-normal">
              <p className="font-medium">{session?.user?.name ?? "User"}</p>
              <p className="text-xs text-muted-foreground">{session?.user?.email}</p>
            </DropdownMenuLabel>
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
            <DropdownMenuItem
              className="cursor-pointer text-destructive focus:text-destructive"
              onClick={handleLogout}
            >
              <LogOut className="mr-2 h-4 w-4" />
              Log out
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  )
}
