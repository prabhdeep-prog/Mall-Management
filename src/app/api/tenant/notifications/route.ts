import { NextResponse } from "next/server"
import { requireTenantSession } from "@/lib/auth/tenant-session"
import { serviceDb } from "@/lib/db"
import { notifications } from "@/lib/db/schema"
import { eq, and, desc } from "drizzle-orm"

/**
 * GET /api/tenant/notifications
 * List notifications for the authenticated tenant.
 */
export async function GET() {
  let ctx
  try {
    ctx = await requireTenantSession()
  } catch (res) {
    return res as Response
  }

  try {
    const rows = await serviceDb
      .select()
      .from(notifications)
      .where(
        and(
          eq(notifications.recipientId, ctx.tenantId),
          eq(notifications.recipientType, "tenant"),
        ),
      )
      .orderBy(desc(notifications.createdAt))
      .limit(50)

    return NextResponse.json({ success: true, data: rows })
  } catch (err) {
    console.error("Tenant notifications error:", err)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
