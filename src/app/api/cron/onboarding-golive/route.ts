/**
 * Cron: /api/cron/onboarding-golive
 * Schedule: 0 8 * * *  (daily at 8 AM)
 * ─────────────────────────────────────────────────────────────────────────────
 * Notifies tenants and admin when target opening date is within 3 days.
 * Also auto-advances GO_LIVE_READY tenants whose opening date has arrived.
 */

import { NextRequest, NextResponse } from "next/server"
import { db } from "@/lib/db"
import { tenants, tenantOnboardingChecklist, tenantOnboardingApprovals, leases } from "@/lib/db/schema"
import { eq, and, lte, gte, inArray } from "drizzle-orm"
import { sendDirectEmail } from "@/lib/notifications/dispatcher"

export async function GET(request: NextRequest) {
  if (request.headers.get("authorization") !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const today   = new Date().toISOString().slice(0, 10)
  const in3Days = new Date(Date.now() + 3 * 86_400_000).toISOString().slice(0, 10)

  // Find tenants with opening date within the next 3 days
  const upcomingTenants = await db.query.tenants.findMany({
    where: and(
      inArray(tenants.onboardingStatus as any, ["SETUP_PENDING", "GO_LIVE_READY"]),
      lte(tenants.targetOpeningDate as any, in3Days),
      gte(tenants.targetOpeningDate as any, today),
    ),
  })

  // Auto-advance GO_LIVE_READY check for SETUP_PENDING tenants
  let advanced = 0
  let notified = 0

  for (const tenant of upcomingTenants) {
    const [checklist, approvals, lease] = await Promise.all([
      db.query.tenantOnboardingChecklist.findMany({ where: eq(tenantOnboardingChecklist.tenantId, tenant.id) }),
      db.query.tenantOnboardingApprovals.findMany({ where: eq(tenantOnboardingApprovals.tenantId, tenant.id) }),
      db.query.leases.findFirst({ where: eq(leases.tenantId, tenant.id) }),
    ])

    const requiredDone = checklist.filter((c) => c.required).every((c) => c.completed)
    const allApproved  = approvals.length > 0 && approvals.every((a) => a.status === "approved")
    const leaseReady   = !!lease && lease.status !== "draft"

    if (requiredDone && allApproved && leaseReady && tenant.onboardingStatus === "SETUP_PENDING") {
      await db.update(tenants)
        .set({ onboardingStatus: "GO_LIVE_READY", updatedAt: new Date() })
        .where(eq(tenants.id, tenant.id))
      advanced++
    }

    // Send notification
    if (tenant.email) {
      const daysUntil = Math.ceil(
        (new Date(tenant.targetOpeningDate!).getTime() - Date.now()) / 86_400_000
      )
      await sendDirectEmail(
        tenant.email,
        `${daysUntil <= 0 ? "🚀 Today is Go-Live Day!" : `Go-Live in ${daysUntil} Day${daysUntil === 1 ? "" : "s"}!`} — ${tenant.businessName}`,
        `<div style="font-family:sans-serif;max-width:600px;margin:0 auto;padding:24px">
          <h2 style="color:#059669">${daysUntil <= 0 ? "🚀 Today is Your Go-Live Day!" : `🗓 Opening in ${daysUntil} Day${daysUntil === 1 ? "" : "s"}!`}</h2>
          <p>Dear ${tenant.contactPerson ?? tenant.businessName},</p>
          ${daysUntil <= 0
            ? `<p>Today is your target opening date! Your store should now be ready for customers.</p>`
            : `<p>Your target opening date is <strong>${new Date(tenant.targetOpeningDate!).toLocaleDateString("en-IN", { day: "numeric", month: "long", year: "numeric" })}</strong>.</p>`
          }
          <p>Ensure all setup tasks are complete before opening:</p>
          <ul>
            <li>All documents submitted and verified</li>
            <li>Lease agreement signed</li>
            <li>POS system connected (if applicable)</li>
            <li>Store fit-out completed</li>
          </ul>
          <p style="color:#6b7280;font-size:12px;margin-top:24px">MallOS — Metro Properties Group</p>
        </div>`
      ).catch(() => {})
      notified++
    }
  }

  return NextResponse.json({
    success: true,
    upcoming: upcomingTenants.length,
    advanced,
    notified,
  })
}
