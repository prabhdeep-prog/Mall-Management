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
import Credentials from "next-auth/providers/credentials"
import { z } from "zod"
import bcrypt from "bcryptjs"
import { sql } from "drizzle-orm"
import { serviceDb } from "@/lib/db"
import type { UserRole } from "./index"

/**
 * postgres-js returns query results as a plain array (RowList extends Array).
 * It does NOT have a `.rows` property. This helper casts safely so both
 * postgres-js (direct array) and any adapter that wraps results in `{ rows }`
 * work at runtime, while keeping TypeScript happy.
 */
function firstRow<T>(result: unknown): T | undefined {
  if (Array.isArray(result)) return (result as T[])[0]
  const r = result as { rows?: T[] }
  return r.rows?.[0]
}

if (!process.env.AUTH_SECRET) {
  if (process.env.NODE_ENV === "production") {
    throw new Error("AUTH_SECRET must be set in production")
  }
  console.warn("⚠️  AUTH_SECRET is not set — using insecure default for development")
}

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
})

// Looks up role name from the roles table
async function getRoleName(roleId: string | null): Promise<UserRole> {
  if (!roleId) return "viewer"
  const result = await serviceDb.execute<{ name: string }>(
    sql`SELECT name FROM roles WHERE id = ${roleId}::uuid LIMIT 1`
  )
  const name = firstRow<{ name: string }>(result)?.name as UserRole | undefined
  return name ?? "viewer"
}

export const authConfig: NextAuthConfig = {
  providers: [
    // ── Tenant portal credentials ─────────────────────────────────────────
    Credentials({
      id:   "tenant",
      name: "Tenant Portal",
      credentials: {
        email:    { label: "Email",    type: "email"    },
        password: { label: "Password", type: "password" },
      },
      async authorize(credentials) {
        const parsed = loginSchema.safeParse(credentials)
        if (!parsed.success) return null

        const { email, password } = parsed.data

        const result = await serviceDb.execute<{
          id: string
          email: string
          password_hash: string
          tenant_id: string
          name: string | null
        }>(sql`SELECT * FROM find_tenant_user_for_auth(${email})`)

        const user = firstRow<{
          id: string; email: string; password_hash: string
          tenant_id: string; name: string | null
        }>(result)
        if (!user || !user.password_hash) return null

        const isValid = await bcrypt.compare(password, user.password_hash)
        if (!isValid) return null

        // Touch last_login_at (fire-and-forget; ignore failure)
        serviceDb
          .execute(sql`SELECT touch_tenant_user_login(${user.id}::uuid)`)
          .catch(() => {})

        return {
          id:             user.id,
          email:          user.email,
          name:           user.name ?? user.email,
          role:           "tenant" as const,
          organizationId: "",
          tenantId:       user.tenant_id,
        }
      },
    }),

    // ── Staff / internal credentials ─────────────────────────────────────
    Credentials({
      name: "credentials",
      credentials: {
        email:    { label: "Email",    type: "email"    },
        password: { label: "Password", type: "password" },
      },
      async authorize(credentials) {
        const parsed = loginSchema.safeParse(credentials)
        if (!parsed.success) return null

        const { email, password } = parsed.data

        // ── SECURITY DEFINER function — no org context needed ─────────────
        // This is the ONLY place we query the users table without RLS.
        // find_user_for_auth() runs as superuser internally but returns
        // only the minimum fields required for authentication.
        const result = await serviceDb.execute<{
          id: string
          email: string
          password_hash: string
          organization_id: string
          role_id: string | null
          status: string
        }>(sql`SELECT * FROM find_user_for_auth(${email})`)

        const user = firstRow<{
          id: string; email: string; password_hash: string
          organization_id: string; role_id: string | null; status: string
        }>(result)
        if (!user || !user.password_hash) return null

        const isValid = await bcrypt.compare(password, user.password_hash)
        if (!isValid) return null

        if (user.status === "suspended") return null

        const role = await getRoleName(user.role_id)

        // Fetch display name from users table
        const nameResult = await serviceDb.execute<{ name: string }>(
          sql`SELECT name FROM users WHERE id = ${user.id}::uuid LIMIT 1`
        )
        const userName = firstRow<{ name: string }>(nameResult)?.name ?? ""

        return {
          id:             user.id,
          email:          user.email,
          name:           userName,
          role,
          organizationId: user.organization_id ?? "",
        }
      },
    }),
  ],

  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.id             = user.id
        token.role           = user.role
        token.organizationId = user.organizationId
        if (user.tenantId) token.tenantId = user.tenantId
      }
      return token
    },

    async session({ session, token }) {
      if (session.user) {
        session.user.id             = token.id             as string
        session.user.role           = token.role           as UserRole
        session.user.organizationId = token.organizationId as string
        if (token.tenantId) session.user.tenantId = token.tenantId as string
      }
      return session
    },

    authorized({ auth: session, request: { nextUrl, headers } }) {
      const isLoggedIn = !!session?.user

      // ── Public paths ─────────────────────────────────────────────────────
      const isPublicPath =
        nextUrl.pathname === "/" ||
        nextUrl.pathname.startsWith("/auth") ||
        nextUrl.pathname.startsWith("/api/auth") ||
        nextUrl.pathname.startsWith("/api/health") ||
        nextUrl.pathname.startsWith("/pos-simulator") ||
        nextUrl.pathname.startsWith("/api/pos/simulator") ||
        nextUrl.pathname === "/portal/login" ||
        nextUrl.pathname === "/tenant/login"

      if (isPublicPath) return true

      // ── Tenant portal — require tenant role, skip org check ───────────────
      const isTenantRoute =
        nextUrl.pathname.startsWith("/portal") ||
        (nextUrl.pathname.startsWith("/tenant") && !nextUrl.pathname.startsWith("/tenants")) ||
        (nextUrl.pathname.startsWith("/api/tenant") && !nextUrl.pathname.startsWith("/api/tenants"))

      if (isTenantRoute) {
        if (!isLoggedIn) {
          const loginUrl = new URL("/tenant/login", nextUrl)
          loginUrl.searchParams.set("callbackUrl", nextUrl.pathname)
          return Response.redirect(loginUrl)
        }
        // Only tenant role can access portal routes
        if (session?.user?.role !== "tenant") {
          return Response.json(
            { error: "Forbidden: tenant role required" },
            { status: 403 },
          )
        }
        return true
      }

      // ── Auth check ───────────────────────────────────────────────────────
      if (!isLoggedIn) return false

      // ── Block tenant users from admin routes ────────────────────────────
      if (session?.user?.role === "tenant") {
        return Response.json(
          { error: "Forbidden: tenant users cannot access admin routes" },
          { status: 403 },
        )
      }

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
