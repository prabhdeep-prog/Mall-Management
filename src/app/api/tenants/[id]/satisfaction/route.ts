import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { PERMISSIONS, requirePermission } from "@/lib/auth/rbac"
import {
  calculateTenantSatisfaction,
  getLatestSatisfaction,
} from "@/lib/tenants/satisfaction-engine"

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { authorized, error } = await requirePermission(PERMISSIONS.TENANTS_VIEW)
    if (!authorized) {
      return NextResponse.json({ error }, { status: 403 })
    }

    const session = await auth()
    const organizationId = session?.user?.organizationId || "default"
    const { id: tenantId } = await params

    const { searchParams } = new URL(request.url)
    const recalculate = searchParams.get("recalculate") === "true"

    let result
    if (recalculate) {
      result = await calculateTenantSatisfaction(organizationId, tenantId)
    } else {
      result = await getLatestSatisfaction(tenantId)
      // If no cached result, calculate fresh
      if (!result) {
        result = await calculateTenantSatisfaction(organizationId, tenantId)
      }
    }

    if (!result) {
      return NextResponse.json(
        { error: "Tenant not found or no data available" },
        { status: 404 }
      )
    }

    return NextResponse.json({
      success: true,
      data: {
        score: result.score,
        level: result.level,
        breakdown: result.breakdown,
        calculatedAt: result.calculatedAt,
      },
    })
  } catch (err) {
    console.error("[satisfaction] Error:", err)
    return NextResponse.json(
      { error: "Failed to calculate satisfaction score" },
      { status: 500 }
    )
  }
}
