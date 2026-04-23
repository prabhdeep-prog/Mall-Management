import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { db } from "@/lib/db"
import { notificationTemplates } from "@/lib/db/schema"
import { eq, and, desc } from "drizzle-orm"
import { requirePermission, PERMISSIONS } from "@/lib/auth/rbac"
import { CHANNELS, EVENT_TYPES } from "@/lib/notifications/variables"

export async function GET(request: NextRequest) {
  try {
    const session = await auth()
    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const { authorized, error } = await requirePermission(PERMISSIONS.NOTIFICATIONS_MANAGE)
    if (!authorized) return NextResponse.json({ error }, { status: 403 })

    const { searchParams } = new URL(request.url)
    const eventType = searchParams.get("eventType")
    const channel = searchParams.get("channel")

    const conditions = []
    if (eventType) conditions.push(eq(notificationTemplates.eventType, eventType))
    if (channel) conditions.push(eq(notificationTemplates.channel, channel))

    const templates = await db
      .select()
      .from(notificationTemplates)
      .where(conditions.length > 0 ? and(...conditions) : undefined)
      .orderBy(desc(notificationTemplates.createdAt))

    return NextResponse.json({ success: true, data: templates })
  } catch (error) {
    console.error("Get notification templates error:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const session = await auth()
    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const { authorized, error } = await requirePermission(PERMISSIONS.NOTIFICATIONS_MANAGE)
    if (!authorized) return NextResponse.json({ error }, { status: 403 })

    const body = await request.json()
    const { name, channel, eventType, subject, bodyText } = body

    if (!name || !channel || !eventType || !bodyText) {
      return NextResponse.json(
        { error: "Missing required fields: name, channel, eventType, bodyText" },
        { status: 400 }
      )
    }

    if (!CHANNELS.includes(channel)) {
      return NextResponse.json(
        { error: `Invalid channel. Must be one of: ${CHANNELS.join(", ")}` },
        { status: 400 }
      )
    }

    if (!EVENT_TYPES.includes(eventType)) {
      return NextResponse.json(
        { error: `Invalid event type. Must be one of: ${EVENT_TYPES.join(", ")}` },
        { status: 400 }
      )
    }

    if (channel === "email" && !subject) {
      return NextResponse.json(
        { error: "Subject is required for email templates" },
        { status: 400 }
      )
    }

    const [template] = await db
      .insert(notificationTemplates)
      .values({
        organizationId: session.user.organizationId!,
        name,
        channel,
        eventType,
        subject: subject || null,
        body: bodyText,
        createdBy: session.user.id,
      })
      .returning()

    return NextResponse.json({ success: true, data: template }, { status: 201 })
  } catch (error) {
    console.error("Create notification template error:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
