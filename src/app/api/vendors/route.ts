import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { db, serviceDb } from "@/lib/db"
import { vendors, workOrders } from "@/lib/db/schema"
import { eq, and, sql } from "drizzle-orm"
import { PERMISSIONS, requirePermission } from "@/lib/auth/rbac"
import { z } from "zod"
import { encryptObject, decryptObject, isEncrypted } from "@/lib/crypto/encryption"

const createVendorSchema = z.object({
  name: z.string().min(1, "Name is required"),
  category: z.string().min(1, "Category is required"),
  contactPerson: z.string().optional().nullable(),
  email: z.union([z.string().email(), z.literal(""), z.null()]).optional(),
  phone: z.string().optional().nullable(),
  address: z.string().optional().nullable(),
  gstNumber: z.string().optional().nullable(),
  panNumber: z.string().optional().nullable(),
  bankDetails: z.object({
    accountName: z.string().optional().nullable(),
    accountNumber: z.string().optional().nullable(),
    bankName: z.string().optional().nullable(),
    ifscCode: z.string().optional().nullable(),
  }).optional().nullable(),
  contractExpiry: z.string().optional().nullable(),
})

export async function GET(request: NextRequest) {
  const { authorized, error } = await requirePermission(PERMISSIONS.VENDORS_VIEW)
  if (!authorized) {
    return NextResponse.json({ error }, { status: 403 })
  }

  const session = await auth()
  const organizationId_fallback = session?.user?.organizationId

  try {
    const { searchParams } = new URL(request.url)
    const organizationId = searchParams.get("organizationId") || organizationId_fallback
    const category = searchParams.get("category")
    const status = searchParams.get("status")
    const type = searchParams.get("type")

    // Query vendors with real-time work order counts from work_orders table
    const allVendors = await serviceDb.execute<{
      id: string
      name: string
      type: string | null
      contact_person: string | null
      email: string | null
      phone: string | null
      address: string | null
      gstin: string | null
      pan: string | null
      rating: string | null
      performance_score: string | null
      total_jobs: string
      completed_jobs: string
      cancelled_jobs: string
      avg_response_time_hours: string | null
      avg_completion_time_hours: string | null
      sla_compliance_percentage: string | null
      cost_efficiency_score: string | null
      status: string | null
      metadata: unknown
      created_at: string
      updated_at: string
      real_total_jobs: string
      real_completed_jobs: string
      real_cancelled_jobs: string
    }>(sql`
      SELECT v.*,
        COALESCE(wo_stats.total, 0) as real_total_jobs,
        COALESCE(wo_stats.completed, 0) as real_completed_jobs,
        COALESCE(wo_stats.cancelled, 0) as real_cancelled_jobs
      FROM vendors v
      LEFT JOIN (
        SELECT
          assigned_to,
          COUNT(*) as total,
          COUNT(CASE WHEN status IN ('completed', 'resolved') THEN 1 END) as completed,
          COUNT(CASE WHEN status = 'cancelled' THEN 1 END) as cancelled
        FROM work_orders
        WHERE assigned_to IS NOT NULL
        GROUP BY assigned_to
      ) wo_stats ON wo_stats.assigned_to = v.id
      ORDER BY v.created_at DESC
    `)

    // Map to expected shape, applying filters and decryption
    let filtered = Array.from(allVendors).map(v => ({
      id: v.id,
      name: v.name,
      type: v.type,
      contactPerson: v.contact_person,
      email: v.email,
      phone: v.phone,
      address: v.address,
      gstin: v.gstin,
      pan: v.pan,
      rating: v.rating,
      performanceScore: v.performance_score,
      // Use real counts from work_orders table
      totalJobs: parseInt(v.real_total_jobs, 10),
      completedJobs: parseInt(v.real_completed_jobs, 10),
      cancelledJobs: parseInt(v.real_cancelled_jobs, 10),
      avgResponseTimeHours: v.avg_response_time_hours,
      avgCompletionTimeHours: v.avg_completion_time_hours,
      slaCompliancePercentage: v.sla_compliance_percentage,
      costEfficiencyScore: v.cost_efficiency_score,
      status: v.status,
      metadata: v.metadata,
      createdAt: v.created_at,
      updatedAt: v.updated_at,
    }))

    if (type) {
      filtered = filtered.filter(v => v.type === type)
    }
    if (status) {
      filtered = filtered.filter(v => v.status === status)
    }

    // Decrypt bank details in metadata for display
    const decrypted = filtered.map(v => {
      const meta = v.metadata as Record<string, unknown> ?? {}
      if (meta.bankDetailsEncrypted && typeof meta.bankDetailsEncrypted === "string") {
        try {
          const bankDetails = decryptObject(meta.bankDetailsEncrypted as string)
          return { ...v, metadata: { ...meta, bankDetails, bankDetailsEncrypted: undefined } }
        } catch {
          return v
        }
      }
      return v
    })

    return NextResponse.json({ success: true, data: decrypted })
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
        // Encrypt bank details at rest — never store plaintext
        ...(validatedData.bankDetails
          ? { bankDetailsEncrypted: encryptObject(validatedData.bankDetails) }
          : {}),
        contractExpiry: validatedData.contractExpiry || null,
      },
    }).returning()

    return NextResponse.json({ success: true, data: newVendor[0] }, { status: 201 })
  } catch (error: any) {
    console.error("Error creating vendor:", error)
    if (error instanceof z.ZodError) {
      const msg = error.errors.map((e) => `${e.path.join(".")}: ${e.message}`).join("; ")
      return NextResponse.json({ error: msg }, { status: 400 })
    }
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}

