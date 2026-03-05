"use client"

/**
 * Global Command Palette — ⌘K
 * ─────────────────────────────
 * A keyboard-first universal action layer.
 *
 * Modes (auto-detected from query):
 *   Default  → Fuzzy search over nav items + recent history
 *   Verb     → Action commands ("create work order", "send reminder")
 *   AI (?)   → Natural language query ("? leases expiring in 60 days")
 *   Page (@) → Filter by entity type ("@tenant ravi")
 *
 * Keyboard:
 *   ↑ / ↓    navigate results
 *   Enter    execute selected
 *   Esc      close
 *   ⌘K       re-open with last query
 *
 * History: stored in localStorage, max 20 items, cleared on logout.
 */

import * as React from "react"
import { useRouter } from "next/navigation"
import { useSession } from "next-auth/react"
import { cn } from "@/lib/utils"
import { Dialog, DialogContent } from "@/components/ui/dialog"
import { Badge } from "@/components/ui/badge"
import { Separator } from "@/components/ui/separator"
import { ScrollArea } from "@/components/ui/scroll-area"
import {
  Search,
  Clock,
  Zap,
  ArrowRight,
  Bot,
  LayoutDashboard,
  Building2,
  Users,
  FileSignature,
  CreditCard,
  Wrench,
  Truck,
  Cpu,
  ShieldCheck,
  IndianRupee,
  BarChart3,
  BarChart2,
  CheckCircle,
  Shield,
  UserCog,
  FileText,
  Receipt,
  Settings,
  HelpCircle,
  Plus,
} from "lucide-react"
import { useWorkspace } from "./workspace-context"
import { WORKSPACES, canAccess, type NavItem } from "./workspace-config"

// ── Recent history ────────────────────────────────────────────────────────────

const HISTORY_KEY = "mallos:cmd-history"
const MAX_HISTORY = 20

interface HistoryItem {
  title:    string
  href:     string
  subtitle: string
  type:     "recent"
  ts:       number
}

function loadHistory(): HistoryItem[] {
  if (typeof window === "undefined") return []
  try {
    return JSON.parse(localStorage.getItem(HISTORY_KEY) ?? "[]") as HistoryItem[]
  } catch {
    return []
  }
}

function saveToHistory(item: Omit<HistoryItem, "ts" | "type">) {
  const history = loadHistory().filter((h) => h.href !== item.href)
  const next    = [{ ...item, type: "recent" as const, ts: Date.now() }, ...history].slice(0, MAX_HISTORY)
  localStorage.setItem(HISTORY_KEY, JSON.stringify(next))
}

// ── All nav items (flat list for search) ─────────────────────────────────────

interface SearchableItem {
  title:    string
  href:     string
  subtitle: string
  icon:     React.ComponentType<{ className?: string }>
  badge:    string
  type:     "nav" | "action" | "ai"
  group?:   string
}

