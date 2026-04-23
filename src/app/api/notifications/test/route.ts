import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { db } from "@/lib/db"
import { notificationTemplates } from "@/lib/db/schema"
import { eq } from "drizzle-orm"
import { requirePermission, PERMISSIONS } from "@/lib/auth/rbac"
import { renderTemplate } from "@/lib/notifications/render"
import { sendEmail } from "@/lib/notifications/email"
import { sendWhatsApp } from "@/lib/notifications/whatsapp"
import { sendSMS } from "@/lib/notifications/sms"
import { SAMPLE_DATA, type EventType, type Channel } from "@/lib/notifications/variables"

export async function POST(request: NextRequest) {
  try {
    const session = await auth()
    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const { authorized, error } = await requirePermission(PERMISSIONS.NOTIFICATIONS_MANAGE)
    if (!authorized) return NextResponse.json({ error }, { status: 403 })

    const body = await request.json()
    const { templateId } = body

    if (!templateId) {
      return NextResponse.json({ error: "Missing templateId" }, { status: 400 })
    }

    const template = await db.query.notificationTemplates.findFirst({
      where: eq(notificationTemplates.id, templateId),
    })

    if (!template) {
      return NextResponse.json({ error: "Template not found" }, { status: 404 })
    }

    const data = SAMPLE_DATA[template.eventType as EventType] || {}
    const renderedBody = renderTemplate(template.body, data)
    const renderedSubject = template.subject
      ? renderTemplate(template.subject, data)
      : "Test Notification"

    let result: { success: boolean; messageId?: string; error?: string }

    switch (template.channel as Channel) {
      case "email": {
        const userEmail = session.user.email
        if (!userEmail) {
          return NextResponse.json({ error: "No email on your account" }, { status: 400 })
        }
        result = await sendEmail(userEmail, `[TEST] ${renderedSubject}`, renderedBody)
        break
      }
      case "whatsapp":
        result = await sendWhatsApp("test-user", renderedBody)
        break
      case "sms":
        result = await sendSMS("test-user", renderedBody)
        break
      default:
        return NextResponse.json({ error: "Unknown channel" }, { status: 400 })
    }

    return NextResponse.json({
      success: true,
      data: {
        channel: template.channel,
        sent: result.success,
        messageId: result.messageId,
        error: result.error,
      },
    })
  } catch (error) {
    console.error("Test notification error:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
