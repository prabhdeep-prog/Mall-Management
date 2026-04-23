"use client"

import * as React from "react"
import Link from "next/link"
import { usePathname } from "next/navigation"
import { signOut, useSession } from "next-auth/react"
import { cn } from "@/lib/utils/index"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import {
  LayoutDashboard,
  FileText,
  CreditCard,
  BarChart2,
  Scroll,
  FolderOpen,
  Settings,
  Building2,
  LogOut,
  ChevronDown,
  MessageCircle,
  Bell,
  Wrench,
} from "lucide-react"
import { NotificationBell } from "./_components/notification-bell"

const NAV_ITEMS = [
  { href: "/tenant",              label: "Assistant",      icon: MessageCircle  },
  { href: "/tenant/dashboard",    label: "Overview",       icon: LayoutDashboard },
  { href: "/tenant/invoices",     label: "Invoices",       icon: FileText        },
  { href: "/tenant/payments",     label: "Payments",       icon: CreditCard      },
  { href: "/tenant/sales",        label: "Sales",          icon: BarChart2       },
  { href: "/tenant/lease",        label: "Lease",          icon: Scroll          },
  { href: "/tenant/documents",    label: "Documents",      icon: FolderOpen      },
  { href: "/tenant/support",      label: "Support",        icon: Wrench          },
  { href: "/tenant/notifications", label: "Notifications", icon: Bell            },
] as const

export default function TenantPortalLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const pathname         = usePathname()
  const { data: session } = useSession()

  const initials = session?.user?.name
    ? session.user.name.split(" ").map((n: string) => n[0]).join("").toUpperCase().slice(0, 2)
    : "T"

  // Login page gets a minimal layout — no sidebar or notification bar
  const isLoginPage = pathname === "/portal/login" || pathname === "/tenant/login"
  if (isLoginPage) {
    return <>{children}</>
  }

  return (
    <div className="flex h-screen overflow-hidden bg-background">

      {/* ── Sidebar ─────────────────────────────────────────────────────────── */}
      <aside className="flex w-56 flex-shrink-0 flex-col border-r bg-background">

        {/* Logo */}
        <div className="flex h-14 items-center gap-2.5 border-b px-4">
          <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-primary">
            <Building2 className="h-4 w-4 text-primary-foreground" />
          </div>
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold leading-none">Tenant Portal</p>
            <p className="truncate text-[10px] text-muted-foreground mt-0.5">
              {session?.user?.name ?? "My Store"}
            </p>
          </div>
        </div>

        {/* Nav links */}
        <nav className="flex-1 space-y-0.5 overflow-y-auto px-2 py-3">
          {NAV_ITEMS.map(({ href, label, icon: Icon }) => {
            const active =
              href === "/tenant"
                ? pathname === "/portal" || pathname === "/tenant"
                : pathname === href || pathname.startsWith(href + "/")
                  || pathname === href.replace("/tenant", "/portal")
                  || pathname.startsWith(href.replace("/tenant", "/portal") + "/")
            return (
              <Link
                key={href}
                href={href}
                className={cn(
                  "flex items-center gap-2.5 rounded-md px-3 py-2 text-sm transition-colors",
                  active
                    ? "bg-primary/10 text-primary font-medium"
                    : "text-muted-foreground hover:bg-accent hover:text-foreground",
                )}
              >
                <Icon className="h-4 w-4 flex-shrink-0" />
                {label}
              </Link>
            )
          })}
        </nav>

        {/* Bottom: settings + user */}
        <div className="border-t px-2 py-2 space-y-0.5">
          <Link
            href="/tenant/settings"
            className={cn(
              "flex items-center gap-2.5 rounded-md px-3 py-2 text-sm transition-colors",
              pathname === "/portal/settings" || pathname === "/tenant/settings"
                ? "bg-primary/10 text-primary font-medium"
                : "text-muted-foreground hover:bg-accent hover:text-foreground",
            )}
          >
            <Settings className="h-4 w-4 flex-shrink-0" />
            Settings
          </Link>

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button className="flex w-full items-center gap-2.5 rounded-md px-3 py-2 text-sm text-muted-foreground hover:bg-accent hover:text-foreground transition-colors">
                <Avatar className="h-6 w-6">
                  <AvatarFallback className="bg-primary text-primary-foreground text-[9px] font-semibold">
                    {initials}
                  </AvatarFallback>
                </Avatar>
                <span className="flex-1 truncate text-left text-xs font-medium text-foreground">
                  {session?.user?.name ?? "Tenant"}
                </span>
                <ChevronDown className="h-3.5 w-3.5 flex-shrink-0" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent side="top" align="start" className="w-52">
              <DropdownMenuLabel className="font-normal">
                <p className="text-sm font-medium">{session?.user?.name ?? "Tenant"}</p>
                <p className="text-xs text-muted-foreground">{session?.user?.email}</p>
              </DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                className="cursor-pointer text-destructive focus:text-destructive"
                onClick={() => signOut({ callbackUrl: "/tenant/login" })}
              >
                <LogOut className="mr-2 h-4 w-4" />
                Sign out
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </aside>

      {/* ── Main content ────────────────────────────────────────────────────── */}
      <div className="flex flex-1 flex-col overflow-hidden min-w-0">
        {/* Top bar */}
        <div className="flex h-12 items-center justify-end border-b px-4 gap-3 flex-shrink-0">
          <NotificationBell />
        </div>
        <main className="flex-1 overflow-y-auto p-6">
          {children}
        </main>
      </div>
    </div>
  )
}
