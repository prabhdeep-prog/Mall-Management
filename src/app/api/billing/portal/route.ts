import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"
import { eq, and, sql } from "drizzle-orm"
import { auth } from "@/lib/auth"
import { serviceDb } from "@/lib/db"
import { subscriptions } from "@/lib/db/schema"
import { createStripePortalSession } from "@/lib/billing/stripe"

const schema = z.object({
  /** Path within the app to return to after the portal session, e.g. "/billing" */
  returnPath: z.string().default("/billing"),
})

/**
 * POST /api/billing/portal
 * Body: { returnPath?: string }
 *
 * Returns a URL to the provider's billing management interface:
 *   - Stripe  → Stripe Customer Portal (manage payment method, view invoices, cancel)
 *   - Razorpay → Razorpay subscription management page (short_url)
 *   - Manual  → Returns a support contact URL
 *
 * The URL is short-lived (session-scoped) — redirect immediately.
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

  const { returnPath } = parsed.data
  const orgId          = session.user.organizationId
  const appUrl         = process.env.NEXT_PUBLIC_APP_URL ?? "https://mallos.com"
  const returnUrl      = `${appUrl}${returnPath}`

  // ── Fetch current subscription ────────────────────────────────────────────
  const [sub] = await serviceDb
    .select({
      id:                       subscriptions.id,
      provider:                 subscriptions.provider,
      provider_subscription_id: subscriptions.providerSubscriptionId,
      provider_customer_id:     subscriptions.providerCustomerId,
      status:                   subscriptions.status,
      metadata:                 subscriptions.metadata,
    })
    .from(subscriptions)
    .where(
      and(
        eq(subscriptions.organizationId, orgId),
        sql`status NOT IN ('cancelled', 'expired')`
      )
    )
    .limit(1)

  if (!sub) {
    return NextResponse.json(
      { error: "No active subscription found." },
      { status: 404 }
    )
  }

  try {
    // ── Stripe portal ────────────────────────────────────────────────────────
    if (sub.provider === "stripe") {
      if (!sub.provider_customer_id) {
        return NextResponse.json(
          { error: "Stripe customer not found. Contact support." },
          { status: 409 }
        )
      }

      const portalUrl = await createStripePortalSession({
        customerId: sub.provider_customer_id,
        returnUrl,
      })

      return NextResponse.json({
        provider: "stripe",
        url:      portalUrl,
      })
    }

    // ── Razorpay management ──────────────────────────────────────────────────
    if (sub.provider === "razorpay") {
      // Razorpay doesn't have a hosted customer portal.
      // Return the subscription short_url for payment updates,
      // or a Razorpay dashboard link if the short_url isn't stored.
      const meta = sub.metadata as Record<string, string> | null
      const shortUrl = meta?.razorpay_short_url

      if (shortUrl) {
        return NextResponse.json({
          provider: "razorpay",
          url:      shortUrl,
        })
      }

      // Fallback: direct to our billing page where they can contact support
      return NextResponse.json({
        provider: "razorpay",
        url:      `${appUrl}/billing?manage=true`,
        message:  "To update your payment method, please contact our support team.",
      })
    }

    // ── Manual / enterprise ───────────────────────────────────────────────────
    return NextResponse.json({
      provider: "manual",
      url:      `${appUrl}/billing?contact=true`,
      message:  "Your account is managed manually. Please contact your account manager.",
    })
  } catch (err) {
    console.error("[billing/portal] error:", err)
    return NextResponse.json(
      { error: "Failed to create billing portal session. Please try again." },
      { status: 500 }
    )
  }
}
