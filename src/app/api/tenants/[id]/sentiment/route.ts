import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { PERMISSIONS, requirePermission } from "@/lib/auth/rbac"
import {
  recordSentiment,
  getSentimentSummary,
  getRecentSentiment,
} from "@/lib/tenants/sentiment-engine"

/**
 * GET /api/tenants/[id]/sentiment
 * Returns the 30-day average sentiment and last 5 entries.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { authorized, error } = await requirePermission(PERMISSIONS.TENANTS_VIEW)
    if (!authorized) {
      return NextResponse.json({ error }, { status: 403 })
    }

    const { id: tenantId } = await params

    const summary = await getSentimentSummary(tenantId)

    return NextResponse.json({
      success: true,
      data: summary,
    })
  } catch (err) {
    console.error("[sentiment] GET error:", err)
    return NextResponse.json(
      { error: "Failed to fetch sentiment data" },
      { status: 500 }
    )
  }
}

/**
 * POST /api/tenants/[id]/sentiment
 * Analyze text and store the sentiment result.
 *
 * Body: { text: string, source?: string }
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { authorized, error } = await requirePermission(PERMISSIONS.TENANTS_VIEW)
    if (!authorized) {
      return NextResponse.json({ error }, { status: 403 })
    }

    const { id: tenantId } = await params
    const body = await request.json()

    const text = body.text
    if (!text || typeof text !== "string" || text.trim().length === 0) {
      return NextResponse.json(
        { error: "Field 'text' is required and must be a non-empty string" },
        { status: 400 }
      )
    }

    const source = body.source || "note"
    const validSources = ["email", "note", "call", "chat"]
    if (!validSources.includes(source)) {
      return NextResponse.json(
        { error: `Invalid source. Must be one of: ${validSources.join(", ")}` },
        { status: 400 }
      )
    }

    const entry = await recordSentiment(tenantId, text.trim(), source)

    return NextResponse.json({
      success: true,
      data: entry,
    })
  } catch (err) {
    console.error("[sentiment] POST error:", err)
    return NextResponse.json(
      { error: "Failed to record sentiment" },
      { status: 500 }
    )
  }
}
