/**
 * Decimal Math Utilities
 * ─────────────────────────────────────────────────────────────────────────────
 * Avoids floating-point precision issues in financial calculations.
 * All operations work in paise (integer cents) internally.
 */

/**
 * Convert rupees (decimal) to paise (integer) for safe arithmetic.
 */
export function toPaise(rupees: number | string): number {
  const n = typeof rupees === "string" ? parseFloat(rupees) : rupees
  return Math.round(n * 100)
}

/**
 * Convert paise (integer) back to rupees (2 decimal places).
 */
export function toRupees(paise: number): number {
  return Math.round(paise) / 100
}

/**
 * Add two rupee amounts safely.
 */
export function addRupees(a: number | string, b: number | string): number {
  return toRupees(toPaise(a) + toPaise(b))
}

/**
 * Subtract two rupee amounts safely.
 */
export function subtractRupees(a: number | string, b: number | string): number {
  return toRupees(toPaise(a) - toPaise(b))
}

/**
 * Multiply a rupee amount by a factor (e.g., tax rate).
 */
export function multiplyRupees(amount: number | string, factor: number): number {
  return toRupees(Math.round(toPaise(amount) * factor))
}

/**
 * Calculate percentage of a rupee amount.
 */
export function percentOfRupees(amount: number | string, percent: number): number {
  return toRupees(Math.round(toPaise(amount) * percent / 100))
}

/**
 * Round to 2 decimal places safely.
 */
export function round2(n: number): number {
  return Math.round(n * 100) / 100
}

/**
 * Compare two rupee amounts with tolerance for floating-point errors.
 */
export function rupeesEqual(a: number | string, b: number | string): boolean {
  return toPaise(a) === toPaise(b)
}
