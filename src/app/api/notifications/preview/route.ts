import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { db } from "@/lib/db"
import { notificationTemplates } from "@/lib/db/schema"
import { eq } from "drizzle-orm"
import { requirePermission, PERMISSIONS } from "@/lib/auth/rbac"
import { renderTemplate } from "@/lib/notifications/render"
import { SAMPLE_DATA, type EventType } from "@/lib/notifications/variables"

export async function POST(request: NextRequest) {
  try {
    const session = await auth()
    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const { authorized, error } = await requirePermission(PERMISSIONS.NOTIFICATIONS_MANAGE)
    if (!authorized) return NextResponse.json({ error }, { status: 403 })

    const body = await request.json()
    const { templateId, sampleData } = body

    if (!templateId) {
      return NextResponse.json({ error: "Missing templateId" }, { status: 400 })
    }

    const template = await db.query.notificationTemplates.findFirst({
      where: eq(notificationTemplates.id, templateId),
    })

    if (!template) {
      return NextResponse.json({ error: "Template not found" }, { status: 404 })
    }

    // Merge sample data with defaults for the event type
    const data = {
      ...SAMPLE_DATA[template.eventType as EventType],
      ...sampleData,
    }

    const renderedBody = renderTemplate(template.body, data)
    const renderedSubject = template.subject
      ? renderTemplate(template.subject, data)
      : null

    return NextResponse.json({
      success: true,
      data: {
        subject: renderedSubject,
        body: renderedBody,
        channel: template.channel,
      },
    })
  } catch (error) {
    console.error("Preview notification error:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
