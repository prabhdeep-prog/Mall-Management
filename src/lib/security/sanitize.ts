/**
 * Server-Side Input Sanitization
 * ─────────────────────────────────────────────────────────────────────────────
 * Strips HTML/script tags from string inputs to prevent stored XSS.
 * Applied at API boundaries before writing to database.
 */

// HTML tag regex — matches any opening/closing/self-closing HTML tag
const HTML_TAG_RE = /<\/?[a-z][^>]*>/gi

// Common XSS patterns
const XSS_PATTERNS = [
  /javascript\s*:/gi,
  /on\w+\s*=/gi,        // onclick=, onerror=, etc.
  /data\s*:\s*text\/html/gi,
  /vbscript\s*:/gi,
  /expression\s*\(/gi,  // CSS expression()
]

/**
 * Strip HTML tags and XSS patterns from a string.
 */
export function sanitizeString(input: string): string {
  if (typeof input !== "string") return input

  let sanitized = input.replace(HTML_TAG_RE, "")

  for (const pattern of XSS_PATTERNS) {
    sanitized = sanitized.replace(pattern, "")
  }

  // Normalize whitespace
  sanitized = sanitized.replace(/\s+/g, " ").trim()

  return sanitized
}

/**
 * Recursively sanitize all string values in an object.
 * Leaves non-string values unchanged.
 */
export function sanitizeObject<T>(obj: T): T {
  if (obj === null || obj === undefined) return obj

  if (typeof obj === "string") {
    return sanitizeString(obj) as unknown as T
  }

  if (Array.isArray(obj)) {
    return obj.map(item => sanitizeObject(item)) as unknown as T
  }

  if (typeof obj === "object") {
    const result: Record<string, unknown> = {}
    for (const [key, value] of Object.entries(obj as Record<string, unknown>)) {
      result[key] = sanitizeObject(value)
    }
    return result as T
  }

  return obj
}

/**
 * Sanitize specific fields in an object (preserves other fields as-is).
 * Useful for forms where some fields may contain intentional rich content.
 */
export function sanitizeFields<T extends Record<string, unknown>>(
  obj: T,
  fields: (keyof T)[],
): T {
  const result = { ...obj }
  for (const field of fields) {
    const value = result[field]
    if (typeof value === "string") {
      result[field] = sanitizeString(value) as T[keyof T]
    }
  }
  return result
}
