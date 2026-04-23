/**
 * Workspace Navigation Configuration
 * ─────────────────────────────────────
 * Single source of truth for all sidebar navigation.
 * Role filtering is done here, not in the component layer.
 *
 * Design principle: Hidden, not disabled.
 * Users only see items they can access — nothing is greyed out.
 */

import type { LucideIcon } from "lucide-react"
import {
  Building2,
  IndianRupee,
  Bot,
  Settings,
  ShieldCheck,
  LayoutDashboard,
  Users,
  FileSignature,
  CreditCard,
  Wrench,
  Truck,
  Cpu,
  BarChart3,
  BarChart2,
  CheckCircle,
  Scale,
  Shield,
  UserCog,
  FileText,
  Receipt,
} from "lucide-react"

// ── Role & workspace types ────────────────────────────────────────────────────

export type WorkspaceId = "operations" | "finance" | "ai" | "settings" | "admin"

export type UserRole =
  | "super_admin"
  | "organization_admin"
  | "property_manager"
  | "finance_manager"
  | "maintenance_manager"
  | "leasing_manager"
  | "tenant"
  | "viewer"

/** "*" means any authenticated role can see this item */
export type RoleFilter = UserRole[] | ["*"]

// ── Navigation item types ─────────────────────────────────────────────────────

export interface NavItem {
  title: string
  href: string
  icon: LucideIcon
  roles: RoleFilter
  /** Keyboard shortcut hint shown on hover in the secondary sidebar */
  shortcutHint?: string
}

export interface NavSection {
  title: string
  /** Section is hidden if no items pass the role check */
  items: NavItem[]
}

export interface WorkspaceQuickAction {
  label: string
  href: string
  shortcut?: string
}

export interface WorkspaceConfig {
  id: WorkspaceId
  label: string
  icon: LucideIcon
  /** Single letter used with G-chord shortcut, e.g. G+O = Operations */
  shortcutKey: string
  /** Tailwind text-color class for the active accent */
  accentClass: string
  /** Which roles can see this workspace at all */
  roles: RoleFilter
  sections: NavSection[]
  /** Contextual create action pinned to the bottom of the secondary sidebar */
  quickAction?: WorkspaceQuickAction
}

// ── Role helper ───────────────────────────────────────────────────────────────

export function canAccess(userRole: string | undefined, roles: RoleFilter): boolean {
  if (!userRole) return false
  if (roles[0] === "*") return true
  return (roles as UserRole[]).includes(userRole as UserRole)
}

/** Filter a workspace's sections down to only items the role can see.
 *  Sections with 0 visible items are omitted entirely. */
export function getVisibleSections(
  workspace: WorkspaceConfig,
  userRole: string | undefined,
): NavSection[] {
  return workspace.sections
    .map((section) => ({
      ...section,
      items: section.items.filter((item) => canAccess(userRole, item.roles)),
    }))
    .filter((section) => section.items.length > 0)
}

/** Returns only workspaces the given role is permitted to see */
export function getVisibleWorkspaces(userRole: string | undefined): WorkspaceConfig[] {
  return WORKSPACES.filter((ws) => canAccess(userRole, ws.roles))
}

// ── Workspace → page mapping (for auto-detecting active workspace from URL) ───

export function workspaceFromPathname(pathname: string): WorkspaceId {
  if (pathname.startsWith("/admin"))                                         return "admin"
  if (
    pathname.startsWith("/settings") ||
    pathname.startsWith("/users") ||
    pathname.startsWith("/roles")
  )                                                                          return "settings"
  if (pathname.startsWith("/agents") || pathname.startsWith("/approvals"))   return "ai"
  if (
    pathname.startsWith("/financials") ||
    pathname.startsWith("/revenue-intelligence") ||
    pathname.startsWith("/analytics")
  )                                                                          return "finance"
  return "operations"
}

// ── Workspace definitions ─────────────────────────────────────────────────────

