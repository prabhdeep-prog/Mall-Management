"use client"

/**
 * Primary Icon Rail — 56px persistent left sidebar
 * ──────────────────────────────────────────────────
 * Renders one icon button per workspace the user can access.
 * Clicking selects the workspace and opens the secondary sidebar.
 * Clicking the already-active workspace toggles the secondary sidebar.
 *
 * Keyboard: G+O / G+F / G+A / G+S / G+D (Vim-style go-to)
 */

import * as React from "react"
import Link from "next/link"
import { useSession, signOut } from "next-auth/react"
import { cn } from "@/lib/utils"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { LogOut, User, Settings, HelpCircle, Building2 } from "lucide-react"
import { useWorkspace } from "./workspace-context"
import { getVisibleWorkspaces, type WorkspaceId, type WorkspaceConfig } from "./workspace-config"

// ── Tooltip wrapper (no external lib — pure CSS) ──────────────────────────────

function RailTooltip({
  label,
  shortcut,
  children,
}: {
  label: string
  shortcut?: string
  children: React.ReactNode
}) {
  return (
    <div className="group relative flex items-center">
      {children}
      {/* Tooltip panel — appears to the right of the rail */}
      <div
        className={cn(
          "pointer-events-none absolute left-full z-50 ml-3",
          "flex items-center gap-2 whitespace-nowrap",
          "rounded-md border bg-popover px-3 py-1.5 shadow-md",
          "text-xs text-popover-foreground",
          "opacity-0 translate-x-[-4px]",
          "group-hover:opacity-100 group-hover:translate-x-0",
          "transition-all duration-150 delay-300",
        )}
      >
        {label}
        {shortcut && (
          <kbd className="rounded border bg-muted px-1 font-mono text-[10px] text-muted-foreground">
            G+{shortcut.toUpperCase()}
          </kbd>
        )}
      </div>
    </div>
  )
}

// ── Workspace icon button ─────────────────────────────────────────────────────

function WorkspaceButton({
  workspace,
  isActive,
  onClick,
}: {
  workspace: WorkspaceConfig
  isActive: boolean
  onClick: () => void
}) {
  const Icon = workspace.icon

  return (
    <RailTooltip label={workspace.label} shortcut={workspace.shortcutKey}>
      <button
        onClick={onClick}
        aria-label={workspace.label}
        aria-pressed={isActive}
        className={cn(
          "relative flex h-10 w-10 items-center justify-center rounded-lg",
          "transition-colors duration-100",
          isActive
            ? "bg-primary/10 text-primary"
            : "text-muted-foreground hover:bg-accent hover:text-foreground",
        )}
      >
        {/* Active left-border indicator */}
        {isActive && (
          <span className="absolute -left-[14px] top-1/2 h-5 w-[3px] -translate-y-1/2 rounded-r-full bg-primary" />
        )}
        <Icon className="h-5 w-5 flex-shrink-0" />
      </button>
    </RailTooltip>
  )
}

// ── Primary Rail ──────────────────────────────────────────────────────────────

export function PrimaryRail() {
  const { data: session } = useSession()
  const { activeWorkspace, setActiveWorkspace, isSidebarOpen, setSidebarOpen } = useWorkspace()

  const userRole    = session?.user?.role
  const workspaces  = getVisibleWorkspaces(userRole)

  const userInitials = session?.user?.name
    ? session.user.name.split(" ").map((n: string) => n[0]).join("").toUpperCase().slice(0, 2)
    : "U"

  // ── G+letter keyboard shortcut handler ───────────────────────────────────
  React.useEffect(() => {
    let gPressed = false
    let gTimer: ReturnType<typeof setTimeout>

    function handleKeyDown(e: KeyboardEvent) {
      // Ignore when focused inside an input
      const tag = (e.target as HTMLElement)?.tagName
      if (tag === "INPUT" || tag === "TEXTAREA") return

      if (e.key === "g" || e.key === "G") {
        gPressed = true
        clearTimeout(gTimer)
        gTimer = setTimeout(() => { gPressed = false }, 800)
        return
      }

      if (gPressed) {
        const ws = workspaces.find((w) => w.shortcutKey === e.key.toLowerCase())
        if (ws) {
          e.preventDefault()
          gPressed = false
          handleWorkspaceClick(ws.id)
        }
      }
    }

    document.addEventListener("keydown", handleKeyDown)
    return () => {
      document.removeEventListener("keydown", handleKeyDown)
      clearTimeout(gTimer)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [workspaces, activeWorkspace, isSidebarOpen])

  function handleWorkspaceClick(id: WorkspaceId) {
    if (id === activeWorkspace) {
      // Re-click active workspace → toggle secondary sidebar
      setSidebarOpen(!isSidebarOpen)
    } else {
      setActiveWorkspace(id)
      setSidebarOpen(true)
    }
  }

  return (
    <aside
      className={cn(
        "relative z-20 flex w-14 flex-shrink-0 flex-col items-center",
        "border-r bg-background py-3",
      )}
    >
      {/* Logo */}
      <Link
        href="/dashboard"
        className="mb-4 flex h-9 w-9 items-center justify-center rounded-lg bg-primary"
        aria-label="Go to dashboard"
      >
        <Building2 className="h-5 w-5 text-primary-foreground" />
      </Link>

      {/* Workspace icons */}
      <nav className="flex flex-1 flex-col items-center gap-1.5">
        {workspaces.map((ws) => (
          <WorkspaceButton
            key={ws.id}
            workspace={ws}
            isActive={activeWorkspace === ws.id}
            onClick={() => handleWorkspaceClick(ws.id)}
          />
        ))}
      </nav>

      {/* Bottom: Help + Avatar */}
      <div className="flex flex-col items-center gap-2 mt-2">
        <RailTooltip label="Help & shortcuts">
          <Link
            href="/help"
            className="flex h-9 w-9 items-center justify-center rounded-lg text-muted-foreground hover:bg-accent hover:text-foreground transition-colors"
            aria-label="Help"
          >
            <HelpCircle className="h-5 w-5" />
          </Link>
        </RailTooltip>

        {/* User avatar with dropdown */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              className="flex h-9 w-9 items-center justify-center rounded-lg hover:ring-2 hover:ring-primary/20 transition-all"
              aria-label="User menu"
            >
              <Avatar className="h-8 w-8">
                <AvatarFallback className="bg-primary text-primary-foreground text-xs font-semibold">
                  {userInitials}
                </AvatarFallback>
              </Avatar>
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent side="right" align="end" className="w-56 ml-1">
            <DropdownMenuLabel className="font-normal">
              <p className="text-sm font-medium">{session?.user?.name || "User"}</p>
              <p className="text-xs text-muted-foreground capitalize">
                {session?.user?.role?.replace(/_/g, " ") || "Member"}
              </p>
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem asChild>
              <Link href="/settings" className="cursor-pointer">
                <User className="mr-2 h-4 w-4" />
                Profile
              </Link>
            </DropdownMenuItem>
            <DropdownMenuItem asChild>
              <Link href="/settings" className="cursor-pointer">
                <Settings className="mr-2 h-4 w-4" />
                Settings
              </Link>
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              className="cursor-pointer text-destructive focus:text-destructive"
              onClick={() => signOut({ callbackUrl: "/auth/login" })}
            >
              <LogOut className="mr-2 h-4 w-4" />
              Log out
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </aside>
  )
}
