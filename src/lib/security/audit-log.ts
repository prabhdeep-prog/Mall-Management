/**
 * Structured Security Audit Logger
 * ──────────────────────────────────
 * Emits structured JSON log lines for all security-relevant events.
 * In production, these are picked up by Datadog / CloudWatch / Loki.
 * Critical events (failures, denials) are also persisted to DB as a fallback.
 *
 * Usage:
 *   import { auditLog } from "@/lib/security/audit-log"
 *   await auditLog({ event: "permission.denied", userId, permission })
 */

export type SecurityEvent =
  | "auth.login.success"
  | "auth.login.failure"
  | "auth.logout"
  | "auth.session.expired"
  | "permission.denied"
  | "permission.granted"
  | "tenant.cross_access_attempt"
  | "rate_limit.exceeded"
  | "api_key.created"
  | "api_key.rotated"
  | "api_key.revoked"
  | "cron.unauthorized"
  | "webhook.signature_invalid"
  | "data.export"
  | "user.created"
  | "user.deleted"
  | "role.changed"

interface AuditEntry {
  event: SecurityEvent
  userId?: string
  organizationId?: string
  ip?: string
  path?: string
  userAgent?: string
  metadata?: Record<string, unknown>
}

interface AuditRecord extends AuditEntry {
  timestamp: string
  environment: string
  level: "audit"
}

// ── Severity classification ───────────────────────────────────────────────────

const HIGH_SEVERITY_EVENTS = new Set<SecurityEvent>([
  "auth.login.failure",
  "permission.denied",
  "tenant.cross_access_attempt",
  "rate_limit.exceeded",
  "cron.unauthorized",
  "webhook.signature_invalid",
])

// ── Core logger ───────────────────────────────────────────────────────────────

export async function auditLog(entry: AuditEntry): Promise<void> {
  const record: AuditRecord = {
    ...entry,
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV ?? "unknown",
    level: "audit",
  }

  // Structured JSON — log aggregators parse this automatically
  console.log(JSON.stringify(record))

  // Persist high-severity events to DB (best-effort, non-blocking)
  if (HIGH_SEVERITY_EVENTS.has(entry.event)) {
    persistAuditRecord(record).catch(() => {
      // Non-fatal — log emission already happened above
    })
  }
}

// ── IP extraction helper ──────────────────────────────────────────────────────

export function getClientIp(request: Request): string {
  const forwarded = (request.headers as Headers).get("x-forwarded-for")
  if (forwarded) return forwarded.split(",")[0].trim()
  return "unknown"
}

// ── DB persistence (deferred) ─────────────────────────────────────────────────

async function persistAuditRecord(record: AuditRecord): Promise<void> {
  try {
    // Lazy import to avoid circular deps and to keep this file edge-compatible.
    // auditLogs is typed as unknown because the table may not exist in all
    // schema versions — the catch block handles any runtime insertion error.
    const { db } = await import("@/lib/db")
    const schema = await import("@/lib/db/schema") as Record<string, unknown>
    const auditLogs = schema["auditLogs"]
    if (!auditLogs) return  // table not in schema yet — skip silently

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (db.insert as any)(auditLogs).values({
      event: record.event,
      userId: record.userId ?? null,
      organizationId: record.organizationId ?? null,
      ip: record.ip ?? null,
      path: record.path ?? null,
      metadata: record.metadata ?? null,
      createdAt: new Date(record.timestamp),
    })
  } catch {
    // Non-fatal: structured JSON log above is the primary audit trail.
    // DB persistence is a secondary fallback for SOC-2 / compliance queries.
  }
}
