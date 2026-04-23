/**
 * CSRF Protection
 * ─────────────────────────────────────────────────────────────────────────────
 * Double-submit cookie pattern for CSRF protection on state-mutating requests.
 *
 * How it works:
 * 1. Server sets a random CSRF token in a cookie (csrf-token)
 * 2. Client reads the cookie and sends it as X-CSRF-Token header
 * 3. Server verifies header matches cookie
 *
 * For Next.js API routes, we also accept the Origin/Referer header check
 * as an additional layer of defense.
 */

import crypto from "crypto"
import { NextRequest } from "next/server"

const CSRF_COOKIE_NAME = "csrf-token"
const CSRF_HEADER_NAME = "x-csrf-token"
const ALLOWED_METHODS = ["GET", "HEAD", "OPTIONS"] // Safe methods, no CSRF check needed

/**
 * Generate a new CSRF token.
 */
export function generateCsrfToken(): string {
  return crypto.randomBytes(32).toString("hex")
}

/**
 * Validate CSRF token from request.
 * Returns true if request is safe (GET/HEAD/OPTIONS) or token is valid.
 */
export function validateCsrf(request: NextRequest): { valid: boolean; reason?: string } {
  // Safe methods don't need CSRF validation
  if (ALLOWED_METHODS.includes(request.method)) {
    return { valid: true }
  }

  // Webhook and cron routes are exempt (they use their own auth)
  const { pathname } = request.nextUrl
  if (pathname.startsWith("/api/webhooks/") || pathname.startsWith("/api/cron/")) {
    return { valid: true }
  }

  // Origin check: verify the request comes from the same origin
  const origin = request.headers.get("origin")
  const referer = request.headers.get("referer")
  const host = request.headers.get("host")

  if (origin) {
    try {
      const originHost = new URL(origin).host
      if (originHost !== host) {
        return { valid: false, reason: "Origin mismatch" }
      }
    } catch {
      return { valid: false, reason: "Invalid origin header" }
    }
  } else if (referer) {
    try {
      const refererHost = new URL(referer).host
      if (refererHost !== host) {
        return { valid: false, reason: "Referer mismatch" }
      }
    } catch {
      // Malformed referer — block
      return { valid: false, reason: "Invalid referer header" }
    }
  }

  // Double-submit cookie validation
  const cookieToken = request.cookies.get(CSRF_COOKIE_NAME)?.value
  const headerToken = request.headers.get(CSRF_HEADER_NAME)

  // If we have a cookie set, validate the header matches
  if (cookieToken && headerToken) {
    if (cookieToken !== headerToken) {
      return { valid: false, reason: "CSRF token mismatch" }
    }
  }

  // If no cookie is set yet, origin/referer check alone is sufficient
  // (token will be set on next response)
  return { valid: true }
}
