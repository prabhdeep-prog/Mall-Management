import { NextRequest, NextResponse } from "next/server"
import { db } from "@/lib/db"
import { properties, dailyMetrics } from "@/lib/db/schema"
import { eq, desc, sql, and } from "drizzle-orm"
import { getCachedOrFetch, CACHE_KEYS, CACHE_TTL, invalidateEntityCache } from "@/lib/cache"
import { PERMISSIONS, requirePermission } from "@/lib/auth/rbac"

export async function GET(request: NextRequest) {
  try {
    const { authorized, error } = await requirePermission(PERMISSIONS.PROPERTIES_VIEW)
    if (!authorized) {
      return NextResponse.json({ error }, { status: 403 })
    }

    const searchParams = request.nextUrl.searchParams
    const organizationId = searchParams.get("organizationId")
    const refresh = searchParams.get("refresh") === "true"

    // Invalidate cache if refresh requested - invalidate all property caches
    if (refresh) {
      await invalidateEntityCache("property", "all", organizationId || "all")
      // Also delete the specific cache key directly
      const { deleteCache } = await import("@/lib/cache")
      await deleteCache(CACHE_KEYS.PROPERTY_LIST(organizationId || "all"))
    }

    // Use caching for property list
    const propertiesWithMetrics = await getCachedOrFetch(
      CACHE_KEYS.PROPERTY_LIST(organizationId || "all"),
      async () => {
        // Get all properties first
        const propertiesData = await db
          .select()
          .from(properties)
          .where(organizationId ? eq(properties.organizationId, organizationId) : undefined)
          .orderBy(desc(properties.createdAt))

        // Import for batch queries
        const { tenants, leases } = await import("@/lib/db/schema")
        const { inArray } = await import("drizzle-orm")

        if (propertiesData.length === 0) return []

        const propertyIds = propertiesData.map(p => p.id)

        // ── 3 batch queries instead of 3N per-property queries ────────────────
        const [tenantCounts, leaseCounts, latestMetrics] = await Promise.all([
          // 1. Tenant count per property (single GROUP BY query)
          db
            .select({
              propertyId: tenants.propertyId,
              count: sql<number>`count(*)::integer`,
            })
            .from(tenants)
            .where(inArray(tenants.propertyId, propertyIds))
            .groupBy(tenants.propertyId),

          // 2. Active lease count per property (single GROUP BY query)
          db
            .select({
              propertyId: leases.propertyId,
              count: sql<number>`count(*)::integer`,
            })
            .from(leases)
            .where(
              and(
                inArray(leases.propertyId, propertyIds),
                eq(leases.status, "active")
              )
            )
            .groupBy(leases.propertyId),

          // 3. Latest metric per property: ordered by (propertyId, metricDate DESC),
          // then deduplicated in JS — keeps first (= most recent) row per property.
          db
            .select({
              propertyId:     dailyMetrics.propertyId,
              metricDate:     dailyMetrics.metricDate,
              occupancyRate:  dailyMetrics.occupancyRate,
              collectionRate: dailyMetrics.collectionRate,
              revenue:        dailyMetrics.revenue,
              footTraffic:    dailyMetrics.footTraffic,
            })
            .from(dailyMetrics)
            .where(inArray(dailyMetrics.propertyId, propertyIds))
            .orderBy(dailyMetrics.propertyId, desc(dailyMetrics.metricDate)),
        ])

        // Build lookup maps for O(1) access
        const tenantCountMap = new Map(tenantCounts.map(r => [r.propertyId, r.count]))
        const leaseCountMap  = new Map(leaseCounts.map(r => [r.propertyId, r.count]))
        // Keep only the most recent row per property (first occurrence after DESC sort)
        const metricsMap = latestMetrics.reduce((acc, row) => {
          if (!acc.has(row.propertyId)) acc.set(row.propertyId, row)
          return acc
        }, new Map<string, typeof latestMetrics[0]>())

        return propertiesData.map(property => ({
          ...property,
          tenantCount:  Number(tenantCountMap.get(property.id)) || 0,
          activeLeases: Number(leaseCountMap.get(property.id))  || 0,
          metrics: metricsMap.get(property.id)
            ? {
                occupancyRate:  metricsMap.get(property.id)!.occupancyRate,
                collectionRate: metricsMap.get(property.id)!.collectionRate,
                revenue:        metricsMap.get(property.id)!.revenue,
                footTraffic:    metricsMap.get(property.id)!.footTraffic,
              }
            : null,
        }))
      },
      CACHE_TTL.MEDIUM // 5 minutes
    )

    return NextResponse.json({ 
      success: true, 
      data: propertiesWithMetrics 
    })
  } catch (error) {
    console.error("Error fetching properties:", error)
    return NextResponse.json(
      { success: false, error: "Failed to fetch properties" },
      { status: 500 }
    )
  }
}

export async function POST(request: NextRequest) {
  try {
    const { authorized, error } = await requirePermission(PERMISSIONS.PROPERTIES_CREATE)
    if (!authorized) {
      return NextResponse.json({ error }, { status: 403 })
    }

    const body = await request.json()
    const { 
      name, 
      code, 
      address, 
      city, 
      state, 
      country,
      pincode,
      type, 
      status,
      totalArea, 
      leasableArea,
      floors,
      operatingHours,
      amenities,
      metadata,
      organizationId 
    } = body

    // Validation
    if (!name || !code || !city || !state) {
      return NextResponse.json(
        { success: false, error: "Name, code, city, and state are required" },
        { status: 400 }
      )
    }

    // Check for duplicate code
    const existingProperty = await db.query.properties.findFirst({
      where: eq(properties.code, code),
    })
    
    if (existingProperty) {
      return NextResponse.json(
        { success: false, error: "A property with this code already exists" },
        { status: 400 }
      )
    }

    // Validate organizationId is a valid UUID if provided
    const isValidUUID = (str: string) => {
      const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
      return uuidRegex.test(str)
    }
    
    // Only use organizationId if it's a valid UUID, otherwise null
    const validOrgId = organizationId && isValidUUID(organizationId) ? organizationId : null

    const [newProperty] = await db
      .insert(properties)
      .values({
        name,
        code,
        address: address || null,
        city,
        state,
        country: country || "India",
        pincode: pincode || null,
        type: type || "mall",
        status: status || "active",
        totalAreaSqft: totalArea || null,
        leasableAreaSqft: leasableArea || null,
        floors: floors || null,
        operatingHours: operatingHours || {},
        amenities: amenities || [],
        metadata: metadata || {},
        organizationId: validOrgId,
      })
      .returning()

    // Invalidate property list cache after creating new property
    // Always invalidate the "all" cache (used when no orgId filter is passed in GET)
    await invalidateEntityCache("property", newProperty.id, "all")
    if (validOrgId) {
      await invalidateEntityCache("property", newProperty.id, validOrgId)
    }

    return NextResponse.json({ success: true, data: newProperty }, { status: 201 })
  } catch (error) {
    console.error("Error creating property:", error)
    
    // Check for unique constraint violation
    if (error instanceof Error && error.message.includes("unique")) {
      return NextResponse.json(
        { success: false, error: "A property with this code already exists" },
        { status: 400 }
      )
    }
    
    return NextResponse.json(
      { success: false, error: "Failed to create property" },
      { status: 500 }
    )
  }
}

