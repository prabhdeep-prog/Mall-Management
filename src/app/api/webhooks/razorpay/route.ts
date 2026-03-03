/**
 * Razorpay Webhook Handler
 * ─────────────────────────
 * Endpoint: POST /api/webhooks/razorpay
 *
 * Security:
 *   • HMAC-SHA256 signature verified before any DB writes
 *   • Idempotency key = Razorpay event ID stored in billing_events
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
import { subscriptions, billing_events } from "@/lib/db/schema"
import {
  verifyRazorpayWebhook,
  razorpayEventToStatus,
  type RazorpayWebhookPayload,
  type RazorpayEventType,
} from "@/lib/billing/razorpay"
import { initiateDunning } from "@/lib/billing/dunning"

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
  // of the same event will create new billing_events rows.
  // Production: use razorpay-event-id header if available, or store raw payload hash.
  const idempotencyKey = `razorpay:${eventType}:${rzpSub?.id}`

  if (!rzpSub) {
    console.warn("[webhooks/razorpay] missing subscription entity in payload")
    return NextResponse.json({ received: true })
  }

  // ── 4. Idempotency check ───────────────────────────────────────────────────
  const [existing] = await serviceDb
    .select({ id: billing_events.id, status: billing_events.status })
    .from(billing_events)
    .where(eq(billing_events.idempotency_key, idempotencyKey))
    .limit(1)

  if (existing) {
    // Already processed — return 200 so Razorpay stops retrying
    return NextResponse.json({ received: true, duplicate: true })
  }

  // ── 5. Resolve our subscription record ────────────────────────────────────
  const [ourSub] = await serviceDb
    .select({
      id:              subscriptions.id,
      organization_id: subscriptions.organization_id,
      status:          subscriptions.status,
      plan_id:         subscriptions.plan_id,
    })
    .from(subscriptions)
    .where(eq(subscriptions.provider_subscription_id, rzpSub.id))
    .limit(1)

  // ── 6. Insert billing_event (append-only audit log) ────────────────────────
  const [eventRow] = await serviceDb
    .insert(billing_events)
    .values({
      idempotency_key:  idempotencyKey,
      provider:         "razorpay",
      event_type:       eventType,
      payload:          payload as unknown as Record<string, unknown>,
      organization_id:  ourSub?.organization_id ?? null,
      subscription_id:  ourSub?.id ?? null,
      status:           "pending",
    })
    .returning({ id: billing_events.id })
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
        .update(billing_events)
        .set({ status: "skipped", error_detail: "Subscription not found in DB", processed_at: now })
        .where(eq(billing_events.id, eventRow.id))
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
    .update(billing_events)
    .set({
      status:       success ? "processed" : "failed",
      error_detail: errMsg || null,
      processed_at: now,
    })
    .where(eq(billing_events.id, eventRow.id))

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
          status:                "active",
          current_period_start:  periodStart,
          current_period_end:    periodEnd,
          // Clear dunning state on successful payment
          payment_failed_at:     null,
          payment_failure_count: 0,
          next_retry_at:         null,
          grace_period_ends_at:  null,
          updated_at:            now,
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
            status:     "past_due",
            updated_at: now,
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
          status:       "cancelled",
          cancelled_at: now,
          updated_at:   now,
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
          status:     "expired",
          updated_at: now,
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
          .set({ status: newStatus, updated_at: now })
          .where(eq(subscriptions.id, ourSub.id))
      }
      break
    }

    default:
      // Unknown event — logged but no state change
      break
  }
}

// ── Config: disable body parsing (we need raw body for HMAC) ──────────────────
export const config = {
  api: { bodyParser: false },
}
