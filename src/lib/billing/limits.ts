/**
 * Usage enforcement — plan limit guards
 * ───────────────────────────────────────
 * Call these at the start of any API route or server action that creates
 * resources subject to plan limits (properties, tenants, users).
 *
 * Design principle: fail CLOSED. If the subscription cannot be resolved,
 * access is denied. If the plan cannot be determined, assume the lowest tier.
 *
 * Usage:
 *   const guard = await checkPlanLimits(orgId)
 *   if (!guard.canAddProperty) {
 *     return NextResponse.json({ error: guard.propertyLimitError }, { status: 402 })
 *   }
 */

import { sql } from "drizzle-orm"
import { serviceDb } from "@/lib/db"
import { PLANS, isAccessGranted, type PlanSlug, type SubscriptionStatus } from "./plans"

// ── Types ─────────────────────────────────────────────────────────────────────

export interface UsageSnapshot {
  propertyCount: number
  tenantCount:   number
  userCount:     number
}

export interface LimitGuard {
  /** Current subscription status */
  status:           SubscriptionStatus
  /** Current plan slug */
  planSlug:         PlanSlug
  /** True if the org has any valid access (active, trialing, past_due in grace) */
  hasAccess:        boolean

  // Per-resource checks
  canAddProperty:   boolean
  canAddTenant:     boolean
  canAddUser:       boolean

  // Limit details (useful for UI display)
  properties:       { current: number; max: number | null; remaining: number | null }
  tenants:          { current: number; max: number | null; remaining: number | null }
  users:            { current: number; max: number | null; remaining: number | null }

  // Upgrade prompt
  upgradeRequired:  boolean
  suggestedPlan:    PlanSlug | null

  // Pre-formatted error messages ready for API responses
  propertyLimitError?: string
  tenantLimitError?:   string
  userLimitError?:     string
  accessDeniedError?:  string
}

// ── Database queries ──────────────────────────────────────────────────────────

interface OrgSubscription {
  status:           string
  plan_slug:        string
  max_properties:   number | null
  max_tenants:      number | null
  max_users:        number | null
}

async function getOrgSubscription(orgId: string): Promise<OrgSubscription | null> {
  const result = await serviceDb.execute<OrgSubscription>(sql`
    SELECT
      s.status,
      bp.slug         AS plan_slug,
      bp.max_properties,
      bp.max_tenants,
      bp.max_users
    FROM       subscriptions s
    JOIN       billing_plans bp ON bp.id = s.plan_id
    WHERE      s.organization_id = ${orgId}::uuid
      AND      s.status NOT IN ('cancelled', 'expired')
    ORDER BY   s.created_at DESC
    LIMIT      1
  `)
  return result.rows[0] ?? null
}

async function getOrgUsage(orgId: string): Promise<UsageSnapshot> {
  const result = await serviceDb.execute<{
    property_count: string
    tenant_count:   string
    user_count:     string
  }>(sql`
    SELECT
      (SELECT COUNT(*) FROM properties WHERE organization_id = ${orgId}::uuid)  AS property_count,
      (SELECT COUNT(*)
       FROM tenants t
       JOIN properties p ON p.id = t.property_id
       WHERE p.organization_id = ${orgId}::uuid
         AND t.status != 'inactive')                                             AS tenant_count,
      (SELECT COUNT(*) FROM users WHERE organization_id = ${orgId}::uuid
         AND status != 'suspended')                                              AS user_count
  `)
  const row = result.rows[0]
  return {
    propertyCount: parseInt(row?.property_count ?? "0", 10),
    tenantCount:   parseInt(row?.tenant_count   ?? "0", 10),
    userCount:     parseInt(row?.user_count      ?? "0", 10),
  }
}

// ── Main guard function ───────────────────────────────────────────────────────

export async function checkPlanLimits(orgId: string): Promise<LimitGuard> {
  const [sub, usage] = await Promise.all([
    getOrgSubscription(orgId),
    getOrgUsage(orgId),
  ])

  // No subscription → treat as expired (fail closed)
  if (!sub) {
    return buildDeniedGuard(usage, "No active subscription. Please subscribe to continue.")
  }

  const status    = sub.status         as SubscriptionStatus
  const planSlug  = sub.plan_slug      as PlanSlug
  const hasAccess = isAccessGranted(status)

  if (!hasAccess) {
    return buildDeniedGuard(
      usage,
      `Your subscription is ${status}. Please renew to continue.`
    )
  }

  // null limits = unlimited
  const maxProps    = sub.max_properties
  const maxTenants  = sub.max_tenants
  const maxUsers    = sub.max_users

  const canAddProperty = maxProps   === null || usage.propertyCount < maxProps
  const canAddTenant   = maxTenants === null || usage.tenantCount   < maxTenants
  const canAddUser     = maxUsers   === null || usage.userCount      < maxUsers

  const upgradeRequired = !canAddProperty || !canAddTenant || !canAddUser
  const suggestedPlan   = upgradeRequired ? getNextPlan(planSlug) : null

  const remaining = (current: number, max: number | null) =>
    max === null ? null : Math.max(0, max - current)

  const guard: LimitGuard = {
    status,
    planSlug,
    hasAccess,
    canAddProperty,
    canAddTenant,
    canAddUser,
    properties: { current: usage.propertyCount, max: maxProps,   remaining: remaining(usage.propertyCount, maxProps)   },
    tenants:    { current: usage.tenantCount,    max: maxTenants, remaining: remaining(usage.tenantCount,   maxTenants) },
    users:      { current: usage.userCount,      max: maxUsers,   remaining: remaining(usage.userCount,     maxUsers)   },
    upgradeRequired,
    suggestedPlan,
  }

  if (!canAddProperty) {
    guard.propertyLimitError = `Your ${PLANS[planSlug].name} plan allows up to ${maxProps} properties. ` +
      `Upgrade to ${suggestedPlan ? PLANS[suggestedPlan].name : "Enterprise"} to add more.`
  }
  if (!canAddTenant) {
    guard.tenantLimitError = `Your ${PLANS[planSlug].name} plan allows up to ${maxTenants} tenants. ` +
      `Upgrade to ${suggestedPlan ? PLANS[suggestedPlan].name : "Enterprise"} to add more.`
  }
  if (!canAddUser) {
    guard.userLimitError = `Your ${PLANS[planSlug].name} plan allows up to ${maxUsers} users. ` +
      `Upgrade to ${suggestedPlan ? PLANS[suggestedPlan].name : "Enterprise"} to add more.`
  }

  return guard
}

function buildDeniedGuard(usage: UsageSnapshot, errorMsg: string): LimitGuard {
  return {
    status:           "expired",
    planSlug:         "starter",
    hasAccess:        false,
    canAddProperty:   false,
    canAddTenant:     false,
    canAddUser:       false,
    properties:       { current: usage.propertyCount, max: 0, remaining: 0 },
    tenants:          { current: usage.tenantCount,   max: 0, remaining: 0 },
    users:            { current: usage.userCount,     max: 0, remaining: 0 },
    upgradeRequired:  true,
    suggestedPlan:    "starter",
    accessDeniedError: errorMsg,
  }
}

function getNextPlan(current: PlanSlug): PlanSlug | null {
  const order: PlanSlug[] = ["starter", "growth", "enterprise"]
  const idx = order.indexOf(current)
  return idx < order.length - 1 ? order[idx + 1] : null
}
