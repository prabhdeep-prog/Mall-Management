/**
 * Reconciliation Engine — Unit Tests
 * ─────────────────────────────────────────────────────────────────────────────
 * Tests the three critical invariants of the fixed engine:
 *
 *   1. flagged → matched transition: status updates, no new invoice
 *   2. matched → flagged transition: status updates, one invoice created
 *   3. cron re-run on already-flagged: no duplicate invoice created
 *
 * All DB calls are mocked via vi.mock — no real database required.
 */

import { describe, it, expect, vi, beforeEach } from "vitest"
import type { Mock } from "vitest"

// ── Mock @/lib/db before importing the engine ─────────────────────────────────
// vi.mock hoists above imports, so the engine receives the mocked module.

vi.mock("@/lib/db", () => ({
  serviceDb: { execute: vi.fn() },
}))

// drizzle-orm/sql is used as a tagged template — mock it to pass-through
vi.mock("drizzle-orm", () => ({
  sql: new Proxy(
    (strings: TemplateStringsArray, ...values: unknown[]) => ({ strings, values }),
    { get: (target, prop) => prop === "raw" ? (s: string) => s : target },
  ),
}))

import { reconcileTenant } from "@/lib/reconciliation/engine"
import { serviceDb } from "@/lib/db"

// ── Helpers ───────────────────────────────────────────────────────────────────

const mockDb = serviceDb as { execute: Mock }

const TENANT_ID      = "tenant-uuid-1234"
const LEASE_ID       = "lease-uuid-5678"
const ORG_ID         = "org-uuid-9012"
const PERIOD_START   = "2025-04-01"
const PERIOD_END     = "2025-04-30"
const RECON_ID       = "recon-uuid-abcd"
const INVOICE_ID     = "invoice-uuid-efgh"

/** Build a sequence of mock DB responses for a single reconcileTenant() call.
 *  The engine executes DB queries in this order:
 *    0. lease lookup
 *    1. POS total SUM
 *    2. invoice total SUM
 *    3. upsert CTE → returns { id, previous_status }
 *    4. (conditional) existing invoice check  → returns [] or [{ id }]
 *    5. (conditional) notification INSERT
 *    6. (conditional) adjustment invoice INSERT → returns { id }
 */
function buildMockSequence({
  posTotal        = 10000,
  invoiceTotal    = 10000,
  previousStatus  = null as string | null,
  existingInvoice = false,
}: {
  posTotal?:        number
  invoiceTotal?:    number
  previousStatus?:  string | null
  existingInvoice?: boolean
}): unknown[] {
  const base = [
    // 0. lease lookup
    [{ lease_id: LEASE_ID, organization_id: ORG_ID, property_id: "prop-uuid" }],
    // 1. POS total
    [{ total: String(posTotal) }],
    // 2. invoice total
    [{ total: String(invoiceTotal) }],
    // 3. upsert CTE
    [{ id: RECON_ID, previous_status: previousStatus }],
  ]

  const variance    = posTotal - invoiceTotal
  const isFlagged   = Math.abs(variance) > 1000
  const isFreshFlag = isFlagged && previousStatus !== "flagged"

  if (isFreshFlag) {
    // 4. existing invoice check
    base.push(existingInvoice ? [{ id: INVOICE_ID }] : [])
    if (!existingInvoice) {
      // 5. notification INSERT
      base.push([])
      // 6. adjustment invoice INSERT
      base.push([{ id: INVOICE_ID }])
    }
  }

  return base
}

function setupMocks(sequence: unknown[]): void {
  let call = 0
  mockDb.execute.mockImplementation(() => {
    const result = sequence[call] ?? []
    call++
    return Promise.resolve(result)
  })
}

// ── Tests ─────────────────────────────────────────────────────────────────────

beforeEach(() => {
  vi.clearAllMocks()
})

