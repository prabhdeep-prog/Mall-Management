/**
 * Finance-grade audit logger
 * ─────────────────────────────────────────────────────────────────────────────
 * Tracks every financial mutation:
 *   invoice.update / invoice.cancel / invoice.post
 *   payment.create
 *   lease.create / lease.update / lease.terminate
 *   pos.override
 *
 * Properties:
 *   - Append-only  — the DB trigger prevents UPDATE/DELETE on audit_logs
 *   - Non-blocking — failures are caught and logged, never surface to the caller
 *   - Tenant-scoped — every row carries organization_id
 *   - Diff-aware   — changedFields shows exactly what was modified
 */

import { NextRequest } from "next/server"
import { db } from "@/lib/db"
import { auditLogs } from "@/lib/db/schema"

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Strip keys irrelevant for diffing (timestamps that always change, etc.) */
const IGNORE_KEYS = new Set(["updatedAt", "updated_at"])

/**
 * Compute a compact field-level diff between two snapshots.
 * Returns only the fields that actually changed.
 *
 * @example
 * diffFields({ status: "pending" }, { status: "paid" })
 * // → { status: { from: "pending", to: "paid" } }
 */
export function diffFields(
  before: Record<string, unknown>,
  after:  Record<string, unknown>,
): Record<string, { from: unknown; to: unknown }> {
  const keys = new Set([...Object.keys(before), ...Object.keys(after)])
  const diff: Record<string, { from: unknown; to: unknown }> = {}

  for (const key of keys) {
    if (IGNORE_KEYS.has(key)) continue
    if (JSON.stringify(before[key]) !== JSON.stringify(after[key])) {
      diff[key] = { from: before[key] ?? null, to: after[key] ?? null }
    }
  }
  return diff
}

/**
 * Extract IP address and User-Agent from an incoming NextRequest.
 * Handles Cloudflare, AWS ELB, and standard x-forwarded-for headers.
 */
export function extractRequestMeta(request: NextRequest): {
  ipAddress: string | null
  userAgent: string | null
} {
  const ip =
    request.headers.get("cf-connecting-ip") ??
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    request.headers.get("x-real-ip") ??
    null

  const userAgent = request.headers.get("user-agent") ?? null

  return { ipAddress: ip, userAgent }
}

// ── Core write ────────────────────────────────────────────────────────────────

export interface WriteAuditParams {
  organizationId: string
  action:         string
  entity:         string
  entityId:       string
  before?:        Record<string, unknown> | null
  after?:         Record<string, unknown> | null
  changedFields?: Record<string, { from: unknown; to: unknown }> | null
  userId?:        string
  ipAddress?:     string | null
  userAgent?:     string | null
}

/**
 * Append one immutable audit log entry.
 * Non-throwing — any DB error is caught and printed to stderr.
 */
export async function writeAuditLog(params: WriteAuditParams): Promise<void> {
  // Silently skip if no org context (should not happen for admin routes)
  if (!params.organizationId) {
    console.warn("[audit] writeAuditLog called without organizationId — skipped", {
      action: params.action,
      entity: params.entity,
      entityId: params.entityId,
    })
    return
  }

  try {
    await db.insert(auditLogs).values({
      organizationId: params.organizationId,
      action:         params.action,
      entity:         params.entity,
      entityId:       params.entityId,
      before:         params.before         ?? null,
      after:          params.after          ?? null,
      changedFields:  params.changedFields  ?? null,
      userId:         params.userId         ?? null,
      ipAddress:      params.ipAddress      ?? null,
      userAgent:      params.userAgent      ?? null,
    })
  } catch (err) {
    // Audit failures must NEVER abort the financial operation
    console.error("[audit] writeAuditLog DB insert failed (non-blocking):", err)
  }
}

// ── auditedOp service wrapper ─────────────────────────────────────────────────

export interface AuditedOpParams<T> {
  /** Drizzle entity name, e.g. "invoice", "payment", "lease" */
  entity:         string
  /** The primary key of the record being mutated */
  entityId:       string
  /** Semantic action: "invoice.update", "payment.create", "pos.override" … */
  action:         string
  /** From session.user.organizationId */
  organizationId: string
  /** From session.user.id */
  userId?:        string
  /** NextRequest — used to extract IP + User-Agent */
  request?:       NextRequest
  /**
   * Optional thunk that fetches the full record BEFORE the mutation.
   * Called before `operation`. If omitted, `before` is stored as null.
   */
  getBefore?:     () => Promise<Record<string, unknown> | null>
  /** The mutation itself. The return value is stored as `after`. */
  operation:      () => Promise<T>
}

/**
 * auditedOp — wrap any financial mutation in a single call:
 *
 * ```ts
 * const updated = await auditedOp({
 *   entity: "invoice",
 *   entityId: params.id,
 *   action: "invoice.update",
 *   organizationId: session.user.organizationId,
 *   userId: session.user.id,
 *   request,
 *   getBefore: () => repo.findById(params.id),
 *   operation: () => repo.update(params.id, data),
 * })
 * ```
 *
 * Guarantees:
 * - `before` is captured before the operation executes
 * - Audit write is fire-and-forget (never throws)
 * - Returns exactly what `operation` returns
 */
export async function auditedOp<T>(params: AuditedOpParams<T>): Promise<T> {
  const { entity, entityId, action, organizationId, userId, request, getBefore, operation } = params

  // 1. Capture before-state
  const before = getBefore ? await getBefore() : null

  // 2. Execute the real mutation
  const result = await operation()

  // 3. Build after-state and diff (fire-and-forget)
  const after = result != null && typeof result === "object"
    ? (result as unknown as Record<string, unknown>)
    : null

  const changedFields = before && after ? diffFields(before, after) : null
  const meta = request ? extractRequestMeta(request) : { ipAddress: null, userAgent: null }

  void writeAuditLog({
    organizationId,
    action,
    entity,
    entityId,
    before,
    after,
    changedFields,
    userId,
    ...meta,
  })

  return result
}
