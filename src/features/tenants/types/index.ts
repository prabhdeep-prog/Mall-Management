/**
 * Tenant Feature Types
 * All types related to tenant management and operations.
 */

/**
 * Tenant Filter Parameters
 */
export interface TenantFilterParams {
  propertyId?: string
  status?: string
  category?: string
  search?: string
  page?: number
  limit?: number
}

/**
 * Tenant Lease Information
 */
export interface TenantLease {
  id: string
  unitNumber: string
  floor?: number
  areaSqft: number
  baseRent: number
  startDate: Date | string
  endDate: Date | string
  status: string
}

/**
 * Tenant Entity
 */
export interface Tenant {
  id: string
  propertyId: string
  businessName: string
  legalEntityName?: string
  category?: string
  subcategory?: string
  contactPerson?: string
  email?: string
  phone?: string
  alternatePhone?: string
  gstin?: string
  pan?: string
  tradeLicense?: string
  status: string
  sentimentScore?: number
  riskScore?: number
  satisfactionScore?: number
  lease?: TenantLease | null
  createdAt: Date
  updatedAt: Date
}

/**
 * Tenant with Lease Details
 */
export interface TenantWithLease extends Tenant {
  lease: TenantLease | null
}

/**
 * Tenant Creation Request
 */
export interface CreateTenantRequest {
  propertyId: string
  businessName: string
  legalEntityName?: string
  category?: string
  subcategory?: string
  contactPerson?: string
  email?: string
  phone?: string
  gstin?: string
}

/**
 * Tenant Update Request
 */
export interface UpdateTenantRequest {
  businessName?: string
  legalEntityName?: string
  category?: string
  subcategory?: string
  contactPerson?: string
  email?: string
  phone?: string
  gstin?: string
  status?: string
}

/**
 * Tenant Statistics
 */
export interface TenantStats {
  total: number
  active: number
  inactive: number
  suspended: number
  byCategory: Record<string, number>
}

/**
 * Tenant Risk Assessment
 */
export interface TenantRiskAssessment {
  tenantId: string
  riskScore: number
  riskLevel: "low" | "medium" | "high" | "critical"
  factors: string[]
  recommendations: string[]
}

/**
 * Tenant Sentiment Analysis
 */
export interface TenantSentiment {
  tenantId: string
  sentimentScore: number
  sentiment: "positive" | "neutral" | "negative"
  lastUpdated: Date
}
