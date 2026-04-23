import { NextRequest, NextResponse } from "next/server"
import { requireTenantSession } from "@/lib/auth/tenant-session"
import { serviceDb } from "@/lib/db"
import { notifications } from "@/lib/db/schema"
import { eq, and } from "drizzle-orm"

/**
 * PATCH /api/tenant/notifications/:id/read
 * Mark a notification as read.
 */
export async function PATCH(
  _request: NextRequest,
  { params }: { params: { id: string } },
) {
  let ctx
  try {
    ctx = await requireTenantSession()
  } catch (res) {
    return res as Response
  }

  try {
    const [updated] = await serviceDb
      .update(notifications)
      .set({ readAt: new Date() })
      .where(
        and(
          eq(notifications.id, params.id),
          eq(notifications.recipientId, ctx.tenantId),
          eq(notifications.recipientType, "tenant"),
        ),
      )
      .returning({ id: notifications.id })

    if (!updated) {
      return NextResponse.json({ error: "Notification not found" }, { status: 404 })
    }

    return NextResponse.json({ success: true })
  } catch (err) {
    console.error("Mark notification read error:", err)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
