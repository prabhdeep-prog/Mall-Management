import "@testing-library/jest-dom"
import { vi, beforeEach, afterEach } from "vitest"

// ── next-auth (server) mock — prevents next/server import errors in jsdom ────
vi.mock("next-auth", () => ({
  default: vi.fn(() => ({
    handlers: { GET: vi.fn(), POST: vi.fn() },
    auth: vi.fn().mockResolvedValue(null),
    signIn: vi.fn(),
    signOut: vi.fn(),
  })),
}))

// ── next/navigation mock ──────────────────────────────────────────────────────
vi.mock("next/navigation", () => ({
  useRouter: () => ({
    push: vi.fn(),
    replace: vi.fn(),
    back: vi.fn(),
    forward: vi.fn(),
    refresh: vi.fn(),
    prefetch: vi.fn(),
  }),
  usePathname: () => "/dashboard",
  useSearchParams: () => new URLSearchParams(),
  useParams: () => ({}),
  redirect: vi.fn(),
  notFound: vi.fn(),
}))

// ── next-auth/react mock ──────────────────────────────────────────────────────
vi.mock("next-auth/react", () => ({
  useSession: () => ({
    data: {
      user: {
        id: "test-user-id",
        email: "admin@test.com",
        name: "Test Admin",
        role: "organization_admin",
        organizationId: "test-org-id",
      },
      expires: new Date(Date.now() + 86400000).toISOString(),
    },
    status: "authenticated",
    update: vi.fn(),
  }),
  SessionProvider: ({ children }: { children: React.ReactNode }) => children,
  signIn: vi.fn(),
  signOut: vi.fn(),
}))

// ── next-themes mock ──────────────────────────────────────────────────────────
vi.mock("next-themes", () => ({
  useTheme: () => ({ theme: "light", resolvedTheme: "light", setTheme: vi.fn() }),
  ThemeProvider: ({ children }: { children: React.ReactNode }) => children,
}))

// ── next/cache mock ───────────────────────────────────────────────────────────
vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
  revalidateTag: vi.fn(),
  unstable_cache: vi.fn((fn) => fn),
}))

// ── Suppress console.error for known React warnings in tests ──────────────────
const originalConsoleError = console.error
beforeEach(() => {
  console.error = (...args: unknown[]) => {
    const msg = args[0]?.toString() ?? ""
    if (
      msg.includes("Warning: ReactDOM.render") ||
      msg.includes("Warning: An update to") ||
      msg.includes("Not implemented: navigation")
    )
      return
    originalConsoleError(...args)
  }
})

afterEach(() => {
  console.error = originalConsoleError
  vi.clearAllMocks()
})
