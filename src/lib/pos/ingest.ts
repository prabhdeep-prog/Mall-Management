/**
 * POS Transaction Ingestion Pipeline
 * ─────────────────────────────────────────────────────────────────────────────
 * Shared logic for all POS webhook handlers.
 *
 * Steps:
 *   1. Verify HMAC signature          (caller — provider-specific)
 *   2. Parse event                     (caller — provider-specific)
 *   3. Normalize payload               → normalizeTransaction()
 *   4. Insert into pos_transactions    → UNIQUE constraint dedup
 *   5. Ignore duplicates               → ON CONFLICT DO NOTHING
 *   6. Update daily aggregate          → pos_sales_data upsert
 *   7. Publish realtime counter event  → SSE broadcast
 *   8. Trigger reconciliation          → recalculate billing on refunds
 */

import { serviceDb, posTransactions } from "@/lib/db"
import { sql } from "drizzle-orm"
import { normalizeTransaction, type TransactionContext } from "./normalizer"
import type { POSProviderKey } from "./types"
import { broadcastAgentActivity } from "@/lib/events/agent-broadcast"
import { incrementPosLiveCounter } from "@/lib/cache/redis"
import { calculateTenantRevenue } from "@/lib/revenue/billing-engine"
import { logger } from "@/lib/logger"

// ── Result type ──────────────────────────────────────────────────────────────

export interface IngestResult {
  inserted: boolean
  externalId: string
}

// ── Integration row shape expected from caller's lookup query ────────────────

export interface POSIntegrationRow extends Record<string, unknown> {
  id:              string
  organization_id: string
  tenant_id:       string
  property_id:     string
  lease_id:        string | null
}

// ── Main pipeline ────────────────────────────────────────────────────────────

export async function ingestTransaction(
  provider:    POSProviderKey,
  integration: POSIntegrationRow,
  payload:     Record<string, unknown>,
): Promise<IngestResult> {
  const ctx: TransactionContext = {
    tenantId:       integration.tenant_id,
    propertyId:     integration.property_id,
    organizationId: integration.organization_id,
  }

  // ── 3. Normalize payload ────────────────────────────────────────────────
  const tx = normalizeTransaction(provider, payload, ctx)
  const isRefund = tx.transactionType === "refund"

  // ── 4 & 5. Insert into pos_transactions (dedup via UNIQUE constraint) ──
  const result = await serviceDb.execute<{ id: string }>(sql`
    INSERT INTO pos_transactions (
      external_id, pos_integration_id,
      tenant_id, property_id, organization_id,
      gross_amount, net_amount, discount_amount, tax_amount, refund_amount,
      transaction_type, payment_method, status, currency,
      terminal_id,
      transacted_at, raw_payload
    ) VALUES (
      ${tx.externalId},
      ${integration.id}::uuid,
      ${tx.tenantId}::uuid,
      ${tx.propertyId}::uuid,
      ${tx.organizationId}::uuid,
      ${tx.grossAmount},
      ${tx.netAmount},
      ${tx.discountAmount},
      ${tx.taxAmount},
      ${tx.refundAmount},
      ${tx.transactionType},
      ${tx.paymentMethod},
      ${tx.status},
      ${tx.currency},
      ${tx.terminalId},
      ${tx.transactedAt.toISOString()}::timestamptz,
      ${JSON.stringify(tx.rawPayload)}::jsonb
    )
    ON CONFLICT (pos_integration_id, external_id) DO NOTHING
    RETURNING id
  `)

  const inserted = result.length > 0

  // Skip aggregate + broadcast for duplicates
  if (!inserted) {
    return { inserted: false, externalId: tx.externalId }
  }

  // ── 6. Update daily aggregate (pos_sales_data) ─────────────────────────
  //
  // Refunds SUBTRACT from the daily totals:
  //   gross_sales  -= refundAmount    (reduce reported gross)
  //   net_sales    += netAmount       (netAmount is already negative for refunds)
  //   refunds      += refundAmount    (track cumulative refund value)
  //
  const txDate = tx.transactedAt.toISOString().slice(0, 10)

  await serviceDb.execute(sql`
    INSERT INTO pos_sales_data (
      pos_integration_id, tenant_id, property_id,
      sales_date,
      gross_sales, net_sales, refunds, discounts,
      transaction_count,
      source
    ) VALUES (
      ${integration.id}::uuid,
      ${tx.tenantId}::uuid,
      ${tx.propertyId}::uuid,
      ${txDate}::date,
      ${isRefund ? 0 : tx.grossAmount},
      ${tx.netAmount},
      ${tx.refundAmount},
      ${isRefund ? 0 : tx.discountAmount},
      1,
      'pos_api'
    )
    ON CONFLICT (pos_integration_id, sales_date) DO UPDATE SET
      gross_sales       = pos_sales_data.gross_sales
                          + ${isRefund ? 0 : tx.grossAmount},
      net_sales         = pos_sales_data.net_sales
                          + ${tx.netAmount},
      refunds           = pos_sales_data.refunds
                          + ${tx.refundAmount},
      discounts         = pos_sales_data.discounts
                          + ${isRefund ? 0 : tx.discountAmount},
      transaction_count = pos_sales_data.transaction_count + 1
  `)

  // Update last_sync_at on the integration
  await serviceDb.execute(sql`
    UPDATE pos_integrations
    SET last_sync_at = NOW(),
        last_sync_status = 'success',
        total_transactions_synced = total_transactions_synced + 1,
        updated_at = NOW()
    WHERE id = ${integration.id}::uuid
  `)

  // ── 7a. Increment live counter (Redis INCR, 60s TTL) ────────────────
  incrementPosLiveCounter(tx.tenantId).catch(() => {})

  // ── 7b. Publish realtime counter event ─────────────────────────────────
  const amountLabel = isRefund
    ? `-₹${tx.refundAmount.toLocaleString("en-IN")}`
    : `₹${tx.grossAmount.toLocaleString("en-IN")}`

  broadcastAgentActivity({
    agentId:      "pos-ingest",
    agentName:    "POS Ingest",
    agentPersona: "system",
    actionType:   "pos_transaction",
    description:  `${tx.transactionType} ${amountLabel} via ${tx.paymentMethod ?? "unknown"} [${provider}]`,
    status:       "completed",
    confidence:   1,
    propertyId:   tx.propertyId,
  }).catch(() => {
    // Fire-and-forget — never fail ingestion due to broadcast errors
  })

  // ── 8. Recalculate billing on refunds ────────────────────────────────
  //
  // Only fires on refunds — MG vs revenue-share may flip when a refund
  // reduces net sales.  POS ↔ invoice reconciliation is handled by the
  // 5-minute cron at /api/cron/reconcile-pos (avoids per-transaction cost).
  //
  if (isRefund && integration.lease_id) {
    const { periodStart, periodEnd } = monthBounds(tx.transactedAt)
    calculateTenantRevenue({
      organizationId: integration.organization_id,
      tenantId:       integration.tenant_id,
      leaseId:        integration.lease_id,
      period:         { startDate: periodStart, endDate: periodEnd },
      calculatedBy:   "pos-ingest-refund",
    }).catch((err) => {
      logger.error("pos-ingest-error", {
        provider,
        integrationId: integration.id,
        externalId:    tx.externalId,
        error:         err,
      })
    })
  }

  return { inserted: true, externalId: tx.externalId }
}

