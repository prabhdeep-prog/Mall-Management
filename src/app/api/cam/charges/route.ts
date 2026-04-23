import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { db } from "@/lib/db"
import { camCharges, properties } from "@/lib/db/schema"
import { eq, and, desc } from "drizzle-orm"
import { requirePermission, PERMISSIONS } from "@/lib/auth/rbac"
import { getCachedOrFetch, deleteCache, CACHE_TTL } from "@/lib/cache"

export async function GET(request: NextRequest) {
  try {
    const session = await auth()
    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const { authorized, error } = await requirePermission(PERMISSIONS.CAM_VIEW)
    if (!authorized) return NextResponse.json({ error }, { status: 403 })

    const { searchParams } = new URL(request.url)
    const propertyId = searchParams.get("propertyId")
    const status = searchParams.get("status")

    const cacheKey = `cam:charges:${propertyId || "all"}:${status || "all"}`

    const result = await getCachedOrFetch(
      cacheKey,
      async () => {
        const conditions = []
        if (propertyId) conditions.push(eq(camCharges.propertyId, propertyId))
        if (status) conditions.push(eq(camCharges.status, status))

        const charges = await db
          .select({
            charge: camCharges,
            property: {
              id: properties.id,
              name: properties.name,
              code: properties.code,
            },
          })
          .from(camCharges)
          .leftJoin(properties, eq(camCharges.propertyId, properties.id))
          .where(conditions.length > 0 ? and(...conditions) : undefined)
          .orderBy(desc(camCharges.createdAt))

        return charges.map(({ charge, property }) => ({
          ...charge,
          property,
        }))
      },
      CACHE_TTL.MEDIUM
    )

    return NextResponse.json({ success: true, data: result })
  } catch (error) {
    console.error("Get CAM charges error:", error)
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    )
  }
}

export async function POST(request: NextRequest) {
  try {
    const session = await auth()
    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const { authorized, error } = await requirePermission(PERMISSIONS.CAM_CREATE)
    if (!authorized) return NextResponse.json({ error }, { status: 403 })

    const body = await request.json()
    const {
      propertyId,
      periodStart,
      periodEnd,
      category,
      totalAmount,
      allocationMethod,
    } = body

    if (!propertyId || !periodStart || !periodEnd || !category || !totalAmount) {
      return NextResponse.json(
        { error: "Missing required fields: propertyId, periodStart, periodEnd, category, totalAmount" },
        { status: 400 }
      )
    }

    const validCategories = ["electricity", "housekeeping", "security", "shared_utilities"]
    if (!validCategories.includes(category)) {
      return NextResponse.json(
        { error: `Invalid category. Must be one of: ${validCategories.join(", ")}` },
        { status: 400 }
      )
    }

    const validMethods = ["per_sqft", "equal", "footfall"]
    const method = allocationMethod || "per_sqft"
    if (!validMethods.includes(method)) {
      return NextResponse.json(
        { error: `Invalid allocation method. Must be one of: ${validMethods.join(", ")}` },
        { status: 400 }
      )
    }

    // Verify property exists
    const property = await db.query.properties.findFirst({
      where: eq(properties.id, propertyId),
    })
    if (!property) {
      return NextResponse.json({ error: "Property not found" }, { status: 404 })
    }

    const [charge] = await db
      .insert(camCharges)
      .values({
        organizationId: property.organizationId!,
        propertyId,
        periodStart,
        periodEnd,
        category,
        totalAmount,
        allocationMethod: method,
        status: "draft",
        createdBy: session.user.id,
      })
      .returning()

    await deleteCache("cam:charges:")

    return NextResponse.json({ success: true, data: charge }, { status: 201 })
  } catch (error) {
    console.error("Create CAM charge error:", error)
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    )
  }
}
