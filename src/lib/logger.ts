/**
 * Structured JSON Logger
 * ──────────────────────
 * Lightweight structured logger for server-side use.
 * Outputs JSON lines with timestamp, level, message, and context.
 *
 * Usage:
 *   import { logger } from "@/lib/logger"
 *   logger.info("Invoice created", { orgId, userId, invoiceId })
 *   logger.warn("Slow query detected", { duration: 520, query: "..." })
 *   logger.error("Payment failed", { error, invoiceId })
 */

type LogLevel = "debug" | "info" | "warn" | "error"

interface LogEntry {
  timestamp: string
  level: LogLevel
  message: string
  [key: string]: unknown
}

const LOG_LEVELS: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
}

const MIN_LEVEL: LogLevel =
  (process.env.LOG_LEVEL as LogLevel) || (process.env.NODE_ENV === "production" ? "info" : "debug")

function shouldLog(level: LogLevel): boolean {
  return LOG_LEVELS[level] >= LOG_LEVELS[MIN_LEVEL]
}

function formatEntry(level: LogLevel, message: string, context?: Record<string, unknown>): LogEntry {
  const entry: LogEntry = {
    timestamp: new Date().toISOString(),
    level,
    message,
  }

  if (context) {
    for (const [key, value] of Object.entries(context)) {
      if (value instanceof Error) {
        entry[key] = {
          name: value.name,
          message: value.message,
          stack: process.env.NODE_ENV !== "production" ? value.stack : undefined,
        }
      } else {
        entry[key] = value
      }
    }
  }

  return entry
}

function emit(level: LogLevel, message: string, context?: Record<string, unknown>) {
  if (!shouldLog(level)) return

  const entry = formatEntry(level, message, context)
  const line = JSON.stringify(entry)

  switch (level) {
    case "error":
      console.error(line)
      break
    case "warn":
      console.warn(line)
      break
    default:
      console.log(line)
  }
}

export const logger = {
  debug: (message: string, context?: Record<string, unknown>) => emit("debug", message, context),
  info: (message: string, context?: Record<string, unknown>) => emit("info", message, context),
  warn: (message: string, context?: Record<string, unknown>) => emit("warn", message, context),
  error: (message: string, context?: Record<string, unknown>) => emit("error", message, context),
}
