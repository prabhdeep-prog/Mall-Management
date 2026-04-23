/**
 * Document Audit Logger
 * ─────────────────────────────────────────────────────────────────────────────
 * Logs document lifecycle events into revenue_audit_log for compliance.
 *
 * Events: document_upload, document_update, document_delete, document_download
 */

import { serviceDb } from "@/lib/db"
import { sql } from "drizzle-orm"

export type DocumentAuditAction =
  | "document_upload"
  | "document_update"
  | "document_delete"
  | "document_download"

interface AuditEntry {
  organizationId: string
  documentId:     string
  action:         DocumentAuditAction
  actorId:        string | null
  details?:       Record<string, unknown>
}

export async function logDocumentEvent(entry: AuditEntry): Promise<void> {
  try {
    await serviceDb.execute(sql`
      INSERT INTO revenue_audit_log (
        organization_id, entity_type, entity_id,
        action, actor_id, new_values, occurred_at
      ) VALUES (
        ${entry.organizationId}::uuid,
        'document',
        ${entry.documentId}::uuid,
        ${entry.action},
        ${entry.actorId}::uuid,
        ${JSON.stringify(entry.details ?? {})}::jsonb,
        NOW()
      )
    `)
  } catch (err) {
    console.error("[doc-audit] Failed to log event:", err)
  }
}
