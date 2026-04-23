/**
 * GET  /api/tenants/onboarding/:id  — full onboarding state
 * PATCH /api/tenants/onboarding/:id — advance stage / update fields
 */

import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { db } from "@/lib/db"
import {
  tenants,
  tenantOnboardingChecklist,
  tenantOnboardingApprovals,
  leases,
} from "@/lib/db/schema"
import { eq, and } from "drizzle-orm"
import { requirePermission, PERMISSIONS } from "@/lib/auth/rbac"
import { writeAuditLog } from "@/lib/audit/log"
import { sanitizeString } from "@/lib/security/sanitize"
import { sendDirectEmail } from "@/lib/notifications/dispatcher"

// Ordered pipeline stages
const STAGES = [
  "LEAD_CREATED",
  "DOCUMENTS_PENDING",
  "LEASE_PENDING",
  "APPROVAL_PENDING",
  "SETUP_PENDING",
  "GO_LIVE_READY",
  "ACTIVE",
] as const

type OnboardingStage = typeof STAGES[number]

// ── GET ───────────────────────────────────────────────────────────────────────

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const { authorized, error } = await requirePermission(PERMISSIONS.ONBOARDING_VIEW)
  if (!authorized) return NextResponse.json({ error }, { status: 403 })

  const tenant = await db.query.tenants.findFirst({ where: eq(tenants.id, params.id) })
  if (!tenant) return NextResponse.json({ error: "Tenant not found" }, { status: 404 })

  const [checklist, approvals, lease] = await Promise.all([
    db.query.tenantOnboardingChecklist.findMany({ where: eq(tenantOnboardingChecklist.tenantId, params.id) }),
    db.query.tenantOnboardingApprovals.findMany({ where: eq(tenantOnboardingApprovals.tenantId, params.id) }),
    db.query.leases.findFirst({ where: eq(leases.tenantId, params.id) }),
  ])

  const stageIndex  = STAGES.indexOf((tenant.onboardingStatus as OnboardingStage) ?? "LEAD_CREATED")
  const checklistPct = checklist.length
    ? Math.round(checklist.filter((c) => c.completed).length / checklist.length * 100)
    : 0
  const allApproved  = approvals.length > 0 && approvals.every((a) => a.status === "approved")

  // Go-live readiness flags
  const goLiveFlags = {
    documentsComplete: checklist.filter((c) => c.required).every((c) => c.completed),
    leaseSigned:       !!lease && lease.status !== "draft",
    approvalsComplete: allApproved,
    billingConfigured: !!lease?.baseRent || !!lease?.revenueSharePercentage,
    posConnected:      false, // optional — checked separately
    openingDateSet:    !!tenant.targetOpeningDate,
  }
  const isGoLiveReady = Object.entries(goLiveFlags)
    .filter(([k]) => k !== "posConnected")
    .every(([, v]) => v)

  return NextResponse.json({
    success: true,
    data: {
      tenant,
      onboardingStatus: tenant.onboardingStatus,
      stageIndex,
      stages:           STAGES,
      checklist,
      checklistPct,
      approvals,
      allApproved,
      lease,
      goLiveFlags,
      isGoLiveReady,
    },
  })
}

// ── PATCH ─────────────────────────────────────────────────────────────────────

export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const { authorized, error } = await requirePermission(PERMISSIONS.ONBOARDING_MANAGE)
  if (!authorized) return NextResponse.json({ error }, { status: 403 })

  const session = await auth()
  const organizationId = session?.user?.organizationId ?? ""

  const tenant = await db.query.tenants.findFirst({ where: eq(tenants.id, params.id) })
  if (!tenant) return NextResponse.json({ error: "Tenant not found" }, { status: 404 })

  let body: Record<string, unknown>
  try { body = await request.json() } catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }) }

  const updates: Record<string, unknown> = { updatedAt: new Date() }

  // ── Allowed field updates ──────────────────────────────────────────────────
  const textFields = [
    "businessName", "brandName", "legalEntityName", "category",
    "contactPerson", "email", "phone", "gstin", "pan", "tradeLicense",
  ] as const
  for (const f of textFields) {
    if (f in body) updates[f] = sanitizeString(String(body[f] || "").trim())
  }
  if ("targetOpeningDate"  in body) updates.targetOpeningDate  = body.targetOpeningDate
  if ("propertyId"         in body) updates.propertyId         = body.propertyId
  if ("emergencyContact"   in body) updates.emergencyContact   = body.emergencyContact
  if ("metadata"           in body) updates.metadata           = body.metadata

  // ── Checklist item toggle ──────────────────────────────────────────────────
  if (body.checklistItem) {
    const { item, completed, documentId } = body.checklistItem as {
      item: string; completed: boolean; documentId?: string
    }
    await db.update(tenantOnboardingChecklist)
      .set({
        completed,
        completedAt: completed ? new Date() : null,
        completedBy: completed ? (session?.user?.id ?? null) : null,
        documentId:  documentId ?? null,
        updatedAt:   new Date(),
      })
      .where(and(
        eq(tenantOnboardingChecklist.tenantId, params.id),
        eq(tenantOnboardingChecklist.item, item),
      ))
  }

  // ── Stage advancement ──────────────────────────────────────────────────────
  if (body.advanceToStage) {
    const target = body.advanceToStage as string
    if (!STAGES.includes(target as OnboardingStage)) {
      return NextResponse.json({ error: `Invalid stage: ${target}` }, { status: 422 })
    }
    updates.onboardingStatus = target
    if (target === "ACTIVE") updates.onboardingCompletedAt = new Date()
  }

  const before = { ...tenant }
  await db.update(tenants).set(updates as Record<string, unknown>).where(eq(tenants.id, params.id))

  await writeAuditLog({
    organizationId,
    action:   "onboarding.update",
    entity:   "tenant",
    entityId: params.id,
    before:   before as Record<string, unknown>,
    after:    updates,
    userId:   session?.user?.id,
  })

  const updated = await db.query.tenants.findFirst({ where: eq(tenants.id, params.id) })
  return NextResponse.json({ success: true, data: updated })
}
