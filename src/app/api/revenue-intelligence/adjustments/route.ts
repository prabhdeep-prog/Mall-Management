/**
 * Revenue Adjustments API
 * ─────────────────────────────────────────────────────────────────────────────
 * Manages the dispute & override workflow for revenue calculations.
 *
 * GET  /api/revenue-intelligence/adjustments?calcId=xxx
 *   → List adjustments for a calculation (with approval status)
 *
 * POST /api/revenue-intelligence/adjustments
 *   → Create an adjustment request (dispute / credit / debit)
 *   Body: { revCalcId, type, amount, reason, evidenceUrls? }
 *
 * PATCH /api/revenue-intelligence/adjustments/:id
 *   → Approve or reject an adjustment (finance_manager+ only)
 *   Body: { status: "approved" | "rejected", reviewNotes? }
 */

import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { serviceDb } from "@/lib/db"
import { sql } from "drizzle-orm"

// ── Role sets ─────────────────────────────────────────────────────────────────

const CAN_READ     = new Set(["super_admin", "organization_admin", "finance_manager", "property_manager"])
const CAN_CREATE   = new Set(["super_admin", "organization_admin", "finance_manager", "property_manager"])
const CAN_APPROVE  = new Set(["super_admin", "organization_admin", "finance_manager"])

// ── GET ───────────────────────────────────────────────────────────────────────

export async function GET(req: NextRequest) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  if (!CAN_READ.has(session.user.role ?? "")) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  const organizationId = session.user.organizationId!
  const { searchParams } = new URL(req.url)
  const calcId = searchParams.get("calcId")
  const status = searchParams.get("status") ?? "all"

  const rows = await serviceDb.execute<{
    id:              string
    revenue_calc_id: string | null
    adjustment_type: string
    amount:          string
    reason:          string
    status:          string
    requested_by:    string
    requested_at:    string
    reviewed_by:     string | null
    reviewed_at:     string | null
    review_notes:    string | null
    tenant_name:     string | null
  }>(sql`
    SELECT
      ra.id, ra.revenue_calc_id, ra.adjustment_type,
      ra.amount::text, ra.reason, ra.status,
      ra.requested_by, ra.requested_at::text,
      ra.reviewed_by, ra.reviewed_at::text, ra.review_notes,
      t.name AS tenant_name
    FROM revenue_adjustments ra
    LEFT JOIN revenue_calculations rc ON rc.id = ra.revenue_calc_id
    LEFT JOIN tenants t ON t.id = ra.tenant_id
    WHERE ra.organization_id = ${organizationId}::uuid
      ${calcId ? sql`AND ra.revenue_calc_id = ${calcId}::uuid` : sql``}
      ${status !== "all" ? sql`AND ra.status = ${status}` : sql``}
    ORDER BY ra.requested_at DESC
    LIMIT 100
  `)

  return NextResponse.json({ adjustments: Array.from(rows) })
}

// ── POST ──────────────────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  if (!CAN_CREATE.has(session.user.role ?? "")) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  const organizationId = session.user.organizationId!
  const body = await req.json() as {
    revCalcId:     string
    tenantId:      string
    type:          string
    amount:        number
    reason:        string
    evidenceUrls?: string[]
  }

  const { revCalcId, tenantId, type, amount, reason, evidenceUrls } = body

  if (!tenantId || !type || !amount || !reason) {
    return NextResponse.json(
      { error: "tenantId, type, amount, reason are required" },
      { status: 400 }
    )
  }

  const validTypes = ["dispute", "override", "credit", "debit"]
  if (!validTypes.includes(type)) {
    return NextResponse.json({ error: `type must be one of: ${validTypes.join(", ")}` }, { status: 400 })
  }

  try {
    const result = await serviceDb.execute<{ id: string }>(sql`
      INSERT INTO revenue_adjustments (
        organization_id, tenant_id, revenue_calc_id,
        adjustment_type, amount, reason, evidence_urls,
        status, requested_by, requested_at
      ) VALUES (
        ${organizationId}::uuid,
        ${tenantId}::uuid,
        ${revCalcId ?? null}::uuid,
        ${type},
        ${amount},
        ${reason},
        ${evidenceUrls ? `{${evidenceUrls.join(",")}}` : null}::text[],
        'pending',
        ${session.user.id}::uuid,
        NOW()
      )
      RETURNING id
    `)

    // Write audit log
    await serviceDb.execute(sql`
      INSERT INTO revenue_audit_log (
        organization_id, entity_type, entity_id,
        action, actor_id, actor_role,
        new_values, occurred_at
      ) VALUES (
        ${organizationId}::uuid,
        'adjustment',
        ${result[0].id}::uuid,
        'created',
        ${session.user.id}::uuid,
        ${session.user.role ?? "unknown"},
        ${JSON.stringify({ type, amount, reason })}::jsonb,
        NOW()
      )
    `)

    return NextResponse.json({ ok: true, id: result[0].id }, { status: 201 })
  } catch (err) {
    console.error("[adjustments/POST]", err)
    return NextResponse.json({ error: "Failed to create adjustment" }, { status: 500 })
  }
}

// ── PATCH ─────────────────────────────────────────────────────────────────────

export async function PATCH(req: NextRequest) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  if (!CAN_APPROVE.has(session.user.role ?? "")) {
    return NextResponse.json({ error: "Forbidden — approval requires finance_manager+" }, { status: 403 })
  }

  const organizationId = session.user.organizationId!
  const body = await req.json() as {
    id:           string
    status:       "approved" | "rejected"
    reviewNotes?: string
  }

  const { id, status, reviewNotes } = body

  if (!id || !["approved", "rejected"].includes(status)) {
    return NextResponse.json(
      { error: "id and status (approved|rejected) are required" },
      { status: 400 }
    )
  }

  // Fetch old status for audit
  const oldRows = await serviceDb.execute<{ status: string }>(sql`
    SELECT status FROM revenue_adjustments
    WHERE id = ${id}::uuid AND organization_id = ${organizationId}::uuid
  `)

  if (oldRows.length === 0) {
    return NextResponse.json({ error: "Adjustment not found" }, { status: 404 })
  }

  if (oldRows[0].status !== "pending") {
    return NextResponse.json(
      { error: "Only pending adjustments can be reviewed" },
      { status: 409 }
    )
  }

  await serviceDb.execute(sql`
    UPDATE revenue_adjustments
    SET
      status       = ${status},
      reviewed_by  = ${session.user.id}::uuid,
      reviewed_at  = NOW(),
      review_notes = ${reviewNotes ?? null}
    WHERE id = ${id}::uuid
      AND organization_id = ${organizationId}::uuid
  `)

  // Audit log
  await serviceDb.execute(sql`
    INSERT INTO revenue_audit_log (
      organization_id, entity_type, entity_id,
      action, actor_id, actor_role,
      old_values, new_values, occurred_at
    ) VALUES (
      ${organizationId}::uuid,
      'adjustment',
      ${id}::uuid,
      'status_changed',
      ${session.user.id}::uuid,
      ${session.user.role ?? "unknown"},
      ${JSON.stringify({ status: "pending" })}::jsonb,
      ${JSON.stringify({ status, reviewNotes })}::jsonb,
      NOW()
    )
  `)

  return NextResponse.json({ ok: true, status })
}
