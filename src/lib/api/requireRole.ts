import { NextResponse } from "next/server"
import { requirePermission, type Permission } from "@/lib/auth/rbac"

/**
 * Reusable permission guard for API routes.
 * Returns a 403 response if the user lacks the permission.
 */
export async function requireRole(permission: Permission) {
  const { authorized, error } = await requirePermission(permission)
  if (!authorized) {
    return NextResponse.json(
      { error: error || "Forbidden: insufficient permissions" },
      { status: 403 }
    )
  }
  return null
}
