/**
 * Stripe billing client — international / USD billing
 * ─────────────────────────────────────────────────────
 * Used for customers who pay in USD or prefer Stripe.
 * Razorpay is the default for INR / Indian customers.
 *
 * Env vars required:
 *   STRIPE_SECRET_KEY         - sk_live_xxx or sk_test_xxx
 *   STRIPE_WEBHOOK_SECRET     - whsec_xxx (from Stripe CLI or dashboard)
 *   NEXT_PUBLIC_APP_URL       - used to build success/cancel redirect URLs
 */

import Stripe from "stripe"
import type { BillingCycle, PlanSlug } from "./plans"

// ── Client (singleton) ────────────────────────────────────────────────────────
let _stripe: Stripe | null = null

export function getStripeClient(): Stripe {
  if (!process.env.STRIPE_SECRET_KEY) {
    throw new Error("STRIPE_SECRET_KEY must be set to use Stripe billing")
  }
  if (!_stripe) {
    _stripe = new Stripe(process.env.STRIPE_SECRET_KEY, {
      apiVersion: "2025-01-27.acacia",
      typescript:  true,
    })
  }
  return _stripe
}

// ── Customer management ───────────────────────────────────────────────────────

export async function createOrFetchStripeCustomer(opts: {
  email:  string
  name:   string
  orgId:  string
  /** Existing Stripe customer ID from subscriptions.provider_customer_id */
  existingCustomerId?: string
}): Promise<string> {
  const stripe = getStripeClient()

  if (opts.existingCustomerId) {
    // Verify it still exists
    const customer = await stripe.customers.retrieve(opts.existingCustomerId)
    if (!customer.deleted) return opts.existingCustomerId
  }

  const customer = await stripe.customers.create({
    email: opts.email,
    name:  opts.name,
    metadata: {
      organization_id: opts.orgId,
      platform:        "mallos",
    },
  })

  return customer.id
}

// ── Checkout session (new subscription) ──────────────────────────────────────

export interface CreateStripeCheckoutOpts {
  customerId:     string
  priceId:        string            // from billing_plans.stripe_price_id_monthly/yearly
  planSlug:       PlanSlug
  billingCycle:   BillingCycle
  orgId:          string
  trialDays?:     number
}

export interface CreateStripeCheckoutResult {
  checkoutUrl:   string
  sessionId:     string
}

export async function createStripeCheckoutSession(
  opts: CreateStripeCheckoutOpts
): Promise<CreateStripeCheckoutResult> {
  const stripe   = getStripeClient()
  const appUrl   = process.env.NEXT_PUBLIC_APP_URL ?? "https://mallos.com"

  const session = await stripe.checkout.sessions.create({
    mode:        "subscription",
    customer:    opts.customerId,
    line_items: [{ price: opts.priceId, quantity: 1 }],
    ...(opts.trialDays
      ? { subscription_data: { trial_period_days: opts.trialDays } }
      : {}),
    metadata: {
      organization_id: opts.orgId,
      plan_slug:       opts.planSlug,
      billing_cycle:   opts.billingCycle,
    },
    success_url: `${appUrl}/billing/success?session_id={CHECKOUT_SESSION_ID}`,
    cancel_url:  `${appUrl}/billing/plans?cancelled=true`,
  })

  return {
    checkoutUrl: session.url!,
    sessionId:   session.id,
  }
}

// ── Customer portal (manage / cancel) ────────────────────────────────────────

export async function createStripePortalSession(opts: {
  customerId:    string
  returnUrl:     string
}): Promise<string> {
  const stripe  = getStripeClient()
  const session = await stripe.billingPortal.sessions.create({
    customer:   opts.customerId,
    return_url: opts.returnUrl,
  })
  return session.url
}

// ── Subscription management ───────────────────────────────────────────────────

export async function cancelStripeSubscription(opts: {
  providerSubscriptionId: string
  cancelAtPeriodEnd?: boolean
}): Promise<void> {
  const stripe = getStripeClient()
  if (opts.cancelAtPeriodEnd !== false) {
    await stripe.subscriptions.update(opts.providerSubscriptionId, {
      cancel_at_period_end: true,
    })
  } else {
    await stripe.subscriptions.cancel(opts.providerSubscriptionId)
  }
}

export async function upgradeStripeSubscription(opts: {
  providerSubscriptionId: string
  newPriceId:             string
  prorationBehavior?:     Stripe.SubscriptionUpdateParams.ProrationBehavior
}): Promise<void> {
  const stripe = getStripeClient()
  const sub    = await stripe.subscriptions.retrieve(opts.providerSubscriptionId)

  await stripe.subscriptions.update(opts.providerSubscriptionId, {
    items: [{ id: sub.items.data[0].id, price: opts.newPriceId }],
    proration_behavior: opts.prorationBehavior ?? "create_prorations",
  })
}

// ── Webhook verification ──────────────────────────────────────────────────────

export function constructStripeEvent(opts: {
  rawBody:   Buffer
  signature: string
}): Stripe.Event {
  if (!process.env.STRIPE_WEBHOOK_SECRET) {
    throw new Error("STRIPE_WEBHOOK_SECRET is not set")
  }
  return getStripeClient().webhooks.constructEvent(
    opts.rawBody,
    opts.signature,
    process.env.STRIPE_WEBHOOK_SECRET
  )
}

// ── Event → internal status mapping ──────────────────────────────────────────
export function stripeEventToStatus(eventType: string): string | null {
  const map: Record<string, string> = {
    "customer.subscription.created":        "active",
    "customer.subscription.updated":        "active",   // re-evaluated from sub.status
    "customer.subscription.deleted":        "cancelled",
    "invoice.payment_succeeded":            "active",
    "invoice.payment_failed":               "past_due",
    "customer.subscription.trial_will_end": "trialing", // informational
  }
  return map[eventType] ?? null
}

/** Map Stripe subscription status to our internal status */
export function stripeSubStatusToInternal(
  stripeStatus: Stripe.Subscription.Status
): string {
  const map: Record<Stripe.Subscription.Status, string> = {
    active:             "active",
    trialing:           "trialing",
    past_due:           "past_due",
    canceled:           "cancelled",
    incomplete:         "past_due",
    incomplete_expired: "expired",
    paused:             "paused",
    unpaid:             "past_due",
  }
  return map[stripeStatus] ?? "past_due"
}
