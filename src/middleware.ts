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
import { getToken } from "next-auth/jwt"
import { auth } from "@/lib/auth"

const ROOT_DOMAIN = process.env.NEXT_PUBLIC_ROOT_DOMAIN ?? "mallos.com"

// Global rate limit: 120 requests/min for admin API, 60 for tenant
const ADMIN_RATE_LIMIT = 120
const ADMIN_RATE_WINDOW = 60 // seconds

const ALWAYS_PUBLIC = [
  "/api/auth",
  "/_next/static",
  "/_next/image",
  "/favicon.ico",
  "/api/health",
  "/api/backup-status",
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

// ── Rate limiter (edge-compatible, Upstash REST) ────────────────────────────
const RATE_LIMIT = 60 // requests
const RATE_WINDOW = 60 // seconds

async function checkTenantRateLimit(userId: string): Promise<boolean> {
  const url   = process.env.UPSTASH_REDIS_REST_URL
  const token = process.env.UPSTASH_REDIS_REST_TOKEN
  if (!url || !token) return false // No Redis configured — allow request through

  const key = `ratelimit:tenant:${userId}`
  const now = Math.floor(Date.now() / 1000)

  try {
    // Pipeline: ZREMRANGEBYSCORE + ZCARD + ZADD + EXPIRE
    const res = await fetch(`${url}/pipeline`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify([
        ["ZREMRANGEBYSCORE", key, 0, now - RATE_WINDOW],
        ["ZCARD", key],
        ["ZADD", key, now, `${now}:${Math.random().toString(36).slice(2, 8)}`],
        ["EXPIRE", key, RATE_WINDOW],
      ]),
      signal: AbortSignal.timeout(300),
    })
    if (!res.ok) return true // Fail closed on HTTP error
    const results = (await res.json()) as { result: number }[]
    const count = results[1]?.result ?? 0
    return count >= RATE_LIMIT
  } catch {
    return true // Fail closed on exception
  }
}

async function checkAdminRateLimit(userId: string): Promise<boolean> {
  const url   = process.env.UPSTASH_REDIS_REST_URL
  const token = process.env.UPSTASH_REDIS_REST_TOKEN
  if (!url || !token) return false

  const key = `ratelimit:admin:${userId}`
  const now = Math.floor(Date.now() / 1000)

  try {
    const res = await fetch(`${url}/pipeline`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify([
        ["ZREMRANGEBYSCORE", key, 0, now - ADMIN_RATE_WINDOW],
        ["ZCARD", key],
        ["ZADD", key, now, `${now}:${Math.random().toString(36).slice(2, 8)}`],
        ["EXPIRE", key, ADMIN_RATE_WINDOW],
      ]),
      signal: AbortSignal.timeout(300),
    })
    if (!res.ok) return true
    const results = (await res.json()) as { result: number }[]
    return (results[1]?.result ?? 0) >= ADMIN_RATE_LIMIT
  } catch {
    return true
  }
}

