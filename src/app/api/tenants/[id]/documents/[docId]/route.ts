import { NextRequest, NextResponse } from "next/server"
import { PERMISSIONS, requirePermission } from "@/lib/auth/rbac"
import {
  ensureTenantExists,
  updateDocumentStatus,
  isValidDocStatus,
  type DocStatus,
} from "@/lib/tenants/onboarding-service"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

/**
 * PATCH /api/tenants/[id]/documents/[docId]
 * Update document status (e.g. verify).
 * Body: { status: "pending"|"uploaded"|"verified" }
 */
export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string; docId: string } },
) {
  const { authorized, error } = await requirePermission(PERMISSIONS.TENANTS_EDIT)
  if (!authorized) return NextResponse.json({ error }, { status: 403 })

  const { id: tenantId, docId } = params
  if (!UUID_RE.test(tenantId) || !UUID_RE.test(docId)) {
    return NextResponse.json({ error: "Invalid ID format" }, { status: 400 })
  }

  if (!(await ensureTenantExists(tenantId))) {
    return NextResponse.json({ error: "Tenant not found" }, { status: 404 })
  }

  let body: { status?: string }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 })
  }

  if (!body.status || !isValidDocStatus(body.status)) {
    return NextResponse.json(
      { error: "Invalid or missing status. Must be one of: pending, uploaded, verified" },
      { status: 400 },
    )
  }

  try {
    const doc = await updateDocumentStatus(tenantId, docId, body.status as DocStatus)
    if (!doc) {
      return NextResponse.json({ error: "Document not found for this tenant" }, { status: 404 })
    }
    return NextResponse.json({ success: true, data: doc })
  } catch (err) {
    console.error("[tenants/documents/docId] PATCH error:", err)
    return NextResponse.json({ error: "Internal error" }, { status: 500 })
  }
}
