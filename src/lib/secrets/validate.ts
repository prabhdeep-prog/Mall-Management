/**
 * Secret / Environment Variable Validation
 * ──────────────────────────────────────────
 * Call validateSecrets() once at application startup (from db/index.ts or
 * instrumentation.ts) to fail-fast on misconfigured environments rather
 * than surfacing errors at request time.
 *
 * Rules:
 *   • REQUIRED_ALWAYS    — must exist in every environment
 *   • REQUIRED_PROD_ONLY — must exist in production; warn in dev/test
 *   • Format checks       — key length, URL format, etc.
 */

type EnvKey = string

const REQUIRED_ALWAYS: EnvKey[] = [
  "DATABASE_URL",
  "AUTH_SECRET",
]

const REQUIRED_IN_PRODUCTION: EnvKey[] = [
  "DATABASE_URL",
  "DATABASE_SERVICE_URL",
  "AUTH_SECRET",
  "ENCRYPTION_KEY",
  "CRON_SECRET",
  "NEXT_PUBLIC_APP_URL",
]

// ── Format validators ─────────────────────────────────────────────────────────

function validateAuthSecret(value: string): string | null {
  if (value.length < 32) {
    return `AUTH_SECRET must be at least 32 characters (got ${value.length})`
  }
  return null
}

function validateEncryptionKey(value: string): string | null {
  if (!/^[0-9a-f]+$/i.test(value)) {
    return "ENCRYPTION_KEY must be a hex string"
  }
  const bytes = Buffer.from(value, "hex")
  if (bytes.length !== 32) {
    return `ENCRYPTION_KEY must be exactly 64 hex chars / 32 bytes (got ${bytes.length} bytes)`
  }
  return null
}

function validateDatabaseUrl(value: string): string | null {
  if (!value.startsWith("postgresql://") && !value.startsWith("postgres://")) {
    return "DATABASE_URL must start with postgresql:// or postgres://"
  }
  return null
}

function validateCronSecret(value: string): string | null {
  if (value.length < 16) {
    return `CRON_SECRET must be at least 16 characters (got ${value.length})`
  }
  return null
}

// ── Main validator ────────────────────────────────────────────────────────────

export function validateSecrets(): void {
  const isProd = process.env.NODE_ENV === "production"
  const isCI   = process.env.CI === "true"
  const errors: string[] = []
  const warnings: string[] = []

  // Check required-always vars
  for (const key of REQUIRED_ALWAYS) {
    if (!process.env[key]) {
      errors.push(`Missing required environment variable: ${key}`)
    }
  }

  // Check production-required vars
  if (isProd || isCI) {
    for (const key of REQUIRED_IN_PRODUCTION) {
      if (!process.env[key]) {
        if (isProd) {
          errors.push(`Missing required production variable: ${key}`)
        } else {
          warnings.push(`[CI] Missing production variable: ${key}`)
        }
      }
    }
  } else {
    // Dev: warn about missing prod vars
    for (const key of REQUIRED_IN_PRODUCTION) {
      if (!process.env[key] && !REQUIRED_ALWAYS.includes(key)) {
        warnings.push(`[DEV] Missing production variable: ${key} (required in prod)`)
      }
    }
  }

  // Format validations (only when value is present)
  const formatChecks: Array<[string, (v: string) => string | null]> = [
    ["AUTH_SECRET",    validateAuthSecret],
    ["ENCRYPTION_KEY", validateEncryptionKey],
    ["DATABASE_URL",   validateDatabaseUrl],
    ["CRON_SECRET",    validateCronSecret],
  ]

  for (const [key, validator] of formatChecks) {
    const value = process.env[key]
    if (value) {
      const err = validator(value)
      if (err) {
        if (isProd) {
          errors.push(err)
        } else {
          warnings.push(`[CONFIG] ${err}`)
        }
      }
    }
  }

  // Emit warnings (non-fatal)
  for (const w of warnings) {
    console.warn(`⚠️  ${w}`)
  }

  // Throw on errors (fatal)
  if (errors.length > 0) {
    throw new Error(
      `Environment validation failed:\n${errors.map((e) => `  ✗ ${e}`).join("\n")}`
    )
  }
}
