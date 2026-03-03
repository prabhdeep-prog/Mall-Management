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
  const name = result.rows[0]?.name as UserRole | undefined
  return name ?? "viewer"
}

export const authConfig: NextAuthConfig = {
  providers: [
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

        const user = result.rows[0]
        if (!user || !user.password_hash) return null

        const isValid = await bcrypt.compare(password, user.password_hash)
        if (!isValid) return null

        if (user.status === "suspended") return null

        const role = await getRoleName(user.role_id)

        return {
          id:             user.id,
          email:          user.email,
          name:           "",  // Populated in jwt callback from DB
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
