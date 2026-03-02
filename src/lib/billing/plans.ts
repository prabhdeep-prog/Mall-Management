/**
 * Billing plan definitions — single source of truth
 * ────────────────────────────────────────────────────
 * These constants mirror the billing_plans rows seeded in 004_billing.sql.
 * Keep them in sync when adding new plans.
 *
 * Amounts are in paise (INR × 100) or cents (USD × 100).
 */

export type PlanSlug = "starter" | "growth" | "enterprise"
export type BillingCycle = "monthly" | "yearly"
export type BillingProvider = "razorpay" | "stripe" | "manual"
export type SubscriptionStatus =
  | "trialing"
  | "active"
  | "past_due"
  | "paused"
  | "cancelled"
  | "expired"

// ── Plan limits ───────────────────────────────────────────────────────────────
export interface PlanLimits {
  maxProperties: number | null   // null = unlimited
  maxTenants:    number | null
  maxUsers:      number | null
}

export interface PlanDefinition extends PlanLimits {
  slug:           PlanSlug
  name:           string
  description:    string
  currency:       "INR" | "USD"
  amountMonthly:  number          // paise / cents; 0 = POA/contact sales
  amountYearly:   number | null
  features:       string[]
  isPublic:       boolean         // false = enterprise (contact sales)
  trialDays:      number
}

export const PLANS: Record<PlanSlug, PlanDefinition> = {
  starter: {
    slug:          "starter",
    name:          "Starter",
    description:   "Perfect for single-property operators",
    currency:      "INR",
    amountMonthly: 499_900,       // ₹4,999
    amountYearly:  4_999_900,     // ₹49,999 (~17% discount)
    maxProperties: 2,
    maxTenants:    50,
    maxUsers:      10,
    features: [
      "Up to 2 properties",
      "Up to 50 tenants",
      "Basic reports",
      "Email support",
      "Work order management",
      "Lease management",
      "Invoice generation",
    ],
    isPublic:  true,
    trialDays: 14,
  },

  growth: {
    slug:          "growth",
    name:          "Growth",
    description:   "For multi-property management companies",
    currency:      "INR",
    amountMonthly: 1_499_900,     // ₹14,999
    amountYearly:  14_999_900,    // ₹1,49,999 (~17% discount)
    maxProperties: 10,
    maxTenants:    250,
    maxUsers:      50,
    features: [
      "Up to 10 properties",
      "Up to 250 tenants",
      "Advanced analytics",
      "Priority support",
      "AI agents",
      "POS integrations",
      "Compliance tracking",
      "Custom roles",
    ],
    isPublic:  true,
    trialDays: 14,
  },

  enterprise: {
    slug:          "enterprise",
    name:          "Enterprise",
    description:   "Unlimited scale with custom SLA",
    currency:      "INR",
    amountMonthly: 0,             // POA — contact sales
    amountYearly:  null,
    maxProperties: null,
    maxTenants:    null,
    maxUsers:      null,
    features: [
      "Unlimited properties",
      "Unlimited tenants",
      "Dedicated support",
      "Custom SLA",
      "SSO/SAML",
      "Audit logs",
      "Custom integrations",
      "On-prem option",
    ],
    isPublic:  false,             // Not shown on pricing page — contact sales
    trialDays: 30,
  },
}

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Formats paise to ₹ display string */
export function formatINR(paise: number): string {
  return new Intl.NumberFormat("en-IN", {
    style:    "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  }).format(paise / 100)
}

/** Yearly discount percentage vs monthly × 12 */
export function yearlyDiscount(plan: PlanDefinition): number {
  if (!plan.amountYearly || !plan.amountMonthly) return 0
  const monthly12 = plan.amountMonthly * 12
  return Math.round(((monthly12 - plan.amountYearly) / monthly12) * 100)
}

export function getPlan(slug: PlanSlug): PlanDefinition {
  const plan = PLANS[slug]
  if (!plan) throw new Error(`Unknown plan slug: ${slug}`)
  return plan
}

/** Returns true if a status is considered "access-granted" */
export function isAccessGranted(status: SubscriptionStatus): boolean {
  return status === "active" || status === "trialing" || status === "past_due"
  // past_due: still has access during grace period (dunning handles downgrade)
}

/** Grace period in days after first payment failure before access is restricted */
export const DUNNING_GRACE_PERIOD_DAYS = 10

/** Dunning schedule (days after first failure) */
export const DUNNING_SCHEDULE = [
  { day: 0,  type: "email_warning"  as const, attemptNumber: 1 },
  { day: 3,  type: "payment_retry"  as const, attemptNumber: 1 },
  { day: 6,  type: "email_warning"  as const, attemptNumber: 2 },
  { day: 7,  type: "payment_retry"  as const, attemptNumber: 2 },
  { day: 10, type: "email_warning"  as const, attemptNumber: 3 },
  { day: 10, type: "downgrade"      as const, attemptNumber: 3 },
  { day: 30, type: "cancellation"   as const, attemptNumber: 4 },
] as const

export type DunningStepType = typeof DUNNING_SCHEDULE[number]["type"]