const QUICK_ACTIONS: SearchableItem[] = [
  { title: "Create Work Order",    href: "/work-orders?action=create",   subtitle: "Open a new maintenance ticket",       icon: Plus,     badge: "ACTION", type: "action", group: "Quick actions" },
  { title: "Create Invoice",       href: "/financials?action=create",    subtitle: "Generate a new invoice for a tenant", icon: Plus,     badge: "ACTION", type: "action", group: "Quick actions" },
  { title: "Add Property",         href: "/properties?action=add",       subtitle: "Register a new property or mall",     icon: Plus,     badge: "ACTION", type: "action", group: "Quick actions" },
  { title: "Invite User",          href: "/users?action=invite",         subtitle: "Add a team member",                   icon: Users,    badge: "ACTION", type: "action", group: "Quick actions" },
  { title: "Go to Dashboard",      href: "/dashboard",                   subtitle: "Command center overview",             icon: LayoutDashboard, badge: "PAGE", type: "nav", group: "Pages" },
  { title: "Properties",           href: "/properties",                  subtitle: "All properties and malls",           icon: Building2, badge: "PAGE",  type: "nav", group: "Pages" },
  { title: "Tenants",              href: "/tenants",                     subtitle: "Tenant directory and profiles",      icon: Users,     badge: "PAGE",  type: "nav", group: "Pages" },
  { title: "Leases",               href: "/leases",                      subtitle: "Lease agreements and renewals",      icon: FileSignature, badge: "PAGE", type: "nav", group: "Pages" },
  { title: "Financials",           href: "/financials",                  subtitle: "Invoices, payments and accounting",  icon: CreditCard, badge: "PAGE", type: "nav", group: "Pages" },
  { title: "Work Orders",          href: "/work-orders",                 subtitle: "Maintenance requests and tickets",   icon: Wrench,    badge: "PAGE",  type: "nav", group: "Pages" },
  { title: "Vendors",              href: "/vendors",                     subtitle: "Vendor directory and performance",   icon: Truck,     badge: "PAGE",  type: "nav", group: "Pages" },
  { title: "Equipment",            href: "/equipment",                   subtitle: "Equipment tracking and health",      icon: Cpu,       badge: "PAGE",  type: "nav", group: "Pages" },
  { title: "Compliance",           href: "/compliance",                  subtitle: "Regulatory certificates and audits", icon: ShieldCheck, badge: "PAGE", type: "nav", group: "Pages" },
  { title: "Revenue Intelligence", href: "/revenue-intelligence",        subtitle: "POS data and revenue analytics",     icon: IndianRupee, badge: "PAGE", type: "nav", group: "Pages" },
  { title: "Analytics",            href: "/analytics",                   subtitle: "Reports and visualisations",        icon: BarChart3, badge: "PAGE",  type: "nav", group: "Pages" },
  { title: "Agent Activity",       href: "/agents",                      subtitle: "Monitor AI agent actions",           icon: Bot,       badge: "PAGE",  type: "nav", group: "Pages" },
  { title: "Approvals",            href: "/approvals",                   subtitle: "Review pending AI decisions",        icon: CheckCircle, badge: "PAGE", type: "nav", group: "Pages" },
  { title: "Users",                href: "/users",                       subtitle: "User accounts and access",           icon: UserCog,   badge: "PAGE",  type: "nav", group: "Pages" },
  { title: "Roles & Permissions",  href: "/roles",                       subtitle: "Role-based access control",          icon: Shield,    badge: "PAGE",  type: "nav", group: "Pages" },
  { title: "Settings",             href: "/settings",                    subtitle: "Organisation profile and preferences", icon: Settings, badge: "PAGE", type: "nav", group: "Pages" },
  { title: "Help & Support",       href: "/help",                        subtitle: "Documentation and keyboard shortcuts", icon: HelpCircle, badge: "PAGE", type: "nav", group: "Pages" },
  { title: "Admin Billing",        href: "/admin/billing",               subtitle: "MRR, plan distribution and renewals", icon: CreditCard, badge: "ADMIN", type: "nav", group: "Admin" },
  { title: "Audit Log",            href: "/admin/audit",                 subtitle: "Platform access and event audit",    icon: FileText,  badge: "ADMIN", type: "nav", group: "Admin" },
]

// ── Fuzzy match ───────────────────────────────────────────────────────────────

/**
 * Returns true if every word in the query appears (in order) within the haystack.
 * Simple and fast — no external lib needed for ~25 static items.
 */
function fuzzyMatch(haystack: string, query: string): boolean {
  const h = haystack.toLowerCase()
  const words = query.toLowerCase().trim().split(/\s+/)
  let pos = 0
  for (const word of words) {
    const idx = h.indexOf(word, pos)
    if (idx === -1) return false
    pos = idx + word.length
  }
  return true
}

function searchItems(query: string, userRole: string | undefined): SearchableItem[] {
  if (!query.trim()) return []
  return QUICK_ACTIONS.filter((item) => {
    // Role gate: find nav items in WORKSPACES and check access
    const wsItem = WORKSPACES.flatMap((ws) => ws.sections.flatMap((s) => s.items))
      .find((i: NavItem) => i.href === item.href)
    if (wsItem && !canAccess(userRole, wsItem.roles)) return false
    return (
      fuzzyMatch(item.title, query) ||
      fuzzyMatch(item.subtitle, query) ||
      fuzzyMatch(item.badge, query)
    )
  })
}

// ── Badge colour map ──────────────────────────────────────────────────────────

const BADGE_VARIANT: Record<string, string> = {
  ACTION:  "bg-violet-100 text-violet-700 dark:bg-violet-900 dark:text-violet-300",
  PAGE:    "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300",
  ADMIN:   "bg-amber-100 text-amber-700 dark:bg-amber-900 dark:text-amber-300",
  RECENT:  "bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300",
  AI:      "bg-emerald-100 text-emerald-700 dark:bg-emerald-900 dark:text-emerald-300",
}

// ── Result row ────────────────────────────────────────────────────────────────

