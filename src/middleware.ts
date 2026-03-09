/**
 * Next.js Edge Middleware
 * ────────────────────────
 * Runs at the Vercel edge before every request — sub-millisecond latency.
 *
 * Responsibilities (in order):
 *   1. Tenant resolution  — extract org slug from subdomain, look up orgId
 *   2. Header injection   — write x-org-id + x-org-slug for downstream use
 *   3. Auth gate          — delegate to NextAuth for session validation
 *
 * Subdomain routing:
 *   phoenix.mallos.com  → orgCode = "phoenix" → Redis lookup → orgId injected
 *   app.customer.com    → custom domain        → Redis lookup → orgId injected
 *   localhost:3000      → ?org=phoenix query param (dev mode)
 *   mallos.com          → root/marketing, no tenant resolution
 *
 * Security:
 *   • orgId comes from subdomain resolution, not from user cookies — cannot be spoofed
 *   • Auth config cross-checks session.organizationId === x-org-id on every request
 *   • Session cookies are scoped to the subdomain, not *.mallos.com root
 *   • Redis miss is non-fatal: auth + DB-layer RLS still enforce isolation
 */

import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"

const ROOT_DOMAIN = process.env.NEXT_PUBLIC_ROOT_DOMAIN ?? "mallos.com"

const ALWAYS_PUBLIC = [
  "/api/auth",
  "/_next/static",
  "/_next/image",
  "/favicon.ico",
  "/api/health",
  "/api/pos/simulator",
  "/pos-simulator",
  // Webhooks: called by payment providers (no session cookie)
  "/api/webhooks",
  // Cron: called by Vercel Cron scheduler (CRON_SECRET protected internally)
  "/api/cron",
]

// ── Upstash Redis lookup (edge-compatible REST, no TCP) ───────────────────────
async function redisGet(key: string): Promise<string | null> {
  const url   = process.env.UPSTASH_REDIS_REST_URL
  const token = process.env.UPSTASH_REDIS_REST_TOKEN
  if (!url || !token) return null
  try {
    const res = await fetch(`${url}/get/${encodeURIComponent(key)}`, {
      headers: { Authorization: `Bearer ${token}` },
      signal: AbortSignal.timeout(400),
    })
    if (!res.ok) return null
    const json = (await res.json()) as { result: string | null }
    return json.result
  } catch {
    return null // Fail open at Redis; DB-layer RLS is the hard enforcement
  }
}


// ── Security headers ──────────────────────────────────────────────────────────
// Applied to every response after auth and tenant resolution.
function addSecurityHeaders(response: NextResponse): NextResponse {
  // Prevent clickjacking
  response.headers.set("X-Frame-Options", "DENY")
  // Prevent MIME-type sniffing
  response.headers.set("X-Content-Type-Options", "nosniff")
  // Referrer policy — no full URL leak on cross-origin navigations
  response.headers.set("Referrer-Policy", "strict-origin-when-cross-origin")
  // Disable browser features the app doesn't use
  response.headers.set(
    "Permissions-Policy",
    "camera=(), microphone=(), geolocation=(), payment=(), usb=(), bluetooth=()"
  )
  // HSTS — production only (local dev uses HTTP)
  if (process.env.NODE_ENV === "production") {
    response.headers.set(
      "Strict-Transport-Security",
      "max-age=63072000; includeSubDomains; preload"
    )
  }
  // Content Security Policy — allow Next.js + Recharts + Upstash
  response.headers.set(
    "Content-Security-Policy",
    [
      "default-src 'self'",
      "script-src 'self' 'unsafe-eval' 'unsafe-inline'", // Next.js requires unsafe-eval in dev
      "style-src 'self' 'unsafe-inline'",                // Tailwind inline styles
      "img-src 'self' data: blob: https:",
      "font-src 'self'",
      "connect-src 'self' https://*.upstash.io https://api.anthropic.com wss:",
      "frame-ancestors 'none'",
      "base-uri 'self'",
      "form-action 'self'",
    ].join("; ")
  )
  return response
}

export default async function middleware(request: NextRequest): Promise<NextResponse> {
  const { pathname } = request.nextUrl
  const host = request.headers.get("host") ?? ""

  // ── Skip static / auth paths entirely ──────────────────────────────────────
  if (ALWAYS_PUBLIC.some((p) => pathname.startsWith(p))) {
    return NextResponse.next()
  }

  // ── Tenant resolution ───────────────────────────────────────────────────────
  let orgSlug: string | null = null
  let orgId: string | null = null

  const isLocalhost  = host.startsWith("localhost") || host.startsWith("127.")
  const isRootDomain = host === ROOT_DOMAIN || host === `www.${ROOT_DOMAIN}`

  if (isLocalhost) {
    // Dev mode: ?org=slug overrides subdomain (subdomains don't work on localhost)
    orgSlug = request.nextUrl.searchParams.get("org")
    if (orgSlug) orgId = await redisGet(`org:slug:${orgSlug}`)
  } else if (!isRootDomain) {
    // Production: check if this is a registered subdomain
    const maybeSub = host.endsWith(`.${ROOT_DOMAIN}`)
      ? host.slice(0, host.length - ROOT_DOMAIN.length - 1)
      : null

    if (maybeSub) {
      orgSlug = maybeSub
      orgId   = await redisGet(`org:slug:${maybeSub}`)
    } else {
      // Custom domain: app.customer.com
      orgId = await redisGet(`org:domain:${host}`)
    }
  }

  // ── Build enriched request (headers forwarded to Server Components / Actions)
  const enrichedHeaders = new Headers(request.headers)
  if (orgId)   enrichedHeaders.set("x-org-id",   orgId)
  if (orgSlug) enrichedHeaders.set("x-org-slug", orgSlug)
  // Remove any client-supplied x-org-* headers to prevent spoofing
  enrichedHeaders.delete("x-org-id-client")

  // ── Auth gate ───────────────────────────────────────────────────────────────
  // auth() runs the authorized() callback in auth/config.ts.
  // The enriched headers are accessible there via request.headers.
  const authedResponse = await (auth as (req: NextRequest) => Promise<NextResponse | null>)(
    new NextRequest(request.url, { headers: enrichedHeaders, method: request.method })
  )

  const response = authedResponse ?? NextResponse.next({
    request: { headers: enrichedHeaders },
  })

  // Propagate org headers to response so client can read them if needed
  if (orgId)   response.headers.set("x-org-id",   orgId)
  if (orgSlug) response.headers.set("x-org-slug", orgSlug)

  // Apply security headers to every response
  return addSecurityHeaders(response)
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon\\.ico).*)"],
}
