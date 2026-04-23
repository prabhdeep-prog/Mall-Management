/**
 * withRetry — exponential backoff retry wrapper
 * ─────────────────────────────────────────────────────────────────────────────
 * Retries an async function up to `attempts` times with exponential backoff.
 * Designed for wrapping outbound HTTP calls to POS provider APIs.
 *
 * Usage:
 *   const data = await withRetry(() => fetchFromPineLabsAPI(url))
 *
 *   // Custom options:
 *   const data = await withRetry(
 *     () => fetchFromRazorpay(url),
 *     {
 *       attempts:      3,
 *       initialDelay:  1_000,
 *       isRetryable:   isRetryableHttpError,
 *       onRetry: (err, attempt, delay) =>
 *         logger.warn("POS API retry", { attempt, delay, error: err }),
 *     }
 *   )
 *
 * Backoff schedule (defaults):
 *   attempt 1 fails → wait 1 000 ms
 *   attempt 2 fails → wait 2 000 ms
 *   attempt 3 fails → throw
 */

export interface RetryOptions {
  /** Total number of attempts (including the first). Default: 3 */
  attempts?: number
  /** Delay before the first retry in ms. Default: 1 000 */
  initialDelay?: number
  /** Maximum delay cap in ms. Default: 30 000 */
  maxDelay?: number
  /** Backoff multiplier applied after each failure. Default: 2 */
  factor?: number
  /**
   * Return false to skip retrying this error (e.g. 401 Unauthorized — retrying
   * won't help). Defaults to always retry.
   */
  isRetryable?: (err: Error) => boolean
  /**
   * Called before each retry sleep.
   * Useful for logging: logger.warn("retrying", { attempt, delay })
   */
  onRetry?: (err: Error, attempt: number, nextDelayMs: number) => void
}

/**
 * Retry `fn` up to `options.attempts` times with exponential backoff.
 * Throws the last error if all attempts are exhausted.
 */
export async function withRetry<T>(
  fn: () => Promise<T>,
  options?: RetryOptions,
): Promise<T> {
  const {
    attempts     = 3,
    initialDelay = 1_000,
    maxDelay     = 30_000,
    factor       = 2,
    isRetryable  = () => true,
    onRetry,
  } = options ?? {}

  let delay = initialDelay

  for (let attempt = 1; attempt <= attempts; attempt++) {
    try {
      return await fn()
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err))

      // Last attempt — rethrow regardless
      if (attempt === attempts) throw error

      // Non-retryable error — rethrow immediately without waiting
      if (!isRetryable(error)) throw error

      onRetry?.(error, attempt, delay)

      await sleep(delay)
      delay = Math.min(delay * factor, maxDelay)
    }
  }

  // TypeScript flow: unreachable, but satisfies the return type
  throw new Error("withRetry: exhausted all attempts")
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

/**
 * Default retryability predicate for outbound HTTP calls.
 *
 * Retries on:
 *   • Network / DNS failures
 *   • Timeouts (AbortError)
 *   • 5xx server errors
 *
 * Does NOT retry on:
 *   • 4xx client errors (bad request, auth failure, not found)
 *     — retrying won't fix a bad API key or malformed payload
 */
export function isRetryableHttpError(err: Error): boolean {
  // Timeout / network abort — always retryable
  if (err.name === "AbortError") return true

  // Parse HTTP status out of our error message convention:
  //   "Pine Labs API 503: ..."
  //   "Razorpay API 429: ..."
  const statusMatch = err.message.match(/API (\d{3})/)
  if (statusMatch) {
    const status = parseInt(statusMatch[1], 10)
    // 4xx — caller error; retrying won't help
    if (status >= 400 && status < 500) return false
    // 5xx / other — transient; retry
    return true
  }

  // Unknown / network error — retry
  return true
}
