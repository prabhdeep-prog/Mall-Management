/**
 * Financial amount validation utilities.
 */

export function validatePositiveAmount(value: unknown, fieldName = "amount"): number {
  const num = typeof value === "number" ? value : parseFloat(String(value))
  if (isNaN(num) || num <= 0) {
    throw new AmountValidationError(`${fieldName} must be a positive number`)
  }
  if (num > 999_999_999.99) {
    throw new AmountValidationError(`${fieldName} exceeds maximum allowed value`)
  }
  return Math.round(num * 100) / 100
}

export function validateNonNegativeAmount(value: unknown, fieldName = "amount"): number {
  const num = typeof value === "number" ? value : parseFloat(String(value))
  if (isNaN(num) || num < 0) {
    throw new AmountValidationError(`${fieldName} must be zero or positive`)
  }
  return Math.round(num * 100) / 100
}

export class AmountValidationError extends Error {
  constructor(message: string) {
    super(message)
    this.name = "AmountValidationError"
  }
}
