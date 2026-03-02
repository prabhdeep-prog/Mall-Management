"use client"

/**
 * Secondary Sidebar — 240px contextual navigation panel
 * ───────────────────────────────────────────────────────
 * Expands/collapses next to the primary rail.
 * Contents are scoped to the active workspace and filtered by user role.
 * Remembers its open/closed state in localStorage.
 */

import * as React from "react"
import Link from "next/link"
import { usePathname } from "next/navigation"
import { useSession } from "next-auth/react"
import { cn } from "@/lib/utils"
import { ScrollArea } from "@/components/ui/scroll-area"
import { ChevronLeft, Plus } from "lucide-react"
import { useWorkspace } from "./workspace-context"
import {
  WORKSPACES,
  getVisibleSections,
  type WorkspaceConfig,
} from "./workspace-config"

// ── Nav item ──────────────────────────────────────────────────────────────────

function NavItem({
  href,
  icon: Icon,
  title,
  isActive,
  shortcutHint,
}: {
  href: string
  icon: React.ComponentType<{ className?: string }>
  title: string
  isActive: boolean
  shortcutHint?: string
}) {
  return (
    <Link
      href={href}
      className={cn(
        "group flex items-center gap-2.5 rounded-md px-2.5 py-1.5 text-sm transition-colors",
        isActive
          ? "bg-primary/10 text-primary font-medium"
          : "text-muted-foreground hover:bg-accent hover:text-foreground",
      )}
    >
      <Icon
        className={cn(
          "h-4 w-4 flex-shrink-0 transition-colors",
          isActive ? "text-primary" : "text-muted-foreground group-hover:text-foreground",
        )}
      />
      <span className="flex-1 truncate">{title}</span>
      {shortcutHint && (
        <kbd className="hidden text-[10px] text-muted-foreground group-hover:inline">
          {shortcutHint}
        </kbd>
      )}
    </Link>
  )
}

// ── Section ───────────────────────────────────────────────────────────────────

function NavSectionBlock({
  title,
  items,
  currentPath,
}: {
  title: string
  items: { href: string; icon: React.ComponentType<{ className?: string }>; title: string; shortcutHint?: string }[]
  currentPath: string
}) {
  return (
    <div>
      <p className="mb-1 px-2.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
        {title}
      </p>
      <div className="space-y-0.5">
        {items.map((item) => (
          <NavItem
            key={item.href}
            href={item.href}
            icon={item.icon}
            title={item.title}
            isActive={currentPath === item.href || currentPath.startsWith(item.href + "?")}
            shortcutHint={item.shortcutHint}
          />
        ))}
      </div>
    </div>
  )
}

// ── Secondary Sidebar ─────────────────────────────────────────────────────────

export function SecondarySidebar() {
  const pathname                              = usePathname()
  const { data: session }                     = useSession()
  const { activeWorkspace, isSidebarOpen, setSidebarOpen } = useWorkspace()

  const userRole  = session?.user?.role
  const workspace = WORKSPACES.find((ws) => ws.id === activeWorkspace) as WorkspaceConfig | undefined
  const sections  = workspace ? getVisibleSections(workspace, userRole) : []

  return (
    <aside
      className={cn(
        "relative z-10 flex flex-shrink-0 flex-col border-r bg-background transition-all duration-200 ease-in-out overflow-hidden",
        isSidebarOpen ? "w-60" : "w-0",
      )}
    >
      {/* Prevent content flash during collapse */}
      <div className="flex h-full w-60 flex-col">

        {/* Header row */}
        <div className="flex h-14 items-center justify-between border-b px-3 flex-shrink-0">
          <span className="text-sm font-semibold truncate">
            {workspace?.label ?? "Navigation"}
          </span>
          <button
            onClick={() => setSidebarOpen(false)}
            className="flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground transition-colors"
            aria-label="Collapse sidebar"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
        </div>

        {/* Navigation */}
        <ScrollArea className="flex-1 px-2 py-3">
          <nav className="flex flex-col gap-4">
            {sections.map((section) => (
              <NavSectionBlock
                key={section.title}
                title={section.title}
                items={section.items}
                currentPath={pathname}
              />
            ))}
          </nav>
        </ScrollArea>

        {/* Quick action pinned to bottom */}
        {workspace?.quickAction && (
          <div className="border-t p-2 flex-shrink-0">
            <Link
              href={workspace.quickAction.href}
              className={cn(
                "flex items-center gap-2 rounded-md px-2.5 py-2 text-sm font-medium",
                "text-muted-foreground hover:bg-primary/10 hover:text-primary transition-colors",
              )}
            >
              <Plus className="h-4 w-4 flex-shrink-0" />
              <span className="flex-1 truncate">{workspace.quickAction.label}</span>
              {workspace.quickAction.shortcut && (
                <kbd className="hidden text-[10px] text-muted-foreground group-hover:inline">
                  {workspace.quickAction.shortcut}
                </kbd>
              )}
            </Link>
          </div>
        )}
      </div>
    </aside>
  )
}
