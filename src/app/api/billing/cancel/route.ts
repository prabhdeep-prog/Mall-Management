import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"
import { eq, and, sql } from "drizzle-orm"
import { auth } from "@/lib/auth"
import { serviceDb } from "@/lib/db"
import { subscriptions } from "@/lib/db/schema"
import { cancelRazorpaySubscription } from "@/lib/billing/razorpay"
import { cancelStripeSubscription } from "@/lib/billing/stripe"

const schema = z.object({
  /** true = cancel at end of current billing period (default); false = immediate */
  cancelAtPeriodEnd: z.boolean().default(true),
  reason:            z.string().max(500).optional(),
})

/**
 * POST /api/billing/cancel
 * Body: { cancelAtPeriodEnd?: boolean, reason?: string }
 *
 * Cancels the organisation's active subscription.
 *
 * cancelAtPeriodEnd=true  (default):
 *   - Stripe: sets cancel_at_period_end flag; access continues until period ends
 *   - Razorpay: cancels at cycle end; access continues until billing date
 *   - DB: sets cancel_at = current_period_end, status stays "active"
 *
 * cancelAtPeriodEnd=false (immediate):
 *   - Both providers: cancel immediately
 *   - DB: status → "cancelled", cancelled_at = now
 */
export async function POST(request: NextRequest) {
  const session = await auth()
  if (!session?.user?.organizationId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const body   = await request.json()
  const parsed = schema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 })
  }

  const { cancelAtPeriodEnd } = parsed.data
  const orgId                 = session.user.organizationId
  const now                   = new Date()

  // ── Fetch current active subscription ──────────────────────────────────────
  const [current] = await serviceDb
    .select({
      id:                       subscriptions.id,
      provider:                 subscriptions.provider,
      provider_subscription_id: subscriptions.providerSubscriptionId,
      status:                   subscriptions.status,
      current_period_end:       subscriptions.currentPeriodEnd,
    })
    .from(subscriptions)
    .where(
      and(
        eq(subscriptions.organizationId, orgId),
        sql`status NOT IN ('cancelled', 'expired')`
      )
    )
    .limit(1)

  if (!current) {
    return NextResponse.json(
      { error: "No active subscription found." },
      { status: 404 }
    )
  }

  if (current.status === "paused") {
    return NextResponse.json(
      { error: "Subscription is already paused due to non-payment. Contact support." },
      { status: 409 }
    )
  }

  try {
    // ── Cancel at provider ──────────────────────────────────────────────────
    if (current.provider_subscription_id) {
      if (current.provider === "stripe") {
        await cancelStripeSubscription({
          providerSubscriptionId: current.provider_subscription_id,
          cancelAtPeriodEnd,
        })
      } else if (current.provider === "razorpay") {
        await cancelRazorpaySubscription({
          providerSubscriptionId: current.provider_subscription_id,
          cancelAtCycleEnd:       cancelAtPeriodEnd,
        })
      }
    }

    // ── Update DB ──────────────────────────────────────────────────────────
    if (cancelAtPeriodEnd) {
      // Scheduled cancellation — access continues; webhook fires when actually done
      const cancelAt = current.current_period_end ?? now

      await serviceDb
        .update(subscriptions)
        .set({
          cancelAt:   cancelAt,
          metadata:   sql`metadata || '{"cancel_requested_at": "${now.toISOString()}"}'::jsonb`,
          updatedAt:  now,
        })
        .where(eq(subscriptions.id, current.id))

      return NextResponse.json({
        success:          true,
        cancelAtPeriodEnd: true,
        cancelAt:          cancelAt,
        message:           "Subscription will be cancelled at the end of the current billing period. Access continues until then.",
      })
    } else {
      // Immediate cancellation
      await serviceDb
        .update(subscriptions)
        .set({
          status:       "cancelled",
          cancelledAt:  now,
          updatedAt:    now,
        })
        .where(eq(subscriptions.id, current.id))

      return NextResponse.json({
        success:           true,
        cancelAtPeriodEnd: false,
        cancelledAt:       now,
        message:           "Subscription cancelled immediately. Your data will be retained for 90 days.",
      })
    }
  } catch (err) {
    console.error("[billing/cancel] error:", err)
    return NextResponse.json(
      { error: "Failed to cancel subscription. Please try again or contact support." },
      { status: 500 }
    )
  }
}
