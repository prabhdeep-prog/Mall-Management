import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import {
  cn,
  formatCurrency,
  formatDate,
  formatRelativeTime,
  truncate,
  capitalizeFirst,
  calculatePercentage,
  getStatusBadgeClass,
  getPriorityBadgeClass,
} from "@/lib/utils"

// ─── cn (class merger) ────────────────────────────────────────────────────────

describe("cn", () => {
  it("merges class strings", () => {
    expect(cn("foo", "bar")).toBe("foo bar")
  })

  it("handles conditional classes", () => {
    expect(cn("base", false && "not-applied", "applied")).toBe("base applied")
  })

  it("merges conflicting Tailwind classes (last wins)", () => {
    // tailwind-merge: bg-red-500 overrides bg-blue-500
    expect(cn("bg-blue-500", "bg-red-500")).toBe("bg-red-500")
  })

  it("returns empty string for no args", () => {
    expect(cn()).toBe("")
  })
})

// ─── formatCurrency ────────────────────────────────────────────────────────────

describe("formatCurrency", () => {
  it("formats INR amounts", () => {
    const result = formatCurrency(150000)
    expect(result).toContain("1,50,000") // Indian numeral format
    expect(result).toMatch(/₹/)
  })

  it("handles string amounts", () => {
    const result = formatCurrency("75000")
    expect(result).toMatch(/75,000/)
  })

  it("formats zero", () => {
    const result = formatCurrency(0)
    expect(result).toMatch(/0/)
  })
})

// ─── formatDate ───────────────────────────────────────────────────────────────

describe("formatDate", () => {
  it("formats a Date object", () => {
    const result = formatDate(new Date("2024-03-15"))
    // en-IN locale: "15 Mar 2024"
    expect(result).toContain("2024")
    expect(result).toMatch(/Mar/i)
    expect(result).toContain("15")
  })

  it("formats a date string", () => {
    const result = formatDate("2024-01-01")
    expect(result).toContain("2024")
    expect(result).toMatch(/Jan/i)
  })
})

// ─── formatRelativeTime ───────────────────────────────────────────────────────

describe("formatRelativeTime", () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date("2024-06-01T12:00:00Z"))
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('returns "just now" for recent timestamps', () => {
    const now = new Date("2024-06-01T12:00:00Z")
    expect(formatRelativeTime(now)).toBe("just now")
  })

  it("returns minutes ago for sub-hour timestamps", () => {
    const thirtyMinsAgo = new Date("2024-06-01T11:30:00Z")
    expect(formatRelativeTime(thirtyMinsAgo)).toBe("30 min ago")
  })

  it("returns hours ago for same-day timestamps", () => {
    const twoHoursAgo = new Date("2024-06-01T10:00:00Z")
    expect(formatRelativeTime(twoHoursAgo)).toBe("2 hours ago")
  })

  it("returns days ago for this-week timestamps", () => {
    const threeDaysAgo = new Date("2024-05-29T12:00:00Z")
    expect(formatRelativeTime(threeDaysAgo)).toBe("3 days ago")
  })

  it("returns formatted date for old timestamps", () => {
    const twoWeeksAgo = new Date("2024-05-15T12:00:00Z")
    const result = formatRelativeTime(twoWeeksAgo)
    expect(result).toContain("2024")
    expect(result).toMatch(/May/i)
  })
})

// ─── truncate ─────────────────────────────────────────────────────────────────

describe("truncate", () => {
  it("returns the original string if within limit", () => {
    expect(truncate("hello", 10)).toBe("hello")
  })

  it("truncates and appends ellipsis when over limit", () => {
    expect(truncate("hello world", 5)).toBe("hello...")
  })

  it("handles exact length boundary (no truncation)", () => {
    expect(truncate("hello", 5)).toBe("hello")
  })
})

// ─── capitalizeFirst ──────────────────────────────────────────────────────────

describe("capitalizeFirst", () => {
  it("capitalizes the first letter", () => {
    expect(capitalizeFirst("hello")).toBe("Hello")
  })

  it("does not change already-capitalized strings", () => {
    expect(capitalizeFirst("Hello")).toBe("Hello")
  })

  it("handles empty string", () => {
    expect(capitalizeFirst("")).toBe("")
  })
})

// ─── calculatePercentage ─────────────────────────────────────────────────────

describe("calculatePercentage", () => {
  it("calculates percentage correctly", () => {
    expect(calculatePercentage(25, 100)).toBe(25)
    expect(calculatePercentage(1, 3)).toBe(33) // Math.round
  })

  it("returns 0 when total is 0 (avoids division by zero)", () => {
    expect(calculatePercentage(5, 0)).toBe(0)
  })

  it("returns 100 when value equals total", () => {
    expect(calculatePercentage(50, 50)).toBe(100)
  })
})

// ─── getStatusBadgeClass ──────────────────────────────────────────────────────

describe("getStatusBadgeClass", () => {
  it("returns green class for active status", () => {
    expect(getStatusBadgeClass("active")).toContain("green")
  })

  it("returns yellow class for pending status", () => {
    expect(getStatusBadgeClass("pending")).toContain("yellow")
  })

  it("returns red class for overdue status", () => {
    expect(getStatusBadgeClass("overdue")).toContain("red")
  })

  it("returns gray fallback for unknown status", () => {
    expect(getStatusBadgeClass("unknown_status")).toContain("gray")
  })
})

// ─── getPriorityBadgeClass ────────────────────────────────────────────────────

describe("getPriorityBadgeClass", () => {
  it("returns gray for low priority", () => {
    expect(getPriorityBadgeClass("low")).toContain("gray")
  })

  it("returns orange for high priority", () => {
    expect(getPriorityBadgeClass("high")).toContain("orange")
  })

  it("returns red for critical priority", () => {
    expect(getPriorityBadgeClass("critical")).toContain("red")
  })

  it("returns gray fallback for unknown priority", () => {
    expect(getPriorityBadgeClass("unknown")).toContain("gray")
  })
})
