import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { db } from "@/lib/db"
import { withOrgContext } from "@/lib/db/with-org-context"
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

    const session = await auth()
    const organizationIdFromSession = session?.user?.organizationId || "default"
    const searchParams = request.nextUrl.searchParams
    const organizationId = searchParams.get("organizationId") || organizationIdFromSession
    const refresh = searchParams.get("refresh") === "true"

    // Invalidate cache if refresh requested
    if (refresh) {
      await invalidateEntityCache("property", "all", organizationId)
      const { deleteCache } = await import("@/lib/cache")
      await deleteCache(CACHE_KEYS.PROPERTY_LIST(organizationId))
    }

    // Use caching for property list
    const propertiesWithMetrics = await getCachedOrFetch(
      CACHE_KEYS.PROPERTY_LIST(organizationId),
      async () => {
        return withOrgContext(organizationId, async (tx) => {
          const { tenants, leases } = await import("@/lib/db/schema")

          // Fetch properties
          const propertiesData = await tx
            .select()
            .from(properties)
            .where(organizationId ? eq(properties.organizationId, organizationId) : undefined)
            .orderBy(desc(properties.createdAt))

          if (propertiesData.length === 0) return []

          const propertyIds = propertiesData.map((p) => p.id)

          // Count tenants per property using separate grouped query
          const tenantCounts = await tx
            .select({
              propertyId: tenants.propertyId,
              count: sql<number>`count(*)::integer`,
            })
            .from(tenants)
            .where(sql`${tenants.propertyId} IN (${sql.join(propertyIds.map((id) => sql`${id}`), sql`, `)})`)
            .groupBy(tenants.propertyId)

          const tenantCountMap = new Map(tenantCounts.map((r) => [r.propertyId, Number(r.count) || 0]))

          // Count active leases per property
          const leaseCounts = await tx
            .select({
              propertyId: leases.propertyId,
              count: sql<number>`count(*)::integer`,
            })
            .from(leases)
            .where(
              and(
                sql`${leases.propertyId} IN (${sql.join(propertyIds.map((id) => sql`${id}`), sql`, `)})`,
                eq(leases.status, "active")
              )
            )
            .groupBy(leases.propertyId)

          const leaseCountMap = new Map(leaseCounts.map((r) => [r.propertyId, Number(r.count) || 0]))

          // Batch fetch latest metrics for all properties
          type MetricRow = typeof dailyMetrics.$inferSelect
          const latestMetrics = new Map<string, MetricRow>()
          const metricRows = await tx
            .select()
            .from(dailyMetrics)
            .where(
              sql`${dailyMetrics.propertyId} IN (${sql.join(
                propertyIds.map((id) => sql`${id}`),
                sql`, `
              )})`
            )
            .orderBy(dailyMetrics.propertyId, desc(dailyMetrics.metricDate))
          for (const row of metricRows) {
            if (row.propertyId && !latestMetrics.has(row.propertyId)) {
              latestMetrics.set(row.propertyId, row)
            }
          }

          return propertiesData.map((property) => {
            const latestMetric = latestMetrics.get(property.id)
            return {
              ...property,
              tenantCount: tenantCountMap.get(property.id) || 0,
              activeLeases: leaseCountMap.get(property.id) || 0,
              metrics: latestMetric
                ? {
                    occupancyRate: latestMetric.occupancyRate,
                    collectionRate: latestMetric.collectionRate,
                    revenue: latestMetric.revenue,
                    footTraffic: latestMetric.footTraffic,
                  }
                : null,
            }
          })
        })
      },
      CACHE_TTL.MEDIUM // 5 minutes
    )

    console.log("[API/Properties] GET →", (propertiesWithMetrics as any[]).map((p: any) => ({ name: p.name, tenantCount: p.tenantCount, activeLeases: p.activeLeases })))
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

    const session = await auth()
    const organizationIdFromSession = session?.user?.organizationId || "default"
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
      organizationId: bodyOrgId 
    } = body

    const organizationId = bodyOrgId || organizationIdFromSession

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

    const newProperty = await withOrgContext(organizationId, async (tx) => {
      const results = await tx
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
      
      return results[0]
    })

    // Invalidate property list cache after creating new property
    await invalidateEntityCache("property", newProperty.id, "all", organizationId)
    if (validOrgId && validOrgId !== organizationId) {
      await invalidateEntityCache("property", newProperty.id, "all", validOrgId)
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

