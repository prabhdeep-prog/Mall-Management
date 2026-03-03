import { NextResponse } from "next/server"
import { PLANS, formatINR, yearlyDiscount } from "@/lib/billing/plans"
import { auth } from "@/lib/auth"
import { checkPlanLimits } from "@/lib/billing/limits"

/**
 * GET /api/billing/plans
 * Returns all public plans with pricing, limits, and current org usage.
 * Used by the pricing/upgrade page.
 */
export async function GET() {
  const session = await auth()
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const orgId = session.user.organizationId
  const guard = orgId ? await checkPlanLimits(orgId).catch(() => null) : null

  const plans = Object.values(PLANS)
    .filter((p) => p.isPublic)
    .sort((a, b) => a.amountMonthly - b.amountMonthly)
    .map((plan) => ({
      slug:           plan.slug,
      name:           plan.name,
      description:    plan.description,
      currency:       plan.currency,
      pricing: {
        monthly:         plan.amountMonthly,
        yearly:          plan.amountYearly,
        monthlyFormatted: formatINR(plan.amountMonthly),
        yearlyFormatted:  plan.amountYearly ? formatINR(plan.amountYearly) : null,
        yearlyDiscount:   yearlyDiscount(plan),
      },
      limits: {
        maxProperties:  plan.maxProperties,
        maxTenants:     plan.maxTenants,
        maxUsers:       plan.maxUsers,
      },
      features:       plan.features,
      isCurrent:      guard?.planSlug === plan.slug,
      trialDays:      plan.trialDays,
    }))

  return NextResponse.json({ plans, currentUsage: guard })
}
