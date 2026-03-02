/**
 * Centralized Logging Utility
 * Provides consistent logging across the application with support for different log levels.
 * Can be extended to integrate with external logging services (e.g., Sentry, LogRocket).
 */

export enum LogLevel {
  DEBUG = "DEBUG",
  INFO = "INFO",
  WARN = "WARN",
  ERROR = "ERROR",
}

interface LogContext {
  [key: string]: unknown
}

class Logger {
  private context: LogContext = {}

  /**
   * Set context that will be included in all subsequent log messages
   */
  setContext(context: LogContext): void {
    this.context = { ...this.context, ...context }
  }

  /**
   * Clear context
   */
  clearContext(): void {
    this.context = {}
  }

  /**
   * Format log message with timestamp and context
   */
  private formatMessage(level: LogLevel, message: string, data?: LogContext): string {
    const timestamp = new Date().toISOString()
    const contextStr = Object.keys(this.context).length > 0 ? JSON.stringify(this.context) : ""
    const dataStr = data ? JSON.stringify(data) : ""

    return `[${timestamp}] [${level}] ${message}${contextStr ? ` | Context: ${contextStr}` : ""}${dataStr ? ` | Data: ${dataStr}` : ""}`
  }

  /**
   * Log debug message (development only)
   */
  debug(message: string, data?: LogContext): void {
    if (process.env.NODE_ENV === "development") {
      console.debug(this.formatMessage(LogLevel.DEBUG, message, data))
    }
  }

  /**
   * Log info message
   */
  info(message: string, data?: LogContext): void {
    console.log(this.formatMessage(LogLevel.INFO, message, data))
  }

  /**
   * Log warning message
   */
  warn(message: string, data?: LogContext): void {
    console.warn(this.formatMessage(LogLevel.WARN, message, data))
  }

  /**
   * Log error message
   */
  error(message: string, error?: Error | unknown, data?: LogContext): void {
    const errorMessage =
      error instanceof Error
        ? `${error.message}\nStack: ${error.stack}`
        : typeof error === "string"
          ? error
          : JSON.stringify(error)

    console.error(
      this.formatMessage(LogLevel.ERROR, message, data),
      errorMessage ? `\nError: ${errorMessage}` : ""
    )
  }
}

/**
 * Global logger instance
 */
export const logger = new Logger()

/**
 * Create a logger with a specific context (e.g., for a specific module or feature)
 */
export function createLogger(moduleName: string): Logger {
  const moduleLogger = new Logger()
  moduleLogger.setContext({ module: moduleName })
  return moduleLogger
}
