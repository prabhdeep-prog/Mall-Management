import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { serviceDb } from "@/lib/db"
import { sql } from "drizzle-orm"
import bcrypt from "bcryptjs"
import { PERMISSIONS, requirePermission } from "@/lib/auth/rbac"

// ── Helpers ───────────────────────────────────────────────────────────────────

function generatePassword(length = 12): string {
  const upper  = "ABCDEFGHJKLMNPQRSTUVWXYZ"
  const lower  = "abcdefghjkmnpqrstuvwxyz"
  const digits = "23456789"
  const special = "@#$%"
  const all = upper + lower + digits + special

  // Guarantee at least one of each class
  const chars = [
    upper[Math.floor(Math.random() * upper.length)],
    lower[Math.floor(Math.random() * lower.length)],
    digits[Math.floor(Math.random() * digits.length)],
    special[Math.floor(Math.random() * special.length)],
  ]
  for (let i = chars.length; i < length; i++) {
    chars.push(all[Math.floor(Math.random() * all.length)])
  }
  // shuffle
  return chars.sort(() => Math.random() - 0.5).join("")
}

// ── GET — check existing portal access ───────────────────────────────────────

export async function GET(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { authorized, error } = await requirePermission(PERMISSIONS.TENANTS_VIEW)
  if (!authorized) return NextResponse.json({ error }, { status: 403 })

  try {
    const rows = await serviceDb.execute<{
      id: string; email: string; name: string | null
      is_active: boolean; last_login_at: string | null; created_at: string
    }>(sql`
      SELECT id, email, name, is_active, last_login_at, created_at
      FROM tenant_users
      WHERE tenant_id = ${params.id}::uuid
      ORDER BY created_at DESC
      LIMIT 1
    `)

    const user = Array.isArray(rows) ? rows[0] : null
    return NextResponse.json({
      success: true,
      data: user
        ? {
            hasAccess:   true,
            email:       user.email,
            name:        user.name,
            isActive:    user.is_active,
            lastLoginAt: user.last_login_at,
            createdAt:   user.created_at,
          }
        : { hasAccess: false },
    })
  } catch (err) {
    console.error("Portal access check error:", err)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}

// ── POST — grant portal access ────────────────────────────────────────────────

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { authorized, error } = await requirePermission(PERMISSIONS.TENANTS_CREATE)
  if (!authorized) return NextResponse.json({ error }, { status: 403 })

  try {
    const body = await request.json()
    const { email, name, password: bodyPassword } = body

    if (!email) {
      return NextResponse.json({ error: "Email is required" }, { status: 400 })
    }

    // Verify tenant exists
    const tenantRows = await serviceDb.execute<{ id: string; business_name: string }>(sql`
      SELECT id, business_name FROM tenants WHERE id = ${params.id}::uuid LIMIT 1
    `)
    const tenant = Array.isArray(tenantRows) ? tenantRows[0] : null
    if (!tenant) {
      return NextResponse.json({ error: "Tenant not found" }, { status: 404 })
    }

    // Check for existing portal user with this email
    const existing = await serviceDb.execute<{ id: string; is_active: boolean }>(sql`
      SELECT id, is_active FROM tenant_users WHERE email = ${email} LIMIT 1
    `)
    const existingUser = Array.isArray(existing) ? existing[0] : null

    if (existingUser) {
      // Re-activate and reset password if previously deactivated, otherwise error
      if (existingUser.is_active) {
        return NextResponse.json(
          { error: "A portal account already exists for this email address" },
          { status: 409 }
        )
      }
      // Re-activate
      const newPassword = bodyPassword || generatePassword()
      const hash = await bcrypt.hash(newPassword, 12)
      await serviceDb.execute(sql`
        UPDATE tenant_users
        SET password_hash = ${hash}, is_active = true, name = ${name || null}
        WHERE id = ${existingUser.id}::uuid
      `)
      return NextResponse.json({
        success: true,
        data: {
          email,
          temporaryPassword: newPassword,
          loginUrl: `${process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000"}/portal/login`,
          message: "Portal access re-activated",
        },
      })
    }

    // Create new tenant_users record
    const temporaryPassword = bodyPassword || generatePassword()
    const passwordHash = await bcrypt.hash(temporaryPassword, 12)

    await serviceDb.execute(sql`
      INSERT INTO tenant_users (id, tenant_id, email, password_hash, name, is_active)
      VALUES (
        gen_random_uuid(),
        ${params.id}::uuid,
        ${email},
        ${passwordHash},
        ${name || null},
        true
      )
    `)

    const loginUrl = `${process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000"}/portal/login`

    return NextResponse.json({
      success: true,
      data: {
        email,
        temporaryPassword,
        loginUrl,
        message: "Portal access granted successfully",
      },
    }, { status: 201 })
  } catch (err: any) {
    console.error("Grant portal access error:", err)
    if (err?.code === "23505" || err?.message?.includes("unique")) {
      return NextResponse.json(
        { error: "A portal account already exists for this email address" },
        { status: 409 }
      )
    }
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}

// ── DELETE — revoke portal access ─────────────────────────────────────────────

export async function DELETE(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { authorized, error } = await requirePermission(PERMISSIONS.TENANTS_CREATE)
  if (!authorized) return NextResponse.json({ error }, { status: 403 })

  try {
    await serviceDb.execute(sql`
      UPDATE tenant_users SET is_active = false
      WHERE tenant_id = ${params.id}::uuid
    `)
    return NextResponse.json({ success: true, message: "Portal access revoked" })
  } catch (err) {
    console.error("Revoke portal access error:", err)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