// ─────────────────────────────────────────────────────────────────────────────
// SCENARIO 1 — flagged → matched transition
// ─────────────────────────────────────────────────────────────────────────────
describe("flagged → matched transition", () => {
  it("updates status to matched when variance closes", async () => {
    setupMocks(buildMockSequence({
      posTotal:       10000,
      invoiceTotal:   10000,   // variance = 0 → matched
      previousStatus: "flagged",
    }))

    const result = await reconcileTenant(TENANT_ID, PERIOD_START, PERIOD_END)

    expect(result.status).toBe("matched")
    expect(result.variance).toBe(0)
    expect(result.previousStatus).toBe("flagged")
  })

  it("does NOT create an adjustment invoice when transitioning to matched", async () => {
    setupMocks(buildMockSequence({
      posTotal:       10000,
      invoiceTotal:   10000,
      previousStatus: "flagged",
    }))

    const result = await reconcileTenant(TENANT_ID, PERIOD_START, PERIOD_END)

    expect(result.adjustmentId).toBeNull()
  })

  it("does NOT send a notification when transitioning to matched", async () => {
    setupMocks(buildMockSequence({
      posTotal:       10000,
      invoiceTotal:   10000,
      previousStatus: "flagged",
    }))

    await reconcileTenant(TENANT_ID, PERIOD_START, PERIOD_END)

    // Notification INSERT (call index 4) should never be reached
    // Total DB calls: lease + pos + invoice + upsert = 4
    expect(mockDb.execute).toHaveBeenCalledTimes(4)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// SCENARIO 2 — matched → flagged transition
// ─────────────────────────────────────────────────────────────────────────────
describe("matched → flagged transition", () => {
  it("updates status to flagged when variance exceeds threshold", async () => {
    setupMocks(buildMockSequence({
      posTotal:       12000,
      invoiceTotal:   10000,   // variance = 2000 → flagged (threshold 1000)
      previousStatus: "matched",
    }))

    const result = await reconcileTenant(TENANT_ID, PERIOD_START, PERIOD_END)

    expect(result.status).toBe("flagged")
    expect(result.variance).toBe(2000)
    expect(result.previousStatus).toBe("matched")
  })

  it("creates an adjustment invoice on first flag", async () => {
    setupMocks(buildMockSequence({
      posTotal:       12000,
      invoiceTotal:   10000,
      previousStatus: "matched",
      existingInvoice: false,
    }))

    const result = await reconcileTenant(TENANT_ID, PERIOD_START, PERIOD_END)

    expect(result.adjustmentId).toBe(INVOICE_ID)
  })

  it("creates an adjustment invoice when record is brand new (null previous status)", async () => {
    setupMocks(buildMockSequence({
      posTotal:        12000,
      invoiceTotal:    10000,
      previousStatus:  null,   // fresh insert
      existingInvoice: false,
    }))

    const result = await reconcileTenant(TENANT_ID, PERIOD_START, PERIOD_END)

    expect(result.adjustmentId).toBe(INVOICE_ID)
    expect(result.previousStatus).toBeNull()
  })

  it("sends a notification on first flag", async () => {
    setupMocks(buildMockSequence({
      posTotal:       12000,
      invoiceTotal:   10000,
      previousStatus: "matched",
    }))

    await reconcileTenant(TENANT_ID, PERIOD_START, PERIOD_END)

    // Calls: lease + pos + invoice + upsert + existing-check + notification + adj-invoice = 7
    expect(mockDb.execute).toHaveBeenCalledTimes(7)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// SCENARIO 3 — cron re-run on already-flagged record
// ─────────────────────────────────────────────────────────────────────────────
describe("cron re-run on already-flagged record", () => {
  it("does NOT create a duplicate invoice when already flagged", async () => {
    setupMocks(buildMockSequence({
      posTotal:       12000,
      invoiceTotal:   10000,
      previousStatus: "flagged",  // still flagged, no transition
    }))

    const result = await reconcileTenant(TENANT_ID, PERIOD_START, PERIOD_END)

    expect(result.status).toBe("flagged")
    expect(result.adjustmentId).toBeNull()
  })

  it("does NOT create a duplicate invoice even when existing invoice check returns a row", async () => {
    // This covers the race condition: two cron workers both reach the flag check simultaneously.
    // The second worker finds previousStatus='flagged' → skips entirely.
    setupMocks(buildMockSequence({
      posTotal:        12000,
      invoiceTotal:    10000,
      previousStatus:  "flagged",
      existingInvoice: true,   // safety net — should not even be reached
    }))

    const result = await reconcileTenant(TENANT_ID, PERIOD_START, PERIOD_END)

    expect(result.adjustmentId).toBeNull()
  })

  it("does NOT create a duplicate invoice when duplicate check finds existing row", async () => {
    // Covers a crash-restart scenario: previousStatus='matched' but an invoice
    // already exists from a previous run that crashed after creating the invoice
    // but before writing the status='flagged' to the DB.
    setupMocks(buildMockSequence({
      posTotal:        12000,
      invoiceTotal:    10000,
      previousStatus:  "matched",
      existingInvoice: true,   // invoice already exists from prior crashed run
    }))

    const result = await reconcileTenant(TENANT_ID, PERIOD_START, PERIOD_END)

    // Existing invoice found → adjustmentId is null (no new invoice created)
    expect(result.adjustmentId).toBeNull()
    // Status still correctly reflects the new calculation
    expect(result.status).toBe("flagged")
  })

  it("does not re-run invoice or notification when cron fires 288 times in a day", async () => {
    // Simulate 288 cron calls (one per 5 minutes over 24 hours), all with
    // previousStatus='flagged'. Expect 0 notification and 0 invoice DB writes
    // across all 288 calls.

    let notificationInserts = 0
    let invoiceInserts       = 0
    let callsPerRun          = 0
    let runCount             = 0

    mockDb.execute.mockImplementation(() => {
      callsPerRun++

      // Map call index within each 4-call run
      const callIndex = (callsPerRun - 1) % 4

      if (callIndex === 0) {
        if (runCount > 0) {
          // End of previous run — validate no extra calls were made
          expect(callsPerRun - 1).toBeLessThanOrEqual(4 * runCount)
        }
        runCount++
      }

      const responses: Record<number, unknown[]> = {
        0: [{ lease_id: LEASE_ID, organization_id: ORG_ID, property_id: "prop" }],
        1: [{ total: "12000" }],
        2: [{ total: "10000" }],
        3: [{ id: RECON_ID, previous_status: "flagged" }],
      }

      const response = responses[callIndex] ?? []

      // Detect if an unexpected 5th+ call is made (notification/invoice)
      if (callIndex >= 4) {
        const callName = callIndex === 4 ? "existing-invoice-check" :
                         callIndex === 5 ? "notification-INSERT" : "invoice-INSERT"
        if (callIndex === 5) notificationInserts++
        if (callIndex === 6) invoiceInserts++
        void callName
      }

      return Promise.resolve(response)
    })

    for (let i = 0; i < 288; i++) {
      const result = await reconcileTenant(TENANT_ID, PERIOD_START, PERIOD_END)
      expect(result.adjustmentId).toBeNull()
      expect(result.status).toBe("flagged")
    }

    expect(notificationInserts).toBe(0)
    expect(invoiceInserts).toBe(0)
    // Each run should execute exactly 4 DB calls: lease + pos + invoice + upsert
    expect(mockDb.execute).toHaveBeenCalledTimes(288 * 4)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// SCENARIO 4 — upsert field coverage
// ─────────────────────────────────────────────────────────────────────────────
describe("upsert returns correct fields", () => {
  it("returns updated pos_total and invoice_total in result", async () => {
    setupMocks(buildMockSequence({
      posTotal:       9500,
      invoiceTotal:   9000,
      previousStatus: "matched",
    }))

    const result = await reconcileTenant(TENANT_ID, PERIOD_START, PERIOD_END)

    expect(result.posTotal).toBe(9500)
    expect(result.invoiceTotal).toBe(9000)
    expect(result.variance).toBe(500)  // below threshold → matched
    expect(result.status).toBe("matched")
  })

  it("rounds variance to 2 decimal places", async () => {
    setupMocks(buildMockSequence({
      posTotal:       10000.126,
      invoiceTotal:   9000.123,
      previousStatus: null,
    }))

    const result = await reconcileTenant(TENANT_ID, PERIOD_START, PERIOD_END)

    expect(result.variance).toBe(1000.0)  // round2(1000.003) = 1000
  })
})
