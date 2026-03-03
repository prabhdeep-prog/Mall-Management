/**
 * Stripe Webhook Handler
 * ───────────────────────
 * Endpoint: POST /api/webhooks/stripe
 *
 * Security:
 *   • Stripe-Signature header verified via constructStripeEvent (HMAC-SHA256)
 *   • Idempotency key = Stripe event ID stored in billing_events
 *   • Returns 200 on duplicate events to prevent Stripe retrying
 *
 * Events handled:
 *   checkout.session.completed          → link Stripe sub ID to our record
 *   customer.subscription.created       → status=active/trialing
 *   customer.subscription.updated       → sync status changes
 *   customer.subscription.deleted       → status=cancelled
 *   invoice.payment_succeeded           → status=active, update period dates
 *   invoice.payment_failed              → status=past_due, initiate dunning
 *   customer.subscription.trial_will_end → informational (could send reminder email)
 */

import { NextRequest, NextResponse } from "next/server"
import type Stripe from "stripe"
import { eq } from "drizzle-orm"
import { serviceDb } from "@/lib/db"
import { subscriptions, billing_events } from "@/lib/db/schema"
import { constructStripeEvent, stripeSubStatusToInternal } from "@/lib/billing/stripe"
import { initiateDunning } from "@/lib/billing/dunning"

export async function POST(request: NextRequest) {
  // ── 1. Read raw body as Buffer (Stripe requires this for signature verification) ─
  const rawBody  = Buffer.from(await request.arrayBuffer())
  const signature = request.headers.get("stripe-signature") ?? ""

  // ── 2. Verify webhook signature ────────────────────────────────────────────
  let event: Stripe.Event
  try {
    event = constructStripeEvent({ rawBody, signature })
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Signature verification failed"
    console.error("[webhooks/stripe] verification error:", err)
    return NextResponse.json({ error: msg }, { status: 401 })
  }

  const eventId   = event.id          // evt_xxx — globally unique, safe idempotency key
  const eventType = event.type

  // ── 3. Idempotency check ───────────────────────────────────────────────────
  const [existing] = await serviceDb
    .select({ id: billing_events.id, status: billing_events.status })
    .from(billing_events)
    .where(eq(billing_events.idempotency_key, eventId))
    .limit(1)

  if (existing) {
    return NextResponse.json({ received: true, duplicate: true })
  }

  // ── 4. Insert billing_event ────────────────────────────────────────────────
  // We insert before processing to claim the idempotency slot (prevent races)
  const [eventRow] = await serviceDb
    .insert(billing_events)
    .values({
      idempotency_key: eventId,
      provider:        "stripe",
      event_type:      eventType,
      payload:         event as unknown as Record<string, unknown>,
      status:          "pending",
    })
    .returning({ id: billing_events.id })
    .onConflictDoNothing()

  if (!eventRow) {
    // Race condition → already processed
    return NextResponse.json({ received: true, duplicate: true })
  }

  // ── 5. Process event ───────────────────────────────────────────────────────
  const now     = new Date()
  let   success = true
  let   errMsg  = ""
  let   orgId: string | null = null
  let   subId: string | null = null

  try {
    const result = await processStripeEvent(event, now)
    orgId   = result.orgId
    subId   = result.subId
    success = true
  } catch (err) {
    errMsg  = err instanceof Error ? err.message : String(err)
    success = false
    console.error(`[webhooks/stripe] failed to process ${eventType}:`, err)
  }

  // ── 6. Update billing_event with resolution context ────────────────────────
  await serviceDb
    .update(billing_events)
    .set({
      status:          success ? "processed" : "failed",
      error_detail:    errMsg || null,
      processed_at:    now,
      organization_id: orgId,
      subscription_id: subId,
    })
    .where(eq(billing_events.id, eventRow.id))

  // Return 200 — Stripe retries on non-2xx
  return NextResponse.json({ received: true, processed: success })
}

// ── Event processor ────────────────────────────────────────────────────────────

interface ProcessResult {
  orgId: string | null
  subId: string | null
}

