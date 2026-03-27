import { vi, beforeAll, afterAll } from "vitest"
import "dotenv/config"

// ── Load test environment variables ──────────────────────────────────────────
// When DATABASE_URL is not set, integration tests skip DB-dependent assertions
if (!process.env.DATABASE_URL) {
  console.warn(
    "[integration] DATABASE_URL not set — DB-dependent tests will be skipped"
  )
}

// ── next/cache mock (server env has no browser cache API) ────────────────────
vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
  revalidateTag: vi.fn(),
  unstable_cache: vi.fn((fn) => fn),
}))

// ── Suppress noisy console output in integration tests ───────────────────────
const noop = () => {}
beforeAll(() => {
  vi.spyOn(console, "warn").mockImplementation(noop)
})

afterAll(() => {
  vi.restoreAllMocks()
})
