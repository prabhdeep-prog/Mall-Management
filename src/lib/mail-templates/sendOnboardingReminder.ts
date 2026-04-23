/**
 * sendOnboardingReminder(tenant)
 * ──────────────────────────────
 * Detects pending onboarding checklist items for a tenant, builds the
 * reminder email from the template, and sends it via SMTP.
 *
 * Returns the sendMail result so callers can check success/failure.
 */
import { eq } from "drizzle-orm"
import { db } from "@/lib/db"
import { tenants, tenantOnboarding, tenantDocuments } from "@/lib/db/schema"
import { sendMail, type SendMailResult } from "@/lib/mail"
import { onboardingReminderTemplate } from "./onboardingReminder"

// The human-readable label for each checklist field.
const CHECKLIST_LABELS: Record<string, string> = {
  kycCompleted: "Complete KYC verification",
  leaseSigned: "Sign the lease agreement",
  depositPaid: "Pay the security deposit",
  posConnected: "Connect your POS system",
  storeOpeningDate: "Set a store opening date",
}

const REQUIRED_DOC_LABELS: Record<string, string> = {
  GST: "Upload GST certificate",
  PAN: "Upload PAN card",
  AGREEMENT: "Upload signed agreement copy",
}

export async function sendOnboardingReminder(
  tenantId: string,
): Promise<SendMailResult> {
  // ── 1. Fetch tenant, onboarding row, and documents ────────────────────
  const [tenant] = await db
    .select({ businessName: tenants.businessName, email: tenants.email })
    .from(tenants)
    .where(eq(tenants.id, tenantId))
    .limit(1)

  if (!tenant) {
    return { success: false, error: "Tenant not found" }
  }
  if (!tenant.email) {
    return { success: false, error: "Tenant has no email address" }
  }

  const [onboarding] = await db
    .select()
    .from(tenantOnboarding)
    .where(eq(tenantOnboarding.tenantId, tenantId))
    .limit(1)

  const docs = await db
    .select()
    .from(tenantDocuments)
    .where(eq(tenantDocuments.tenantId, tenantId))

  // ── 2. Detect pending items ───────────────────────────────────────────
  const pendingItems: string[] = []

  if (onboarding) {
    if (!onboarding.kycCompleted) pendingItems.push(CHECKLIST_LABELS.kycCompleted)
    if (!onboarding.leaseSigned) pendingItems.push(CHECKLIST_LABELS.leaseSigned)
    if (!onboarding.depositPaid) pendingItems.push(CHECKLIST_LABELS.depositPaid)
    if (!onboarding.posConnected) pendingItems.push(CHECKLIST_LABELS.posConnected)
    if (!onboarding.storeOpeningDate) pendingItems.push(CHECKLIST_LABELS.storeOpeningDate)
  } else {
    // No onboarding row yet — everything is pending.
    pendingItems.push(...Object.values(CHECKLIST_LABELS))
  }

  // Required documents that are not yet verified.
  for (const [type, label] of Object.entries(REQUIRED_DOC_LABELS)) {
    const doc = docs.find((d) => d.type === type)
    if (!doc || doc.status !== "verified") {
      pendingItems.push(label)
    }
  }

  if (pendingItems.length === 0) {
    return { success: true, messageId: "no-op:already-complete" }
  }

  // ── 3. Build and send ─────────────────────────────────────────────────
  const html = onboardingReminderTemplate({
    tenantName: tenant.businessName,
    pendingItems,
  })

  return sendMail({
    to: tenant.email,
    subject: "Action Required: Complete Your Onboarding",
    html,
  })
}