function ResultRow({
  icon: Icon,
  title,
  subtitle,
  badge,
  isSelected,
  onSelect,
  onMouseEnter,
  rowRef,
}: {
  icon:         React.ComponentType<{ className?: string }>
  title:        string
  subtitle:     string
  badge:        string
  isSelected:   boolean
  onSelect:     () => void
  onMouseEnter: () => void
  rowRef?:      React.Ref<HTMLButtonElement>
}) {
  return (
    <button
      ref={rowRef}
      className={cn(
        "flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left transition-colors",
        isSelected
          ? "bg-accent text-accent-foreground"
          : "hover:bg-accent/50",
      )}
      onClick={onSelect}
      onMouseEnter={onMouseEnter}
    >
      <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-md border bg-background">
        <Icon className="h-4 w-4 text-muted-foreground" />
      </div>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium">{title}</p>
        <p className="truncate text-xs text-muted-foreground">{subtitle}</p>
      </div>
      <span
        className={cn(
          "flex-shrink-0 rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide",
          BADGE_VARIANT[badge] ?? BADGE_VARIANT.PAGE,
        )}
      >
        {badge}
      </span>
      {isSelected && <ArrowRight className="h-3.5 w-3.5 flex-shrink-0 text-muted-foreground" />}
    </button>
  )
}

// ── Result group ──────────────────────────────────────────────────────────────

function ResultGroup({
  label,
  children,
}: {
  label: string
  children: React.ReactNode
}) {
  return (
    <div>
      <p className="mb-1 px-3 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
        {label}
      </p>
      {children}
    </div>
  )
}

// ── AI suggestion row ─────────────────────────────────────────────────────────

function AiRow({
  query,
  isSelected,
  onSelect,
  onMouseEnter,
}: {
  query:        string
  isSelected:   boolean
  onSelect:     () => void
  onMouseEnter: () => void
}) {
  return (
    <button
      className={cn(
        "flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left transition-colors",
        isSelected ? "bg-accent text-accent-foreground" : "hover:bg-accent/50",
      )}
      onClick={onSelect}
      onMouseEnter={onMouseEnter}
    >
      <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-md border bg-emerald-50 dark:bg-emerald-950">
        <Bot className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
      </div>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium">Ask AI: &ldquo;{query}&rdquo;</p>
        <p className="text-xs text-muted-foreground">Natural language query via AI assistant</p>
      </div>
      <span className={cn("flex-shrink-0 rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide", BADGE_VARIANT.AI)}>
        AI
      </span>
    </button>
  )
}

// ── Empty state ───────────────────────────────────────────────────────────────

function EmptyState({ query }: { query: string }) {
  return (
    <div className="px-4 py-8 text-center">
      <p className="text-sm text-muted-foreground">
        No results for <span className="font-medium text-foreground">&ldquo;{query}&rdquo;</span>
      </p>
      <p className="mt-1 text-xs text-muted-foreground">
        Try starting with <kbd className="rounded border bg-muted px-1 font-mono text-[10px]">?</kbd> to ask the AI assistant
      </p>
    </div>
  )
}

// ── Main palette ──────────────────────────────────────────────────────────────

