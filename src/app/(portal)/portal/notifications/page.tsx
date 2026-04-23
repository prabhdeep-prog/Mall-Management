"use client"

import * as React from "react"
import { Card, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Bell,
  AlertCircle,
  Megaphone,
  Wrench,
  Info,
  CheckCircle2,
  Check,
} from "lucide-react"
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

const TYPE_CONFIG: Record<string, { label: string; icon: typeof Bell; className: string }> = {
  payment_reminder:   { label: "Payment",      icon: AlertCircle,  className: "bg-amber-100 text-amber-700" },
  payment_due:        { label: "Payment Due",  icon: AlertCircle,  className: "bg-red-100 text-red-700" },
  announcement:       { label: "Announcement", icon: Megaphone,    className: "bg-blue-100 text-blue-700" },
  maintenance_update: { label: "Maintenance",  icon: Wrench,       className: "bg-indigo-100 text-indigo-700" },
  work_order_update:  { label: "Work Order",   icon: Wrench,       className: "bg-indigo-100 text-indigo-700" },
  lease_notice:       { label: "Lease",        icon: Info,         className: "bg-violet-100 text-violet-700" },
  lease_expiry:       { label: "Lease Expiry", icon: Info,         className: "bg-violet-100 text-violet-700" },
  invoice_created:    { label: "Invoice",      icon: AlertCircle,  className: "bg-amber-100 text-amber-700" },
  support_request:    { label: "Support",      icon: CheckCircle2, className: "bg-green-100 text-green-700" },
  cam_generated:      { label: "CAM",          icon: Info,         className: "bg-slate-100 text-slate-700" },
  custom:             { label: "Notice",       icon: Bell,         className: "bg-slate-100 text-slate-700" },
}

export default function TenantNotificationsPage() {
  const [items, setItems] = React.useState<Notification[]>([])
  const [loading, setLoading] = React.useState(true)

  React.useEffect(() => {
    fetch("/api/tenant/notifications")
      .then((r) => r.json())
      .then((data) => setItems(data.data ?? []))
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

  const markAsRead = async (id: string) => {
    try {
      await fetch(`/api/tenant/notifications/${id}/read`, { method: "PATCH" })
      setItems((prev) =>
        prev.map((n) => (n.id === id ? { ...n, readAt: new Date().toISOString() } : n)),
      )
    } catch {}
  }

  const markAllRead = async () => {
    const unread = items.filter((n) => !n.readAt)
    await Promise.all(
      unread.map((n) =>
        fetch(`/api/tenant/notifications/${n.id}/read`, { method: "PATCH" }).catch(() => {}),
      ),
    )
    setItems((prev) => prev.map((n) => ({ ...n, readAt: n.readAt ?? new Date().toISOString() })))
  }

  const unreadCount = items.filter((n) => !n.readAt).length

  if (loading) {
    return (
      <div className="space-y-4">
        <div className="h-8 w-48 animate-pulse rounded bg-muted" />
        {[1, 2, 3].map((i) => (
          <div key={i} className="h-20 animate-pulse rounded-lg bg-muted" />
        ))}
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Notifications</h1>
          <p className="text-sm text-muted-foreground mt-1">
            {unreadCount > 0 ? `${unreadCount} unread` : "All caught up"}
          </p>
        </div>
        {unreadCount > 0 && (
          <Button variant="outline" size="sm" onClick={markAllRead}>
            <Check className="h-4 w-4 mr-1.5" />
            Mark all read
          </Button>
        )}
      </div>

      {items.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-16 text-muted-foreground">
            <Bell className="h-10 w-10 mb-3 opacity-40" />
            <p className="text-sm font-medium">No notifications yet</p>
            <p className="text-xs mt-1">You'll see updates from mall management here</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {items.map((item) => {
            const cfg = TYPE_CONFIG[item.type ?? ""] ?? TYPE_CONFIG.custom
            const Icon = cfg.icon
            const isUnread = !item.readAt
            return (
              <Card
                key={item.id}
                className={cn(
                  "transition-colors cursor-pointer hover:bg-accent/50",
                  isUnread && "border-primary/20 bg-primary/5",
                )}
                onClick={() => {
                  if (isUnread) markAsRead(item.id)
                }}
              >
                <CardContent className="flex items-start gap-4 p-4">
                  <div className={cn("flex h-8 w-8 items-center justify-center rounded-full flex-shrink-0", cfg.className)}>
                    <Icon className="h-4 w-4" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <p className={cn("text-sm", isUnread ? "font-semibold" : "font-medium")}>
                        {item.title}
                      </p>
                      <Badge variant="outline" className={cn("text-[10px] px-1.5 py-0", cfg.className)}>
                        {cfg.label}
                      </Badge>
                      {isUnread && (
                        <span className="h-2 w-2 rounded-full bg-primary flex-shrink-0" />
                      )}
                    </div>
                    <p className="text-sm text-muted-foreground mt-1">{item.content}</p>
                    <p className="text-xs text-muted-foreground mt-2">
                      {formatDistanceToNow(new Date(item.createdAt), { addSuffix: true })}
                    </p>
                  </div>
                </CardContent>
              </Card>
            )
          })}
        </div>
      )}
    </div>
  )
}
