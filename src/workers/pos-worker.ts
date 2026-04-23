/**
 * POS Ingestion Worker
 * ─────────────────────────────────────────────────────────────────────────────
 * Standalone Node.js process that consumes the "pos-ingestion" BullMQ queue
 * and calls ingestTransaction() for each job.
 *
 * Run in development:
 *   pnpm worker            — single run
 *   pnpm worker:dev        — watch mode (restarts on file changes)
 *
 * Run in production:
 *   node --require tsconfig-paths/register dist/workers/pos-worker.js
 *   (or via PM2 / Docker CMD alongside the Next.js server)
 *
 * Concurrency: 10 — 10 jobs processed in parallel per worker process.
 * Rate limit:  200 jobs/min across all worker instances combined.
 *
 * Failure flow:
 *   attempt 1 → fail → wait 1 s
 *   attempt 2 → fail → wait 2 s
 *   attempt 3 → fail → job moves to BullMQ "failed" set (dead-letter queue)
 *               → pos_integrations.last_sync_status = 'failed'
 *               → logger.error fired for alerting
 */

// Env vars are loaded before this module via --require ./src/workers/env-preload.cjs
// (see package.json worker / worker:dev scripts). Static imports are hoisted by the
// ESM loader, so dotenv calls inside this file cannot precede them.

import { Worker, type Job, type UnrecoverableError } from "bullmq"
import { sql } from "drizzle-orm"
import { getWorkerConnection, closeConnections } from "@/lib/queues/connection"
import { POS_QUEUE_NAME, type POSIngestJobData } from "@/lib/queues/pos-ingestion"
import { serviceDb } from "@/lib/db"
import { ingestTransaction, type POSIntegrationRow } from "@/lib/pos/ingest"
import { logger } from "@/lib/logger"
import { metrics } from "@/lib/monitoring/metrics"
import { withCircuitBreaker } from "@/lib/pos/circuit-breaker"

// ── Integration row re-fetch ──────────────────────────────────────────────────
// Secrets are NOT stored in the queue payload — we re-fetch from DB so:
//   a) encrypted keys never touch Redis
//   b) if integration is deactivated between enqueue and process, we skip safely

interface FetchedIntegration extends POSIntegrationRow, Record<string, unknown> {}

async function fetchIntegration(integrationId: string): Promise<FetchedIntegration | null> {
  const rows = await serviceDb.execute<FetchedIntegration>(sql`
    SELECT id, organization_id, tenant_id, property_id, lease_id
    FROM pos_integrations
    WHERE id        = ${integrationId}::uuid
      AND is_active = true
    LIMIT 1
  `)
  return rows[0] ?? null
}

// ── Job processor ─────────────────────────────────────────────────────────────

async function processJob(job: Job<POSIngestJobData>): Promise<void> {
  const { provider, integrationId, payload, receivedAt } = job.data
  const queueLatencyMs = Date.now() - new Date(receivedAt).getTime()

  logger.info("pos-worker: processing job", {
    jobId:           job.id,
    provider,
    integrationId,
    attempt:         job.attemptsMade + 1,
    queueLatencyMs,
  })

  // Re-fetch integration — never deserialise secrets from the queue
  const integration = await fetchIntegration(integrationId)

  if (!integration) {
    // Integration deleted or deactivated after webhook was received — skip permanently.
    // Throw as UnrecoverableError so BullMQ moves it straight to "failed" without retrying.
    const { UnrecoverableError } = await import("bullmq")
    throw new (UnrecoverableError as new (msg: string) => InstanceType<typeof UnrecoverableError>)(
      `Integration ${integrationId} not found or inactive — skipping`,
    )
  }

  const startMs = Date.now()

  const result = await withCircuitBreaker(provider, () => 
    ingestTransaction(provider, integration, payload)
  )

  const durationMs       = Date.now() - startMs
  const totalLatencyMs   = Date.now() - new Date(receivedAt).getTime()

  // ── Metrics ──────────────────────────────────────────────────────────────
  metrics.observe("pos_ingest_latency_ms", durationMs)
  metrics.observe("pos_e2e_latency_ms",    totalLatencyMs)
  metrics.increment("pos_jobs_processed")
  if (!result.inserted) metrics.increment("pos_duplicate")

  logger.info("pos-worker: job complete", {
    jobId:           job.id,
    provider,
    integrationId,
    externalId:      result.externalId,
    inserted:        result.inserted,
    durationMs,
    totalLatencyMs,
  })
}

// ── Worker ────────────────────────────────────────────────────────────────────

const worker = new Worker<POSIngestJobData>(
  POS_QUEUE_NAME,
  processJob,
  {
    connection:  getWorkerConnection(),
    concurrency: 10,
    limiter: {
      // Across all worker instances, max 200 jobs per minute
      max:      200,
      duration: 60_000,
    },
  },
)

// ── Event handlers ────────────────────────────────────────────────────────────

worker.on("ready", () => {
  logger.info("pos-worker: ready", {
    queue:       POS_QUEUE_NAME,
    concurrency: 10,
    rateLimit:   "200/min",
  })
})

worker.on("completed", (job) => {
  logger.info("pos-worker: job completed", {
    jobId:    job.id,
    provider: job.data.provider,
  })
})

worker.on("failed", (job: Job<POSIngestJobData> | undefined, err: Error) => {
  const isExhausted = job
    ? job.attemptsMade >= (job.opts.attempts ?? 3)
    : false

  logger.error("pos-worker: job failed", {
    jobId:         job?.id,
    provider:      job?.data.provider,
    integrationId: job?.data.integrationId,
    attempt:       job?.attemptsMade,
    exhausted:     isExhausted,
    error:         err,
  })

  metrics.increment("pos_ingest_failed")

  // After all retries are exhausted, write failure status to the integration row
  // so the UI and /api/backup-status can surface it.
  if (isExhausted && job) {
    serviceDb.execute(sql`
      UPDATE pos_integrations
      SET last_sync_status = 'failed',
          updated_at       = NOW()
      WHERE id = ${job.data.integrationId}::uuid
    `).catch((dbErr: Error) => {
      logger.error("pos-worker: failed to update integration status", { error: dbErr })
    })
  }
})

worker.on("stalled", (jobId: string) => {
  logger.warn("pos-worker: job stalled — will be retried", { jobId })
  metrics.increment("pos_jobs_stalled")
})

worker.on("error", (err: Error) => {
  logger.error("pos-worker: worker-level error", { error: err })
})

// ── Graceful shutdown ─────────────────────────────────────────────────────────
// SIGTERM — sent by Docker / Kubernetes on scale-down / deploy
// SIGINT  — sent by Ctrl-C in development

async function shutdown(signal: string): Promise<void> {
  logger.info(`pos-worker: received ${signal}, shutting down gracefully`)

  // Stops picking up new jobs; waits for in-flight jobs to complete
  await worker.close()
  await closeConnections()

  logger.info("pos-worker: shutdown complete")
  process.exit(0)
}

process.on("SIGTERM", () => { shutdown("SIGTERM").catch((err) => logger.error("pos-ingest-error", { error: err })) })
process.on("SIGINT",  () => { shutdown("SIGINT").catch((err)  => logger.error("pos-ingest-error", { error: err })) })

// Surface unhandled rejections instead of silently dying
process.on("unhandledRejection", (reason) => {
  logger.error("pos-worker: unhandled rejection", { reason })
})
