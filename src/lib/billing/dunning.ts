/**
 * Dunning management — payment failure retry and recovery
 * ────────────────────────────────────────────────────────
 * Called from:
 *   - Webhook handlers (when payment fails)
 *   - Cron job (/api/cron/process-dunning) which executes due steps
 *
 * Schedule (days after first payment failure):
 *   Day  0: Email warning #1 + schedule payment retry
 *   Day  3: Payment retry attempt #1
 *   Day  6: Email warning #2 (urgent)
 *   Day  7: Payment retry attempt #2
 *   Day 10: Email warning #3 (final) + restrict access (read-only)
 *   Day 30: Cancel subscription
 */

import { sql, eq, and, lte } from "drizzle-orm"
import { addDays } from "date-fns"
import { Resend } from "resend"
import { serviceDb } from "@/lib/db"
import {
  subscriptions,
  dunning_attempts,
  organizations,
  users,
} from "@/lib/db/schema"
import {
  cancelRazorpaySubscription,
  getRazorpaySubscription,
} from "./razorpay"
import { cancelStripeSubscription } from "./stripe"
import { DUNNING_SCHEDULE, type DunningStepType } from "./plans"

// ── Initiate dunning on first payment failure ─────────────────────────────────

export async function initiateDunning(opts: {
  subscriptionId:  string
  organizationId:  string
  failedAt:        Date
}): Promise<void> {
  const { subscriptionId, organizationId, failedAt } = opts

  // Update subscription state
  await serviceDb
    .update(subscriptions)
    .set({
      status:                "past_due",
      payment_failed_at:      failedAt,
      payment_failure_count:  sql`payment_failure_count + 1`,
      grace_period_ends_at:   addDays(failedAt, 10),
      updated_at:             new Date(),
    })
    .where(eq(subscriptions.id, subscriptionId))

  // Schedule all dunning steps
  const attempts = DUNNING_SCHEDULE.map((step) => ({
    subscription_id: subscriptionId,
    organization_id: organizationId,
    attempt_number:  step.attemptNumber,
    attempt_type:    step.type,
    scheduled_at:    addDays(failedAt, step.day),
    status:          "scheduled" as const,
  }))

  // Skip steps that have already been scheduled (idempotent)
  await serviceDb
    .insert(dunning_attempts)
    .values(attempts)
    .onConflictDoNothing()
}

// ── Process due dunning steps (called by cron) ────────────────────────────────

export interface DunningResult {
  processed:  number
  succeeded:  number
  failed:     Array<{ attemptId: string; error: string }>
}

export async function processDueDunningSteps(): Promise<DunningResult> {
  const now = new Date()

  // Fetch all scheduled steps that are due
  const due = await serviceDb
    .select()
    .from(dunning_attempts)
    .where(
      and(
        eq(dunning_attempts.status, "scheduled"),
        lte(dunning_attempts.scheduled_at, now)
      )
    )
    .limit(100)  // Process in batches; cron runs every 15 min

  const result: DunningResult = { processed: due.length, succeeded: 0, failed: [] }

  for (const attempt of due) {
    try {
      await executeDunningStep(attempt)
      await serviceDb
        .update(dunning_attempts)
        .set({ status: "succeeded", executed_at: now })
        .where(eq(dunning_attempts.id, attempt.id))
      result.succeeded++
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : String(err)
      await serviceDb
        .update(dunning_attempts)
        .set({ status: "failed", result: { error: errMsg }, executed_at: now })
        .where(eq(dunning_attempts.id, attempt.id))
      result.failed.push({ attemptId: attempt.id, error: errMsg })
    }
  }

  return result
}

// ── Execute a single dunning step ─────────────────────────────────────────────

async function executeDunningStep(
  attempt: typeof dunning_attempts.$inferSelect
): Promise<void> {
  const stepType = attempt.attempt_type as DunningStepType

  // Fetch subscription + org details
  const subRow = await serviceDb
    .select({
      sub:          subscriptions,
      orgName:      organizations.name,
      adminEmail:   sql<string>`(
        SELECT email FROM users
        WHERE organization_id = ${attempt.organization_id}::uuid
          AND status = 'active'
        ORDER BY created_at ASC
        LIMIT 1
      )`,
    })
    .from(subscriptions)
    .innerJoin(organizations, eq(organizations.id, subscriptions.organization_id))
    .where(eq(subscriptions.id, attempt.subscription_id))
    .limit(1)

  const row = subRow[0]
  if (!row) throw new Error(`Subscription ${attempt.subscription_id} not found`)

  const { sub, orgName, adminEmail } = row

  switch (stepType) {
    case "email_warning":
      await sendDunningEmail({
        to:             adminEmail,
        orgName,
        attemptNumber:  attempt.attempt_number,
        failedAt:       sub.payment_failed_at!,
        gracePeriodEnd: sub.grace_period_ends_at!,
      })
      break

    case "payment_retry":
      await retryPayment({ sub })
      break

    case "downgrade":
      // Restrict access by marking subscription as paused
      await serviceDb
        .update(subscriptions)
        .set({ status: "paused", updated_at: new Date() })
        .where(eq(subscriptions.id, sub.id))
      await sendAccessRestrictedEmail({ to: adminEmail, orgName })
      break

    case "cancellation":
      await cancelSubscription({ sub })
      await sendCancellationEmail({ to: adminEmail, orgName })
      break
  }
}

// ── Payment retry ─────────────────────────────────────────────────────────────

