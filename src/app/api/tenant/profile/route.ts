import { NextRequest, NextResponse } from "next/server"
import { requireTenantSession } from "@/lib/auth/tenant-session"
import { serviceDb } from "@/lib/db"
import { tenantUsers, tenants } from "@/lib/db/schema"
import { eq } from "drizzle-orm"

export async function GET() {
  let ctx
  try {
    ctx = await requireTenantSession()
  } catch (res) {
    return res as Response
  }

  const { tenantId, userId } = ctx

  try {
    const [row] = await serviceDb
      .select({
        name:          tenantUsers.name,
        email:         tenantUsers.email,
        businessName:  tenants.businessName,
        contactPerson: tenants.contactPerson,
        gstin:         tenants.gstin,
        pan:           tenants.pan,
        phone:         tenants.phone,
      })
      .from(tenantUsers)
      .innerJoin(tenants, eq(tenantUsers.tenantId, tenants.id))
      .where(eq(tenantUsers.id, userId))
      .limit(1)

    if (!row) {
      return NextResponse.json({ error: "Not found" }, { status: 404 })
    }

    return NextResponse.json({ success: true, data: row })
  } catch (err) {
    console.error("Tenant profile GET error:", err)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}

export async function PATCH(req: NextRequest) {
  let ctx
  try {
    ctx = await requireTenantSession()
  } catch (res) {
    return res as Response
  }

  const { userId } = ctx

  try {
    const body = await req.json()
    const { name, phone } = body as { name?: string; phone?: string }

    const updates: Partial<typeof tenantUsers.$inferInsert> = {}
    if (name  !== undefined) updates.name  = name
    // phone lives on the tenants table — update separately if provided
    if (Object.keys(updates).length > 0) {
      await serviceDb.update(tenantUsers).set(updates).where(eq(tenantUsers.id, userId))
    }

    if (phone !== undefined) {
      const [tu] = await serviceDb
        .select({ tenantId: tenantUsers.tenantId })
        .from(tenantUsers)
        .where(eq(tenantUsers.id, userId))
        .limit(1)
      if (tu) {
        await serviceDb.update(tenants).set({ phone }).where(eq(tenants.id, tu.tenantId))
      }
    }

    return NextResponse.json({ success: true })
  } catch (err) {
    console.error("Tenant profile PATCH error:", err)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
