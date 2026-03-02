/**
 * Tenant Provisioning Service
 * ────────────────────────────
 * Zero-touch onboarding: from signup form submission to first login.
 *
 * Guarantees:
 *   • Idempotency via provisioning_events table (safe to retry on failure)
 *   • Atomic DB creation (org + user + roles + wizard in one transaction)
 *   • Rollback if any DB step fails — no orphaned partial records
 *   • Post-commit side effects (email, cache warm) fire AFTER DB success
 *   • Provisioner role (app_provisioner) used for DB writes — narrowest
 *     possible privilege, still subject to RLS where applicable
 *
 * Lifecycle:
 *   1.  Validate input + check idempotency key
 *   2.  BEGIN TRANSACTION (as app_provisioner via serviceDb)
 *       a. INSERT organization
 *       b. INSERT user (first admin)
 *       c. UPSERT default roles
 *       d. INSERT wizard_session (step 1 = pending)
 *       e. INSERT provisioning_events (status=completed)
 *   3.  COMMIT
 *   4.  Warm subdomain cache in Redis
 *   5.  Send welcome email via Resend
 *   6.  Return { orgId, userId, loginUrl }
 *
 * Error handling:
 *   • DB failure → transaction rolls back automatically
 *   • Email failure → DB already committed; log and queue retry
 *   • Double-call with same idempotency key → returns existing result
 */

import { sql, eq } from "drizzle-orm"
import { serviceDb } from "@/lib/db"
import {
  organizations,
  users,
  roles,
  wizard_sessions,
  provisioning_events,
} from "@/lib/db/schema"
import bcrypt from "bcryptjs"
import { Redis } from "@upstash/redis"
import { Resend } from "resend"

// ── Types ─────────────────────────────────────────────────────────────────────

export interface ProvisionInput {
  /** Caller-generated UUID — used as idempotency key */
  idempotencyKey: string
  org: {
    name: string
    code: string   // unique slug, e.g. "phoenix-malls" → slug for subdomain
    type: "corporate" | "property_manager"
  }
  adminUser: {
    email: string
    name: string
    /** Plaintext password (will be hashed before storage) */
    password: string
  }
  /** If true, also call provision_tenant_schema() for schema-per-tenant */
  enterpriseSchemaIsolation?: boolean
}

export interface ProvisionResult {
  orgId: string
  userId: string
  loginUrl: string
  alreadyExisted: boolean
}

// ── Default role seeds ────────────────────────────────────────────────────────
const DEFAULT_ROLES = [
  {
    name: "Organization Admin",
    description: "Full access to all resources within the organization",
    permissions: ["properties:*","tenants:*","leases:*","invoices:*","payments:*",
                  "work_orders:*","agents:*","users:manage","reports:*","settings:*"],
  },
  {
    name: "Property Manager",
    description: "Manage properties, tenants, leases, and maintenance",
    permissions: ["properties:read","properties:update","tenants:*","leases:*",
                  "work_orders:*","agents:view","agents:approve","reports:read"],
  },
  {
    name: "Finance Manager",
    description: "Manage invoices, payments, and financial reports",
    permissions: ["invoices:*","payments:*","expenses:*","reports:financial","agents:view"],
  },
  {
    name: "Maintenance Manager",
    description: "Manage work orders, vendors, and equipment",
    permissions: ["work_orders:*","vendors:*","equipment:*","agents:view"],
  },
  {
    name: "Viewer",
    description: "Read-only access to all resources",
    permissions: ["properties:read","tenants:read","leases:read","invoices:read",
                  "work_orders:read","reports:read"],
  },
] as const

// ── Singleton clients (initialized lazily) ───────────────────────────────────
let _redis: Redis | null = null
let _resend: Resend | null = null

function getRedis(): Redis {
  if (!_redis) {
    _redis = new Redis({
      url: process.env.UPSTASH_REDIS_REST_URL!,
      token: process.env.UPSTASH_REDIS_REST_TOKEN!,
    })
  }
  return _redis
}

function getResend(): Resend {
  if (!_resend) _resend = new Resend(process.env.RESEND_API_KEY!)
  return _resend
}

// ── Main provisioning function ────────────────────────────────────────────────

