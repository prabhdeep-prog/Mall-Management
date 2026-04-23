/**
 * Razorpay Webhook Handler
 * ─────────────────────────
 * Endpoint: POST /api/webhooks/razorpay
 *
 * Security:
 *   • HMAC-SHA256 signature verified before any DB writes
 *   • Idempotency key = Razorpay event ID stored in billingEvents
 *   • Returns 200 on duplicate events (don't cause Razorpay retries)
 *
 * Events handled:
 *   subscription.activated      → status=active
 *   subscription.charged        → status=active, update billing period
 *   subscription.payment.failed → status=past_due, initiate dunning
 *   subscription.cancelled      → status=cancelled
 *   subscription.completed      → status=expired
 *   subscription.updated        → refresh plan/period metadata
 */

import { NextRequest, NextResponse } from "next/server"
import { eq, and } from "drizzle-orm"
import { serviceDb } from "@/lib/db"
import { subscriptions, billingEvents } from "@/lib/db/schema"
import {
  verifyRazorpayWebhook,
  razorpayEventToStatus,
  type RazorpayWebhookPayload,
  type RazorpayEventType,
} from "@/lib/billing/razorpay"
import { initiateDunning } from "@/lib/billing/dunning"

// App Router segment config — raw body is read via request.text() before any
// JSON.parse so HMAC verification runs against the exact bytes Razorpay signed.
export const runtime = "nodejs"
export const dynamic = "force-dynamic"

export async function POST(request: NextRequest) {
  // ── 1. Read raw body (must be text for HMAC verification) ──────────────────
  const rawBody  = await request.text()
  const signature = request.headers.get("x-razorpay-signature") ?? ""

  // ── 2. Verify webhook signature ────────────────────────────────────────────
  let verified: boolean
  try {
    verified = verifyRazorpayWebhook({ rawBody, signature })
  } catch (err) {
    console.error("[webhooks/razorpay] signature verification error:", err)
    return NextResponse.json({ error: "Webhook secret not configured" }, { status: 500 })
  }

  if (!verified) {
    return NextResponse.json({ error: "Invalid signature" }, { status: 401 })
  }

  // ── 3. Parse payload ───────────────────────────────────────────────────────
  let payload: RazorpayWebhookPayload
  try {
    payload = JSON.parse(rawBody)
  } catch {
    return NextResponse.json({ error: "Invalid JSON payload" }, { status: 400 })
  }

  const eventType   = payload.event
  const rzpSub      = payload.payload?.subscription?.entity
  const rzpEventId  = `rzp_${eventType}_${rzpSub?.id}_${Date.now()}`
  //
  // Note: Razorpay doesn't expose a unique event ID in the webhook envelope.
  // We compose one from event type + subscription ID. This means re-deliveries
  // of the same event will create new billingEvents rows.
  // Production: use razorpay-event-id header if available, or store raw payload hash.
  const idempotencyKey = `razorpay:${eventType}:${rzpSub?.id}`

  if (!rzpSub) {
    console.warn("[webhooks/razorpay] missing subscription entity in payload")
    return NextResponse.json({ received: true })
  }

  // ── 4. Idempotency check ───────────────────────────────────────────────────
  const [existing] = await serviceDb
    .select({ id: billingEvents.id, status: billingEvents.status })
    .from(billingEvents)
    .where(eq(billingEvents.idempotencyKey, idempotencyKey))
    .limit(1)

  if (existing) {
    // Already processed — return 200 so Razorpay stops retrying
    return NextResponse.json({ received: true, duplicate: true })
  }

  // ── 5. Resolve our subscription record ────────────────────────────────────
  const [ourSub] = await serviceDb
    .select({
      id:              subscriptions.id,
      organization_id: subscriptions.organizationId,
      status:          subscriptions.status,
      plan_id:         subscriptions.planId,
    })
    .from(subscriptions)
    .where(eq(subscriptions.providerSubscriptionId, rzpSub.id))
    .limit(1)

  // ── 6. Insert billing_event (append-only audit log) ────────────────────────
  const [eventRow] = await serviceDb
    .insert(billingEvents)
    .values({
      idempotencyKey:  idempotencyKey,
      provider:        "razorpay",
      eventType:       eventType,
      payload:         payload as unknown as Record<string, unknown>,
      organizationId:  ourSub?.organization_id ?? null,
      subscriptionId:  ourSub?.id ?? null,
    })
    .returning({ id: billingEvents.id })
    .onConflictDoNothing()

  // If conflict (race) → duplicate, already handled above
  if (!eventRow) {
    return NextResponse.json({ received: true, duplicate: true })
  }

  // ── 7. Process event ───────────────────────────────────────────────────────
  const now     = new Date()
  let   success = true
  let   errMsg  = ""

  try {
    if (!ourSub) {
      // Subscription not in our DB yet (e.g. webhook arrived before subscribe route committed)
      console.warn(`[webhooks/razorpay] subscription ${rzpSub.id} not found in DB — skipping state update`)
      // Mark as skipped but return 200 to avoid Razorpay retrying forever
      await serviceDb
        .update(billingEvents)
        .set({ status: "skipped", errorDetail: "Subscription not found in DB", processedAt: now })
        .where(eq(billingEvents.id, eventRow.id))
      return NextResponse.json({ received: true, skipped: true })
    }

    await processRazorpayEvent({
      eventType: eventType as RazorpayEventType,
      rzpSub,
      ourSub,
      now,
    })

    success = true
  } catch (err) {
    errMsg  = err instanceof Error ? err.message : String(err)
    success = false
    console.error(`[webhooks/razorpay] failed to process ${eventType}:`, err)
  }

  // ── 8. Update billing_event status ────────────────────────────────────────
  await serviceDb
    .update(billingEvents)
    .set({
      status:      success ? "processed" : "failed",
      errorDetail: errMsg || null,
      processedAt: now,
    })
    .where(eq(billingEvents.id, eventRow.id))

  // Always return 200 — non-200 causes Razorpay to retry forever
  return NextResponse.json({ received: true, processed: success })
}

