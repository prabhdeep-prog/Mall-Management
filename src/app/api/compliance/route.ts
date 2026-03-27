import { NextRequest, NextResponse } from "next/server"
import { db } from "@/lib/db"
import { complianceRequirements } from "@/lib/db/schema"
import { eq, and, sql } from "drizzle-orm"
import { PERMISSIONS, requirePermission } from "@/lib/auth/rbac"
import { z } from "zod"

const createComplianceSchema = z.object({
  propertyId: z.string().uuid("Invalid property ID"),
  requirementType: z.string().min(1, "Requirement type is required"),
  title: z.string().min(1, "Title is required"),
  description: z.string().optional(),
  authority: z.string().optional(),
  frequency: z.string().optional(),
  dueDate: z.string().optional(),
  nextDueDate: z.string().optional(),
  status: z.string().default("pending"),
  riskLevel: z.string().default("medium"),
  autoReminder: z.boolean().default(true),
  reminderDays: z.array(z.number()).default([30, 15, 7, 2]),
  documentsRequired: z.array(z.string()).default([]),
})

export async function GET(request: NextRequest) {
  const { authorized, error } = await requirePermission(PERMISSIONS.COMPLIANCE_VIEW)
  if (!authorized) {
    return NextResponse.json({ error }, { status: 403 })
  }

  try {
    const { searchParams } = new URL(request.url)
    const propertyId = searchParams.get("propertyId")
    const status     = searchParams.get("status")
    const riskLevel  = searchParams.get("riskLevel")
    const page       = Math.max(1, parseInt(searchParams.get("page")  || "1",  10))
    const limit      = Math.min(200, Math.max(1, parseInt(searchParams.get("limit") || "50", 10)))
    const offset     = (page - 1) * limit

    // Push all filters to the database — no app-level filtering
    const conditions = []
    if (propertyId) conditions.push(eq(complianceRequirements.propertyId, propertyId))
    if (status)     conditions.push(eq(complianceRequirements.status, status))
    if (riskLevel)  conditions.push(eq(complianceRequirements.riskLevel, riskLevel))

    const where = conditions.length > 0 ? and(...conditions) : undefined

    const [items, [{ total }]] = await Promise.all([
      db.query.complianceRequirements.findMany({
        where,
        orderBy: (table, { desc }) => [desc(table.createdAt)],
        limit,
        offset,
      }),
      db
        .select({ total: sql<number>`count(*)::integer` })
        .from(complianceRequirements)
        .where(where),
    ])

    return NextResponse.json({
      success: true,
      data: items,
      pagination: { page, limit, total, pages: Math.ceil(total / limit) },
    })
  } catch (error) {
    console.error("Error fetching compliance requirements:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  const { authorized, error } = await requirePermission(PERMISSIONS.COMPLIANCE_CREATE)
  if (!authorized) {
    return NextResponse.json({ error }, { status: 403 })
  }

  try {
    const body = await request.json()
    const validatedData = createComplianceSchema.parse(body)

    const newRequirement = await db.insert(complianceRequirements).values({
      propertyId: validatedData.propertyId,
      requirementType: validatedData.requirementType,
      title: validatedData.title,
      description: validatedData.description || null,
      authority: validatedData.authority || null,
      frequency: validatedData.frequency || null,
      dueDate: validatedData.dueDate || null,
      nextDueDate: validatedData.nextDueDate || null,
      status: validatedData.status,
      riskLevel: validatedData.riskLevel,
      autoReminder: validatedData.autoReminder,
      reminderDays: validatedData.reminderDays,
      documentsRequired: validatedData.documentsRequired,
    }).returning()

    return NextResponse.json({ success: true, data: newRequirement[0] }, { status: 201 })
  } catch (error: any) {
    console.error("Error creating compliance requirement:", error)
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: error.errors }, { status: 400 })
    }
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}