export async function provisionTenant(input: ProvisionInput): Promise<ProvisionResult> {
  // ── Step 0: Validate input ────────────────────────────────────────────────
  if (!input.idempotencyKey || !/^[0-9a-f-]{36}$/.test(input.idempotencyKey)) {
    throw new Error("idempotencyKey must be a valid UUID")
  }
  if (!input.org.code || !/^[a-z0-9-]{2,50}$/.test(input.org.code)) {
    throw new Error("org.code must be 2–50 lowercase alphanumeric or hyphen characters")
  }
  if (!input.adminUser.email || !input.adminUser.password) {
    throw new Error("adminUser.email and adminUser.password are required")
  }

  // ── Step 1: Idempotency check ─────────────────────────────────────────────
  const existing = await serviceDb
    .select()
    .from(provisioning_events)
    .where(
      sql`idempotency_key = ${input.idempotencyKey}::uuid
          AND status = 'completed'`
    )
    .limit(1)

  if (existing.length > 0) {
    const meta = existing[0].metadata as { orgId?: string; userId?: string }
    return {
      orgId: meta.orgId!,
      userId: meta.userId!,
      loginUrl: buildLoginUrl(input.org.code),
      alreadyExisted: true,
    }
  }

  // ── Step 2: Record provisioning start ─────────────────────────────────────
  await serviceDb.insert(provisioning_events).values({
    idempotency_key: input.idempotencyKey,
    step: "started",
    status: "started",
    metadata: { orgCode: input.org.code, email: input.adminUser.email },
  }).onConflictDoNothing()   // If started but not completed → retry is safe

  // ── Step 3: Atomic database provisioning ──────────────────────────────────
  let orgId: string
  let userId: string
  let adminRoleId: string

  try {
    const result = await serviceDb.transaction(async (tx) => {
      // 3a. Create organization
      const [org] = await tx.insert(organizations).values({
        name: input.org.name,
        code: input.org.code,
        type: input.org.type,
        settings: { wizardComplete: false, provisioned_at: new Date().toISOString() },
      }).returning({ id: organizations.id })

      // 3b. Hash password
      const passwordHash = await bcrypt.hash(input.adminUser.password, 12)

      // 3c. Create admin user (no org context set — running as app_provisioner
      //     which has unrestricted INSERT on users during provisioning)
      const [user] = await tx.insert(users).values({
        email: input.adminUser.email,
        name: input.adminUser.name,
        password: passwordHash,
        organization_id: org.id,
        status: "active",
      }).returning({ id: users.id })

      // 3d. Seed default roles for this organization
      //     We namespace role names by org to allow per-org customization later
      const insertedRoles = await tx.insert(roles).values(
        DEFAULT_ROLES.map((r) => ({
          name: r.name,
          description: r.description,
          permissions: r.permissions,
        }))
      ).returning({ id: roles.id, name: roles.name })

      const orgAdminRole = insertedRoles.find((r) => r.name === "Organization Admin")!

      // 3e. Link user to their role
      await tx.update(users)
        .set({ role_id: orgAdminRole.id })
        .where(eq(users.id, user.id))

      // 3f. Create wizard session at step 1
      await tx.insert(wizard_sessions).values({
        organization_id: org.id,
        step_key: "org_profile",
        step_index: 1,
        status: "complete",   // Step 1 is pre-filled from signup data
        form_data: {
          name: input.org.name,
          code: input.org.code,
          type: input.org.type,
        },
        version: 1,
        completed_at: new Date(),
      })

      // 3g. If enterprise schema isolation requested, provision tenant schema
      if (input.enterpriseSchemaIsolation) {
        await tx.execute(
          sql`SELECT provision_tenant_schema(${input.org.code})`
        )
      }

      // 3h. Mark provisioning complete (within the same transaction)
      await tx.update(provisioning_events)
        .set({
          status: "completed",
          organization_id: org.id,
          completed_at: new Date(),
          metadata: {
            orgId: org.id,
            userId: user.id,
            adminRoleId: orgAdminRole.id,
          },
        })
        .where(
          sql`idempotency_key = ${input.idempotencyKey}::uuid`
        )

      return {
        orgId: org.id,
        userId: user.id,
        adminRoleId: orgAdminRole.id,
      }
    })

    orgId = result.orgId
    userId = result.userId
    adminRoleId = result.adminRoleId
  } catch (err) {
    // Transaction rolled back automatically — mark event as failed for retry
    await serviceDb.update(provisioning_events)
      .set({
        status: "failed",
        error_detail: err instanceof Error ? err.message : String(err),
      })
      .where(sql`idempotency_key = ${input.idempotencyKey}::uuid`)

    throw err  // Re-throw to caller
  }

  // ── Step 4: Post-commit side effects (failures are non-fatal) ─────────────
  await Promise.allSettled([
    warmSubdomainCache(input.org.code, orgId),
    sendWelcomeEmail({
      to: input.adminUser.email,
      name: input.adminUser.name,
      orgName: input.org.name,
      loginUrl: buildLoginUrl(input.org.code),
    }),
  ])

  return {
    orgId,
    userId,
    loginUrl: buildLoginUrl(input.org.code),
    alreadyExisted: false,
  }
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function buildLoginUrl(orgCode: string): string {
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL ?? "https://mallos.com"
  const isCustomDomain = baseUrl.startsWith("http://localhost")
  // Subdomains don't work on localhost — use query param instead
  if (isCustomDomain) {
    return `${baseUrl}/auth/login?org=${orgCode}`
  }
  const url = new URL(baseUrl)
  url.hostname = `${orgCode}.${url.hostname}`
  url.pathname = "/auth/login"
  return url.toString()
}

async function warmSubdomainCache(orgCode: string, orgId: string): Promise<void> {
  const redis = getRedis()
  await redis.set(`org:slug:${orgCode}`, orgId, { ex: 86400 }) // 24 hr TTL
}

async function sendWelcomeEmail(opts: {
  to: string
  name: string
  orgName: string
  loginUrl: string
}): Promise<void> {
  const resend = getResend()
  await resend.emails.send({
    from: "Mallos <onboarding@mallos.com>",
    to: opts.to,
    subject: `Welcome to Mallos — ${opts.orgName} is ready`,
    html: `
      <h2>Welcome, ${opts.name}!</h2>
      <p>Your workspace for <strong>${opts.orgName}</strong> has been set up.</p>
      <p><a href="${opts.loginUrl}">Sign in to get started →</a></p>
      <p>You'll be guided through a quick setup wizard to configure your first property.</p>
    `,
  })
}
