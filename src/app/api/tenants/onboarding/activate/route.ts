/**
 * POST /api/tenants/onboarding/activate
 * ─────────────────────────────────────────────────────────────────────────────
 * Final activation step: moves tenant to ACTIVE, creates portal user,
 * enables billing and notifications, sends welcome email.
 *
 * Body: { tenantId: string }
 *
 * Pre-conditions checked:
 *   • All required checklist items complete
 *   • Lease exists and is not draft
 *   • All approvals are "approved"
 */

import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { db } from "@/lib/db"
import {
  tenants,
  tenantOnboardingChecklist,
  tenantOnboardingApprovals,
  leases,
  tenantUsers,
} from "@/lib/db/schema"
import { eq } from "drizzle-orm"
import { requirePermission, PERMISSIONS } from "@/lib/auth/rbac"
import { writeAuditLog } from "@/lib/audit/log"
import { sendDirectEmail } from "@/lib/notifications/dispatcher"
import bcrypt from "bcryptjs"

function generateTempPassword(): string {
  const chars = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!@#"
  return Array.from({ length: 12 }, () => chars[Math.floor(Math.random() * chars.length)]).join("")
}

export async function POST(request: NextRequest) {
  const { authorized, error } = await requirePermission(PERMISSIONS.ONBOARDING_MANAGE)
  if (!authorized) return NextResponse.json({ error }, { status: 403 })

  const session = await auth()
  const organizationId = session?.user?.organizationId ?? ""

  let body: { tenantId: string }
  try { body = await request.json() } catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }) }

  const { tenantId } = body
  if (!tenantId) return NextResponse.json({ error: "tenantId required" }, { status: 400 })

  const tenant = await db.query.tenants.findFirst({ where: eq(tenants.id, tenantId) })
  if (!tenant) return NextResponse.json({ error: "Tenant not found" }, { status: 404 })

  // ── Pre-activation gates ───────────────────────────────────────────────────
  const [checklist, approvals, lease] = await Promise.all([
    db.query.tenantOnboardingChecklist.findMany({ where: eq(tenantOnboardingChecklist.tenantId, tenantId) }),
    db.query.tenantOnboardingApprovals.findMany({ where: eq(tenantOnboardingApprovals.tenantId, tenantId) }),
    db.query.leases.findFirst({ where: eq(leases.tenantId, tenantId) }),
  ])

  const requiredItems = checklist.filter((c) => c.required)
  const incompleteRequired = requiredItems.filter((c) => !c.completed)
  if (incompleteRequired.length) {
    return NextResponse.json({
      error:   "Cannot activate: required checklist items incomplete",
      missing: incompleteRequired.map((c) => c.label),
    }, { status: 409 })
  }

  if (!lease || lease.status === "draft") {
    return NextResponse.json({ error: "Cannot activate: no active lease found" }, { status: 409 })
  }

  const unapproved = approvals.filter((a) => a.status !== "approved")
  if (unapproved.length) {
    return NextResponse.json({
      error:    "Cannot activate: pending approvals",
      pending:  unapproved.map((a) => a.approverRole),
    }, { status: 409 })
  }

  // ── System setup ───────────────────────────────────────────────────────────
  // 1. Activate tenant
  await db.update(tenants)
    .set({
      status:               "active",
      onboardingStatus:     "ACTIVE",
      onboardingCompletedAt: new Date(),
      updatedAt:            new Date(),
    })
    .where(eq(tenants.id, tenantId))

  // 2. Create portal user (if email exists and no portal user yet)
  let tempPassword: string | null = null
  if (tenant.email) {
    const existingPortalUser = await db.query.tenantUsers.findFirst({
      where: eq(tenantUsers.tenantId, tenantId),
    })
    if (!existingPortalUser) {
      tempPassword = generateTempPassword()
      const passwordHash = await bcrypt.hash(tempPassword, 10)
      await db.insert(tenantUsers).values({
        id:           crypto.randomUUID(),
        tenantId,
        email:        tenant.email,
        passwordHash,
        name:         tenant.contactPerson ?? tenant.businessName,
        isActive:     true,
      })
    }
  }

  // 3. Send activation email
  if (tenant.email) {
    const portalUrl = process.env.NEXT_PUBLIC_APP_URL ?? "https://app.mallos.com"
    await sendDirectEmail(
      tenant.email,
      `Welcome to MallOS — ${tenant.businessName} is now LIVE!`,
      `<div style="font-family:sans-serif;max-width:600px;margin:0 auto;padding:24px">
        <h2 style="color:#059669">🎉 Your store is now live on MallOS!</h2>
        <p>Dear ${tenant.contactPerson ?? tenant.businessName},</p>
        <p>Congratulations! Your onboarding is complete. You can now access the <strong>Tenant Portal</strong>.</p>
        ${tempPassword ? `
        <div style="background:#f0fdf4;border:1px solid #bbf7d0;border-radius:8px;padding:16px;margin:16px 0">
          <strong>Tenant Portal Login:</strong><br>
          URL: <a href="${portalUrl}/tenant/login">${portalUrl}/tenant/login</a><br>
          Email: ${tenant.email}<br>
          Temporary Password: <code style="background:#e5e7eb;padding:2px 6px;border-radius:4px">${tempPassword}</code><br>
          <em>Please change your password on first login.</em>
        </div>` : ""}
        <p>From the portal you can view invoices, raise support tickets, track your POS data, and more.</p>
        <p style="color:#6b7280;font-size:12px;margin-top:32px">MallOS — Metro Properties Group</p>
      </div>`
    ).catch(() => {})
  }

  await writeAuditLog({
    organizationId,
    action:   "onboarding.activate",
    entity:   "tenant",
    entityId: tenantId,
    before:   { status: tenant.status, onboardingStatus: tenant.onboardingStatus },
    after:    { status: "active", onboardingStatus: "ACTIVE" },
    userId:   session?.user?.id,
    ipAddress: request.headers.get("x-forwarded-for") ?? null,
  })

  return NextResponse.json({
    success: true,
    data: {
      tenantId,
      status:           "active",
      onboardingStatus: "ACTIVE",
      portalUserCreated: !!tempPassword,
      message: `${tenant.businessName} is now an active tenant.`,
    },
  })
}
