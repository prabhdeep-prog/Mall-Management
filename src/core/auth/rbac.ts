// Server-only RBAC functions
// This file imports server-only modules and should NOT be imported in client components

import { auth } from "@/lib/auth"
import { db } from "@/lib/db"
import { roles } from "@/lib/db/schema"
import { eq } from "drizzle-orm"

// Re-export client-safe constants for backward compatibility in server components
export { PERMISSIONS, ROLE_PERMISSIONS, type Permission } from "./permissions"
import { PERMISSIONS, ROLE_PERMISSIONS, Permission } from "./permissions"

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
  
  // Development mode bypass
  if (process.env.NODE_ENV === "development" && !session?.user) {
    return true
  }
  
  if (!session?.user) {
    return false
  }
  
  // In development, grant all permissions if role is missing
  if (process.env.NODE_ENV === "development" && !session.user.role) {
    return true
  }
  
  const userRole = session.user.role || "viewer"
  const permissions = await getRolePermissions(userRole)
  
  return permissions.includes(permission)
}

// Check if user has any of the specified permissions
export async function hasAnyPermission(permissions: Permission[]): Promise<boolean> {
  const session = await auth()
  
  if (!session?.user) {
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
    return false
  }
  
  const userRole = session.user.role || "viewer"
  const rolePermissions = await getRolePermissions(userRole)
  
  return permissions.every(p => rolePermissions.includes(p))
}

// Middleware helper for API routes
export async function requirePermission(permission: Permission): Promise<{ authorized: boolean; error?: string }> {
  const session = await auth()
  
  // Development mode bypass - allow all operations when no session
  // In production, this should be removed or properly secured
  if (process.env.NODE_ENV === "development" && !session?.user) {
    console.warn(`[DEV] Bypassing permission check for: ${permission}`)
    return { authorized: true }
  }
  
  if (!session?.user) {
    return { authorized: false, error: "Unauthorized" }
  }
  
  // In development, also allow if user role is missing (mock session)
  if (process.env.NODE_ENV === "development" && !session.user.role) {
    console.warn(`[DEV] User role missing, granting access for: ${permission}`)
    return { authorized: true }
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