export const WORKSPACES: WorkspaceConfig[] = [

  // ── Operations ──────────────────────────────────────────────────────────────
  {
    id:           "operations",
    label:        "Operations",
    icon:         Building2,
    shortcutKey:  "o",
    accentClass:  "text-indigo-500",
    roles:        ["super_admin", "organization_admin", "property_manager",
                   "maintenance_manager", "leasing_manager", "viewer"],
    quickAction:  { label: "New Work Order", href: "/work-orders?action=create", shortcut: "⌘N" },
    sections: [
      {
        title: "Overview",
        items: [
          {
            title: "Command Center",
            href:  "/dashboard",
            icon:  LayoutDashboard,
            roles: ["super_admin", "organization_admin", "property_manager",
                    "maintenance_manager", "leasing_manager", "viewer"],
          },
        ],
      },
      {
        title: "Properties",
        items: [
          {
            title: "All Properties",
            href:  "/properties",
            icon:  Building2,
            roles: ["super_admin", "organization_admin", "property_manager", "viewer"],
          },
          {
            title: "Tenants",
            href:  "/tenants",
            icon:  Users,
            roles: ["super_admin", "organization_admin", "property_manager",
                    "leasing_manager", "viewer"],
          },
          {
            title: "Leases",
            href:  "/leases",
            icon:  FileSignature,
            roles: ["super_admin", "organization_admin", "property_manager",
                    "leasing_manager", "viewer"],
          },
          {
            title: "Compliance",
            href:  "/compliance",
            icon:  ShieldCheck,
            roles: ["super_admin", "organization_admin", "property_manager"],
          },
          {
            title: "Documents",
            href:  "/documents",
            icon:  FileText,
            roles: ["super_admin", "organization_admin", "property_manager",
                    "finance_manager", "leasing_manager"],
          },
        ],
      },
      {
        title: "Maintenance",
        items: [
          {
            title: "Work Orders",
            href:  "/work-orders",
            icon:  Wrench,
            roles: ["super_admin", "organization_admin", "property_manager",
                    "maintenance_manager"],
          },
          {
            title: "Vendors",
            href:  "/vendors",
            icon:  Truck,
            roles: ["super_admin", "organization_admin", "property_manager",
                    "maintenance_manager"],
          },
          {
            title: "Equipment",
            href:  "/equipment",
            icon:  Cpu,
            roles: ["super_admin", "organization_admin", "maintenance_manager"],
          },
        ],
      },
    ],
  },

  // ── Finance ──────────────────────────────────────────────────────────────────
  {
    id:           "finance",
    label:        "Finance",
    icon:         IndianRupee,
    shortcutKey:  "f",
    accentClass:  "text-emerald-500",
    roles:        ["super_admin", "organization_admin", "finance_manager",
                   "property_manager", "viewer"],
    quickAction:  { label: "New Invoice", href: "/financials?action=create", shortcut: "⌘N" },
    sections: [
      {
        title: "Overview",
        items: [
          {
            title: "Finance Dashboard",
            href:  "/financials",
            icon:  BarChart3,
            roles: ["super_admin", "organization_admin", "finance_manager",
                    "property_manager", "viewer"],
          },
        ],
      },
      {
        title: "Revenue",
        items: [
          {
            title: "Invoices",
            href:  "/financials?tab=invoices",
            icon:  Receipt,
            roles: ["super_admin", "organization_admin", "finance_manager",
                    "property_manager", "viewer"],
          },
          {
            title: "Payments",
            href:  "/financials?tab=payments",
            icon:  CreditCard,
            roles: ["super_admin", "organization_admin", "finance_manager"],
          },
          {
            title: "Revenue Intelligence",
            href:  "/revenue-intelligence",
            icon:  IndianRupee,
            roles: ["super_admin", "organization_admin", "finance_manager"],
          },
          {
            title: "Reconciliation",
            href:  "/revenue-intelligence/reconciliation",
            icon:  Scale,
            roles: ["super_admin", "organization_admin", "finance_manager"],
          },
        ],
      },
      {
        title: "Reports",
        items: [
          {
            title: "Analytics",
            href:  "/analytics",
            icon:  BarChart2,
            roles: ["super_admin", "organization_admin", "finance_manager",
                    "property_manager", "viewer"],
          },
        ],
      },
    ],
  },

  // ── AI Command ───────────────────────────────────────────────────────────────
  {
    id:           "ai",
    label:        "AI Command",
    icon:         Bot,
    shortcutKey:  "a",
    accentClass:  "text-violet-500",
    roles:        ["super_admin", "organization_admin", "property_manager",
                   "maintenance_manager"],
    sections: [
      {
        title: "Agents",
        items: [
          {
            title: "Agent Activity",
            href:  "/agents",
            icon:  Bot,
            roles: ["super_admin", "organization_admin", "property_manager",
                    "maintenance_manager"],
          },
          {
            title: "Approvals",
            href:  "/approvals",
            icon:  CheckCircle,
            roles: ["super_admin", "organization_admin"],
          },
        ],
      },
    ],
  },

  // ── Settings ─────────────────────────────────────────────────────────────────
  {
    id:           "settings",
    label:        "Settings",
    icon:         Settings,
    shortcutKey:  "s",
    accentClass:  "text-slate-500",
    roles:        ["super_admin", "organization_admin", "property_manager"],
    sections: [
      {
        title: "Organisation",
        items: [
          {
            title: "Organisation Profile",
            href:  "/settings",
            icon:  Building2,
            roles: ["super_admin", "organization_admin"],
          },
          {
            title: "Users",
            href:  "/users",
            icon:  UserCog,
            roles: ["super_admin", "organization_admin"],
          },
          {
            title: "Roles & Permissions",
            href:  "/roles",
            icon:  Shield,
            roles: ["super_admin", "organization_admin"],
          },
        ],
      },
    ],
  },

  // ── Admin ────────────────────────────────────────────────────────────────────
  {
    id:           "admin",
    label:        "Admin",
    icon:         ShieldCheck,
    shortcutKey:  "d",
    accentClass:  "text-amber-500",
    roles:        ["super_admin"],
    sections: [
      {
        title: "Platform",
        items: [
          {
            title: "Billing",
            href:  "/admin/billing",
            icon:  CreditCard,
            roles: ["super_admin"],
          },
          {
            title: "Audit Log",
            href:  "/admin/audit",
            icon:  FileText,
            roles: ["super_admin"],
          },
        ],
      },
    ],
  },
]
