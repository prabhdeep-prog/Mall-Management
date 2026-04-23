/**
 * POS Ingestion Queue
 * ─────────────────────────────────────────────────────────────────────────────
 * BullMQ Queue used by webhook handlers to enqueue POS transactions for
 * asynchronous processing.  The Worker in src/workers/pos-worker.ts consumes
 * this queue.
 *
 * Job data:
 *   provider      — which POS provider sent the webhook
 *   integrationId — UUID of the pos_integrations row (looked up by webhook handler)
 *   payload       — parsed webhook body (provider-specific shape)
 *   receivedAt    — ISO timestamp of when the webhook arrived (for latency tracking)
 *
 * Retry policy:
 *   3 attempts with exponential backoff starting at 1 s (1 s → 2 s → 4 s).
 *   Failed jobs are kept in the BullMQ "failed" set (acts as a dead-letter queue)
 *   and can be inspected or replayed via Bull Board or the BullMQ API.
 */

import { Queue, type JobsOptions } from "bullmq"
import { getQueueConnection } from "./connection"
import type { POSProviderKey } from "@/lib/pos/types"

// ── Job payload ───────────────────────────────────────────────────────────────

export interface POSIngestJobData {
  /** POS provider that fired the webhook */
  provider: POSProviderKey
  /** UUID of the pos_integrations row — worker re-fetches from DB for freshness */
  integrationId: string
  /** Raw parsed webhook payload (provider-specific) */
  payload: Record<string, unknown>
  /** ISO 8601 — when the webhook was received, used to compute end-to-end latency */
  receivedAt: string
}

// ── Queue name ────────────────────────────────────────────────────────────────

export const POS_QUEUE_NAME = "pos-ingestion"

// ── Default job options ───────────────────────────────────────────────────────

export const DEFAULT_JOB_OPTIONS: JobsOptions = {
  attempts: 3,
  backoff: {
    type:  "exponential",
    delay: 1_000,   // 1 s → 2 s → 4 s
  },
  // Keep last 100 completed jobs for debugging visibility
  removeOnComplete: { count: 100 },
  // Keep all failed jobs — they form the dead-letter queue
  removeOnFail:     false,
}

// ── Queue singleton ───────────────────────────────────────────────────────────

let _queue: Queue<POSIngestJobData> | null = null

export function getPosQueue(): Queue<POSIngestJobData> {
  if (!_queue) {
    _queue = new Queue<POSIngestJobData>(POS_QUEUE_NAME, {
      connection:        getQueueConnection(),
      defaultJobOptions: DEFAULT_JOB_OPTIONS,
    })

    _queue.on("error", (err) => {
      // Log but don't crash — the webhook handler has a synchronous fallback
      console.error("[pos-queue] Queue error:", err)
    })
  }
  return _queue
}

/**
 * Enqueue a POS transaction for asynchronous ingestion.
 * Returns the BullMQ Job ID, or null if enqueue fails.
 *
 * Callers (webhook handlers) should fall back to synchronous ingestTransaction()
 * if this returns null, ensuring no data loss when Redis is temporarily unavailable.
 */
export async function enqueuePosTransaction(
  provider:      POSProviderKey,
  integrationId: string,
  payload:       Record<string, unknown>,
): Promise<string | null> {
  try {
    const job = await getPosQueue().add(
      "ingest",
      {
        provider,
        integrationId,
        payload,
        receivedAt: new Date().toISOString(),
      },
    )
    return job.id ?? null
  } catch (err) {
    console.error("[pos-queue] Failed to enqueue transaction:", err)
    return null
  }
}
