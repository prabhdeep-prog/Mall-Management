/**
 * Razorpay billing client — India-first payment provider
 * ────────────────────────────────────────────────────────
 * Handles subscription creation, cancellation, and webhook verification.
 * All amounts are in paise (INR × 100).
 *
 * Razorpay subscription lifecycle:
 *   created → authenticated → active → charged (recurring)
 *                                   → payment_failed → halted
 *   active → cancelled
 *
 * Env vars required:
 *   RAZORPAY_KEY_ID          - rzp_live_xxx or rzp_test_xxx
 *   RAZORPAY_KEY_SECRET      - secret key
 *   RAZORPAY_WEBHOOK_SECRET  - webhook secret set in Razorpay dashboard
 */

import Razorpay from "razorpay"
import crypto from "crypto"
import type { BillingCycle, PlanSlug } from "./plans"

// ── Client ────────────────────────────────────────────────────────────────────
function getRazorpayClient(): Razorpay {
  if (!process.env.RAZORPAY_KEY_ID || !process.env.RAZORPAY_KEY_SECRET) {
    throw new Error(
      "RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET must be set to use Razorpay billing"
    )
  }
  return new Razorpay({
    key_id:     process.env.RAZORPAY_KEY_ID,
    key_secret: process.env.RAZORPAY_KEY_SECRET,
  })
}

// ── Types (Razorpay SDK types are loose; we define what we use) ───────────────
export interface RazorpaySubscription {
  id:           string   // sub_xxx
  plan_id:      string   // plan_xxx
  customer_id:  string   // cust_xxx
  status:       string
  current_start: number  // unix timestamp
  current_end:   number
  short_url:     string  // payment link for new subscriptions
  charge_at:     number
  total_count:   number  // -1 for unlimited
  paid_count:    number
}

export interface RazorpayCustomer {
  id:    string   // cust_xxx
  name:  string
  email: string
  contact?: string
}

// ── Customer management ───────────────────────────────────────────────────────

export async function createOrFetchRazorpayCustomer(opts: {
  name:  string
  email: string
  orgId: string
}): Promise<string> {
  const rp = getRazorpayClient()

  // Check if customer already exists via notes lookup
  // (Razorpay doesn't have a search-by-email API, so we store orgId in notes)
  // In production: store customer ID in subscriptions table on first create
  const customer = await rp.customers.create({
    name:    opts.name,
    email:   opts.email,
    fail_existing: "0",           // Return existing customer if email matches
    notes: {
      organization_id: opts.orgId,
      platform:        "mallos",
    },
  }) as unknown as RazorpayCustomer

  return customer.id
}

// ── Subscription creation ─────────────────────────────────────────────────────

export interface CreateRazorpaySubscriptionOpts {
  planSlug:       PlanSlug
  billingCycle:   BillingCycle
  customerId:     string
  orgId:          string
  orgName:        string
  trialDays?:     number
  /** Razorpay plan ID (from billing_plans.razorpay_plan_id_monthly/yearly) */
  razorpayPlanId: string
}

export interface CreateRazorpaySubscriptionResult {
  subscriptionId: string    // sub_xxx
  shortUrl:       string    // redirect URL for payment
  customerId:     string
}

export async function createRazorpaySubscription(
  opts: CreateRazorpaySubscriptionOpts
): Promise<CreateRazorpaySubscriptionResult> {
  const rp = getRazorpayClient()

  const sub = await rp.subscriptions.create({
    plan_id:     opts.razorpayPlanId,
    customer_id: opts.customerId,
    quantity:    1,
    total_count: opts.billingCycle === "yearly" ? 1 : 120,  // ~10 years for monthly
    ...(opts.trialDays ? { start_at: Math.floor(Date.now() / 1000) + opts.trialDays * 86400 } : {}),
    notes: {
      organization_id: opts.orgId,
      org_name:        opts.orgName,
      platform:        "mallos",
    },
  }) as unknown as RazorpaySubscription

  return {
    subscriptionId: sub.id,
    shortUrl:       sub.short_url,
    customerId:     opts.customerId,
  }
}

// ── Subscription cancellation ─────────────────────────────────────────────────

export async function cancelRazorpaySubscription(opts: {
  providerSubscriptionId: string
  cancelAtCycleEnd?: boolean
}): Promise<void> {
  const rp = getRazorpayClient()
  await rp.subscriptions.cancel(
    opts.providerSubscriptionId,
    opts.cancelAtCycleEnd !== false   // default: cancel at end of billing period
  )
}

// ── Subscription retrieval ────────────────────────────────────────────────────

export async function getRazorpaySubscription(
  subscriptionId: string
): Promise<RazorpaySubscription> {
  const rp = getRazorpayClient()
  return rp.subscriptions.fetch(subscriptionId) as unknown as RazorpaySubscription
}

// ── Webhook verification ──────────────────────────────────────────────────────
// Razorpay signs webhooks with HMAC-SHA256 using the webhook secret.
// The signature is in the X-Razorpay-Signature header.

export function verifyRazorpayWebhook(opts: {
  rawBody:   string
  signature: string
}): boolean {
  if (!process.env.RAZORPAY_WEBHOOK_SECRET) {
    throw new Error("RAZORPAY_WEBHOOK_SECRET is not set")
  }
  const expected = crypto
    .createHmac("sha256", process.env.RAZORPAY_WEBHOOK_SECRET)
    .update(opts.rawBody)
    .digest("hex")
  // Constant-time comparison prevents timing attacks
  return crypto.timingSafeEqual(
    Buffer.from(expected),
    Buffer.from(opts.signature)
  )
}

// ── Event → internal status mapping ──────────────────────────────────────────
export type RazorpayEventType =
  | "subscription.activated"
  | "subscription.charged"
  | "subscription.payment.failed"
  | "subscription.cancelled"
  | "subscription.completed"
  | "subscription.updated"

export interface RazorpayWebhookPayload {
  event:    RazorpayEventType
  entity:   "subscription"
  contains: string[]
  payload: {
    subscription: {
      entity: RazorpaySubscription
    }
    payment?: { entity: Record<string, unknown> }
  }
}

export function razorpayEventToStatus(event: RazorpayEventType): string | null {
  const map: Partial<Record<RazorpayEventType, string>> = {
    "subscription.activated":       "active",
    "subscription.charged":         "active",
    "subscription.payment.failed":  "past_due",
    "subscription.cancelled":       "cancelled",
    "subscription.completed":       "expired",
  }
  return map[event] ?? null
}

// ── Create Razorpay plan (run once during plan setup) ─────────────────────────
// Call this once to create plans in Razorpay dashboard. Returns plan_id to
// store in billing_plans.razorpay_plan_id_monthly/yearly.

export async function createRazorpayPlan(opts: {
  name:     string
  amount:   number   // paise
  interval: "monthly" | "yearly"
  notes?:   Record<string, string>
}): Promise<string> {
  const rp = getRazorpayClient()
  const plan = await rp.plans.create({
    period:   opts.interval === "monthly" ? "monthly" : "yearly",
    interval: 1,
    item: {
      name:     opts.name,
      amount:   opts.amount,
      currency: "INR",
    },
    notes: opts.notes ?? {},
  }) as unknown as { id: string }
  return plan.id
}
