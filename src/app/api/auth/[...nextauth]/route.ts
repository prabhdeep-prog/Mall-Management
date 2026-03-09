import { NextRequest, NextResponse } from "next/server"
import { handlers } from "@/lib/auth"
import { checkRateLimit } from "@/lib/cache/redis"

export const { GET } = handlers

/**
 * Wrap NextAuth POST with IP-level brute-force protection.
 *
 * Limit: 5 login attempts per 15 minutes per source IP.
 * On Redis failure the rate limiter fails closed (see redis.ts), so the
 * user will be blocked until Redis recovers — acceptable for the login path.
 */
export async function POST(request: NextRequest): Promise<Response> {
  // Extract client IP from standard proxy headers
  const ip =
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    request.headers.get("x-real-ip") ??
    "unknown"

  const { allowed, remaining, resetAt } = await checkRateLimit(
    `auth:login:${ip}`,
    5,   // max 5 attempts
    900, // per 15-minute window
  )

  if (!allowed) {
    const retryAfter = Math.max(0, resetAt - Math.floor(Date.now() / 1000))
    return NextResponse.json(
      { error: "Too many login attempts. Please try again later." },
      {
        status: 429,
        headers: {
          "Retry-After": String(retryAfter),
          "X-RateLimit-Limit": "5",
          "X-RateLimit-Remaining": "0",
          "X-RateLimit-Reset": String(resetAt),
        },
      }
    )
  }

  // Delegate to NextAuth handler; propagate rate-limit headers on success
  const response = await handlers.POST(request)
  const mutable = new Response(response.body, response)
  mutable.headers.set("X-RateLimit-Limit", "5")
  mutable.headers.set("X-RateLimit-Remaining", String(remaining))
  mutable.headers.set("X-RateLimit-Reset", String(resetAt))
  return mutable
}
