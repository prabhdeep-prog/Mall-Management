/**
 * Cron: Process Dunning Steps
 * ────────────────────────────
 * GET /api/cron/process-dunning
 *
 * Scheduled by Vercel Cron (see vercel.json) every 15 minutes.
 * Executes all dunning_attempts whose scheduled_at ≤ now and status='scheduled'.
 *
 * Security:
 *   • Bearer token from CRON_SECRET env var (set the same value in vercel.json cron headers)
 *   • Vercel also sends x-vercel-signature on cron invocations — validated via CRON_SECRET
 *
 * Idempotent: safe to call multiple times; each step is only processed once.
 */

import { NextRequest, NextResponse } from "next/server"
import { processDueDunningSteps } from "@/lib/billing/dunning"

export const dynamic   = "force-dynamic"  // Never cached
export const maxDuration = 60             // Up to 60 s for the Vercel Hobby plan

export async function GET(request: NextRequest) {
  // ── Auth (timing-safe comparison to prevent secret extraction via timing) ──
  const { guardCronRoute } = await import("@/lib/security/cron-auth")
  const denied = await guardCronRoute(request)
  if (denied) return denied

  const startedAt = new Date()

  try {
    const result = await processDueDunningSteps()

    const duration = Date.now() - startedAt.getTime()

    console.log(
      `[cron/process-dunning] processed=${result.processed} ` +
      `succeeded=${result.succeeded} failed=${result.failed.length} ` +
      `duration=${duration}ms`
    )

    if (result.failed.length > 0) {
      console.error("[cron/process-dunning] failed steps:", result.failed)
    }

    return NextResponse.json({
      ok:         true,
      processed:  result.processed,
      succeeded:  result.succeeded,
      failed:     result.failed.length,
      failedItems: result.failed,
      durationMs: duration,
      runAt:      startedAt.toISOString(),
    })
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : String(err)
    console.error("[cron/process-dunning] fatal error:", err)
    return NextResponse.json(
      { error: "Dunning cron failed", detail: errMsg },
      { status: 500 }
    )
  }
}
