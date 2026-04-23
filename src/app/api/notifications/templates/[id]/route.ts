import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { db } from "@/lib/db"
import { notificationTemplates } from "@/lib/db/schema"
import { eq } from "drizzle-orm"
import { requirePermission, PERMISSIONS } from "@/lib/auth/rbac"

export async function PUT(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const session = await auth()
    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const { authorized, error } = await requirePermission(PERMISSIONS.NOTIFICATIONS_MANAGE)
    if (!authorized) return NextResponse.json({ error }, { status: 403 })

    const existing = await db.query.notificationTemplates.findFirst({
      where: eq(notificationTemplates.id, params.id),
    })
    if (!existing) {
      return NextResponse.json({ error: "Template not found" }, { status: 404 })
    }

    const body = await request.json()
    const { name, channel, eventType, subject, bodyText, isActive } = body

    const [updated] = await db
      .update(notificationTemplates)
      .set({
        ...(name !== undefined && { name }),
        ...(channel !== undefined && { channel }),
        ...(eventType !== undefined && { eventType }),
        ...(subject !== undefined && { subject }),
        ...(bodyText !== undefined && { body: bodyText }),
        ...(isActive !== undefined && { isActive }),
        updatedAt: new Date(),
      })
      .where(eq(notificationTemplates.id, params.id))
      .returning()

    return NextResponse.json({ success: true, data: updated })
  } catch (error) {
    console.error("Update notification template error:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const session = await auth()
    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const { authorized, error } = await requirePermission(PERMISSIONS.NOTIFICATIONS_MANAGE)
    if (!authorized) return NextResponse.json({ error }, { status: 403 })

    // Soft delete – set is_active = false
    const [updated] = await db
      .update(notificationTemplates)
      .set({ isActive: false, updatedAt: new Date() })
      .where(eq(notificationTemplates.id, params.id))
      .returning()

    if (!updated) {
      return NextResponse.json({ error: "Template not found" }, { status: 404 })
    }

    return NextResponse.json({ success: true, data: updated })
  } catch (error) {
    console.error("Delete notification template error:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
