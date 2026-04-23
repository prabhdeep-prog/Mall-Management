"use client"

import * as React from "react"
import Link from "next/link"
import { Bell, CheckCircle2, AlertCircle, Megaphone, Wrench, Info } from "lucide-react"
import { cn } from "@/lib/utils/index"
import { formatDistanceToNow } from "date-fns"

interface Notification {
  id: string
  type: string | null
  title: string | null
  content: string | null
  readAt: string | null
  createdAt: string
}

const TYPE_CONFIG: Record<string, { icon: typeof Bell; className: string }> = {
  payment_reminder: { icon: AlertCircle, className: "text-amber-500" },
  announcement:     { icon: Megaphone,   className: "text-blue-500" },
  maintenance_update: { icon: Wrench,    className: "text-indigo-500" },
  lease_notice:     { icon: Info,        className: "text-violet-500" },
  support_request:  { icon: CheckCircle2, className: "text-green-500" },
}

export function NotificationBell() {
  const [unread, setUnread] = React.useState(0)
  const [items, setItems] = React.useState<Notification[]>([])
  const [open, setOpen] = React.useState(false)
  const ref = React.useRef<HTMLDivElement>(null)

  // Fetch unread count
  const fetchCount = React.useCallback(async () => {
    try {
      const res = await fetch("/api/tenant/notifications/count")
      if (res.ok) {
        const data = await res.json()
        setUnread(data.unread ?? 0)
      }
    } catch {}
  }, [])

  // Fetch recent notifications for dropdown
  const fetchRecent = React.useCallback(async () => {
    try {
      const res = await fetch("/api/tenant/notifications")
      if (res.ok) {
        const data = await res.json()
        setItems((data.data ?? []).slice(0, 5))
      }
    } catch {}
  }, [])

  // Poll count every 30s
  React.useEffect(() => {
    fetchCount()
    const interval = setInterval(fetchCount, 30000)
    return () => clearInterval(interval)
  }, [fetchCount])

  // Fetch items when dropdown opens
  React.useEffect(() => {
    if (open) fetchRecent()
  }, [open, fetchRecent])

  // Close on outside click
  React.useEffect(() => {
    function handler(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener("mousedown", handler)
    return () => document.removeEventListener("mousedown", handler)
  }, [])

  const markAsRead = async (id: string) => {
    try {
      await fetch(`/api/tenant/notifications/${id}/read`, { method: "PATCH" })
      setItems((prev) =>
        prev.map((n) => (n.id === id ? { ...n, readAt: new Date().toISOString() } : n)),
      )
      setUnread((prev) => Math.max(0, prev - 1))
    } catch {}
  }

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen(!open)}
        className="relative flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground transition-colors"
      >
        <Bell className="h-4 w-4" />
        {unread > 0 && (
          <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-destructive px-1 text-[10px] font-bold text-destructive-foreground">
            {unread > 9 ? "9+" : unread}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 top-full z-50 mt-1 w-80 rounded-lg border bg-popover shadow-lg">
          <div className="flex items-center justify-between border-b px-4 py-2.5">
            <p className="text-sm font-semibold">Notifications</p>
            {unread > 0 && (
              <span className="text-xs text-muted-foreground">{unread} unread</span>
            )}
          </div>

          <div className="max-h-80 overflow-y-auto">
            {items.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-8 text-muted-foreground">
                <Bell className="h-6 w-6 mb-2 opacity-40" />
                <p className="text-sm">No notifications</p>
              </div>
            ) : (
              items.map((item) => {
                const cfg = TYPE_CONFIG[item.type ?? ""] ?? TYPE_CONFIG.announcement
                const Icon = cfg.icon
                const isUnread = !item.readAt
                return (
                  <button
                    key={item.id}
                    onClick={() => {
                      if (isUnread) markAsRead(item.id)
                    }}
                    className={cn(
                      "flex w-full gap-3 px-4 py-3 text-left transition-colors hover:bg-accent",
                      isUnread && "bg-primary/5",
                    )}
                  >
                    <Icon className={cn("h-4 w-4 mt-0.5 flex-shrink-0", cfg.className)} />
                    <div className="min-w-0 flex-1">
                      <p className={cn("text-sm truncate", isUnread && "font-medium")}>
                        {item.title}
                      </p>
                      <p className="text-xs text-muted-foreground line-clamp-2 mt-0.5">
                        {item.content}
                      </p>
                      <p className="text-[10px] text-muted-foreground mt-1">
                        {formatDistanceToNow(new Date(item.createdAt), { addSuffix: true })}
                      </p>
                    </div>
                    {isUnread && (
                      <span className="mt-1 h-2 w-2 flex-shrink-0 rounded-full bg-primary" />
                    )}
                  </button>
                )
              })
            )}
          </div>

          <div className="border-t px-4 py-2">
            <Link
              href="/tenant/notifications"
              onClick={() => setOpen(false)}
              className="text-xs text-primary hover:underline"
            >
              View all notifications
            </Link>
          </div>
        </div>
      )}
    </div>
  )
}
