/**
 * NextAuth configuration
 * ───────────────────────
 * Key changes from the original:
 *
 * 1. User lookup uses `find_user_for_auth()` SECURITY DEFINER function via
 *    serviceDb — this bypasses RLS (which would block unauthenticated lookups)
 *    without exposing a privileged connection to user-facing code.
 *
 * 2. The authorized() callback cross-checks session.organizationId against
 *    the x-org-id header injected by middleware (which comes from subdomain
 *    resolution — not from the user). Mismatch forces re-login.
 *    This prevents a user from accessing another tenant's subdomain using
 *    their own valid session cookie.
 *
 * 3. Role is read from the database (via roleId → roles.permissions),
 *    not hardcoded from user.status as in the original POC.
 */

import type { NextAuthConfig } from "next-auth"
import type { UserRole } from "./index"

if (!process.env.AUTH_SECRET) {
  if (process.env.NODE_ENV === "production") {
    throw new Error("AUTH_SECRET must be set in production")
  }
  console.warn("⚠️  AUTH_SECRET is not set — using insecure default for development")
}

/**
 * Dev-mode bypass guard
 * REQUIRES explicit DEV_AUTH_BYPASS=true in .env.local — never set in CI/prod.
 */
export function isDevBypassEnabled(): boolean {
  return (
    process.env.NODE_ENV === "development" &&
    process.env.DEV_AUTH_BYPASS === "true" &&
    process.env.CI !== "true" // never bypass in CI
  )
}

export const authConfig: NextAuthConfig = {
  providers: [],

  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.id             = user.id
        token.role           = user.role
        token.organizationId = user.organizationId
      }
      return token
    },

    async session({ session, token }) {
      if (session.user) {
        session.user.id             = token.id             as string
        session.user.role           = token.role           as UserRole
        session.user.organizationId = token.organizationId as string
      }
      return session
    },

    authorized({ auth: session, request: { nextUrl, headers } }) {
      // ── Dev-mode bypass ──────────────────────────────────────────────────
      if (isDevBypassEnabled()) {
        const isPublicPath =
          nextUrl.pathname === "/" ||
          nextUrl.pathname.startsWith("/auth") ||
          nextUrl.pathname.startsWith("/api/auth") ||
          nextUrl.pathname.startsWith("/api/health") ||
          nextUrl.pathname.startsWith("/pos-simulator") ||
          nextUrl.pathname.startsWith("/api/pos/simulator")

        if (!isPublicPath) {
          console.warn(`[DEV] Auth bypass enabled — allowing access to ${nextUrl.pathname}`)
        }
        return true
      }

      const isLoggedIn = !!session?.user

      // ── Public paths ─────────────────────────────────────────────────────
      const isPublicPath =
        nextUrl.pathname === "/" ||
        nextUrl.pathname.startsWith("/auth") ||
        nextUrl.pathname.startsWith("/api/auth") ||
        nextUrl.pathname.startsWith("/api/health") ||
        nextUrl.pathname.startsWith("/pos-simulator") ||
        nextUrl.pathname.startsWith("/api/pos/simulator")

      if (isPublicPath) return true

      // ── Auth check ───────────────────────────────────────────────────────
      if (!isLoggedIn) return false

      // ── Cross-tenant session check ────────────────────────────────────────
      // x-org-id is set by middleware from subdomain resolution — not from
      // user-supplied data. If the session's org doesn't match the subdomain's
      // org, the user is trying to use their cookie on the wrong tenant.
      const subdomainOrgId = headers.get("x-org-id")
      const sessionOrgId   = session.user?.organizationId

      if (
        subdomainOrgId &&           // Only enforce when subdomain resolved to an org
        sessionOrgId   &&           // And the session has an org
        subdomainOrgId !== sessionOrgId  // And they don't match
      ) {
        // Redirect to login on the correct subdomain
        const loginUrl = new URL(nextUrl)
        loginUrl.pathname = "/auth/login"
        loginUrl.searchParams.set("error", "wrong_tenant")
        return Response.redirect(loginUrl)
      }

      return true
    },
  },

  pages: {
    signIn: "/auth/login",
    error:  "/auth/error",
  },

  session: { strategy: "jwt" },
  trustHost: true,
}
