import { NextResponse } from "next/server"
import { requireTenantSession } from "@/lib/auth/tenant-session"
import { serviceDb } from "@/lib/db"
import { notifications } from "@/lib/db/schema"
import { eq, and, isNull, sql } from "drizzle-orm"

/**
 * GET /api/tenant/notifications/count
 * Returns unread notification count for the authenticated tenant.
 */
export async function GET() {
  let ctx
  try {
    ctx = await requireTenantSession()
  } catch (res) {
    return res as Response
  }

  try {
    const [result] = await serviceDb
      .select({ count: sql<number>`count(*)::int` })
      .from(notifications)
      .where(
        and(
          eq(notifications.recipientId, ctx.tenantId),
          eq(notifications.recipientType, "tenant"),
          isNull(notifications.readAt),
        ),
      )

    return NextResponse.json({ unread: result?.count ?? 0 })
  } catch (err) {
    console.error("Tenant notification count error:", err)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
