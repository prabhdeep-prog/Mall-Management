import { NextRequest, NextResponse } from "next/server"
import { PERMISSIONS, requirePermission } from "@/lib/auth/rbac"
import {
  ensureTenantExists,
  upsertDocument,
  isValidDocType,
  type DocType,
} from "@/lib/tenants/onboarding-service"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

/**
 * POST /api/tenants/[id]/documents
 * Create or update a tenant document. Sets status = "uploaded".
 * Body: { type: "GST"|"PAN"|"AGREEMENT"|"LOGO"|"OTHER", fileUrl?: string }
 */
export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } },
) {
  const { authorized, error } = await requirePermission(PERMISSIONS.TENANTS_EDIT)
  if (!authorized) return NextResponse.json({ error }, { status: 403 })

  const tenantId = params.id
  if (!UUID_RE.test(tenantId)) {
    return NextResponse.json({ error: "Invalid tenant ID" }, { status: 400 })
  }

  if (!(await ensureTenantExists(tenantId))) {
    return NextResponse.json({ error: "Tenant not found" }, { status: 404 })
  }

  let body: { type?: string; fileUrl?: string }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 })
  }

  if (!body.type || !isValidDocType(body.type)) {
    return NextResponse.json(
      { error: "Invalid or missing type. Must be one of: GST, PAN, AGREEMENT, LOGO, OTHER" },
      { status: 400 },
    )
  }

  try {
    const doc = await upsertDocument(tenantId, {
      type: body.type as DocType,
      fileUrl: body.fileUrl,
    })
    return NextResponse.json({ success: true, data: doc }, { status: 201 })
  } catch (err) {
    console.error("[tenants/documents] POST error:", err)
    return NextResponse.json({ error: "Internal error" }, { status: 500 })
  }
}