// ── Event processor ────────────────────────────────────────────────────────────

async function processRazorpayEvent(opts: {
  eventType:  RazorpayEventType
  rzpSub:     { id: string; status: string; current_start?: number; current_end?: number; charge_at?: number }
  ourSub:     { id: string; organization_id: string; status: string }
  now:        Date
}): Promise<void> {
  const { eventType, rzpSub, ourSub, now } = opts

  const newStatus = razorpayEventToStatus(eventType)

  switch (eventType) {
    case "subscription.activated":
    case "subscription.charged": {
      // Update subscription to active + refresh billing period
      const periodStart = rzpSub.current_start
        ? new Date(rzpSub.current_start * 1000)
        : undefined
      const periodEnd = rzpSub.current_end
        ? new Date(rzpSub.current_end * 1000)
        : undefined

      await serviceDb
        .update(subscriptions)
        .set({
          status:               "active",
          currentPeriodStart:   periodStart,
          currentPeriodEnd:     periodEnd,
          // Clear dunning state on successful payment
          paymentFailedAt:      null,
          paymentFailureCount:  0,
          nextRetryAt:          null,
          gracePeriodEndsAt:    null,
          updatedAt:            now,
        })
        .where(eq(subscriptions.id, ourSub.id))
      break
    }

    case "subscription.payment.failed": {
      // Transition to past_due and schedule dunning
      if (ourSub.status !== "past_due") {
        await serviceDb
          .update(subscriptions)
          .set({
            status:    "past_due",
            updatedAt: now,
          })
          .where(eq(subscriptions.id, ourSub.id))

        await initiateDunning({
          subscriptionId:  ourSub.id,
          organizationId:  ourSub.organization_id,
          failedAt:        now,
        })
      }
      // else: dunning already running; let it continue
      break
    }

    case "subscription.cancelled": {
      await serviceDb
        .update(subscriptions)
        .set({
          status:      "cancelled",
          cancelledAt: now,
          updatedAt:   now,
        })
        .where(eq(subscriptions.id, ourSub.id))

      // Cancel any pending dunning steps
      await serviceDb.execute(
        `UPDATE dunning_attempts
         SET    status = 'cancelled'
         WHERE  subscription_id = '${ourSub.id}'
           AND  status = 'scheduled'`
      )
      break
    }

    case "subscription.completed": {
      await serviceDb
        .update(subscriptions)
        .set({
          status:    "expired",
          updatedAt: now,
        })
        .where(eq(subscriptions.id, ourSub.id))
      break
    }

    case "subscription.updated": {
      // Metadata refresh — no status change needed
      // Period dates will be updated on next "charged" event
      if (newStatus) {
        await serviceDb
          .update(subscriptions)
          .set({ status: newStatus, updatedAt: now })
          .where(eq(subscriptions.id, ourSub.id))
      }
      break
    }

    default:
      // Unknown event — logged but no state change
      break
  }
}