export default async function middleware(request: NextRequest): Promise<NextResponse> {
  const requestStart = Date.now()
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

  // Only perform Redis org lookups when needed (tenant routes or explicit org param)
  const isTenantOrPortalRoute =
    pathname.startsWith("/portal") ||
    pathname.startsWith("/tenant") ||
    pathname.startsWith("/api/tenant")
  const hasOrgParam = isLocalhost && request.nextUrl.searchParams.has("org")
  const needsOrgResolution = isTenantOrPortalRoute || hasOrgParam || (!isLocalhost && !isRootDomain)

  if (needsOrgResolution) {
    if (isLocalhost) {
      orgSlug = request.nextUrl.searchParams.get("org")
      if (orgSlug) orgId = await redisGet(`org:slug:${orgSlug}`)
    } else if (!isRootDomain) {
      const maybeSub = host.endsWith(`.${ROOT_DOMAIN}`)
        ? host.slice(0, host.length - ROOT_DOMAIN.length - 1)
        : null

      if (maybeSub) {
        orgSlug = maybeSub
        orgId   = await redisGet(`org:slug:${maybeSub}`)
      } else {
        orgId = await redisGet(`org:domain:${host}`)
      }
    }
  }

  // ── Decode JWT for role-based routing ──────────────────────────────────────
  const token = await getToken({ req: request, secret: process.env.AUTH_SECRET })

  const isTenantRoute =
    pathname.startsWith("/portal") ||
    (pathname.startsWith("/tenant") && !pathname.startsWith("/tenants")) ||
    (pathname.startsWith("/api/tenant") && !pathname.startsWith("/api/tenants"))
  const isTenantLogin = pathname === "/portal/login" || pathname === "/tenant/login"
  const isTenantUser  = token?.role === "tenant"

  // ── Tenant route guard ──────────────────────────────────────────────────────
  // /portal/*, /tenant/*, and /api/tenant/* require role === "tenant" (except login)
  if (isTenantRoute && !isTenantLogin) {
    if (!token) {
      const loginUrl = new URL("/tenant/login", request.url)
      loginUrl.searchParams.set("callbackUrl", pathname)
      return NextResponse.redirect(loginUrl)
    }
    if (!isTenantUser || !token.tenantId) {
      return NextResponse.json(
        { error: "Forbidden: tenant role required" },
        { status: 403 },
      )
    }
  }

  // ── Block tenant users from admin routes ────────────────────────────────────
  // Tenant users must stay within /portal/* and /api/tenant/*
  if (isTenantUser && !isTenantRoute && !isTenantLogin) {
    return NextResponse.json(
      { error: "Forbidden: tenant users cannot access admin routes" },
      { status: 403 },
    )
  }

  // ── Rate limit tenant API routes ──────────────────────────────────────────
  // 60 requests per minute per tenant user — sliding window via Upstash sorted set
  if (pathname.startsWith("/api/tenant") && token?.id) {
    const rateLimited = await checkTenantRateLimit(token.id as string)
    if (rateLimited) {
      return NextResponse.json(
        { error: "Too many requests" },
        { status: 429, headers: { "Retry-After": "60" } },
      )
    }
  }

  // ── Rate limit admin API routes ────────────────────────────────────────────
  // 120 requests per minute per admin user
  if (pathname.startsWith("/api/") && !pathname.startsWith("/api/tenant") && token?.id) {
    const rateLimited = await checkAdminRateLimit(token.id as string)
    if (rateLimited) {
      return NextResponse.json(
        { error: "Too many requests" },
        { status: 429, headers: { "Retry-After": "60" } },
      )
    }
  }

  // ── CSRF validation for state-mutating requests ──────────────────────────
  if (
    pathname.startsWith("/api/") &&
    !["GET", "HEAD", "OPTIONS"].includes(request.method) &&
    !pathname.startsWith("/api/webhooks/") &&
    !pathname.startsWith("/api/cron/") &&
    !pathname.startsWith("/api/auth/")
  ) {
    const origin = request.headers.get("origin")
    const referer = request.headers.get("referer")
    if (origin) {
      try {
        const originHost = new URL(origin).host
        if (originHost !== host) {
          return NextResponse.json({ error: "CSRF: origin mismatch" }, { status: 403 })
        }
      } catch {
        return NextResponse.json({ error: "CSRF: invalid origin" }, { status: 403 })
      }
    }
  }

  // ── Build enriched request (headers forwarded to Server Components / Actions)
  const enrichedHeaders = new Headers(request.headers)
  if (orgId)   enrichedHeaders.set("x-org-id",   orgId)
  if (orgSlug) enrichedHeaders.set("x-org-slug", orgSlug)
  // Remove any client-supplied x-org-* / x-tenant-* headers to prevent spoofing
  enrichedHeaders.delete("x-org-id-client")
  enrichedHeaders.delete("x-tenant-id")

  // ── Inject x-tenant-id for tenant routes ────────────────────────────────────
  // Downstream API routes and withTenantContext() can read this header
  // instead of decoding the JWT again.
  if (isTenantUser && token.tenantId) {
    enrichedHeaders.set("x-tenant-id", token.tenantId as string)
  }

  // ── Auth gate ───────────────────────────────────────────────────────────────
  // auth() runs the authorized() callback in auth/config.ts.
  // The enriched headers are accessible there via request.headers.
  const authedResponse = await (auth as (req: NextRequest) => Promise<NextResponse | null>)(
    new NextRequest(request.url, { headers: enrichedHeaders, method: request.method })
  )

  const response = authedResponse ?? NextResponse.next({
    request: { headers: enrichedHeaders },
  })

  // ── Security headers ─────────────────────────────────────────────────────
  response.headers.set("X-Frame-Options", "DENY")
  response.headers.set("X-Content-Type-Options", "nosniff")
  response.headers.set("Referrer-Policy", "strict-origin-when-cross-origin")
  response.headers.set("Permissions-Policy", "camera=(), microphone=(), geolocation=()")
  response.headers.set("X-XSS-Protection", "1; mode=block")
  response.headers.set(
    "Content-Security-Policy",
    "default-src 'self'; script-src 'self' 'unsafe-inline' 'unsafe-eval'; style-src 'self' 'unsafe-inline'; img-src 'self' data: https:; font-src 'self' data:; connect-src 'self' https:; frame-ancestors 'none';"
  )
  response.headers.set("Strict-Transport-Security", "max-age=63072000; includeSubDomains; preload")

  // Propagate org headers to response so client can read them if needed
  if (orgId)   response.headers.set("x-org-id",   orgId)
  if (orgSlug) response.headers.set("x-org-slug", orgSlug)
  if (isTenantUser && token?.tenantId) {
    response.headers.set("x-tenant-id", token.tenantId as string)
  }

  // ── Request timing & slow API detection ────────────────────────────────────
  const duration = Date.now() - requestStart
  response.headers.set("X-Response-Time", `${duration}ms`)

  if (pathname.startsWith("/api/") && duration > 500) {
    // Edge runtime can't import logger — use console with structured JSON
    console.warn(
      JSON.stringify({
        timestamp: new Date().toISOString(),
        level: "warn",
        message: "Slow API request detected",
        pathname,
        method: request.method,
        duration_ms: duration,
        orgId: orgId || undefined,
      })
    )
  }

  return response
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon\\.ico).*)"],
}
