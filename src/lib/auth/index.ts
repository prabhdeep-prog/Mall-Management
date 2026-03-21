import NextAuth from "next-auth"
import { authConfig } from "./config"
import Credentials from "next-auth/providers/credentials"
import { z } from "zod"
import bcrypt from "bcryptjs"
import { sql } from "drizzle-orm"
import { serviceDb } from "@/lib/db"

export type UserRole = 
  | "super_admin"
  | "organization_admin"
  | "property_manager"
  | "finance_manager"
  | "maintenance_manager"
  | "leasing_manager"
  | "tenant"
  | "viewer"

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
})

// Looks up role name from the roles table
async function getRoleName(roleId: string | null): Promise<UserRole> {
  if (!roleId) return "viewer"
  const result = await serviceDb.execute<{ name: string; [key: string]: unknown }>(
    sql`SELECT name FROM roles WHERE id = ${roleId}::uuid LIMIT 1`
  )
  const name = result[0]?.name as UserRole | undefined
  return name ?? "viewer"
}

export const { handlers, auth, signIn, signOut } = NextAuth({
  ...authConfig,
  providers: [
    Credentials({
      name: "credentials",
      credentials: {
        email:    { label: "Email",    type: "email"    },
        password: { label: "Password", type: "password" },
      },
      async authorize(credentials) {
        const parsed = loginSchema.safeParse(credentials)
        if (!parsed.success) return null

        const { email, password } = parsed.data

        interface AuthRow {
          id: string
          email: string
          password_hash: string
          organization_id: string
          role_id: string | null
          status: string
          [key: string]: unknown
        }
        let user: AuthRow | undefined

        try {
          const result = await serviceDb.execute<AuthRow>(
            sql`SELECT * FROM find_user_for_auth(${email})`
          )
          user = result[0] as AuthRow | undefined
        } catch (err: unknown) {
          const msg = err instanceof Error ? err.message : String(err)
          if (msg.includes("find_user_for_auth") && msg.includes("does not exist")) {
            type FallbackRow = {
              id: string
              email: string
              password_hash: string
              organization_id: string | null
              role_id: string | null
              status: string
              [key: string]: unknown
            }
            const result = await serviceDb.execute<FallbackRow>(sql`
              SELECT id, email, password AS password_hash,
                     organization_id, role_id, status
              FROM   users
              WHERE  email = ${email}
              LIMIT  1
            `)
            const row = result[0] as FallbackRow | undefined
            if (row) {
              user = {
                id:              row.id,
                email:           row.email,
                password_hash:   row.password_hash ?? "",
                organization_id: row.organization_id ?? "",
                role_id:         row.role_id,
                status:          row.status,
              }
            }
          } else {
            throw err
          }
        }

        if (!user || !user.password_hash) return null

        const isValid = await bcrypt.compare(password, user.password_hash)
        if (!isValid) return null

        if (user.status === "suspended") return null

        const role = await getRoleName(user.role_id)

        return {
          id:             user.id,
          email:          user.email,
          name:           "",  
          role,
          organizationId: user.organization_id ?? "",
        }
      },
    }),
  ],
})

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

