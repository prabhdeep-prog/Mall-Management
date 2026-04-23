import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { PERMISSIONS, requirePermission } from "@/lib/auth/rbac"
import {
  ensureTenantExists,
  getOrCreateOnboarding,
  getDocuments,
  computeProgress,
  updateChecklist,
  type ChecklistUpdate,
} from "@/lib/tenants/onboarding-service"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

/**
 * GET /api/tenants/[id]/onboarding
 * Returns checklist, documents, progress, and status.
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
    const progress = computeProgress(onboarding, documents)

    return NextResponse.json({
      success: true,
      data: {
        checklist: {
          kycCompleted: onboarding.kycCompleted,
          leaseSigned: onboarding.leaseSigned,
          depositPaid: onboarding.depositPaid,
          posConnected: onboarding.posConnected,
          storeOpeningDate: onboarding.storeOpeningDate,
          completedAt: onboarding.completedAt,
        },
        documents,
        progress: progress.progress,
        checklistProgress: progress.checklistProgress,
        documentProgress: progress.documentProgress,
        status: progress.status,
      },
    })
  } catch (err) {
    console.error("[tenants/onboarding] GET error:", err)
    return NextResponse.json({ error: "Internal error" }, { status: 500 })
  }
}

/**
 * PATCH /api/tenants/[id]/onboarding
 * Update checklist fields. Auto-sets completedAt when everything is done.
 */
export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } },
) {
  const { authorized, error } = await requirePermission(PERMISSIONS.TENANTS_EDIT)
  if (!authorized) return NextResponse.json({ error }, { status: 403 })

  const tenantId = params.id
  if (!UUID_RE.test(tenantId)) {
    return NextResponse.json({ error: "Invalid tenant ID" }, { status: 400 })
  }

  if (!(await ensureTenantExists(tenantId))) {
    return NextResponse.json({ error: "Tenant not found" }, { status: 404 })
  }

  let body: ChecklistUpdate
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 })
  }

  // Validate: only known fields.
  const allowed = new Set(["kycCompleted", "leaseSigned", "depositPaid", "posConnected", "storeOpeningDate"])
  for (const key of Object.keys(body)) {
    if (!allowed.has(key)) {
      return NextResponse.json({ error: `Unknown field: ${key}` }, { status: 400 })
    }
  }

  try {
    const updated = await updateChecklist(tenantId, body)
    const documents = await getDocuments(tenantId)
    const progress = computeProgress(updated, documents)

    return NextResponse.json({
      success: true,
      data: {
        checklist: {
          kycCompleted: updated.kycCompleted,
          leaseSigned: updated.leaseSigned,
          depositPaid: updated.depositPaid,
          posConnected: updated.posConnected,
          storeOpeningDate: updated.storeOpeningDate,
          completedAt: updated.completedAt,
        },
        progress: progress.progress,
        status: progress.status,
      },
    })
  } catch (err) {
    console.error("[tenants/onboarding] PATCH error:", err)
    return NextResponse.json({ error: "Internal error" }, { status: 500 })
  }
}
