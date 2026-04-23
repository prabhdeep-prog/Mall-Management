import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { requirePermission, PERMISSIONS } from "@/lib/auth/rbac"
import { allocateCAM } from "@/lib/cam/allocate"
import { deleteCache } from "@/lib/cache"

export async function POST(request: NextRequest) {
  try {
    const session = await auth()
    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const { authorized, error } = await requirePermission(PERMISSIONS.CAM_ALLOCATE)
    if (!authorized) return NextResponse.json({ error }, { status: 403 })

    const body = await request.json()
    const { chargeId } = body

    if (!chargeId) {
      return NextResponse.json(
        { error: "Missing required field: chargeId" },
        { status: 400 }
      )
    }

    const result = await allocateCAM(chargeId)

    await deleteCache("cam:charges:")
    await deleteCache("cam:allocations:")

    return NextResponse.json({ success: true, data: result })
  } catch (error) {
    console.error("Allocate CAM error:", error)
    const msg = error instanceof Error ? error.message : ""
    const isClientError = msg.includes("not found") || msg.includes("already allocated") || msg.includes("No active tenants")
    return NextResponse.json(
      { error: isClientError ? msg : "Operation failed" },
      { status: isClientError ? 400 : 500 }
    )
  }
}
