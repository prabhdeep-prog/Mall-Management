/**
 * Application Metrics Collector
 * ─────────────────────────────
 * In-memory metrics with periodic flush to structured logs.
 * For production, replace the flush target with Prometheus, Datadog, or CloudWatch.
 *
 * Tracks:
 *   • request_count     — total API requests
 *   • error_count       — total 4xx/5xx responses
 *   • db_query_duration — database query latency (histogram)
 *   • queue_size        — background job queue depth
 */

import { logger } from "@/lib/logger"

interface MetricBucket {
  count: number
  sum: number
  min: number
  max: number
}

class MetricsCollector {
  private counters = new Map<string, number>()
  private histograms = new Map<string, MetricBucket>()
  private flushInterval: ReturnType<typeof setInterval> | null = null

  constructor() {
    // Flush metrics every 60 seconds
    if (typeof setInterval !== "undefined") {
      this.flushInterval = setInterval(() => this.flush(), 60_000)
      // Don't block process shutdown
      if (this.flushInterval.unref) this.flushInterval.unref()
    }
  }

  /** Increment a counter by 1 (or delta). */
  increment(name: string, delta = 1) {
    this.counters.set(name, (this.counters.get(name) ?? 0) + delta)
  }

  /** Record a value in a histogram (e.g., latency). */
  observe(name: string, value: number) {
    const bucket = this.histograms.get(name) ?? { count: 0, sum: 0, min: Infinity, max: -Infinity }
    bucket.count++
    bucket.sum += value
    bucket.min = Math.min(bucket.min, value)
    bucket.max = Math.max(bucket.max, value)
    this.histograms.set(name, bucket)
  }

  /** Set a gauge value (overwrites previous). */
  gauge(name: string, value: number) {
    this.counters.set(name, value)
  }

  /** Get current counter value. */
  getCounter(name: string): number {
    return this.counters.get(name) ?? 0
  }

  /** Get current histogram stats. */
  getHistogram(name: string): MetricBucket | null {
    return this.histograms.get(name) ?? null
  }

  /** Flush all metrics to structured log and reset. */
  flush() {
    if (this.counters.size === 0 && this.histograms.size === 0) return

    const snapshot: Record<string, unknown> = {}

    for (const [name, value] of this.counters) {
      snapshot[name] = value
    }

    for (const [name, bucket] of this.histograms) {
      snapshot[name] = {
        count: bucket.count,
        avg: bucket.count > 0 ? Math.round(bucket.sum / bucket.count) : 0,
        min: bucket.min === Infinity ? 0 : bucket.min,
        max: bucket.max === -Infinity ? 0 : bucket.max,
      }
    }

    logger.info("metrics_flush", snapshot)

    // Check alert thresholds
    this.checkAlerts()

    // Reset
    this.counters.clear()
    this.histograms.clear()
  }

  /** Check alert thresholds and log warnings. */
  private checkAlerts() {
    const requests = this.getCounter("request_count")
    const errors = this.getCounter("error_count")

    if (requests > 0) {
      const errorRate = errors / requests
      if (errorRate > 0.02) {
        logger.error("ALERT: High error rate", {
          alert: "error_rate_exceeded",
          error_rate: Math.round(errorRate * 10000) / 100,
          threshold_pct: 2,
          requests,
          errors,
        })
      }
    }

    const dbLatency = this.getHistogram("db_query_duration")
    if (dbLatency && dbLatency.max > 1000) {
      logger.warn("ALERT: High DB latency", {
        alert: "db_latency_exceeded",
        max_ms: dbLatency.max,
        avg_ms: Math.round(dbLatency.sum / dbLatency.count),
        threshold_ms: 1000,
      })
    }

    const reqLatency = this.getHistogram("request_duration")
    if (reqLatency) {
      const avg = reqLatency.sum / reqLatency.count
      if (avg > 1000) {
        logger.warn("ALERT: High average request latency", {
          alert: "latency_exceeded",
          avg_ms: Math.round(avg),
          max_ms: reqLatency.max,
          threshold_ms: 1000,
        })
      }
    }
  }

  /** Snapshot for /api/health or monitoring endpoints. */
  snapshot(): Record<string, unknown> {
    const snap: Record<string, unknown> = {}
    for (const [name, value] of this.counters) snap[name] = value
    for (const [name, bucket] of this.histograms) {
      snap[name] = {
        count: bucket.count,
        avg: bucket.count > 0 ? Math.round(bucket.sum / bucket.count) : 0,
        min: bucket.min === Infinity ? 0 : bucket.min,
        max: bucket.max === -Infinity ? 0 : bucket.max,
      }
    }
    return snap
  }
}

/** Singleton metrics collector. */
export const metrics = new MetricsCollector()
