import { describe, it, expect, vi, beforeEach } from "vitest"
import { CircuitBreaker, CircuitState } from "@/lib/pos/circuit-breaker"
import { redis } from "@/lib/cache/redis"
import { UnrecoverableError } from "bullmq"

vi.mock("@/lib/cache/redis", () => ({
  redis: vi.fn(),
}))

vi.mock("bullmq", () => ({
  UnrecoverableError: class extends Error {
    constructor(message: string) {
      super(message)
      this.name = "UnrecoverableError"
    }
  },
}))

describe("CircuitBreaker", () => {
  const provider = "test_provider"
  let cb: CircuitBreaker
  let mockRedis: any

  beforeEach(() => {
    vi.clearAllMocks()
    cb = new CircuitBreaker(provider)
    mockRedis = {
      get: vi.fn(),
      set: vi.fn(),
      incr: vi.fn(),
      expire: vi.fn(),
      del: vi.fn(),
    }
    ;(redis as any).mockReturnValue(mockRedis)
  })

  it("should be CLOSED initially", async () => {
    mockRedis.get.mockResolvedValue(null)
    const state = await cb.getState()
    expect(state).toBe(CircuitState.CLOSED)
  })

  it("should transition to OPEN after 5 failures", async () => {
    mockRedis.get.mockResolvedValue(null) // State is NOT OPEN
    mockRedis.incr.mockResolvedValue(5)    // 5th failure

    const task = vi.fn().mockRejectedValue(new Error("API Down"))

    await expect(cb.run(task)).rejects.toThrow("API Down")

    expect(mockRedis.incr).toHaveBeenCalledWith(`pos:circuit:${provider}:failures`)
    expect(mockRedis.set).toHaveBeenCalledWith(
      `pos:circuit:${provider}:state`,
      CircuitState.OPEN,
      { ex: 60 }
    )
  })

  it("should throw UnrecoverableError when OPEN", async () => {
    mockRedis.get.mockResolvedValue(CircuitState.OPEN)

    const task = vi.fn()
    await expect(cb.run(task)).rejects.toThrow(UnrecoverableError)
    await expect(cb.run(task)).rejects.toThrow(/is OPEN/)
    expect(task).not.toHaveBeenCalled()
  })

  it("should reset to CLOSED on success", async () => {
    mockRedis.get.mockResolvedValue(null)
    const task = vi.fn().mockResolvedValue("success")

    const result = await cb.run(task)

    expect(result).toBe("success")
    expect(mockRedis.del).toHaveBeenCalledWith(
      `pos:circuit:${provider}:failures`,
      `pos:circuit:${provider}:state`
    )
  })

  it("should be HALF_OPEN if failures >= 5 but state key expired", async () => {
    mockRedis.get.mockImplementation((key: string) => {
      if (key.includes(":state")) return Promise.resolve(null)
      if (key.includes(":failures")) return Promise.resolve(5)
      return Promise.resolve(null)
    })

    const state = await cb.getState()
    expect(state).toBe(CircuitState.HALF_OPEN)
  })
})
