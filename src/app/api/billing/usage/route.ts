import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { checkPlanLimits } from "@/lib/billing/limits"

/**
 * GET /api/billing/usage
 *
 * Returns the current plan limits and usage snapshot for the authenticated org.
 * Used by the billing UI to display progress bars and upgrade prompts.
 *
 * Response: LimitGuard (see src/lib/billing/limits.ts)
 */
export async function GET(_request: NextRequest) {
  const session = await auth()
  if (!session?.user?.organizationId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  try {
    const guard = await checkPlanLimits(session.user.organizationId)

    return NextResponse.json({
      status:    guard.status,
      planSlug:  guard.planSlug,
      hasAccess: guard.hasAccess,

      properties: guard.properties,
      tenants:    guard.tenants,
      users:      guard.users,

      canAddProperty:   guard.canAddProperty,
      canAddTenant:     guard.canAddTenant,
      canAddUser:       guard.canAddUser,

      upgradeRequired:  guard.upgradeRequired,
      suggestedPlan:    guard.suggestedPlan,

      // Error messages (only present when limit reached)
      ...(guard.propertyLimitError  ? { propertyLimitError:  guard.propertyLimitError  } : {}),
      ...(guard.tenantLimitError    ? { tenantLimitError:    guard.tenantLimitError    } : {}),
      ...(guard.userLimitError      ? { userLimitError:      guard.userLimitError      } : {}),
      ...(guard.accessDeniedError   ? { accessDeniedError:   guard.accessDeniedError   } : {}),
    })
  } catch (err) {
    console.error("[billing/usage] error:", err)
    return NextResponse.json(
      { error: "Failed to fetch usage data." },
      { status: 500 }
    )
  }
}
