import { NextRequest, NextResponse } from "next/server"
import { PERMISSIONS, requirePermission } from "@/lib/auth/rbac"
import {
  ensureTenantExists,
  getOrCreateOnboarding,
  getDocuments,
  computeProgress,
} from "@/lib/tenants/onboarding-service"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

/**
 * GET /api/tenants/[id]/onboarding/progress
 * Returns { progress, checklistProgress, documentProgress, status }.
 */
export async function GET(
  _req: NextRequest,
  { params }: { params: { id: string } },
) {
  const { authorized, error } = await requirePermission(PERMISSIONS.TENANTS_VIEW)
  if (!authorized) return NextResponse.json({ error }, { status: 403 })

  const tenantId = params.id
  if (!UUID_RE.test(tenantId)) {
    return NextResponse.json({ error: "Invalid tenant ID" }, { status: 400 })
  }

  if (!(await ensureTenantExists(tenantId))) {
    return NextResponse.json({ error: "Tenant not found" }, { status: 404 })
  }

  try {
    const onboarding = await getOrCreateOnboarding(tenantId)
    const documents = await getDocuments(tenantId)
    const result = computeProgress(onboarding, documents)

    return NextResponse.json({ success: true, data: result })
  } catch (err) {
    console.error("[tenants/onboarding/progress] GET error:", err)
    return NextResponse.json({ error: "Internal error" }, { status: 500 })
  }
}
