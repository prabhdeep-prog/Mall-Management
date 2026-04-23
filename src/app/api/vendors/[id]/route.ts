import { NextRequest, NextResponse } from "next/server"
import { db } from "@/lib/db"
import { vendors } from "@/lib/db/schema"
import { eq } from "drizzle-orm"
import { PERMISSIONS, requirePermission } from "@/lib/auth/rbac"
import { z } from "zod"
import { encryptObject } from "@/lib/crypto/encryption"

const updateVendorSchema = z.object({
  name: z.string().min(1).optional(),
  category: z.string().optional(),
  contactPerson: z.string().optional().nullable(),
  email: z.union([z.string().email(), z.literal(""), z.null()]).optional(),
  phone: z.string().optional().nullable(),
  address: z.string().optional().nullable(),
  gstNumber: z.string().optional().nullable(),
  panNumber: z.string().optional().nullable(),
  status: z.enum(["active", "inactive", "suspended", "pending"]).optional(),
  bankDetails: z.object({
    accountName: z.string().optional().nullable(),
    accountNumber: z.string().optional().nullable(),
    bankName: z.string().optional().nullable(),
    ifscCode: z.string().optional().nullable(),
  }).optional().nullable(),
  contractExpiry: z.string().optional().nullable(),
})

export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string } },
) {
  const { authorized, error } = await requirePermission(PERMISSIONS.VENDORS_EDIT)
  if (!authorized) {
    return NextResponse.json({ error }, { status: 403 })
  }

  try {
    const body = await request.json()
    const data = updateVendorSchema.parse(body)

    const existing = await db.query.vendors.findFirst({
      where: eq(vendors.id, params.id),
    })
    if (!existing) {
      return NextResponse.json({ error: "Vendor not found" }, { status: 404 })
    }

    const updatePayload: Record<string, unknown> = { updatedAt: new Date() }
    if (data.name !== undefined) updatePayload.name = data.name
    if (data.category !== undefined) updatePayload.type = data.category
    if (data.contactPerson !== undefined) updatePayload.contactPerson = data.contactPerson
    if (data.email !== undefined) updatePayload.email = data.email || null
    if (data.phone !== undefined) updatePayload.phone = data.phone
    if (data.address !== undefined) updatePayload.address = data.address
    if (data.gstNumber !== undefined) updatePayload.gstin = data.gstNumber
    if (data.panNumber !== undefined) updatePayload.pan = data.panNumber
    if (data.status !== undefined) updatePayload.status = data.status
    if (data.bankDetails !== undefined || data.contractExpiry !== undefined) {
      const existingMeta = existing.metadata as Record<string, unknown> ?? {}
      updatePayload.metadata = {
        ...existingMeta,
        // Encrypt bank details at rest
        ...(data.bankDetails !== undefined
          ? { bankDetailsEncrypted: data.bankDetails ? encryptObject(data.bankDetails) : null, bankDetails: undefined }
          : {}),
        ...(data.contractExpiry !== undefined ? { contractExpiry: data.contractExpiry } : {}),
      }
    }

    const [updated] = await db
      .update(vendors)
      .set(updatePayload)
      .where(eq(vendors.id, params.id))
      .returning()

    return NextResponse.json({ success: true, data: updated })
  } catch (err: any) {
    console.error("Vendor PATCH error:", err)
    if (err instanceof z.ZodError) {
      return NextResponse.json({ error: err.errors.map((e) => `${e.path.join(".")}: ${e.message}`).join("; ") }, { status: 400 })
    }
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
