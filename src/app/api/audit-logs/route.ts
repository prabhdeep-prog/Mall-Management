import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { db } from "@/lib/db"
import { auditLogs } from "@/lib/db/schema"
import { eq, and, desc, gte, lte, like, SQL } from "drizzle-orm"
import { requirePermission, PERMISSIONS } from "@/lib/auth/rbac"

export async function GET(request: NextRequest) {
  try {
    const session = await auth()
    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const { authorized, error: permError } = await requirePermission(PERMISSIONS.INVOICES_VIEW)
    if (!authorized) return NextResponse.json({ error: permError }, { status: 403 })

    const sp = request.nextUrl.searchParams
    const entityType = sp.get("entityType")   // e.g. "invoice"
    const entityId   = sp.get("entityId")     // specific record id
    const action     = sp.get("action")       // e.g. "invoice.update"
    const userId     = sp.get("userId")
    const from       = sp.get("from")         // ISO date
    const to         = sp.get("to")           // ISO date
    const page       = Math.max(1, parseInt(sp.get("page") ?? "1"))
    const limit      = Math.min(100, Math.max(1, parseInt(sp.get("limit") ?? "50")))
    const offset     = (page - 1) * limit

    // Always scope to the caller's org (tenant isolation)
    const orgId = session.user.organizationId
    if (!orgId) {
      return NextResponse.json({ error: "Organization context required" }, { status: 403 })
    }

    // Build WHERE conditions
    const conditions: SQL[] = [eq(auditLogs.organizationId, orgId)]

    if (entityType) conditions.push(eq(auditLogs.entity,   entityType))
    if (entityId)   conditions.push(eq(auditLogs.entityId, entityId))
    if (action)     conditions.push(eq(auditLogs.action,   action))
    if (userId)     conditions.push(eq(auditLogs.userId,   userId))
    if (from)       conditions.push(gte(auditLogs.createdAt, new Date(from)))
    if (to) {
      const toDate = new Date(to); toDate.setHours(23, 59, 59, 999)
      conditions.push(lte(auditLogs.createdAt, toDate))
    }

    const where = and(...conditions)

    // Count total for pagination
    const allRows = await db
      .select({ id: auditLogs.id })
      .from(auditLogs)
      .where(where)

    const total = allRows.length

    // Fetch page
    const rows = await db
      .select()
      .from(auditLogs)
      .where(where)
      .orderBy(desc(auditLogs.createdAt))
      .limit(limit)
      .offset(offset)

    return NextResponse.json({
      success: true,
      data: {
        logs: rows,
        pagination: {
          page,
          limit,
          total,
          totalPages: Math.ceil(total / limit),
        },
      },
    })
  } catch (error) {
    console.error("Audit logs fetch error:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
