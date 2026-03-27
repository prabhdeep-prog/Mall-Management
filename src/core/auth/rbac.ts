// Server-only RBAC functions
// This file imports server-only modules and should NOT be imported in client components

import { auth } from "@/lib/auth"
import { db } from "@/lib/db"
import { roles } from "@/lib/db/schema"
import { eq } from "drizzle-orm"

// Re-export client-safe constants for backward compatibility in server components
export { PERMISSIONS, ROLE_PERMISSIONS, type Permission } from "./permissions"
import { PERMISSIONS, ROLE_PERMISSIONS, Permission } from "./permissions"
import { isDevBypassEnabled } from "./config"
export { isDevBypassEnabled } from "./config"


// Get permissions for a role (from DB or defaults)
export async function getRolePermissions(roleName: string): Promise<Permission[]> {
  // First check default permissions
  if (ROLE_PERMISSIONS[roleName]) {
    return ROLE_PERMISSIONS[roleName]
  }

  // Then check database
  try {
    const role = await db.query.roles.findFirst({
      where: eq(roles.name, roleName),
    })

    if (role && role.permissions) {
      return role.permissions as Permission[]
    }
  } catch (error) {
    console.error("Error fetching role permissions:", error)
  }

  // Default to viewer permissions
  return ROLE_PERMISSIONS.viewer
}

// Check if user has a specific permission
export async function hasPermission(permission: Permission): Promise<boolean> {
  const session = await auth()

  if (!session?.user) {
    if (isDevBypassEnabled()) {
      console.warn(`[DEV] No session — bypassing permission check: ${permission}`)
      return true
    }
    return false
  }

  if (!session.user.role) {
    if (isDevBypassEnabled()) {
      console.warn(`[DEV] No role on session — bypassing permission check: ${permission}`)
      return true
    }
    return false
  }

  const userRole = session.user.role || "viewer"
  const permissions = await getRolePermissions(userRole)

  return permissions.includes(permission)
}

// Check if user has any of the specified permissions
export async function hasAnyPermission(permissions: Permission[]): Promise<boolean> {
  const session = await auth()

  if (!session?.user) {
    if (isDevBypassEnabled()) {
      console.warn(`[DEV] No session — bypassing hasAnyPermission check: ${permissions.join(", ")}`)
      return true
    }
    return false
  }

  const userRole = session.user.role || "viewer"
  const rolePermissions = await getRolePermissions(userRole)

  return permissions.some(p => rolePermissions.includes(p))
}

// Check if user has all of the specified permissions
export async function hasAllPermissions(permissions: Permission[]): Promise<boolean> {
  const session = await auth()

  if (!session?.user) {
    if (isDevBypassEnabled()) {
      console.warn(`[DEV] No session — bypassing hasAllPermissions check: ${permissions.join(", ")}`)
      return true
    }
    return false
  }

  const userRole = session.user.role || "viewer"
  const rolePermissions = await getRolePermissions(userRole)

  return permissions.every(p => rolePermissions.includes(p))
}

// Middleware helper for API routes
export async function requirePermission(permission: Permission): Promise<{ authorized: boolean; error?: string }> {
  const session = await auth()

  if (!session?.user) {
    if (isDevBypassEnabled()) {
      console.warn(`[DEV] Bypassing requirePermission (no session): ${permission}`)
      return { authorized: true }
    }
    return { authorized: false, error: "Unauthorized" }
  }

  if (!session.user.role) {
    if (isDevBypassEnabled()) {
      console.warn(`[DEV] Bypassing requirePermission (no role): ${permission}`)
      return { authorized: true }
    }
    return { authorized: false, error: "Unauthorized: no role assigned" }
  }

  const hasAccess = await hasPermission(permission)

  if (!hasAccess) {
    return { authorized: false, error: "Forbidden: Insufficient permissions" }
  }

  return { authorized: true }
}

// Get all permissions for current user
export async function getCurrentUserPermissions(): Promise<Permission[]> {
  const session = await auth()

  if (!session?.user) {
    if (isDevBypassEnabled()) {
      console.warn(`[DEV] No session — returning ALL permissions for bypass`)
      return Object.values(PERMISSIONS)
    }
    return []
  }

  const userRole = session.user.role || "viewer"
  return getRolePermissions(userRole)
}

// Check access to specific resource (with organization context)
export async function canAccessResource(
  resourceType: "property" | "tenant" | "invoice" | "work_order",
  resourceOrgId?: string
): Promise<boolean> {
  const session = await auth()

  if (!session?.user) {
    if (isDevBypassEnabled()) {
      console.warn(`[DEV] No session — bypassing canAccessResource check: ${resourceType}`)
      return true
    }
    return false
  }

  // Super admins can access everything
  if (session.user.role === "super_admin") {
    return true
  }

  // Check organization match
  if (resourceOrgId && resourceOrgId !== session.user.organizationId) {
    return false
  }

  // Check basic view permission
  const viewPermission = `${resourceType}s:view` as Permission
  return hasPermission(viewPermission)
}

