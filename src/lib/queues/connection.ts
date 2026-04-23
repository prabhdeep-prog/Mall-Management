/**
 * ioredis connection for BullMQ
 * ─────────────────────────────────────────────────────────────────────────────
 * BullMQ requires a native TCP Redis connection (ioredis) — it cannot use the
 * Upstash REST client used for caching elsewhere in this app.
 *
 * Required env var:
 *   REDIS_URL — standard Redis connection string.
 *
 * If you use Upstash, get the ioredis-compatible URL from the Upstash dashboard
 * under "Connect" → "ioredis". It looks like:
 *   rediss://default:<TOKEN>@<HOST>:<PORT>
 *
 * For local dev without Redis you can use:
 *   REDIS_URL=redis://localhost:6379
 *
 * Two separate IORedis instances are required by BullMQ — one for the Queue
 * (producer) and one for the Worker (consumer + blocking commands). Both are
 * created lazily and kept as module-level singletons.
 */

import IORedis, { type RedisOptions } from "ioredis"

// ── BullMQ-required connection options ───────────────────────────────────────
// maxRetriesPerRequest: null  — required; BullMQ manages its own retries
// enableReadyCheck: false     — required; avoids startup race with BullMQ init
const BASE_OPTIONS: RedisOptions = {
  maxRetriesPerRequest: null,
  enableReadyCheck:     false,
  lazyConnect:          true,
  retryStrategy(times: number) {
    // Reconnect with exponential backoff, capped at 30 s
    return Math.min(1_000 * 2 ** times, 30_000)
  },
}

function buildConnection(): IORedis {
  const url = process.env.REDIS_URL
  if (!url) {
    throw new Error(
      "[BullMQ] REDIS_URL is not set. " +
      "Set it to a standard Redis connection string, e.g. redis://localhost:6379 " +
      "or the Upstash ioredis URL from your dashboard.",
    )
  }
  // Parse URL separately so BASE_OPTIONS (host/port/auth) are applied cleanly
  const parsed = new URL(url)
  return new IORedis({
    ...BASE_OPTIONS,
    host:     parsed.hostname,
    port:     parseInt(parsed.port || "6379", 10),
    password: parsed.password || undefined,
    username: parsed.username || undefined,
    tls:      parsed.protocol === "rediss:" ? {} : undefined,
  })
}

// ── Singletons ────────────────────────────────────────────────────────────────
// Queue and Worker each need their own connection instance.
let _queueConn:  IORedis | null = null
let _workerConn: IORedis | null = null

/** Connection used by Queue producers (webhook handlers, etc.). */
export function getQueueConnection(): IORedis {
  if (!_queueConn) _queueConn = buildConnection()
  return _queueConn
}

/** Connection used by the Worker process. */
export function getWorkerConnection(): IORedis {
  if (!_workerConn) _workerConn = buildConnection()
  return _workerConn
}

/** Close both connections — call during graceful shutdown. */
export async function closeConnections(): Promise<void> {
  await Promise.allSettled([
    _queueConn?.quit(),
    _workerConn?.quit(),
  ])
  _queueConn  = null
  _workerConn = null
}