async function retryPayment(opts: {
  sub: typeof subscriptions.$inferSelect
}): Promise<void> {
  const { sub } = opts

  if (sub.provider === "razorpay" && sub.provider_subscription_id) {
    // Razorpay automatically retries — fetching the subscription triggers a check
    const rzpSub = await getRazorpaySubscription(sub.provider_subscription_id)
    if (rzpSub.status === "active") {
      await serviceDb
        .update(subscriptions)
        .set({
          status:                "active",
          payment_failed_at:     null,
          payment_failure_count: 0,
          next_retry_at:         null,
          updated_at:            new Date(),
        })
        .where(eq(subscriptions.id, sub.id))
    }
    // If still failed, Razorpay will fire another payment.failed webhook
  }

  if (sub.provider === "stripe" && sub.provider_subscription_id) {
    // Stripe auto-retries via smart retries; we just poll status
    // For manual retry: create a payment intent on the latest invoice
    // (handled by Stripe's built-in retry logic via subscription settings)
  }
}

// ── Subscription cancellation ─────────────────────────────────────────────────

async function cancelSubscription(opts: {
  sub: typeof subscriptions.$inferSelect
}): Promise<void> {
  const { sub } = opts

  if (sub.provider === "razorpay" && sub.provider_subscription_id) {
    await cancelRazorpaySubscription({
      providerSubscriptionId: sub.provider_subscription_id,
      cancelAtCycleEnd:       false,  // Immediate for non-payment
    }).catch(() => {})  // Swallow — may already be cancelled in provider
  }

  if (sub.provider === "stripe" && sub.provider_subscription_id) {
    await cancelStripeSubscription({
      providerSubscriptionId: sub.provider_subscription_id,
      cancelAtPeriodEnd:      false,
    }).catch(() => {})
  }

  await serviceDb
    .update(subscriptions)
    .set({
      status:       "cancelled",
      cancelled_at: new Date(),
      updated_at:   new Date(),
    })
    .where(eq(subscriptions.id, sub.id))
}

// ── Email sequences ───────────────────────────────────────────────────────────

function getResend(): Resend {
  return new Resend(process.env.RESEND_API_KEY!)
}

async function sendDunningEmail(opts: {
  to:             string
  orgName:        string
  attemptNumber:  number
  failedAt:       Date
  gracePeriodEnd: Date
}): Promise<void> {
  const { to, orgName, attemptNumber, gracePeriodEnd } = opts
  const resend    = getResend()
  const graceDate = gracePeriodEnd.toLocaleDateString("en-IN", { day: "numeric", month: "long" })

  const subjects: Record<number, string> = {
    1: `Action required: Payment failed for ${orgName}`,
    2: `Urgent: Second payment attempt failed — ${orgName}`,
    3: `Final notice: Access will be restricted on ${graceDate} — ${orgName}`,
  }

  const bodies: Record<number, string> = {
    1: `
      <h2>Payment Failed</h2>
      <p>We were unable to process your subscription payment for <strong>${orgName}</strong>.</p>
      <p>We'll automatically retry in 3 days. To avoid interruption, please ensure your payment method is up to date.</p>
      <p><a href="${process.env.NEXT_PUBLIC_APP_URL}/billing">Update payment method →</a></p>
    `,
    2: `
      <h2>Second Payment Attempt Failed</h2>
      <p>We've made two attempts to charge your account for <strong>${orgName}</strong>, but both have failed.</p>
      <p>Your access will be restricted on <strong>${graceDate}</strong> if payment is not received.</p>
      <p><a href="${process.env.NEXT_PUBLIC_APP_URL}/billing">Pay now →</a></p>
    `,
    3: `
      <h2>Final Notice — Access Restriction Imminent</h2>
      <p>This is your final notice. Your account for <strong>${orgName}</strong> will be moved to read-only mode today.</p>
      <p>All your data is safe. Pay now to restore full access immediately.</p>
      <p><a href="${process.env.NEXT_PUBLIC_APP_URL}/billing">Restore access →</a></p>
    `,
  }

  await resend.emails.send({
    from:    "Mallos Billing <billing@mallos.com>",
    to,
    subject: subjects[attemptNumber] ?? subjects[1],
    html:    bodies[attemptNumber]   ?? bodies[1],
  })
}

async function sendAccessRestrictedEmail(opts: { to: string; orgName: string }): Promise<void> {
  const resend = getResend()
  await resend.emails.send({
    from:    "Mallos Billing <billing@mallos.com>",
    to:      opts.to,
    subject: `Account restricted — ${opts.orgName}`,
    html: `
      <h2>Account Access Restricted</h2>
      <p>Your account for <strong>${opts.orgName}</strong> has been moved to read-only mode
      due to an unpaid subscription.</p>
      <p>Your data is safe. Pay now to immediately restore full access.</p>
      <p><a href="${process.env.NEXT_PUBLIC_APP_URL}/billing">Pay now →</a></p>
    `,
  })
}

async function sendCancellationEmail(opts: { to: string; orgName: string }): Promise<void> {
  const resend = getResend()
  await resend.emails.send({
    from:    "Mallos Billing <billing@mallos.com>",
    to:      opts.to,
    subject: `Subscription cancelled — ${opts.orgName}`,
    html: `
      <h2>Subscription Cancelled</h2>
      <p>Your Mallos subscription for <strong>${opts.orgName}</strong> has been cancelled
      after 30 days of non-payment.</p>
      <p>Your data will be retained for 90 days. To reactivate, please subscribe again.</p>
      <p><a href="${process.env.NEXT_PUBLIC_APP_URL}/billing/plans">Resubscribe →</a></p>
    `,
  })
}
