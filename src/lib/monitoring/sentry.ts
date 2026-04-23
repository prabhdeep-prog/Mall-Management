/**
 * Sentry Error Tracking
 * ─────────────────────
 * Lightweight wrapper for Sentry integration.
 *
 * Setup:
 *   1. npm install @sentry/nextjs
 *   2. Set SENTRY_DSN in .env
 *   3. Run `npx @sentry/wizard@latest -i nextjs` for full setup
 *
 * This module provides a graceful fallback when Sentry is not installed,
 * so the rest of the codebase can call captureException() without guards.
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let _sentry: any = null
let _sentryLoaded = false

async function getSentry(): Promise<any> {
  if (_sentryLoaded) return _sentry
  _sentryLoaded = true
  if (!process.env.SENTRY_DSN && !process.env.NEXT_PUBLIC_SENTRY_DSN) return null
  try {
    // @ts-ignore — optional dependency, resolved at runtime
    _sentry = await import("@sentry/nextjs")
    return _sentry
  } catch {
    return null
  }
}

/**
 * Capture an exception in Sentry (no-op if Sentry not configured).
 */
export async function captureException(
  error: Error | unknown,
  context?: Record<string, unknown>
) {
  const sentry = await getSentry()
  if (sentry) {
    if (context) {
      sentry.withScope((scope: any) => {
        for (const [key, value] of Object.entries(context)) {
          scope.setExtra(key, value)
        }
        sentry.captureException(error)
      })
    } else {
      sentry.captureException(error)
    }
  }

  // Always log to structured logger as fallback
  const { logger } = await import("@/lib/logger")
  logger.error("Exception captured", {
    error: error instanceof Error ? error : new Error(String(error)),
    ...context,
  })
}

/**
 * Capture a message in Sentry.
 */
export async function captureMessage(
  message: string,
  level: "info" | "warning" | "error" = "info",
  context?: Record<string, unknown>
) {
  const sentry = await getSentry()
  if (sentry) {
    if (context) {
      sentry.withScope((scope: any) => {
        for (const [key, value] of Object.entries(context)) {
          scope.setExtra(key, value)
        }
        sentry.captureMessage(message, level)
      })
    } else {
      sentry.captureMessage(message, level)
    }
  }
}

/**
 * Set user context for Sentry.
 */
export async function setUser(user: { id: string; email?: string; orgId?: string }) {
  const sentry = await getSentry()
  if (sentry) {
    sentry.setUser({
      id: user.id,
      email: user.email,
      ...(user.orgId ? { organization: user.orgId } : {}),
    })
  }
}
