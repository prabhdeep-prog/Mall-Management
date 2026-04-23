/**
 * POS Live Transaction Counter — Server-Sent Events
 * ─────────────────────────────────────────────────────────────────────────────
 * Streams the rolling 60-second transaction count for a tenant to the
 * dashboard via SSE.
 *
 * GET /api/events/pos-live?tenantId=<uuid>
 *
 * Events:
 *   connected  — initial handshake with clientId
 *   count      — { tenantId, count, timestamp }  (every 2s)
 *   heartbeat  — keep-alive (every 30s)
 */

import { type NextRequest } from "next/server"
import { getPosLiveCounter } from "@/lib/cache/redis"

export const dynamic = "force-dynamic"
export const runtime = "nodejs"

export async function GET(request: NextRequest) {
  const tenantId = request.nextUrl.searchParams.get("tenantId")

  if (!tenantId) {
    return new Response(JSON.stringify({ error: "tenantId is required" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    })
  }

  const encoder = new TextEncoder()

  const stream = new ReadableStream({
    start(controller) {
      // ── Connected event ───────────────────────────────────────────────
      const clientId = `pos-live-${tenantId}-${Date.now()}`
      controller.enqueue(encoder.encode(
        `event: connected\ndata: ${JSON.stringify({ clientId, tenantId, timestamp: new Date().toISOString() })}\n\n`
      ))

      // ── Poll Redis every 2 seconds and push the count ─────────────────
      const countInterval = setInterval(async () => {
        try {
          const count = await getPosLiveCounter(tenantId)
          controller.enqueue(encoder.encode(
            `event: count\ndata: ${JSON.stringify({ tenantId, count, timestamp: new Date().toISOString() })}\n\n`
          ))
        } catch {
          // Swallow — next tick will retry
        }
      }, 2000)

      // ── Heartbeat every 30 seconds ────────────────────────────────────
      const heartbeatInterval = setInterval(() => {
        try {
          controller.enqueue(encoder.encode(
            `event: heartbeat\ndata: ${JSON.stringify({ timestamp: new Date().toISOString() })}\n\n`
          ))
        } catch {
          clearInterval(countInterval)
          clearInterval(heartbeatInterval)
        }
      }, 30_000)

      // ── Cleanup on disconnect ─────────────────────────────────────────
      request.signal.addEventListener("abort", () => {
        clearInterval(countInterval)
        clearInterval(heartbeatInterval)
        try { controller.close() } catch { /* already closed */ }
      })
    },
  })

  return new Response(stream, {
    headers: {
      "Content-Type":      "text/event-stream",
      "Cache-Control":     "no-cache, no-transform",
      "Connection":        "keep-alive",
      "X-Accel-Buffering": "no",
    },
  })
}
