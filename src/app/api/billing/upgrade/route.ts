import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"
import { eq, and, sql } from "drizzle-orm"
import { auth } from "@/lib/auth"
import { serviceDb } from "@/lib/db"
import { subscriptions, billingPlans } from "@/lib/db/schema"
import { cancelRazorpaySubscription, createOrFetchRazorpayCustomer, createRazorpaySubscription } from "@/lib/billing/razorpay"
import { upgradeStripeSubscription } from "@/lib/billing/stripe"
import { PLANS, type PlanSlug, type BillingCycle } from "@/lib/billing/plans"

const schema = z.object({
  planSlug:     z.enum(["starter", "growth", "enterprise"]),
  billingCycle: z.enum(["monthly", "yearly"]).optional(),
})

/**
 * POST /api/billing/upgrade
 * Body: { planSlug, billingCycle? }
 *
 * Changes the current active subscription to a new plan.
 *
 * Stripe  → instant proration via subscription item update
 * Razorpay → cancel current at cycle-end + create new subscription
 *            (returns shortUrl; user must authorise the new sub)
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

  const { planSlug } = parsed.data
  const orgId        = session.user.organizationId

  // ── Fetch current active subscription ──────────────────────────────────────
  const [current] = await serviceDb
    .select({
      id:                      subscriptions.id,
      provider:                subscriptions.provider,
      provider_subscription_id:subscriptions.providerSubscriptionId,
      provider_customer_id:    subscriptions.providerCustomerId,
      plan_id:                 subscriptions.planId,
      billing_cycle:           subscriptions.billingCycle,
      status:                  subscriptions.status,
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
      { error: "No active subscription found. Use /api/billing/subscribe to create one." },
      { status: 404 }
    )
  }

  // Determine billing cycle (keep existing if not specified)
  const billingCycle: BillingCycle = (parsed.data.billingCycle ?? current.billing_cycle) as BillingCycle

  // ── Fetch new plan row ──────────────────────────────────────────────────────
  const [newPlanRow] = await serviceDb
    .select()
    .from(billingPlans)
    .where(eq(billingPlans.slug, planSlug))
    .limit(1)

  if (!newPlanRow) {
    return NextResponse.json({ error: "Plan not found" }, { status: 404 })
  }

  // Guard: same plan + same cycle = no-op
  if (current.plan_id === newPlanRow.id && current.billing_cycle === billingCycle) {
    return NextResponse.json(
      { error: "Already on this plan and billing cycle." },
      { status: 409 }
    )
  }

  const plan      = PLANS[planSlug as PlanSlug]
  const now       = new Date()

  try {
    // ── Stripe upgrade ────────────────────────────────────────────────────────
    if (current.provider === "stripe") {
      const priceId =
        billingCycle === "monthly"
          ? newPlanRow.stripePriceIdMonthly
          : newPlanRow.stripePriceIdYearly

      if (!priceId) {
        return NextResponse.json(
          { error: "Stripe price not configured for this plan. Contact support." },
          { status: 503 }
        )
      }
      if (!current.provider_subscription_id) {
        return NextResponse.json(
          { error: "Missing Stripe subscription ID. Contact support." },
          { status: 409 }
        )
      }

      await upgradeStripeSubscription({
        providerSubscriptionId: current.provider_subscription_id,
        newPriceId:             priceId,
        prorationBehavior:      "create_prorations",
      })

      // Optimistically update our record; webhook confirms definitive state
      await serviceDb
        .update(subscriptions)
        .set({
          planId:          newPlanRow.id,
          billingCycle:    billingCycle,
          previousPlanId:  current.plan_id ?? undefined,
          planChangedAt:   now,
          updatedAt:       now,
        })
        .where(eq(subscriptions.id, current.id))

      return NextResponse.json({
        provider:  "stripe",
        success:   true,
        planSlug,
        billingCycle,
        message:   "Plan updated immediately with proration.",
      })
    }

    // ── Razorpay upgrade ──────────────────────────────────────────────────────
    if (current.provider === "razorpay") {
      const razorpayPlanId =
        billingCycle === "monthly"
          ? newPlanRow.razorpayPlanIdMonthly
          : newPlanRow.razorpayPlanIdYearly

      if (!razorpayPlanId) {
        return NextResponse.json(
          { error: "Razorpay plan not configured for this tier. Contact support." },
          { status: 503 }
        )
      }

      // Cancel existing at cycle end (keeps access until next billing date)
      if (current.provider_subscription_id) {
        await cancelRazorpaySubscription({
          providerSubscriptionId: current.provider_subscription_id,
          cancelAtCycleEnd:       true,
        }).catch(() => {})  // Don't block upgrade if cancel fails (webhook will reconcile)
      }

      // Reuse or refresh the customer
      const customerId = current.provider_customer_id
        ?? await createOrFetchRazorpayCustomer({
          name:  session.user.name ?? "Admin",
          email: session.user.email!,
          orgId,
        })

      const result = await createRazorpaySubscription({
        planSlug:       planSlug as PlanSlug,
        billingCycle,
        customerId,
        orgId,
        orgName:        session.user.name ?? orgId,
        trialDays:      0,  // No trial on upgrades
        razorpayPlanId,
      })

      // Update the existing subscription row to the new plan/subscription
      await serviceDb
        .update(subscriptions)
        .set({
          planId:                  newPlanRow.id,
          billingCycle:            billingCycle,
          providerSubscriptionId:  result.subscriptionId,
          providerCustomerId:      result.customerId,
          previousPlanId:          current.plan_id ?? undefined,
          planChangedAt:           now,
          status:                  "trialing",
          updatedAt:               now,
        })
        .where(eq(subscriptions.id, current.id))

      return NextResponse.json({
        provider:       "razorpay",
        subscriptionId: result.subscriptionId,
        shortUrl:       result.shortUrl,
        planSlug,
        billingCycle,
        message:        "Authorise payment on the linked page to activate the new plan.",
      })
    }

    return NextResponse.json({ error: "Unsupported provider for upgrade" }, { status: 400 })
  } catch (err) {
    console.error("[billing/upgrade] error:", err)
    return NextResponse.json(
      { error: "Failed to upgrade subscription. Please try again." },
      { status: 500 }
    )
  }
}
