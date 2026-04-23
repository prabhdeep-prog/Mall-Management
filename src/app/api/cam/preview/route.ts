import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { requirePermission, PERMISSIONS } from "@/lib/auth/rbac"
import { previewCAM } from "@/lib/cam/allocate"

export async function POST(request: NextRequest) {
  try {
    const session = await auth()
    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const { authorized, error } = await requirePermission(PERMISSIONS.CAM_VIEW)
    if (!authorized) return NextResponse.json({ error }, { status: 403 })

    const body = await request.json()
    const { propertyId, category, totalAmount, allocationMethod, periodStart, periodEnd } = body

    if (!propertyId || !category || !totalAmount || !periodStart || !periodEnd) {
      return NextResponse.json(
        { error: "Missing required fields: propertyId, category, totalAmount, periodStart, periodEnd" },
        { status: 400 }
      )
    }

    const preview = await previewCAM({
      propertyId,
      category,
      totalAmount: parseFloat(totalAmount),
      allocationMethod: allocationMethod || "per_sqft",
      periodStart,
      periodEnd,
    })

    return NextResponse.json({ success: true, data: preview })
  } catch (error) {
    console.error("Preview CAM error:", error)
    const msg = error instanceof Error ? error.message : ""
    const isClientError = msg.includes("No active tenants") || msg.includes("Unknown allocation")
    return NextResponse.json(
      { error: isClientError ? msg : "Preview failed" },
      { status: 400 }
    )
  }
}
