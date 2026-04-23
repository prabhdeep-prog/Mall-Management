/**
 * POST /api/tenants/onboarding/approve
 * ─────────────────────────────────────────────────────────────────────────────
 * Records an approval / rejection from a role-holder.
 * When all three roles have approved, advances onboarding → SETUP_PENDING
 * and sends a system-setup email to the initiator.
 *
 * Body:
 *   tenantId   string
 *   decision   "approved" | "rejected"
 *   comments   string (optional)
 */

import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { db } from "@/lib/db"
import { tenants, tenantOnboardingApprovals, users } from "@/lib/db/schema"
import { eq, and } from "drizzle-orm"
import { requirePermission, PERMISSIONS } from "@/lib/auth/rbac"
import { writeAuditLog } from "@/lib/audit/log"
import { sendDirectEmail } from "@/lib/notifications/dispatcher"

// Map session roles → approval role keys
const SESSION_ROLE_TO_APPROVER: Record<string, string> = {
  organization_admin:  "leasing_manager",
  property_manager:    "leasing_manager",
  finance_manager:     "finance_manager",
  operations_manager:  "operations_manager",
  super_admin:         "leasing_manager",  // super_admin can approve any
}

export async function POST(request: NextRequest) {
  const { authorized, error } = await requirePermission(PERMISSIONS.ONBOARDING_APPROVE)
  if (!authorized) return NextResponse.json({ error }, { status: 403 })

  const session = await auth()
  const organizationId = session?.user?.organizationId ?? ""
  const userId         = session?.user?.id

  let body: { tenantId: string; decision: "approved" | "rejected"; comments?: string; approverRole?: string }
  try { body = await request.json() } catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }) }

  const { tenantId, decision, comments } = body
  if (!tenantId) return NextResponse.json({ error: "tenantId required" }, { status: 400 })
  if (!["approved", "rejected"].includes(decision))
    return NextResponse.json({ error: "decision must be 'approved' or 'rejected'" }, { status: 422 })

  const tenant = await db.query.tenants.findFirst({ where: eq(tenants.id, tenantId) })
  if (!tenant) return NextResponse.json({ error: "Tenant not found" }, { status: 404 })
  if (tenant.onboardingStatus !== "APPROVAL_PENDING")
    return NextResponse.json({ error: "Tenant is not in APPROVAL_PENDING stage" }, { status: 409 })

  // Determine which approval slot this user fills
  const userRole   = session?.user?.role ?? "viewer"
  const approverRole = body.approverRole || SESSION_ROLE_TO_APPROVER[userRole] || "leasing_manager"

  // Update (or insert-if-not-exists) the approval row
  await db.update(tenantOnboardingApprovals)
    .set({
      status:     decision,
      approvedBy: userId,
      approvedAt: new Date(),
      comments:   comments ?? null,
      updatedAt:  new Date(),
    })
    .where(and(
      eq(tenantOnboardingApprovals.tenantId, tenantId),
      eq(tenantOnboardingApprovals.approverRole, approverRole),
    ))

  // Check if all required roles have approved
  const allApprovals = await db.query.tenantOnboardingApprovals.findMany({
    where: eq(tenantOnboardingApprovals.tenantId, tenantId),
  })
  const allApproved  = allApprovals.every((a) => a.status === "approved")
  const anyRejected  = allApprovals.some((a)  => a.status === "rejected")

  if (anyRejected) {
    // Revert to DOCUMENTS_PENDING so team can fix issues
    await db.update(tenants)
      .set({ onboardingStatus: "DOCUMENTS_PENDING", updatedAt: new Date() })
      .where(eq(tenants.id, tenantId))

    // Notify initiator
    if (tenant.email) {
      await sendDirectEmail(
        tenant.email,
        `Onboarding Rejected: ${tenant.businessName}`,
        `<p>Your onboarding application for <strong>${tenant.businessName}</strong> has been rejected by one or more approvers.</p>
         <p><strong>Comments:</strong> ${comments || "No comments provided."}</p>
         <p>Please contact your property manager for next steps.</p>`
      ).catch(() => {})
    }
  } else if (allApproved) {
    await db.update(tenants)
      .set({ onboardingStatus: "SETUP_PENDING", updatedAt: new Date() })
      .where(eq(tenants.id, tenantId))
  }

  await writeAuditLog({
    organizationId,
    action:   `onboarding.${decision}`,
    entity:   "tenant",
    entityId: tenantId,
    after:    { approverRole, decision, comments },
    userId,
  })

  return NextResponse.json({
    success: true,
    data: {
      approverRole,
      decision,
      allApproved,
      anyRejected,
      newStatus: anyRejected ? "DOCUMENTS_PENDING" : allApproved ? "SETUP_PENDING" : "APPROVAL_PENDING",
    },
  })
}
