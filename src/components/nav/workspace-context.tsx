"use client"

import * as React from "react"
import { usePathname } from "next/navigation"
import { workspaceFromPathname, type WorkspaceId } from "./workspace-config"

// ── Context shape ─────────────────────────────────────────────────────────────

interface WorkspaceContextValue {
  /** Currently selected workspace */
  activeWorkspace: WorkspaceId
  setActiveWorkspace: (id: WorkspaceId) => void

  /** Whether the secondary sidebar panel is open */
  isSidebarOpen: boolean
  setSidebarOpen: (open: boolean) => void
  toggleSidebar: () => void

  /** Whether the ⌘K command palette is open */
  isPaletteOpen: boolean
  openPalette: (initialQuery?: string) => void
  closePalette: () => void

  /** Pre-populated query when palette was opened via a specific trigger */
  paletteInitialQuery: string
}

const WorkspaceContext = React.createContext<WorkspaceContextValue | null>(null)

// ── Hook ──────────────────────────────────────────────────────────────────────

export function useWorkspace(): WorkspaceContextValue {
  const ctx = React.useContext(WorkspaceContext)
  if (!ctx) throw new Error("useWorkspace must be used within <WorkspaceProvider>")
  return ctx
}

// ── Provider ──────────────────────────────────────────────────────────────────

const SIDEBAR_STORAGE_KEY = "mallos:sidebar-open"
const WORKSPACE_STORAGE_KEY = "mallos:active-workspace"

export function WorkspaceProvider({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()

  // Derive active workspace from current URL on mount and navigation
  const detectedWorkspace = workspaceFromPathname(pathname)

  // Initial state MUST match between server and client to avoid hydration
  // mismatches. We seed with the URL-derived workspace and the default sidebar
  // state, then sync the persisted values from localStorage in a post-mount
  // effect below.
  const [activeWorkspace, setActiveWorkspaceState] = React.useState<WorkspaceId>(detectedWorkspace)
  const [isSidebarOpen, setSidebarOpenState] = React.useState<boolean>(true)

  const [isPaletteOpen, setPaletteOpen] = React.useState(false)
  const [paletteInitialQuery, setPaletteInitialQuery] = React.useState("")

  // Hydrate persisted preferences from localStorage after mount (client-only)
  React.useEffect(() => {
    const storedSidebar = localStorage.getItem(SIDEBAR_STORAGE_KEY)
    if (storedSidebar !== null) setSidebarOpenState(storedSidebar === "true")

    const storedWorkspace = localStorage.getItem(WORKSPACE_STORAGE_KEY) as WorkspaceId | null
    if (storedWorkspace) setActiveWorkspaceState(storedWorkspace)
  }, [])

  // Auto-sync workspace from pathname changes (browser navigation)
  React.useEffect(() => {
    const ws = workspaceFromPathname(pathname)
    setActiveWorkspaceState(ws)
    localStorage.setItem(WORKSPACE_STORAGE_KEY, ws)
  }, [pathname])

  // Persist sidebar state
  const setSidebarOpen = React.useCallback((open: boolean) => {
    setSidebarOpenState(open)
    localStorage.setItem(SIDEBAR_STORAGE_KEY, String(open))
  }, [])

  const toggleSidebar = React.useCallback(() => {
    setSidebarOpenState((prev) => {
      const next = !prev
      localStorage.setItem(SIDEBAR_STORAGE_KEY, String(next))
      return next
    })
  }, [])

  const setActiveWorkspace = React.useCallback((id: WorkspaceId) => {
    setActiveWorkspaceState(id)
    localStorage.setItem(WORKSPACE_STORAGE_KEY, id)
  }, [])

  const openPalette = React.useCallback((initialQuery = "") => {
    setPaletteInitialQuery(initialQuery)
    setPaletteOpen(true)
  }, [])

  const closePalette = React.useCallback(() => {
    setPaletteOpen(false)
    setPaletteInitialQuery("")
  }, [])

  const value: WorkspaceContextValue = React.useMemo(
    () => ({
      activeWorkspace,
      setActiveWorkspace,
      isSidebarOpen,
      setSidebarOpen,
      toggleSidebar,
      isPaletteOpen,
      openPalette,
      closePalette,
      paletteInitialQuery,
    }),
    [
      activeWorkspace, setActiveWorkspace,
      isSidebarOpen, setSidebarOpen, toggleSidebar,
      isPaletteOpen, openPalette, closePalette, paletteInitialQuery,
    ]
  )

  return (
    <WorkspaceContext.Provider value={value}>
      {children}
    </WorkspaceContext.Provider>
  )
}
