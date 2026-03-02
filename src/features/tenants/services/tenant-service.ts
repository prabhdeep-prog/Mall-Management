/**
 * Tenant Service
 * Handles all business logic related to tenant management.
 * This service layer abstracts database operations and provides a clean interface for API routes and other services.
 */

import { db } from "@/core/db"
import { tenants, leases } from "@/core/db/schema"
import { eq, desc, and } from "drizzle-orm"
import { getCachedOrFetch, invalidateEntityCache, CACHE_KEYS, CACHE_TTL } from "@/core/cache"
import { logger } from "@/core/logging"
import { NotFoundError, BadRequestError } from "@/core/errors"
import type { Tenant, TenantFilterParams, CreateTenantRequest, UpdateTenantRequest } from "@/features/tenants/types"

const moduleLogger = logger

/**
 * Retrieve tenants with optional filtering and caching
 */
export async function getTenants(
  filters: TenantFilterParams,
  refreshCache: boolean = false
): Promise<Tenant[]> {
  const { propertyId, status, category } = filters

  // Invalidate cache if refresh requested
  if (refreshCache && propertyId) {
    await invalidateEntityCache("tenant", propertyId, propertyId)
  }

  // Build cache key
  const cacheKey = propertyId
    ? CACHE_KEYS.TENANT_LIST(propertyId)
    : `tenants:list:all:${status || "all"}:${category || "all"}`

  // Fetch with caching
  const result = await getCachedOrFetch(
    cacheKey,
    async () => {
      moduleLogger.debug("Fetching tenants from database", { propertyId, status, category })

      const tenantsWithLeases = await db
        .select({
          tenant: tenants,
          activeLease: leases,
        })
        .from(tenants)
        .leftJoin(
          leases,
          and(
            eq(leases.tenantId, tenants.id),
            eq(leases.status, "active")
          )
        )
        .where(
          and(
            propertyId ? eq(tenants.propertyId, propertyId) : undefined,
            status ? eq(tenants.status, status) : undefined,
            category ? eq(tenants.category, category) : undefined
          )
        )
        .orderBy(desc(tenants.createdAt))

      // Deduplicate tenants (in case of multiple active leases)
      const seen = new Set<string>()
      const deduplicated: typeof tenantsWithLeases = []
      for (const row of tenantsWithLeases) {
        if (!seen.has(row.tenant.id)) {
          seen.add(row.tenant.id)
          deduplicated.push(row)
        }
      }

      // Transform and return
      return deduplicated.map(({ tenant, activeLease }) => ({
        ...tenant,
        lease: activeLease
          ? {
              id: activeLease.id,
              unitNumber: activeLease.unitNumber,
              floor: activeLease.floor,
              areaSqft: activeLease.areaSqft,
              baseRent: activeLease.baseRent,
              startDate: activeLease.startDate,
              endDate: activeLease.endDate,
              status: activeLease.status,
            }
          : null,
      }))
    },
    CACHE_TTL.MEDIUM // 5 minutes
  )

  return result as Tenant[]
}

/**
 * Retrieve a single tenant by ID
 */
export async function getTenantById(tenantId: string): Promise<Tenant> {
  moduleLogger.debug("Fetching tenant by ID", { tenantId })

  const tenant = await db.query.tenants.findFirst({
    where: eq(tenants.id, tenantId),
  })

  if (!tenant) {
    throw new NotFoundError(`Tenant with ID ${tenantId} not found`)
  }

  return tenant as Tenant
}

/**
 * Create a new tenant
 */
export async function createTenant(data: CreateTenantRequest): Promise<Tenant> {
  // Validate required fields
  if (!data.propertyId || !data.businessName) {
    throw new BadRequestError("Property ID and business name are required")
  }

  moduleLogger.info("Creating new tenant", { propertyId: data.propertyId, businessName: data.businessName })

  const tenantId = crypto.randomUUID()

  await db.insert(tenants).values({
    id: tenantId,
    propertyId: data.propertyId,
    businessName: data.businessName,
    legalEntityName: data.legalEntityName,
    category: data.category,
    subcategory: data.subcategory,
    contactPerson: data.contactPerson,
    email: data.email,
    phone: data.phone,
    gstin: data.gstin,
    status: "active",
  })

  // Invalidate cache
  await invalidateEntityCache("tenant", tenantId, data.propertyId)

  const newTenant = await getTenantById(tenantId)
  moduleLogger.info("Tenant created successfully", { tenantId })

  return newTenant
}

/**
 * Update an existing tenant
 */
export async function updateTenant(tenantId: string, data: UpdateTenantRequest): Promise<Tenant> {
  moduleLogger.info("Updating tenant", { tenantId })

  // Verify tenant exists
  const existingTenant = await getTenantById(tenantId)

  // Build update object with only provided fields
  const updateData: Record<string, unknown> = {}
  if (data.businessName !== undefined) updateData.businessName = data.businessName
  if (data.legalEntityName !== undefined) updateData.legalEntityName = data.legalEntityName
  if (data.category !== undefined) updateData.category = data.category
  if (data.subcategory !== undefined) updateData.subcategory = data.subcategory
  if (data.contactPerson !== undefined) updateData.contactPerson = data.contactPerson
  if (data.email !== undefined) updateData.email = data.email
  if (data.phone !== undefined) updateData.phone = data.phone
  if (data.gstin !== undefined) updateData.gstin = data.gstin
  if (data.status !== undefined) updateData.status = data.status

  if (Object.keys(updateData).length === 0) {
    return existingTenant
  }

  await db.update(tenants).set(updateData).where(eq(tenants.id, tenantId))

  // Invalidate cache
  await invalidateEntityCache("tenant", tenantId, existingTenant.propertyId)

  const updatedTenant = await getTenantById(tenantId)
  moduleLogger.info("Tenant updated successfully", { tenantId })

  return updatedTenant
}

/**
 * Delete a tenant
 */
export async function deleteTenant(tenantId: string): Promise<void> {
  moduleLogger.info("Deleting tenant", { tenantId })

  const tenant = await getTenantById(tenantId)

  await db.delete(tenants).where(eq(tenants.id, tenantId))

  // Invalidate cache
  await invalidateEntityCache("tenant", tenantId, tenant.propertyId)

  moduleLogger.info("Tenant deleted successfully", { tenantId })
}

/**
 * Get tenant statistics for a property
 */
export async function getTenantStats(propertyId: string) {
  moduleLogger.debug("Fetching tenant statistics", { propertyId })

  const allTenants = await db
    .select()
    .from(tenants)
    .where(eq(tenants.propertyId, propertyId))

  const stats = {
    total: allTenants.length,
    active: allTenants.filter(t => t.status === "active").length,
    inactive: allTenants.filter(t => t.status === "inactive").length,
    suspended: allTenants.filter(t => t.status === "suspended").length,
    byCategory: {} as Record<string, number>,
  }

  // Count by category
  allTenants.forEach(tenant => {
    if (tenant.category) {
      stats.byCategory[tenant.category] = (stats.byCategory[tenant.category] || 0) + 1
    }
  })

  return stats
}
