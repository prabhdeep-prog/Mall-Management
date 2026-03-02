"use client"

import * as React from "react"
import Link from "next/link"
import { usePathname } from "next/navigation"
import { cn } from "@/lib/utils"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Separator } from "@/components/ui/separator"
import {
  LayoutDashboard,
  Building2,
  Users,
  CreditCard,
  Wrench,
  Bot,
  CheckCircle,
  BarChart3,
  Settings,
  HelpCircle,
  ChevronLeft,
  ChevronRight,
  Shield,
  ShieldCheck,
  Truck,
  Cpu,
  UserCog,
  FileSignature,
  IndianRupee,
} from "lucide-react"
import { Button } from "@/components/ui/button"

const navigation = [
  {
    title: "Overview",
    items: [
      {
        title: "Command Center",
        href: "/dashboard",
        icon: LayoutDashboard,
        description: "AI-powered operations hub",
      },
    ],
  },
  {
    title: "Management",
    items: [
      {
        title: "Properties",
        href: "/properties",
        icon: Building2,
        description: "Mall & property management",
      },
      {
        title: "Tenants",
        href: "/tenants",
        icon: Users,
        description: "Tenant relationships",
      },
      {
        title: "Leases",
        href: "/leases",
        icon: FileSignature,
        description: "Lease agreements & renewals",
      },
      {
        title: "Financials",
        href: "/financials",
        icon: CreditCard,
        description: "Invoices, payments & accounting",
      },
      {
        title: "Maintenance",
        href: "/work-orders",
        icon: Wrench,
        description: "Work orders & equipment",
      },
      {
        title: "Vendors",
        href: "/vendors",
        icon: Truck,
        description: "Vendor management & performance",
      },
      {
        title: "Equipment",
        href: "/equipment",
        icon: Cpu,
        description: "Equipment tracking & health",
      },
      {
        title: "Compliance",
        href: "/compliance",
        icon: ShieldCheck,
        description: "Regulatory requirements & audits",
      },
    ],
  },
  {
    title: "AI Agents",
    items: [
      {
        title: "Agent Activity",
        href: "/agents",
        icon: Bot,
        description: "Monitor AI agent actions",
      },
      {
        title: "Approvals",
        href: "/approvals",
        icon: CheckCircle,
        description: "Review pending decisions",
      },
    ],
  },
  {
    title: "Insights",
    items: [
      {
        title: "Revenue Intelligence",
        href: "/revenue-intelligence",
        icon: IndianRupee,
        description: "POS data & revenue tracking",
      },
      {
        title: "Analytics",
        href: "/analytics",
        icon: BarChart3,
        description: "Reports & visualizations",
      },
    ],
  },
  {
    title: "Administration",
    items: [
      {
        title: "Users",
        href: "/users",
        icon: UserCog,
        description: "User accounts & access",
      },
      {
        title: "Roles & Permissions",
        href: "/roles",
        icon: Shield,
        description: "Role-based access control",
      },
    ],
  },
]

const bottomNavigation = [
  {
    title: "Settings",
    href: "/settings",
    icon: Settings,
  },
  {
    title: "Help & Support",
    href: "/help",
    icon: HelpCircle,
  },
]

export function Sidebar() {
  const pathname = usePathname()
  const [collapsed, setCollapsed] = React.useState(false)

  return (
    <aside
      className={cn(
        "relative flex flex-col border-r bg-white dark:bg-gray-950 transition-all duration-300",
        collapsed ? "w-16" : "w-64"
      )}
    >
      {/* Logo */}
      <div className="flex h-16 items-center justify-between border-b px-4">
        {!collapsed && (
          <Link href="/dashboard" className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary">
              <Building2 className="h-5 w-5 text-white" />
            </div>
            <div className="flex flex-col">
              <span className="text-sm font-bold">MallOS</span>
              <span className="text-[10px] text-muted-foreground">AI Platform</span>
            </div>
          </Link>
        )}
        {collapsed && (
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary mx-auto">
            <Building2 className="h-5 w-5 text-white" />
          </div>
        )}
      </div>

      {/* Navigation */}
      <ScrollArea className="flex-1 px-3 py-4">
        <nav className="flex flex-col gap-6">
          {navigation.map((section) => (
            <div key={section.title}>
              {!collapsed && (
                <h4 className="mb-2 px-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  {section.title}
                </h4>
              )}
              <div className="space-y-1">
                {section.items.map((item) => {
                  const isActive = pathname === item.href
                  return (
                    <Link
                      key={item.href}
                      href={item.href}
                      className={cn(
                        "flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors",
                        isActive
                          ? "bg-primary/10 text-primary font-medium"
                          : "text-muted-foreground hover:bg-muted hover:text-foreground",
                        collapsed && "justify-center px-0"
                      )}
                      title={collapsed ? item.title : undefined}
                    >
                      <item.icon className={cn("h-5 w-5 flex-shrink-0", isActive && "text-primary")} />
                      {!collapsed && <span>{item.title}</span>}
                    </Link>
                  )
                })}
              </div>
            </div>
          ))}
        </nav>
      </ScrollArea>

      {/* Bottom Navigation */}
      <div className="border-t px-3 py-4">
        <div className="space-y-1">
          {bottomNavigation.map((item) => {
            const isActive = pathname === item.href
            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  "flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors",
                  isActive
                    ? "bg-primary/10 text-primary font-medium"
                    : "text-muted-foreground hover:bg-muted hover:text-foreground",
                  collapsed && "justify-center px-0"
                )}
                title={collapsed ? item.title : undefined}
              >
                <item.icon className="h-5 w-5 flex-shrink-0" />
                {!collapsed && <span>{item.title}</span>}
              </Link>
            )
          })}
        </div>
      </div>

      {/* Collapse Toggle */}
      <Button
        variant="ghost"
        size="icon"
        className="absolute -right-3 top-20 h-6 w-6 rounded-full border bg-white shadow-sm hover:bg-gray-50"
        onClick={() => setCollapsed(!collapsed)}
      >
        {collapsed ? (
          <ChevronRight className="h-3 w-3" />
        ) : (
          <ChevronLeft className="h-3 w-3" />
        )}
      </Button>
    </aside>
  )
}

