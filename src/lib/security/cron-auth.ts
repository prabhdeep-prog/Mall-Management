/**
 * Cron job authentication helper
 * ────────────────────────────────
 * Provides timing-safe CRON_SECRET comparison to prevent timing attacks.
 * Both cron routes use this instead of plain string equality.
 */

import { timingSafeEqual } from "crypto"
import { auditLog, getClientIp } from "./audit-log"

/**
 * Verify the Bearer token in Authorization header against CRON_SECRET.
 * Uses timing-safe comparison to prevent timing-based secret extraction.
 *
 * @returns true if the request is authorized
 */
export function verifyCronSecret(request: Request): boolean {
  const secret = process.env.CRON_SECRET
  if (!secret || secret.length < 16) return false

  const authHeader = (request.headers as Headers).get("authorization")
  if (!authHeader?.startsWith("Bearer ")) return false

  const provided = authHeader.slice(7) // strip "Bearer "

  try {
    const a = Buffer.from(provided)
    const b = Buffer.from(secret)
    // Buffers must be same length for timingSafeEqual
    if (a.length !== b.length) return false
    return timingSafeEqual(a, b)
  } catch {
    return false
  }
}

/**
 * Guard a cron route handler. Returns a 401 NextResponse if unauthorized,
 * or null if the request is authorized (indicating the handler should proceed).
 */
export async function guardCronRoute(
  request: Request
): Promise<Response | null> {
  const authorized = verifyCronSecret(request)

  if (!authorized) {
    await auditLog({
      event: "cron.unauthorized",
      ip: getClientIp(request),
      path: new URL(request.url).pathname,
      metadata: {
        hasAuthHeader: !!(request.headers as Headers).get("authorization"),
      },
    })

    const { NextResponse } = await import("next/server")
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  return null // authorized — caller should proceed
}
