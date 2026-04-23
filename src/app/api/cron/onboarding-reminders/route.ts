/**
 * Cron: /api/cron/onboarding-reminders
 * Schedule: 0 9 * * *  (daily at 9 AM)
 * ─────────────────────────────────────────────────────────────────────────────
 * Sends reminder emails to tenants with incomplete onboarding.
 * Targets stages: LEAD_CREATED, DOCUMENTS_PENDING that are > 3 days old.
 */

import { NextRequest, NextResponse } from "next/server"
import { db } from "@/lib/db"
import { tenants, tenantOnboardingChecklist } from "@/lib/db/schema"
import { eq, and, inArray, lt, isNotNull } from "drizzle-orm"
import { sendDirectEmail } from "@/lib/notifications/dispatcher"

export async function GET(request: NextRequest) {
  if (request.headers.get("authorization") !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const staleThreshold = new Date(Date.now() - 3 * 86_400_000) // 3 days ago

  // Find stale incomplete onboarding tenants
  const staleTenants = await db.query.tenants.findMany({
    where: and(
      inArray(tenants.onboardingStatus as any, ["LEAD_CREATED", "DOCUMENTS_PENDING"]),
      lt(tenants.onboardingStartedAt as any, staleThreshold),
      isNotNull(tenants.email as any),
    ),
  })

  let sent = 0
  const errors: string[] = []

  for (const tenant of staleTenants) {
    if (!tenant.email) continue

    const checklist = await db.query.tenantOnboardingChecklist.findMany({
      where: eq(tenantOnboardingChecklist.tenantId, tenant.id),
    })
    const pending = checklist.filter((c) => c.required && !c.completed)

    const portalUrl = process.env.NEXT_PUBLIC_APP_URL ?? "https://app.mallos.com"

    const result = await sendDirectEmail(
      tenant.email,
      `Action Required: Complete Your Onboarding — ${tenant.businessName}`,
      `<div style="font-family:sans-serif;max-width:600px;margin:0 auto;padding:24px">
        <h2 style="color:#d97706">Onboarding Reminder</h2>
        <p>Dear ${tenant.contactPerson ?? tenant.businessName},</p>
        <p>Your onboarding is still in progress. Please complete the following required steps to activate your store:</p>
        ${pending.length ? `
        <ul style="margin:12px 0;padding-left:20px">
          ${pending.map((c) => `<li>${c.label}</li>`).join("")}
        </ul>` : ""}
        <p>Log in to the admin portal to continue: <a href="${portalUrl}/tenants/onboarding/${tenant.id}">${portalUrl}</a></p>
        <p style="color:#6b7280;font-size:12px;margin-top:24px">This is an automated reminder from MallOS.</p>
      </div>`
    ).catch((e) => ({ success: false, error: String(e) }))

    if ((result as any).success !== false) sent++
    else errors.push(`${tenant.id}: ${(result as any).error}`)
  }

  return NextResponse.json({
    success: true,
    processed: staleTenants.length,
    sent,
    errors,
  })
}
