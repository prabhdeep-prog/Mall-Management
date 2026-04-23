import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { serviceDb } from "@/lib/db"
import { notifications } from "@/lib/db/schema"
import { eq } from "drizzle-orm"

/**
 * PATCH /api/notifications/[id]/read
 * Mark an admin notification as read.
 */
export async function PATCH(
  _request: NextRequest,
  { params }: { params: { id: string } },
) {
  const session = await auth()
  if (!session?.user || session.user.role === "tenant") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  try {
    const [updated] = await serviceDb
      .update(notifications)
      .set({ readAt: new Date() })
      .where(eq(notifications.id, params.id))
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