async function processStripeEvent(
  event: Stripe.Event,
  now:   Date,
): Promise<ProcessResult> {
  switch (event.type) {

    // ── checkout.session.completed ─────────────────────────────────────────
    // Links the Stripe subscription ID to our local record (created in subscribe route)
    case "checkout.session.completed": {
      const session = event.data.object as Stripe.Checkout.Session
      if (session.mode !== "subscription" || !session.subscription) {
        return { orgId: null, subId: null }
      }

      const orgId        = session.metadata?.organization_id ?? null
      const stripeSubId  = typeof session.subscription === "string"
        ? session.subscription
        : session.subscription.id

      if (!orgId) return { orgId: null, subId: null }

      // Find our pending record (inserted by subscribe route with no provider_subscription_id)
      const [ourSub] = await serviceDb
        .select({ id: subscriptions.id })
        .from(subscriptions)
        .where(eq(subscriptions.organization_id, orgId))
        .limit(1)

      if (!ourSub) return { orgId, subId: null }

      await serviceDb
        .update(subscriptions)
        .set({
          provider_subscription_id: stripeSubId,
          status:                   "trialing",
          updated_at:               now,
        })
        .where(eq(subscriptions.id, ourSub.id))

      return { orgId, subId: ourSub.id }
    }

    // ── customer.subscription.created / updated ────────────────────────────
    case "customer.subscription.created":
    case "customer.subscription.updated": {
      const stripeSub = event.data.object as Stripe.Subscription
      const result    = await syncStripeSubscription(stripeSub, now)
      return result
    }

    // ── customer.subscription.deleted ─────────────────────────────────────
    case "customer.subscription.deleted": {
      const stripeSub = event.data.object as Stripe.Subscription
      const [ourSub]  = await serviceDb
        .select({ id: subscriptions.id, organization_id: subscriptions.organization_id })
        .from(subscriptions)
        .where(eq(subscriptions.provider_subscription_id, stripeSub.id))
        .limit(1)

      if (!ourSub) return { orgId: null, subId: null }

      await serviceDb
        .update(subscriptions)
        .set({
          status:       "cancelled",
          cancelled_at: now,
          updated_at:   now,
        })
        .where(eq(subscriptions.id, ourSub.id))

      // Cancel pending dunning steps
      await serviceDb.execute(
        `UPDATE dunning_attempts
         SET    status = 'cancelled'
         WHERE  subscription_id = '${ourSub.id}'
           AND  status = 'scheduled'`
      )

      return { orgId: ourSub.organization_id, subId: ourSub.id }
    }

    // ── invoice.payment_succeeded ──────────────────────────────────────────
    case "invoice.payment_succeeded": {
      const invoice   = event.data.object as Stripe.Invoice
      const stripeSubId = typeof invoice.subscription === "string"
        ? invoice.subscription
        : invoice.subscription?.id

      if (!stripeSubId) return { orgId: null, subId: null }

      const [ourSub] = await serviceDb
        .select({ id: subscriptions.id, organization_id: subscriptions.organization_id })
        .from(subscriptions)
        .where(eq(subscriptions.provider_subscription_id, stripeSubId))
        .limit(1)

      if (!ourSub) return { orgId: null, subId: null }

      const periodStart = invoice.period_start
        ? new Date(invoice.period_start * 1000)
        : undefined
      const periodEnd = invoice.period_end
        ? new Date(invoice.period_end * 1000)
        : undefined

      await serviceDb
        .update(subscriptions)
        .set({
          status:                "active",
          current_period_start:  periodStart,
          current_period_end:    periodEnd,
          // Clear any dunning state
          payment_failed_at:     null,
          payment_failure_count: 0,
          next_retry_at:         null,
          grace_period_ends_at:  null,
          updated_at:            now,
        })
        .where(eq(subscriptions.id, ourSub.id))

      return { orgId: ourSub.organization_id, subId: ourSub.id }
    }

    // ── invoice.payment_failed ────────────────────────────────────────────
    case "invoice.payment_failed": {
      const invoice   = event.data.object as Stripe.Invoice
      const stripeSubId = typeof invoice.subscription === "string"
        ? invoice.subscription
        : invoice.subscription?.id

      if (!stripeSubId) return { orgId: null, subId: null }

      const [ourSub] = await serviceDb
        .select({
          id:              subscriptions.id,
          organization_id: subscriptions.organization_id,
          status:          subscriptions.status,
        })
        .from(subscriptions)
        .where(eq(subscriptions.provider_subscription_id, stripeSubId))
        .limit(1)

      if (!ourSub) return { orgId: null, subId: null }

      // Only initiate dunning once per failure sequence
      if (ourSub.status !== "past_due") {
        await serviceDb
          .update(subscriptions)
          .set({ status: "past_due", updated_at: now })
          .where(eq(subscriptions.id, ourSub.id))

        await initiateDunning({
          subscriptionId: ourSub.id,
          organizationId: ourSub.organization_id,
          failedAt:       now,
        })
      }

      return { orgId: ourSub.organization_id, subId: ourSub.id }
    }

    // ── customer.subscription.trial_will_end ────────────────────────────────
    case "customer.subscription.trial_will_end": {
      // Informational — Stripe fires this 3 days before trial ends.
      // Could send a reminder email here. For now, just log it.
      const stripeSub = event.data.object as Stripe.Subscription
      const [ourSub] = await serviceDb
        .select({ id: subscriptions.id, organization_id: subscriptions.organization_id })
        .from(subscriptions)
        .where(eq(subscriptions.provider_subscription_id, stripeSub.id))
        .limit(1)

      return { orgId: ourSub?.organization_id ?? null, subId: ourSub?.id ?? null }
    }

    default:
      // Unknown / unhandled event — log and ack
      return { orgId: null, subId: null }
  }
}

// ── Sync Stripe subscription state to our DB ──────────────────────────────────

async function syncStripeSubscription(
  stripeSub: Stripe.Subscription,
  now:       Date,
): Promise<ProcessResult> {
  const [ourSub] = await serviceDb
    .select({ id: subscriptions.id, organization_id: subscriptions.organization_id })
    .from(subscriptions)
    .where(eq(subscriptions.provider_subscription_id, stripeSub.id))
    .limit(1)

  if (!ourSub) return { orgId: null, subId: null }

  const internalStatus = stripeSubStatusToInternal(stripeSub.status)

  const periodStart = stripeSub.current_period_start
    ? new Date(stripeSub.current_period_start * 1000)
    : undefined
  const periodEnd = stripeSub.current_period_end
    ? new Date(stripeSub.current_period_end * 1000)
    : undefined
  const cancelAt = stripeSub.cancel_at
    ? new Date(stripeSub.cancel_at * 1000)
    : null

  await serviceDb
    .update(subscriptions)
    .set({
      status:               internalStatus,
      current_period_start: periodStart,
      current_period_end:   periodEnd,
      cancel_at:            cancelAt,
      updated_at:           now,
    })
    .where(eq(subscriptions.id, ourSub.id))

  return { orgId: ourSub.organization_id, subId: ourSub.id }
}

// ── Config: raw body required for Stripe signature verification ───────────────
export const config = {
  api: { bodyParser: false },
}
