"use client"

import * as React from "react"
import { Megaphone, X } from "lucide-react"

interface Notification {
  id: string
  title: string | null
  content: string | null
  type: string | null
  createdAt: string
}

export function AnnouncementBanner() {
  const [announcement, setAnnouncement] = React.useState<Notification | null>(null)
  const [dismissed, setDismissed] = React.useState(false)

  React.useEffect(() => {
    fetch("/api/tenant/notifications")
      .then((r) => r.json())
      .then((data) => {
        const items = data.data ?? []
        const latest = items.find(
          (n: Notification) => n.type === "announcement" && !dismissed,
        )
        if (latest) setAnnouncement(latest)
      })
      .catch(() => {})
  }, [dismissed])

  const dismiss = async () => {
    if (!announcement) return
    setDismissed(true)
    setAnnouncement(null)
    try {
      await fetch(`/api/tenant/notifications/${announcement.id}/read`, { method: "PATCH" })
    } catch {}
  }

  if (!announcement || dismissed) return null

  return (
    <div className="flex items-start gap-3 rounded-lg border border-blue-200 bg-blue-50 p-4 dark:border-blue-800 dark:bg-blue-950/30">
      <Megaphone className="h-5 w-5 text-blue-600 flex-shrink-0 mt-0.5" />
      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold text-blue-900 dark:text-blue-100">
          {announcement.title}
        </p>
        <p className="text-sm text-blue-800 dark:text-blue-200 mt-0.5">
          {announcement.content}
        </p>
      </div>
      <button
        onClick={dismiss}
        className="flex-shrink-0 rounded-md p-1 text-blue-600 hover:bg-blue-100 dark:hover:bg-blue-900 transition-colors"
      >
        <X className="h-4 w-4" />
      </button>
    </div>
  )
}