export function CommandPalette() {
  const router                        = useRouter()
  const { data: session }             = useSession()
  const { isPaletteOpen, closePalette, paletteInitialQuery } = useWorkspace()

  const [query,         setQuery]         = React.useState("")
  const [selectedIndex, setSelectedIndex] = React.useState(0)
  const [history,       setHistory]       = React.useState<HistoryItem[]>([])

  const inputRef = React.useRef<HTMLInputElement>(null)
  const listRef  = React.useRef<HTMLDivElement>(null)

  const userRole = session?.user?.role

  // ── Sync initial query when opened externally (e.g. "?" prefix from header) ─
  React.useEffect(() => {
    if (isPaletteOpen) {
      setQuery(paletteInitialQuery)
      setSelectedIndex(0)
      setHistory(loadHistory())
      setTimeout(() => inputRef.current?.focus(), 0)
    }
  }, [isPaletteOpen, paletteInitialQuery])

  // ── Global ⌘K listener ───────────────────────────────────────────────────
  const { openPalette } = useWorkspace()
  React.useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault()
        if (isPaletteOpen) closePalette()
        else openPalette()
      }
    }
    document.addEventListener("keydown", handleKeyDown)
    return () => document.removeEventListener("keydown", handleKeyDown)
  }, [isPaletteOpen, openPalette, closePalette])

  // ── Compute results ───────────────────────────────────────────────────────

  const trimmedQuery = query.trim()
  const isAiMode     = trimmedQuery.startsWith("?")
  const aiQuery      = isAiMode ? trimmedQuery.slice(1).trim() : trimmedQuery

  // Collect all result rows as a flat list for keyboard navigation
  const results = React.useMemo<SearchableItem[]>(() => {
    if (!trimmedQuery) return []
    const searched = searchItems(isAiMode ? aiQuery : trimmedQuery, userRole)
    return searched
  }, [trimmedQuery, aiQuery, isAiMode, userRole])

  // History filtered by query (when query is empty, show all recent)
  const filteredHistory = React.useMemo<HistoryItem[]>(() => {
    if (!trimmedQuery) return history.slice(0, 5)
    return history.filter(
      (h) => fuzzyMatch(h.title, trimmedQuery) || fuzzyMatch(h.subtitle, trimmedQuery)
    ).slice(0, 3)
  }, [history, trimmedQuery])

  // Flat ordered list for keyboard navigation:
  //   history → nav results → AI row (if ai mode or query present)
  const flatRows: Array<{
    key:     string
    execute: () => void
  }> = React.useMemo(() => {
    const rows: { key: string; execute: () => void }[] = []
    filteredHistory.forEach((h) => rows.push({ key: `h:${h.href}`, execute: () => navigate(h.href, h.title, h.subtitle) }))
    results.forEach((r)         => rows.push({ key: `r:${r.href}`, execute: () => navigate(r.href, r.title, r.subtitle) }))
    if (aiQuery)                  rows.push({ key: "ai",           execute: () => navigate(`/agents?q=${encodeURIComponent(aiQuery)}`, `AI: ${aiQuery}`, "AI query") })
    return rows
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filteredHistory, results, aiQuery])

  // Reset selection when results change
  React.useEffect(() => { setSelectedIndex(0) }, [flatRows.length])

  // Scroll selected item into view
  React.useEffect(() => {
    const el = listRef.current?.querySelector(`[data-row="${selectedIndex}"]`)
    el?.scrollIntoView({ block: "nearest" })
  }, [selectedIndex])

  // ── Navigate and record history ──────────────────────────────────────────

  function navigate(href: string, title: string, subtitle: string) {
    saveToHistory({ href, title, subtitle })
    closePalette()
    router.push(href)
  }

  // ── Keyboard handler ─────────────────────────────────────────────────────

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    switch (e.key) {
      case "ArrowDown":
        e.preventDefault()
        setSelectedIndex((i) => Math.min(i + 1, flatRows.length - 1))
        break
      case "ArrowUp":
        e.preventDefault()
        setSelectedIndex((i) => Math.max(i - 1, 0))
        break
      case "Enter":
        e.preventDefault()
        flatRows[selectedIndex]?.execute()
        break
      case "Escape":
        closePalette()
        break
    }
  }

  // ── Build row index for keyboard highlight ───────────────────────────────

  let rowIndex = 0
  const nextIndex = () => rowIndex++

  const showQuickActions = !trimmedQuery
  const quickActionItems = QUICK_ACTIONS.filter((i) => i.type === "action").slice(0, 3)

  return (
    <Dialog open={isPaletteOpen} onOpenChange={(open) => { if (!open) closePalette() }}>
      <DialogContent
        className="overflow-hidden p-0 shadow-2xl sm:max-w-[560px]"
        // Hide default close button & title (visually hidden below)
        aria-describedby={undefined}
      >
        {/* Visually hidden title for a11y */}
        <span className="sr-only">Command palette</span>

        {/* ── Input ─────────────────────────────────────────────────────── */}
        <div className="flex items-center gap-3 border-b px-4 py-3">
          <Search className="h-4 w-4 flex-shrink-0 text-muted-foreground" />
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={isAiMode ? "Ask the AI assistant anything…" : "Search pages, actions, or type ? for AI…"}
            className="flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
            autoComplete="off"
            spellCheck={false}
          />
          {isAiMode && (
            <span className={cn("rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide", BADGE_VARIANT.AI)}>
              AI mode
            </span>
          )}
          {/* <kbd className="hidden rounded border bg-muted px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground sm:inline">
            Esc
          </kbd> */}
        </div>

        {/* ── Results ───────────────────────────────────────────────────── */}
        <ScrollArea className="max-h-[400px]">
          <div ref={listRef} className="px-2 py-2 space-y-3">

            {/* Empty query: show recent + quick actions */}
            {!trimmedQuery && (
              <>
                {filteredHistory.length > 0 && (
                  <ResultGroup label="Recent">
                    {filteredHistory.map((h) => {
                      const idx = nextIndex()
                      return (
                        <ResultRow
                          key={h.href}
                          icon={Clock}
                          title={h.title}
                          subtitle={h.subtitle}
                          badge="RECENT"
                          isSelected={selectedIndex === idx}
                          onMouseEnter={() => setSelectedIndex(idx)}
                          onSelect={() => navigate(h.href, h.title, h.subtitle)}
                        />
                      )
                    })}
                  </ResultGroup>
                )}

                {showQuickActions && (
                  <ResultGroup label="Quick actions">
                    {quickActionItems.map((item) => {
                      const idx = nextIndex()
                      return (
                        <ResultRow
                          key={item.href}
                          icon={item.icon}
                          title={item.title}
                          subtitle={item.subtitle}
                          badge={item.badge}
                          isSelected={selectedIndex === idx}
                          onMouseEnter={() => setSelectedIndex(idx)}
                          onSelect={() => navigate(item.href, item.title, item.subtitle)}
                        />
                      )
                    })}
                  </ResultGroup>
                )}

                {filteredHistory.length === 0 && !showQuickActions && (
                  <p className="px-3 py-6 text-center text-sm text-muted-foreground">
                    Start typing to search pages and actions, or type{" "}
                    <kbd className="rounded border bg-muted px-1 font-mono text-[10px]">?</kbd> to ask the AI.
                  </p>
                )}
              </>
            )}

            {/* With query: recent matches then search results */}
            {trimmedQuery && (
              <>
                {filteredHistory.length > 0 && (
                  <ResultGroup label="Recent">
                    {filteredHistory.map((h) => {
                      const idx = nextIndex()
                      return (
                        <ResultRow
                          key={h.href}
                          icon={Clock}
                          title={h.title}
                          subtitle={h.subtitle}
                          badge="RECENT"
                          isSelected={selectedIndex === idx}
                          onMouseEnter={() => setSelectedIndex(idx)}
                          onSelect={() => navigate(h.href, h.title, h.subtitle)}
                        />
                      )
                    })}
                  </ResultGroup>
                )}

                {results.length > 0 && (
                  <ResultGroup label={isAiMode ? "Pages & actions" : "Results"}>
                    {results.map((item) => {
                      const idx = nextIndex()
                      return (
                        <ResultRow
                          key={item.href}
                          icon={item.icon}
                          title={item.title}
                          subtitle={item.subtitle}
                          badge={item.badge}
                          isSelected={selectedIndex === idx}
                          onMouseEnter={() => setSelectedIndex(idx)}
                          onSelect={() => navigate(item.href, item.title, item.subtitle)}
                        />
                      )
                    })}
                  </ResultGroup>
                )}

                {/* AI query row */}
                {aiQuery && (
                  <>
                    {(filteredHistory.length > 0 || results.length > 0) && (
                      <Separator className="my-1" />
                    )}
                    <ResultGroup label="AI assistant">
                      {(() => {
                        const idx = nextIndex()
                        return (
                          <AiRow
                            query={aiQuery}
                            isSelected={selectedIndex === idx}
                            onMouseEnter={() => setSelectedIndex(idx)}
                            onSelect={() => navigate(`/agents?q=${encodeURIComponent(aiQuery)}`, `AI: ${aiQuery}`, "AI query")}
                          />
                        )
                      })()}
                    </ResultGroup>
                  </>
                )}

                {/* No results at all */}
                {filteredHistory.length === 0 && results.length === 0 && !aiQuery && (
                  <EmptyState query={trimmedQuery} />
                )}
              </>
            )}
          </div>
        </ScrollArea>

        {/* ── Footer hint bar ───────────────────────────────────────────── */}
        <div className="flex items-center gap-4 border-t bg-muted/30 px-4 py-2 text-[11px] text-muted-foreground">
          <span className="flex items-center gap-1">
            <kbd className="rounded border bg-background px-1 font-mono">↑↓</kbd> navigate
          </span>
          <span className="flex items-center gap-1">
            <kbd className="rounded border bg-background px-1 font-mono">↵</kbd> open
          </span>
          <span className="flex items-center gap-1">
            <kbd className="rounded border bg-background px-1 font-mono">?</kbd> AI mode
          </span>
          <span className="ml-auto flex items-center gap-1">
            <kbd className="rounded border bg-background px-1 font-mono">Esc</kbd> close
          </span>
        </div>
      </DialogContent>
    </Dialog>
  )
}
