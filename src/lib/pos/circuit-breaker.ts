import { redis } from "@/lib/cache/redis"
import { UnrecoverableError } from "bullmq"

/**
 * Per-provider Circuit Breaker for POS API calls.
 * ─────────────────────────────────────────────────────────────────────────────
 * Prevents overwhelming a failing provider's API.
 * 
 * Flow:
 *   1. Before call: Check state. If OPEN, throw UnrecoverableError.
 *   2. On failure: INCR failures. If >= threshold, set state OPEN (EX 60s).
 *   3. On success: Reset failures and clear state (CLOSED).
 * 
 * Keys:
 *   pos:circuit:<provider>:failures  (INCR on fail, EX 60s)
 *   pos:circuit:<provider>:state     (Set to OPEN on threshold, EX 60s)
 */

export enum CircuitState {
  CLOSED = "CLOSED",
  OPEN = "OPEN",
  HALF_OPEN = "HALF_OPEN",
}

export class CircuitBreaker {
  private readonly FAILURES_KEY: string
  private readonly STATE_KEY: string
  private readonly threshold = 5
  private readonly window = 60   // seconds
  private readonly cooldown = 60 // seconds

  constructor(private readonly provider: string) {
    this.FAILURES_KEY = `pos:circuit:${this.provider}:failures`
    this.STATE_KEY    = `pos:circuit:${this.provider}:state`
  }

  /**
   * Returns current state from Redis.
   * If state key is missing, it's CLOSED (or HALF_OPEN if it just expired).
   */
  async getState(): Promise<CircuitState> {
    const client = redis()
    if (!client) return CircuitState.CLOSED // Fail open if Redis is down

    const state = await client.get<CircuitState>(this.STATE_KEY)
    if (state === CircuitState.OPEN) return CircuitState.OPEN
    
    // If state key is gone but we still have high failures, it's implicitly HALF_OPEN
    const failures = await client.get<number>(this.FAILURES_KEY)
    if (typeof failures === 'number' && failures >= this.threshold) return CircuitState.HALF_OPEN
    
    return CircuitState.CLOSED
  }

  /**
   * Execute `fn` with circuit breaker protection.
   * Skips execution and throws UnrecoverableError if circuit is OPEN.
   */
  async run<T>(fn: () => Promise<T>): Promise<T> {
    const state = await this.getState()

    if (state === CircuitState.OPEN) {
      throw new UnrecoverableError(`Circuit for provider ${this.provider} is OPEN. Skipping API call.`)
    }

    try {
      const result = await fn()
      // Success! Reset circuit.
      await this.onSuccess()
      return result
    } catch (err) {
      // Failure — update metrics and possibly open circuit
      await this.onFailure()
      throw err
    }
  }

  private async onSuccess(): Promise<void> {
    const client = redis()
    if (!client) return

    // Clear everything — back to CLOSED
    await client.del(this.FAILURES_KEY, this.STATE_KEY)
  }

  private async onFailure(): Promise<void> {
    const client = redis()
    if (!client) return

    try {
      // 1. INCR failures
      const failures = await client.incr(this.FAILURES_KEY)
      
      // 2. Set expiry on first failure
      if (failures === 1) {
        await client.expire(this.FAILURES_KEY, this.window)
      }

      // 3. Open circuit if threshold reached
      if (failures >= this.threshold) {
        await client.set(this.STATE_KEY, CircuitState.OPEN, { ex: this.cooldown })
      }
    } catch (err) {
      console.error(`[CircuitBreaker] Failed to update failure metrics for ${this.provider}:`, err)
    }
  }
}

/**
 * Helper to wrap an async task with per-provider circuit breaker
 */
export async function withCircuitBreaker<T>(
  provider: string,
  fn: () => Promise<T>
): Promise<T> {
  const cb = new CircuitBreaker(provider)
  return cb.run(fn)
}
