import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"
import { sql, eq, and } from "drizzle-orm"
import { auth } from "@/lib/auth"
import { serviceDb } from "@/lib/db"
import { subscriptions, billingPlans, users, organizations } from "@/lib/db/schema"
import {
  createOrFetchRazorpayCustomer,
  createRazorpaySubscription,
} from "@/lib/billing/razorpay"
import {
  createOrFetchStripeCustomer,
  createStripeCheckoutSession,
} from "@/lib/billing/stripe"
import { PLANS, type PlanSlug, type BillingCycle, type BillingProvider } from "@/lib/billing/plans"
import { withOrgContext } from "@/lib/db/context"

const schema = z.object({
  planSlug:     z.enum(["starter", "growth", "enterprise"]),
  billingCycle: z.enum(["monthly", "yearly"]).default("monthly"),
  provider:     z.enum(["razorpay", "stripe"]).default("razorpay"),
})

/**
 * POST /api/billing/subscribe
 * Body: { planSlug, billingCycle, provider }
 *
 * Razorpay → returns { subscriptionId, shortUrl }  (redirect to shortUrl)
 * Stripe   → returns { checkoutUrl }               (redirect to checkoutUrl)
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

  const { planSlug, billingCycle, provider } = parsed.data
  const orgId = session.user.organizationId

  // Prevent duplicate active subscriptions
  const existing = await serviceDb
    .select({ id: subscriptions.id, status: subscriptions.status })
    .from(subscriptions)
    .where(
      and(
        eq(subscriptions.organizationId, orgId),
        sql`status NOT IN ('cancelled', 'expired')`
      )
    )
    .limit(1)

  if (existing.length > 0 && existing[0].status === "active") {
    return NextResponse.json(
      { error: "Already has an active subscription. Use /api/billing/upgrade to change plans." },
      { status: 409 }
    )
  }

  // Fetch plan + provider IDs
  const [planRow] = await serviceDb
    .select()
    .from(billingPlans)
    .where(eq(billingPlans.slug, planSlug))
    .limit(1)

  if (!planRow) {
    return NextResponse.json({ error: "Plan not found" }, { status: 404 })
  }

  // Get org + admin user details
  const [orgRow] = await serviceDb
    .select({ name: organizations.name })
    .from(organizations)
    .where(eq(organizations.id, orgId))
    .limit(1)

  const [adminUser] = await serviceDb
    .select({ email: users.email, name: users.name })
    .from(users)
    .where(eq(users.organizationId, orgId))
    .orderBy(users.createdAt)
    .limit(1)

  if (!orgRow || !adminUser) {
    return NextResponse.json({ error: "Organization not found" }, { status: 404 })
  }

  const plan      = PLANS[planSlug as PlanSlug]
  const trialDays = plan.trialDays

  try {
    if (provider === "razorpay") {
      const razorpayPlanId =
        billingCycle === "monthly"
          ? planRow.razorpayPlanIdMonthly
          : planRow.razorpayPlanIdYearly

      if (!razorpayPlanId) {
        return NextResponse.json(
          { error: "Razorpay plan not configured. Contact support." },
          { status: 503 }
        )
      }

      // Reuse existing provider_customer_id if available
      const existingSub = existing[0]
      let customerId = ""
      if (existingSub) {
        const [existingSubRow] = await serviceDb
          .select({ providerCustomerId: subscriptions.providerCustomerId })
          .from(subscriptions)
          .where(eq(subscriptions.id, existingSub.id))
          .limit(1)
        customerId = existingSubRow?.providerCustomerId ?? ""
      }

      if (!customerId) {
        customerId = await createOrFetchRazorpayCustomer({
          name:  adminUser.name ?? orgRow.name,
          email: adminUser.email,
          orgId,
        })
      }

      const result = await createRazorpaySubscription({
        planSlug,
        billingCycle,
        customerId,
        orgId,
        orgName:       orgRow.name,
        trialDays,
        razorpayPlanId,
      })

      // Record subscription row (status=trialing until webhook confirms)
      await serviceDb.insert(subscriptions).values({
        organizationId:          orgId,
        planId:                  planRow.id,
        provider:                "razorpay",
        providerSubscriptionId:  result.subscriptionId,
        providerCustomerId:      result.customerId,
        status:                  "trialing",
        billingCycle:            billingCycle,
        trialEndsAt:             trialDays ? new Date(Date.now() + trialDays * 86_400_000) : undefined,
      }).onConflictDoNothing()

      return NextResponse.json({
        provider:       "razorpay",
        subscriptionId: result.subscriptionId,
        shortUrl:       result.shortUrl,   // Redirect user here
      })
    }

    if (provider === "stripe") {
      const priceId =
        billingCycle === "monthly"
          ? planRow.stripePriceIdMonthly
          : planRow.stripePriceIdYearly

      if (!priceId) {
        return NextResponse.json(
          { error: "Stripe price not configured. Contact support." },
          { status: 503 }
        )
      }

      const customerId = await createOrFetchStripeCustomer({
        email: adminUser.email,
        name:  adminUser.name ?? orgRow.name,
        orgId,
      })

      const result = await createStripeCheckoutSession({
        customerId,
        priceId,
        planSlug,
        billingCycle,
        orgId,
        trialDays,
      })

      // Stripe subscription is confirmed via webhook after checkout
      await serviceDb.insert(subscriptions).values({
        organizationId:      orgId,
        planId:              planRow.id,
        provider:            "stripe",
        providerCustomerId:  customerId,
        status:              "trialing",
        billingCycle:        billingCycle,
        trialEndsAt:         trialDays ? new Date(Date.now() + trialDays * 86_400_000) : undefined,
        metadata:             { stripe_checkout_session_id: result.sessionId },
      }).onConflictDoNothing()

      return NextResponse.json({
        provider:    "stripe",
        checkoutUrl: result.checkoutUrl,   // Redirect user here
      })
    }

    return NextResponse.json({ error: "Invalid provider" }, { status: 400 })
  } catch (err) {
    console.error("[billing/subscribe] error:", err)
    return NextResponse.json(
      { error: "Failed to create subscription. Please try again." },
      { status: 500 }
    )
  }
}