// ── Helpers ──────────────────────────────────────────────────────────────────

/** Returns first and last day of the calendar month containing `d`. */
function monthBounds(d: Date): { periodStart: Date; periodEnd: Date } {
  const year  = d.getUTCFullYear()
  const month = d.getUTCMonth()
  return {
    periodStart: new Date(Date.UTC(year, month, 1)),
    periodEnd:   new Date(Date.UTC(year, month + 1, 0)),
  }
}

// ── Batch ingestion ──────────────────────────────────────────────────────────

const BATCH_SIZE = 100

export interface BatchIngestItem {
  provider:    POSProviderKey
  integration: POSIntegrationRow
  payload:     Record<string, unknown>
}

export interface BatchIngestResult {
  inserted:   number
  duplicates: number
}

/**
 * Batch-insert up to BATCH_SIZE=100 transactions per DB round-trip.
 * Uses Drizzle ORM insert with onConflictDoNothing() for deduplication.
 * Does NOT update pos_sales_data aggregates — use the reconcile-pos cron
 * for aggregate refresh after bulk backfills.
 */
export async function batchIngestTransactions(
  items: BatchIngestItem[],
): Promise<BatchIngestResult> {
  if (items.length === 0) return { inserted: 0, duplicates: 0 }

  // Normalize all payloads
  const rows = items.map(({ provider, integration, payload }) => {
    const ctx: TransactionContext = {
      tenantId:       integration.tenant_id,
      propertyId:     integration.property_id,
      organizationId: integration.organization_id,
    }
    const tx = normalizeTransaction(provider, payload, ctx)
    return {
      externalId:       tx.externalId,
      posIntegrationId: integration.id,
      tenantId:         tx.tenantId,
      propertyId:       tx.propertyId,
      organizationId:   tx.organizationId,
      grossAmount:      String(tx.grossAmount),
      netAmount:        String(tx.netAmount),
      discountAmount:   String(tx.discountAmount),
      taxAmount:        String(tx.taxAmount),
      refundAmount:     String(tx.refundAmount),
      transactionType:  tx.transactionType,
      paymentMethod:    tx.paymentMethod ?? null,
      status:           tx.status,
      currency:         tx.currency,
      terminalId:       tx.terminalId ?? null,
      rawPayload:       tx.rawPayload as Record<string, unknown>,
      transactedAt:     tx.transactedAt,
    }
  })

  let inserted = 0

  // Chunk into batches of BATCH_SIZE and insert
  for (let i = 0; i < rows.length; i += BATCH_SIZE) {
    const chunk = rows.slice(i, i + BATCH_SIZE)
    const result = await serviceDb
      .insert(posTransactions)
      .values(chunk)
      .onConflictDoNothing()
    inserted += result.rowCount ?? 0
  }

  return {
    inserted,
    duplicates: items.length - inserted,
  }
}
