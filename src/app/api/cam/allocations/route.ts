import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { db } from "@/lib/db"
import { camAllocations, tenants, leases } from "@/lib/db/schema"
import { eq } from "drizzle-orm"
import { requirePermission, PERMISSIONS } from "@/lib/auth/rbac"
import { getCachedOrFetch, CACHE_TTL } from "@/lib/cache"

export async function GET(request: NextRequest) {
  try {
    const session = await auth()
    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const { authorized, error } = await requirePermission(PERMISSIONS.CAM_VIEW)
    if (!authorized) return NextResponse.json({ error }, { status: 403 })

    const { searchParams } = new URL(request.url)
    const chargeId = searchParams.get("chargeId")

    if (!chargeId) {
      return NextResponse.json(
        { error: "Missing required query param: chargeId" },
        { status: 400 }
      )
    }

    const cacheKey = `cam:allocations:${chargeId}`

    const result = await getCachedOrFetch(
      cacheKey,
      async () => {
        const allocations = await db
          .select({
            allocation: camAllocations,
            tenant: {
              id: tenants.id,
              businessName: tenants.businessName,
              contactPerson: tenants.contactPerson,
            },
            lease: {
              id: leases.id,
              unitNumber: leases.unitNumber,
              areaSqft: leases.areaSqft,
            },
          })
          .from(camAllocations)
          .innerJoin(tenants, eq(camAllocations.tenantId, tenants.id))
          .leftJoin(leases, eq(camAllocations.leaseId, leases.id))
          .where(eq(camAllocations.chargeId, chargeId))

        return allocations.map(({ allocation, tenant, lease }) => ({
          ...allocation,
          tenant,
          lease,
        }))
      },
      CACHE_TTL.MEDIUM
    )

    return NextResponse.json({ success: true, data: result })
  } catch (error) {
    console.error("Get CAM allocations error:", error)
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    )
  }
}
