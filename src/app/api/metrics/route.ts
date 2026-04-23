import { NextRequest, NextResponse } from "next/server"
import { metrics } from "@/lib/monitoring/metrics"

export const dynamic = "force-dynamic"

/**
 * GET /api/metrics
 *
 * Returns current application metrics snapshot.
 * Protected by a bearer token (METRICS_SECRET) to prevent public access.
 */
export async function GET(request: NextRequest) {
  const secret = process.env.METRICS_SECRET
  if (secret) {
    const auth = request.headers.get("authorization")
    if (auth !== `Bearer ${secret}`) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }
  }

  return NextResponse.json({
    timestamp: new Date().toISOString(),
    metrics: metrics.snapshot(),
  })
}
