import NextAuth from "next-auth"
import { authConfig } from "./config"

export const { handlers, auth, signIn, signOut } = NextAuth(authConfig)

export type UserRole = 
  | "super_admin"
  | "organization_admin"
  | "property_manager"
  | "finance_manager"
  | "maintenance_manager"
  | "leasing_manager"
  | "tenant"
  | "viewer"

export const ROLE_PERMISSIONS: Record<UserRole, string[]> = {
  super_admin: ["*"],
  organization_admin: [
    "properties:*",
    "tenants:*",
    "leases:*",
    "invoices:*",
    "payments:*",
    "work_orders:*",
    "agents:*",
    "users:manage",
    "reports:*",
    "settings:*",
  ],
  property_manager: [
    "properties:read",
    "properties:update",
    "tenants:*",
    "leases:*",
    "invoices:read",
    "work_orders:*",
    "agents:view",
    "agents:approve",
    "reports:read",
  ],
  finance_manager: [
    "properties:read",
    "tenants:read",
    "leases:read",
    "invoices:*",
    "payments:*",
    "expenses:*",
    "reports:financial",
    "agents:view",
  ],
  maintenance_manager: [
    "properties:read",
    "tenants:read",
    "work_orders:*",
    "vendors:*",
    "equipment:*",
    "agents:view",
    "agents:approve:maintenance",
  ],
  leasing_manager: [
    "properties:read",
    "tenants:*",
    "leases:*",
    "invoices:read",
    "agents:view",
    "agents:approve:leasing",
  ],
  tenant: [
    "profile:read",
    "profile:update",
    "invoices:read:own",
    "payments:read:own",
    "work_orders:create",
    "work_orders:read:own",
    "chat:tenant_relations",
  ],
  viewer: [
    "properties:read",
    "tenants:read",
    "leases:read",
    "invoices:read",
    "work_orders:read",
    "reports:read",
  ],
}

export function hasPermission(role: UserRole, permission: string): boolean {
  const permissions = ROLE_PERMISSIONS[role]
  
  if (!permissions) return false
  if (permissions.includes("*")) return true
  if (permissions.includes(permission)) return true
  
  // Check wildcard permissions (e.g., "properties:*" matches "properties:read")
  const [resource, action] = permission.split(":")
  if (permissions.includes(`${resource}:*`)) return true
  
  return false
}

export function checkPermissions(role: UserRole, requiredPermissions: string[]): boolean {
  return requiredPermissions.every(permission => hasPermission(role, permission))
}

