/**
 * Cron: /api/cron/onboarding-escalate
 * Schedule: 0 10 * * *  (daily at 10 AM)
 * ─────────────────────────────────────────────────────────────────────────────
 * Escalates approvals that have been pending > 24 hours.
 * Emails admin users to nudge stalled approvals.
 */

import { NextRequest, NextResponse } from "next/server"
import { db } from "@/lib/db"
import { tenants, tenantOnboardingApprovals, users } from "@/lib/db/schema"
import { eq, and, lt } from "drizzle-orm"
import { sendDirectEmail } from "@/lib/notifications/dispatcher"

export async function GET(request: NextRequest) {
  if (request.headers.get("authorization") !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const escalationThreshold = new Date(Date.now() - 24 * 3600_000) // 24 hours ago

  // Find pending approvals older than 24h for tenants in APPROVAL_PENDING stage
  const pendingApprovals = await db
    .select({
      approval: tenantOnboardingApprovals,
      tenant:   tenants,
    })
    .from(tenantOnboardingApprovals)
    .innerJoin(tenants, eq(tenantOnboardingApprovals.tenantId, tenants.id))
    .where(
      and(
        eq(tenantOnboardingApprovals.status, "pending"),
        lt(tenantOnboardingApprovals.createdAt, escalationThreshold),
        eq(tenants.onboardingStatus as any, "APPROVAL_PENDING"),
      )
    )

  // Find admin users to notify
  const adminUsers = await db.query.users.findMany({ where: eq(users.status, "active") })
  const admins = adminUsers.filter((u) => (u as any).roleId || true) // all active users

  let escalated = 0

  for (const { approval, tenant } of pendingApprovals) {
    for (const admin of admins.slice(0, 3)) { // cap at 3 admins
      if (!(admin as any).email) continue
      await sendDirectEmail(
        (admin as any).email,
        `[Escalation] Pending Approval: ${tenant.businessName} (${approval.approverRole})`,
        `<div style="font-family:sans-serif;max-width:600px;margin:0 auto;padding:24px">
          <h2 style="color:#dc2626">⚠ Approval Escalation</h2>
          <p>The following onboarding approval has been pending for more than 24 hours:</p>
          <table style="width:100%;border-collapse:collapse;margin:12px 0">
            <tr><td style="padding:8px;font-weight:bold;background:#fef2f2">Tenant</td><td style="padding:8px">${tenant.businessName}</td></tr>
            <tr><td style="padding:8px;font-weight:bold">Role Required</td><td style="padding:8px;text-transform:capitalize">${approval.approverRole.replace(/_/g, " ")}</td></tr>
            <tr><td style="padding:8px;font-weight:bold;background:#fef2f2">Pending Since</td><td style="padding:8px">${new Date(approval.createdAt).toLocaleDateString("en-IN")}</td></tr>
          </table>
          <p>Please log in to the admin portal to review and approve/reject this request.</p>
          <p style="color:#6b7280;font-size:12px;margin-top:24px">MallOS — Automated Escalation</p>
        </div>`
      ).catch(() => {})
      escalated++
    }
  }

  return NextResponse.json({
    success: true,
    pendingCount: pendingApprovals.length,
    escalationsSent: escalated,
  })
}
