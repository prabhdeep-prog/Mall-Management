import { NextRequest, NextResponse } from "next/server"
import { requireTenantSession } from "@/lib/auth/tenant-session"
import { serviceDb } from "@/lib/db"
import { tenantUsers } from "@/lib/db/schema"
import { eq } from "drizzle-orm"
import { sql } from "drizzle-orm"
import bcrypt from "bcryptjs"

export async function POST(req: NextRequest) {
  let ctx
  try {
    ctx = await requireTenantSession()
  } catch (res) {
    return res as Response
  }

  const { userId } = ctx

  try {
    const { currentPassword, newPassword } = await req.json()

    if (!currentPassword || !newPassword) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 })
    }

    if (newPassword.length < 8) {
      return NextResponse.json(
        { error: "New password must be at least 8 characters" },
        { status: 400 },
      )
    }

    // Fetch current hash via SECURITY DEFINER function to avoid RLS issues
    const result = await serviceDb.execute<{ password_hash: string }>(
      sql`SELECT password_hash FROM tenant_users WHERE id = ${userId}::uuid LIMIT 1`,
    )
    // postgres-js returns a direct array; older drivers use result.rows
    const row = ((result as unknown as { rows?: unknown[] }).rows ?? result as unknown[])[0] as { password_hash: string } | undefined

    if (!row?.password_hash) {
      return NextResponse.json({ error: "User not found" }, { status: 404 })
    }

    const isValid = await bcrypt.compare(currentPassword, row.password_hash)
    if (!isValid) {
      return NextResponse.json({ error: "Current password is incorrect" }, { status: 400 })
    }

    const newHash = await bcrypt.hash(newPassword, 12)
    await serviceDb
      .update(tenantUsers)
      .set({ passwordHash: newHash })
      .where(eq(tenantUsers.id, userId))

    return NextResponse.json({ success: true })
  } catch (err) {
    console.error("Tenant password change error:", err)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
