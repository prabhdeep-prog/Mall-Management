import { NextRequest, NextResponse } from "next/server"
import { db } from "@/lib/db"
import { equipment } from "@/lib/db/schema"
import { eq, and, sql } from "drizzle-orm"
import { PERMISSIONS, requirePermission } from "@/lib/auth/rbac"
import { z } from "zod"

const createEquipmentSchema = z.object({
  propertyId: z.string().uuid("Invalid property ID"),
  name: z.string().min(1, "Name is required"),
  type: z.string().min(1, "Type is required"),
  make: z.string().optional().nullable(),
  model: z.string().optional().nullable(),
  serialNumber: z.string().optional().nullable(),
  location: z.string().optional().nullable(),
  installationDate: z.string().optional().nullable(),
  warrantyExpiry: z.string().optional().nullable(),
  maintenanceFrequencyDays: z.number().int().positive().optional().nullable(),
})

export async function GET(request: NextRequest) {
  const { authorized, error } = await requirePermission(PERMISSIONS.EQUIPMENT_VIEW)
  if (!authorized) {
    return NextResponse.json({ error }, { status: 403 })
  }

  try {
    const { searchParams } = new URL(request.url)
    const propertyId = searchParams.get("propertyId")
    const type       = searchParams.get("type")
    const status     = searchParams.get("status")
    const page       = Math.max(1, parseInt(searchParams.get("page")  || "1",  10))
    const limit      = Math.min(200, Math.max(1, parseInt(searchParams.get("limit") || "50", 10)))
    const offset     = (page - 1) * limit

    // Build conditions in SQL — no more app-level filtering
    const conditions = []
    if (propertyId) conditions.push(eq(equipment.propertyId, propertyId))
    if (type)       conditions.push(eq(equipment.type, type))
    if (status)     conditions.push(eq(equipment.status, status))

    const where = conditions.length > 0 ? and(...conditions) : undefined

    const [items, [{ total }]] = await Promise.all([
      db.query.equipment.findMany({
        where,
        orderBy: (table, { desc }) => [desc(table.createdAt)],
        limit,
        offset,
      }),
      db
        .select({ total: sql<number>`count(*)::integer` })
        .from(equipment)
        .where(where),
    ])

    return NextResponse.json({
      success: true,
      data: items,
      pagination: { page, limit, total, pages: Math.ceil(total / limit) },
    })
  } catch (error) {
    console.error("Error fetching equipment:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  const { authorized, error } = await requirePermission(PERMISSIONS.EQUIPMENT_CREATE)
  if (!authorized) {
    return NextResponse.json({ error }, { status: 403 })
  }

  try {
    const body = await request.json()
    const validatedData = createEquipmentSchema.parse(body)

    // Calculate next maintenance date
    let nextMaintenanceDate: Date | null = null
    if (validatedData.maintenanceFrequencyDays && validatedData.installationDate) {
      nextMaintenanceDate = new Date(validatedData.installationDate)
      nextMaintenanceDate.setDate(nextMaintenanceDate.getDate() + validatedData.maintenanceFrequencyDays)
    }

    const newEquipment = await db.insert(equipment).values({
      propertyId: validatedData.propertyId,
      name: validatedData.name,
      type: validatedData.type,
      make: validatedData.make || null,
      model: validatedData.model || null,
      serialNumber: validatedData.serialNumber || null,
      location: validatedData.location || null,
      installationDate: validatedData.installationDate || null,
      warrantyExpiry: validatedData.warrantyExpiry || null,
      maintenanceFrequencyDays: validatedData.maintenanceFrequencyDays || null,
      lastMaintenanceDate: null,
      nextMaintenanceDate: nextMaintenanceDate?.toISOString().split("T")[0] || null,
      predictedFailureDate: null,
      predictionConfidence: null,
      healthScore: "1.00",
      status: "operational",
    }).returning()

    return NextResponse.json({ success: true, data: newEquipment[0] }, { status: 201 })
  } catch (error: any) {
    console.error("Error creating equipment:", error)
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: error.errors }, { status: 400 })
    }
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}

