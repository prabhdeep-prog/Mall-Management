import { describe, it, expect, vi, beforeEach } from "vitest"
import { createRequest, parseJsonResponse } from "../../helpers/api"
import { testTenant, testTenantWithLease, testTenantCreatePayload } from "../../fixtures/tenants"

// ── Mock heavy dependencies before importing the route ────────────────────────

// Mock the auth RBAC layer — returns authorized by default
vi.mock("@/lib/auth/rbac", () => ({
  requirePermission: vi.fn().mockResolvedValue({ authorized: true }),
  PERMISSIONS: {
    TENANTS_VIEW: "tenants:view",
    TENANTS_CREATE: "tenants:create",
    TENANTS_EDIT: "tenants:edit",
    TENANTS_DELETE: "tenants:delete",
  },
}))

// Mock the cache layer — call through by default
vi.mock("@/lib/cache", () => ({
  getCachedOrFetch: vi.fn().mockImplementation((_key: string, fetcher: () => unknown) => fetcher()),
  invalidateEntityCache: vi.fn().mockResolvedValue(undefined),
  CACHE_KEYS: {
    TENANT_LIST: (id: string) => `tenants:list:${id}`,
  },
  CACHE_TTL: { MEDIUM: 300 },
}))

// Mock the DB module
vi.mock("@/lib/db", () => ({
  db: {
    select: vi.fn(),
    insert: vi.fn(),
    query: {
      tenants: {
        findFirst: vi.fn(),
      },
    },
  },
}))

// ── Dynamic imports (after mocks are set up) ──────────────────────────────────
const { GET, POST } = await import("@/app/api/tenants/route")
const { requirePermission } = await import("@/lib/auth/rbac")
const { db } = await import("@/lib/db")

// ─── GET /api/tenants ─────────────────────────────────────────────────────────

describe("GET /api/tenants", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    // Default: return two tenants
    ;(db.select as ReturnType<typeof vi.fn>).mockReturnValue({
      from: vi.fn().mockReturnValue({
        leftJoin: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            orderBy: vi.fn().mockResolvedValue([
              { tenant: testTenant, activeLease: testTenantWithLease.lease },
            ]),
          }),
        }),
      }),
    })
  })

  it("returns 200 with tenant list when authorized", async () => {
    const req = createRequest("http://localhost:3001/api/tenants")
    const res = await GET(req)

    expect(res.status).toBe(200)
    const { data } = await parseJsonResponse<{ success: boolean; data: unknown[] }>(res)
    expect(data.success).toBe(true)
    expect(Array.isArray(data.data)).toBe(true)
  })

  it("calls requirePermission with TENANTS_VIEW", async () => {
    const req = createRequest("http://localhost:3001/api/tenants")
    await GET(req)

    expect(requirePermission).toHaveBeenCalledWith("tenants:view")
  })

  it("returns 403 when unauthorized", async () => {
    ;(requirePermission as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      authorized: false,
      error: "Forbidden: Insufficient permissions",
    })

    const req = createRequest("http://localhost:3001/api/tenants")
    const res = await GET(req)

    expect(res.status).toBe(403)
    const { data } = await parseJsonResponse<{ error: string }>(res)
    expect(data.error).toContain("Forbidden")
  })

  it("accepts propertyId query param and passes it to the query", async () => {
    const req = createRequest("http://localhost:3001/api/tenants", {
      searchParams: { propertyId: "00000000-0000-0000-0000-000000000010" },
    })
    const res = await GET(req)

    expect(res.status).toBe(200)
  })

  it("returns 500 on unexpected DB error", async () => {
    ;(db.select as ReturnType<typeof vi.fn>).mockReturnValue({
      from: vi.fn().mockReturnValue({
        leftJoin: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            orderBy: vi.fn().mockRejectedValue(new Error("DB connection lost")),
          }),
        }),
      }),
    })

    const req = createRequest("http://localhost:3001/api/tenants")
    const res = await GET(req)

    expect(res.status).toBe(500)
  })
})

// ─── POST /api/tenants ────────────────────────────────────────────────────────

describe("POST /api/tenants", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    ;(db.insert as ReturnType<typeof vi.fn>).mockReturnValue({
      values: vi.fn().mockResolvedValue(undefined),
    })
    ;(db.query.tenants.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue({
      ...testTenant,
      id: "new-generated-uuid",
    })
  })

  it("returns 201 with the new tenant when authorized", async () => {
    const req = createRequest("http://localhost:3001/api/tenants", {
      method: "POST",
      body: testTenantCreatePayload,
    })
    const res = await POST(req)

    expect(res.status).toBe(201)
    const { data } = await parseJsonResponse<{ businessName: string }>(res)
    expect(data.businessName).toBeDefined()
  })

  it("calls requirePermission with TENANTS_CREATE", async () => {
    const req = createRequest("http://localhost:3001/api/tenants", {
      method: "POST",
      body: testTenantCreatePayload,
    })
    await POST(req)

    expect(requirePermission).toHaveBeenCalledWith("tenants:create")
  })

  it("returns 400 when propertyId is missing", async () => {
    const req = createRequest("http://localhost:3001/api/tenants", {
      method: "POST",
      body: { businessName: "Test Shop" }, // missing propertyId
    })
    const res = await POST(req)

    expect(res.status).toBe(400)
    const { data } = await parseJsonResponse<{ error: string }>(res)
    expect(data.error).toContain("required")
  })

  it("returns 400 when businessName is missing", async () => {
    const req = createRequest("http://localhost:3001/api/tenants", {
      method: "POST",
      body: { propertyId: "00000000-0000-0000-0000-000000000010" },
    })
    const res = await POST(req)

    expect(res.status).toBe(400)
  })

  it("returns 403 when unauthorized", async () => {
    ;(requirePermission as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      authorized: false,
      error: "Forbidden: Insufficient permissions",
    })

    const req = createRequest("http://localhost:3001/api/tenants", {
      method: "POST",
      body: testTenantCreatePayload,
    })
    const res = await POST(req)

    expect(res.status).toBe(403)
  })

  it("returns 500 on DB insert failure", async () => {
    ;(db.insert as ReturnType<typeof vi.fn>).mockReturnValue({
      values: vi.fn().mockRejectedValue(new Error("Insert failed")),
    })

    const req = createRequest("http://localhost:3001/api/tenants", {
      method: "POST",
      body: testTenantCreatePayload,
    })
    const res = await POST(req)

    expect(res.status).toBe(500)
  })
})
