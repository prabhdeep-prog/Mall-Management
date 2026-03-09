import { NextRequest, NextResponse } from "next/server"
import { db } from "@/lib/db"
import { vendors } from "@/lib/db/schema"
import { eq, and, sql } from "drizzle-orm"
import { PERMISSIONS, requirePermission } from "@/lib/auth/rbac"
import { z } from "zod"

const createVendorSchema = z.object({
  name: z.string().min(1, "Name is required"),
  category: z.string().min(1, "Category is required"),
  contactPerson: z.string().optional(),
  email: z.string().email().optional().nullable(),
  phone: z.string().optional().nullable(),
  address: z.string().optional().nullable(),
  gstNumber: z.string().optional().nullable(),
  panNumber: z.string().optional().nullable(),
  bankDetails: z.object({
    accountName: z.string().optional(),
    accountNumber: z.string().optional(),
    bankName: z.string().optional(),
    ifscCode: z.string().optional(),
  }).optional().nullable(),
  contractExpiry: z.string().optional().nullable(),
})

export async function GET(request: NextRequest) {
  const { authorized, error } = await requirePermission(PERMISSIONS.VENDORS_VIEW)
  if (!authorized) {
    return NextResponse.json({ error }, { status: 403 })
  }

  try {
    const { searchParams } = new URL(request.url)
    const type   = searchParams.get("type")
    const status = searchParams.get("status")
    const page   = Math.max(1, parseInt(searchParams.get("page")  || "1",  10))
    const limit  = Math.min(200, Math.max(1, parseInt(searchParams.get("limit") || "50", 10)))
    const offset = (page - 1) * limit

    // Push filters to DB
    const conditions = []
    if (type)   conditions.push(eq(vendors.type, type))
    if (status) conditions.push(eq(vendors.status, status))

    const where = conditions.length > 0 ? and(...conditions) : undefined

    const [items, [{ total }]] = await Promise.all([
      db.query.vendors.findMany({
        where,
        orderBy: (table, { desc }) => [desc(table.createdAt)],
        limit,
        offset,
      }),
      db
        .select({ total: sql<number>`count(*)::integer` })
        .from(vendors)
        .where(where),
    ])

    return NextResponse.json({
      success: true,
      data: items,
      pagination: { page, limit, total, pages: Math.ceil(total / limit) },
    })
  } catch (error) {
    console.error("Error fetching vendors:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  const { authorized, error } = await requirePermission(PERMISSIONS.VENDORS_CREATE)
  if (!authorized) {
    return NextResponse.json({ error }, { status: 403 })
  }

  try {
    const body = await request.json()
    const validatedData = createVendorSchema.parse(body)

    const newVendor = await db.insert(vendors).values({
      name: validatedData.name,
      type: validatedData.category || null,
      contactPerson: validatedData.contactPerson || null,
      email: validatedData.email || null,
      phone: validatedData.phone || null,
      address: validatedData.address || null,
      gstin: validatedData.gstNumber || null,
      pan: validatedData.panNumber || null,
      rating: "0",
      performanceScore: "0",
      totalJobs: 0,
      completedJobs: 0,
      cancelledJobs: 0,
      status: "active",
      metadata: {
        bankDetails: validatedData.bankDetails || null,
        contractExpiry: validatedData.contractExpiry || null,
      },
    }).returning()

    return NextResponse.json({ success: true, data: newVendor[0] }, { status: 201 })
  } catch (error: any) {
    console.error("Error creating vendor:", error)
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: error.errors }, { status: 400 })
    }
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}

