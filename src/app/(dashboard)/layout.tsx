import * as React from "react"
import { WorkspaceProvider } from "@/components/nav/workspace-context"
import { PrimaryRail } from "@/components/nav/primary-rail"
import { SecondarySidebar } from "@/components/nav/secondary-sidebar"
import { CommandPalette } from "@/components/nav/command-palette"
import { Header } from "@/components/dashboard/header"

/**
 * Dashboard Shell Layout
 * ───────────────────────
 * Two-level navigation:
 *   [PrimaryRail 56px] [SecondarySidebar 0–240px] [Header + content]
 *
 * WorkspaceProvider supplies shared state to all nav components and the header.
 * CommandPalette is mounted globally (always in DOM, shown/hidden via state).
 */
export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <WorkspaceProvider>
      <div className="flex h-screen overflow-hidden bg-background">

        {/* Primary icon rail (always visible, 56px) */}
        <PrimaryRail />

        {/* Contextual secondary sidebar (collapses to 0) */}
        <SecondarySidebar />

        {/* Main content area */}
        <div className="flex flex-1 flex-col overflow-hidden min-w-0">
          <Header />
          <main className="flex-1 overflow-y-auto p-6">
            {children}
          </main>
        </div>

        {/* Global ⌘K command palette — always mounted, shown via context state */}
        <CommandPalette />
      </div>
    </WorkspaceProvider>
  )
}
