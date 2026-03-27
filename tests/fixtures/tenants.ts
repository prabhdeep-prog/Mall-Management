import { TEST_ORG_ID, TEST_PROPERTY_ID } from "./users"

export const testTenant = {
  id: "00000000-0000-0000-0009-000000000001",
  propertyId: TEST_PROPERTY_ID,
  organizationId: TEST_ORG_ID,
  businessName: "Test Coffee Shop",
  legalEntityName: "Test Coffee Pvt Ltd",
  category: "F&B",
  subcategory: "Cafe",
  contactPerson: "John Doe",
  email: "coffee@testshop.com",
  phone: "+91-9876543210",
  gstin: "07AABCU9603R1ZX",
  status: "active" as const,
  createdAt: new Date("2024-01-15"),
  updatedAt: new Date("2024-01-15"),
}

export const testTenantWithLease = {
  ...testTenant,
  lease: {
    id: "00000000-0000-0000-0010-000000000001",
    unitNumber: "GF-101",
    floor: "Ground Floor",
    areaSqft: "1200",
    baseRent: "150000",
    startDate: "2024-01-01",
    endDate: "2025-12-31",
    status: "active",
  },
}

export const testTenantCreatePayload = {
  propertyId: TEST_PROPERTY_ID,
  businessName: "New Boutique",
  legalEntityName: "New Boutique Pvt Ltd",
  category: "Fashion",
  subcategory: "Women's Wear",
  contactPerson: "Jane Smith",
  email: "boutique@newshop.com",
  phone: "+91-9999999999",
  gstin: "07AABCU9603R1ZY",
}
