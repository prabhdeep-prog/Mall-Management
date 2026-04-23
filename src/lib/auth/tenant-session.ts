/**
 * Server-side helper for tenant portal API routes.
 *
 * Usage in a route handler:
 *   const { tenantId } = await requireTenantSession()
 *   // Returns 401 response if not authenticated as a tenant
 */

import { auth } from "@/lib/auth"
import { NextResponse } from "next/server"

export interface TenantSessionContext {
  tenantId: string
  userId:   string
  email:    string
}

/**
 * Verifies the incoming request has a valid tenant portal session.
 * Returns the tenant context or throws a NextResponse with 401.
 */
export async function requireTenantSession(): Promise<TenantSessionContext> {
  const session = await auth()

  if (!session?.user) {
    throw NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const { tenantId, id, email, role } = session.user as {
    tenantId?: string
    id: string
    email: string
    role: string
  }

  if (role !== "tenant" || !tenantId) {
    throw NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  return { tenantId, userId: id, email }
}
