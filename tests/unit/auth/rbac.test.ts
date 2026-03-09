import { describe, it, expect } from "vitest"
import {
  hasPermission,
  checkPermissions,
  ROLE_PERMISSIONS,
  type UserRole,
} from "@/core/auth"

// ─── hasPermission ────────────────────────────────────────────────────────────

describe("hasPermission", () => {
  describe("super_admin", () => {
    it("grants every permission via wildcard *", () => {
      expect(hasPermission("super_admin", "properties:read")).toBe(true)
      expect(hasPermission("super_admin", "users:delete")).toBe(true)
      expect(hasPermission("super_admin", "anything:whatsoever")).toBe(true)
    })
  })

  describe("organization_admin", () => {
    it("grants permissions explicitly listed for their role", () => {
      expect(hasPermission("organization_admin", "properties:read")).toBe(true)
      expect(hasPermission("organization_admin", "tenants:create")).toBe(true)
      expect(hasPermission("organization_admin", "settings:edit")).toBe(true)
    })

    it("grants via resource wildcard (properties:*)", () => {
      // organization_admin has "properties:*" so all sub-actions should pass
      expect(hasPermission("organization_admin", "properties:read")).toBe(true)
      expect(hasPermission("organization_admin", "properties:delete")).toBe(true)
    })
  })

  describe("property_manager", () => {
    it("grants read/update on properties", () => {
      expect(hasPermission("property_manager", "properties:read")).toBe(true)
      expect(hasPermission("property_manager", "properties:update")).toBe(true)
    })

    it("grants all tenant permissions (tenants:*)", () => {
      expect(hasPermission("property_manager", "tenants:read")).toBe(true)
      expect(hasPermission("property_manager", "tenants:create")).toBe(true)
      expect(hasPermission("property_manager", "tenants:delete")).toBe(true)
    })

    it("does NOT grant finance-only permissions", () => {
      expect(hasPermission("property_manager", "invoices:create")).toBe(false)
    })
  })

  describe("finance_manager", () => {
    it("grants invoices and payments wildcard", () => {
      expect(hasPermission("finance_manager", "invoices:read")).toBe(true)
      expect(hasPermission("finance_manager", "invoices:create")).toBe(true)
      expect(hasPermission("finance_manager", "payments:read")).toBe(true)
    })

    it("does NOT grant properties:create", () => {
      expect(hasPermission("finance_manager", "properties:create")).toBe(false)
    })
  })

  describe("maintenance_manager", () => {
    it("grants work orders and vendors", () => {
      expect(hasPermission("maintenance_manager", "work_orders:read")).toBe(true)
      expect(hasPermission("maintenance_manager", "vendors:create")).toBe(true)
      expect(hasPermission("maintenance_manager", "equipment:read")).toBe(true)
    })

    it("does NOT grant invoices:create", () => {
      expect(hasPermission("maintenance_manager", "invoices:create")).toBe(false)
    })
  })

  describe("tenant", () => {
    it("grants tenant-specific permissions", () => {
      expect(hasPermission("tenant", "profile:read")).toBe(true)
      expect(hasPermission("tenant", "invoices:read:own")).toBe(true)
      expect(hasPermission("tenant", "work_orders:create")).toBe(true)
    })

    it("does NOT grant admin permissions", () => {
      expect(hasPermission("tenant", "properties:read")).toBe(false)
      expect(hasPermission("tenant", "tenants:create")).toBe(false)
    })
  })

  describe("viewer", () => {
    it("grants read-only access to core resources", () => {
      expect(hasPermission("viewer", "properties:read")).toBe(true)
      expect(hasPermission("viewer", "tenants:read")).toBe(true)
      expect(hasPermission("viewer", "leases:read")).toBe(true)
    })

    it("does NOT grant create/update/delete", () => {
      expect(hasPermission("viewer", "tenants:create")).toBe(false)
      expect(hasPermission("viewer", "properties:delete")).toBe(false)
      expect(hasPermission("viewer", "invoices:create")).toBe(false)
    })
  })

  describe("edge cases", () => {
    it("returns false for unknown role", () => {
      expect(hasPermission("unknown_role" as UserRole, "properties:read")).toBe(false)
    })

    it("does not match partial prefix (tenants: should not grant tenants2:read)", () => {
      // "tenants:*" should not grant "tenants2:read"
      expect(hasPermission("organization_admin", "tenants2:read")).toBe(false)
    })
  })
})

// ─── checkPermissions ─────────────────────────────────────────────────────────

describe("checkPermissions", () => {
  it("returns true when all required permissions are granted", () => {
    expect(
      checkPermissions("organization_admin", ["properties:read", "tenants:create"])
    ).toBe(true)
  })

  it("returns false when at least one required permission is missing", () => {
    // viewer cannot create tenants
    expect(
      checkPermissions("viewer", ["properties:read", "tenants:create"])
    ).toBe(false)
  })

  it("returns true for an empty permissions array (vacuous truth)", () => {
    expect(checkPermissions("viewer", [])).toBe(true)
  })

  it("returns true for super_admin with any set of permissions", () => {
    expect(
      checkPermissions("super_admin", [
        "properties:delete",
        "users:manage",
        "anything:goes",
      ])
    ).toBe(true)
  })
})

// ─── ROLE_PERMISSIONS shape ───────────────────────────────────────────────────

describe("ROLE_PERMISSIONS", () => {
  const roles: UserRole[] = [
    "super_admin",
    "organization_admin",
    "property_manager",
    "finance_manager",
    "maintenance_manager",
    "leasing_manager",
    "tenant",
    "viewer",
  ]

  it.each(roles)("has a permissions array for %s", (role) => {
    expect(Array.isArray(ROLE_PERMISSIONS[role])).toBe(true)
    expect(ROLE_PERMISSIONS[role].length).toBeGreaterThan(0)
  })

  it("super_admin permissions contain the wildcard *", () => {
    expect(ROLE_PERMISSIONS.super_admin).toContain("*")
  })
})
