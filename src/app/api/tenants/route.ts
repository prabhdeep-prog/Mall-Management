import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { db } from "@/lib/db"
import { withOrgContext } from "@/lib/db/with-org-context"
import { tenants, leases } from "@/lib/db/schema"
import { eq, desc, and } from "drizzle-orm"
import { getCachedOrFetch, CACHE_KEYS, CACHE_TTL, invalidateEntityCache, deleteCachePattern } from "@/lib/cache"
import { PERMISSIONS, requirePermission } from "@/lib/auth/rbac"
import { calculateAllSatisfaction } from "@/lib/tenants/satisfaction-engine"

export async function GET(request: NextRequest) {
  try {
    const { authorized, error } = await requirePermission(PERMISSIONS.TENANTS_VIEW)
    if (!authorized) {
      return NextResponse.json({ error }, { status: 403 })
    }

    const session = await auth()
    const organizationId = session?.user?.organizationId || "default"

    const { searchParams } = new URL(request.url)
    const propertyId = searchParams.get("propertyId")
    const status = searchParams.get("status")
    const category = searchParams.get("category")
    const refresh = searchParams.get("refresh") === "true"

    // Invalidate cache if refresh requested
    if (refresh && propertyId) {
      await invalidateEntityCache("tenant", propertyId, propertyId, organizationId)
    }

    // Use caching for tenant list
    const cacheKey = propertyId
      ? CACHE_KEYS.TENANT_LIST(organizationId, propertyId)
      : `${organizationId}:tenants:list:all:${status || "all"}:${category || "all"}`

    const result = await getCachedOrFetch(
      cacheKey,
      async () => {
        return withOrgContext(organizationId, async (tx) => {
          // Get tenants with their lease information
          const tenantsWithLeases = await tx
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

          // Deduplicate: a tenant with multiple active leases appears as multiple rows
          // Keep the first lease found for each tenant (most recent by join order)
          const seen = new Set<string>()
          const deduplicated: typeof tenantsWithLeases = []
          for (const row of tenantsWithLeases) {
            if (!seen.has(row.tenant.id)) {
              seen.add(row.tenant.id)
              deduplicated.push(row)
            }
          }

          // Transform the data
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
        })
      },
      CACHE_TTL.MEDIUM // 5 minutes
    )

    // Compute satisfaction scores if any tenant is missing one
    const hasMissingSatisfaction = result.some((t: any) => !t.satisfactionScore)
    if (hasMissingSatisfaction) {
      try {
        const scores = await calculateAllSatisfaction(organizationId)
        const scoreMap = new Map(scores.map((s) => [s.tenantId, s.score]))
        for (const t of result as any[]) {
          if (!t.satisfactionScore && scoreMap.has(t.id)) {
            t.satisfactionScore = ((scoreMap.get(t.id)! / 100) * 5).toFixed(2)
          }
        }
      } catch (e) {
        console.error("[tenants] Satisfaction calculation failed:", e)
      }
    }

    // Default sentiment to neutral (0) for tenants without entries
    for (const t of result as any[]) {
      if (!t.sentimentScore) {
        t.sentimentScore = "0.00"
      }
    }

    console.log(`[API/Tenants] GET → orgId=${organizationId}, propertyId=${propertyId || "ALL"}, results=${(result as any[]).length}`)
    return NextResponse.json({ success: true, data: result })
  } catch (error) {
    console.error("Get tenants error:", error)
    return NextResponse.json(
      { success: false, error: "Internal server error" },
      { status: 500 }
    )
  }
}

export async function POST(request: NextRequest) {
  try {
    const { authorized, error } = await requirePermission(PERMISSIONS.TENANTS_CREATE)
    if (!authorized) {
      return NextResponse.json({ error }, { status: 403 })
    }

    const session = await auth()
    const organizationId = session?.user?.organizationId || "default"

    const body = await request.json()
    console.log("[API/Tenants] Creating tenant for org:", organizationId, "property:", body.propertyId)

    const {
      propertyId,
      businessName,
      legalEntityName,
      category,
      subcategory,
      contactPerson,
      email,
      phone,
      gstin,
      // Metadata fields from comprehensive form
      brandName,
      businessType,
      website,
      pan,
      tan,
      cin,
      fssaiLicense,
      tradeLicense,
      shopEstablishmentNumber,
      bankName,
      bankBranch,
      accountNumber,
      ifscCode,
      accountHolderName,
      registeredAddress,
      registeredCity,
      registeredState,
      registeredPincode,
      emergencyContactName,
      emergencyContactPhone,
      notes,
      status: statusField,
    } = body

    if (!propertyId || !businessName) {
      console.warn("[API/Tenants] Missing required fields:", { propertyId, businessName })
      return NextResponse.json(
        { error: "Property ID and business name are required" },
        { status: 400 }
      )
    }

    const tenantId = crypto.randomUUID()

    // Store extended fields in metadata
    const metadata = {
      brandName,
      businessType,
      website,
      tan,
      cin,
      fssaiLicense,
      shopEstablishmentNumber,
      bankName,
      bankBranch,
      accountNumber,
      ifscCode,
      accountHolderName,
      registeredAddress,
      registeredCity,
      registeredState,
      registeredPincode,
      emergencyContactName,
      emergencyContactPhone,
      notes,
    }

    const newTenant = await withOrgContext(organizationId, async (tx) => {
      await tx.insert(tenants).values({
        id: tenantId,
        propertyId,
        businessName,
        legalEntityName,
        category,
        subcategory,
        contactPerson,
        email,
        phone,
        gstin,
        pan,
        tradeLicense,
        status: statusField || "active",
        metadata,
      })

      return tx.query.tenants.findFirst({
        where: eq(tenants.id, tenantId),
      })
    })

    if (!newTenant) {
      console.error("[API/Tenants] Tenant was not found immediately after insert!")
      throw new Error("Failed to retrieve new tenant")
    }

    console.log("[API/Tenants] Created tenant successfully:", tenantId)

    // Invalidate tenant list cache after creating new tenant
    await invalidateEntityCache("tenant", tenantId, propertyId, organizationId)
    // Also invalidate the 'all properties' lists for this org to be safe
    await deleteCachePattern(`${organizationId}:tenants:list:all:*`)

    return NextResponse.json({ success: true, data: newTenant }, { status: 201 })
  } catch (error) {
    console.error("[API/Tenants] Error in POST:", error)
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : "Internal server error" },
      { status: 500 }
    )
  }
}

