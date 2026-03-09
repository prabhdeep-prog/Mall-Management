import { describe, it, expect } from "vitest"
import { PERMISSIONS, ROLE_PERMISSIONS, type Permission } from "@/lib/auth/permissions"

describe("PERMISSIONS constants", () => {
  it("follows the resource:action naming convention", () => {
    const values = Object.values(PERMISSIONS)
    for (const perm of values) {
      expect(perm).toMatch(/^[a-z_]+:[a-z_]+$/)
    }
  })

  it("has unique permission values", () => {
    const values = Object.values(PERMISSIONS)
    const unique = new Set(values)
    expect(unique.size).toBe(values.length)
  })

  it("covers core resources", () => {
    const values = Object.values(PERMISSIONS)
    const resources = new Set(values.map((p) => p.split(":")[0]))
    expect(resources).toContain("properties")
    expect(resources).toContain("tenants")
    expect(resources).toContain("leases")
    expect(resources).toContain("invoices")
    expect(resources).toContain("work_orders")
  })
})

describe("ROLE_PERMISSIONS", () => {
  const knownRoles = [
    "super_admin",
    "organization_admin",
    "property_manager",
    "maintenance_staff",
    "tenant_user",
    "viewer",
  ]

  it.each(knownRoles)("has permissions for %s", (role) => {
    expect(Array.isArray(ROLE_PERMISSIONS[role])).toBe(true)
    expect(ROLE_PERMISSIONS[role].length).toBeGreaterThan(0)
  })

  it("super_admin has all defined permissions", () => {
    const allPerms = Object.values(PERMISSIONS) as Permission[]
    const superAdminPerms = ROLE_PERMISSIONS["super_admin"]
    for (const perm of allPerms) {
      expect(superAdminPerms).toContain(perm)
    }
  })

  it("all role permissions are valid PERMISSIONS values", () => {
    const validPerms = new Set(Object.values(PERMISSIONS))
    for (const [role, perms] of Object.entries(ROLE_PERMISSIONS)) {
      for (const perm of perms) {
        expect(validPerms.has(perm as Permission), `${role} has invalid permission: ${perm}`).toBe(true)
      }
    }
  })

  it("viewer has fewer permissions than organization_admin", () => {
    expect(ROLE_PERMISSIONS["viewer"].length).toBeLessThan(
      ROLE_PERMISSIONS["organization_admin"].length
    )
  })

  it("maintenance_staff has work_orders and equipment permissions", () => {
    const perms = ROLE_PERMISSIONS["maintenance_staff"]
    expect(perms).toContain(PERMISSIONS.WORK_ORDERS_VIEW)
    expect(perms).toContain(PERMISSIONS.EQUIPMENT_VIEW)
  })

  it("tenant_user cannot view tenants (own isolation)", () => {
    const perms = ROLE_PERMISSIONS["tenant_user"]
    expect(perms).not.toContain(PERMISSIONS.TENANTS_VIEW)
  })
})
