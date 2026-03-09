import type { UserRole } from "@/core/auth"

export interface TestUser {
  id: string
  email: string
  name: string
  role: UserRole
  organizationId: string
}

export const TEST_ORG_ID = "00000000-0000-0000-0000-000000000001"
export const TEST_PROPERTY_ID = "00000000-0000-0000-0000-000000000010"

export const testUsers: Record<UserRole, TestUser> = {
  super_admin: {
    id: "00000000-0000-0000-0001-000000000001",
    email: "super@test.com",
    name: "Super Admin",
    role: "super_admin",
    organizationId: TEST_ORG_ID,
  },
  organization_admin: {
    id: "00000000-0000-0000-0002-000000000001",
    email: "orgadmin@test.com",
    name: "Org Admin",
    role: "organization_admin",
    organizationId: TEST_ORG_ID,
  },
  property_manager: {
    id: "00000000-0000-0000-0003-000000000001",
    email: "pm@test.com",
    name: "Property Manager",
    role: "property_manager",
    organizationId: TEST_ORG_ID,
  },
  finance_manager: {
    id: "00000000-0000-0000-0004-000000000001",
    email: "finance@test.com",
    name: "Finance Manager",
    role: "finance_manager",
    organizationId: TEST_ORG_ID,
  },
  maintenance_manager: {
    id: "00000000-0000-0000-0005-000000000001",
    email: "maintenance@test.com",
    name: "Maintenance Manager",
    role: "maintenance_manager",
    organizationId: TEST_ORG_ID,
  },
  leasing_manager: {
    id: "00000000-0000-0000-0006-000000000001",
    email: "leasing@test.com",
    name: "Leasing Manager",
    role: "leasing_manager",
    organizationId: TEST_ORG_ID,
  },
  tenant: {
    id: "00000000-0000-0000-0007-000000000001",
    email: "tenant@test.com",
    name: "Tenant User",
    role: "tenant",
    organizationId: TEST_ORG_ID,
  },
  viewer: {
    id: "00000000-0000-0000-0008-000000000001",
    email: "viewer@test.com",
    name: "Viewer",
    role: "viewer",
    organizationId: TEST_ORG_ID,
  },
}
