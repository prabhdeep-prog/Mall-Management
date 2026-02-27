import { NextResponse } from "next/server"

/**
 * Custom API Error Class
 * Extends Error to provide HTTP status codes and operational error handling.
 */
export class ApiError extends Error {
  statusCode: number
  isOperational: boolean

  constructor(
    message: string,
    statusCode: number = 500,
    isOperational: boolean = true
  ) {
    super(message)
    this.statusCode = statusCode
    this.isOperational = isOperational
    Object.setPrototypeOf(this, ApiError.prototype)
  }
}

/**
 * 400 Bad Request Error
 * Used when the client sends an invalid request.
 */
export class BadRequestError extends ApiError {
  constructor(message: string = "Bad Request") {
    super(message, 400)
    Object.setPrototypeOf(this, BadRequestError.prototype)
  }
}

/**
 * 401 Unauthorized Error
 * Used when authentication is required but not provided or invalid.
 */
export class UnauthorizedError extends ApiError {
  constructor(message: string = "Unauthorized") {
    super(message, 401)
    Object.setPrototypeOf(this, UnauthorizedError.prototype)
  }
}

/**
 * 403 Forbidden Error
 * Used when the user is authenticated but lacks permission for the resource.
 */
export class ForbiddenError extends ApiError {
  constructor(message: string = "Forbidden") {
    super(message, 403)
    Object.setPrototypeOf(this, ForbiddenError.prototype)
  }
}

/**
 * 404 Not Found Error
 * Used when the requested resource does not exist.
 */
export class NotFoundError extends ApiError {
  constructor(message: string = "Resource not found") {
    super(message, 404)
    Object.setPrototypeOf(this, NotFoundError.prototype)
  }
}

/**
 * 409 Conflict Error
 * Used when the request conflicts with the current state (e.g., duplicate entry).
 */
export class ConflictError extends ApiError {
  constructor(message: string = "Resource already exists") {
    super(message, 409)
    Object.setPrototypeOf(this, ConflictError.prototype)
  }
}

/**
 * 422 Unprocessable Entity Error
 * Used when validation fails.
 */
export class ValidationError extends ApiError {
  constructor(message: string = "Validation failed", public errors?: Record<string, string[]>) {
    super(message, 422)
    Object.setPrototypeOf(this, ValidationError.prototype)
  }
}

/**
 * 500 Internal Server Error
 * Used for unexpected server-side errors.
 */
export class InternalServerError extends ApiError {
  constructor(message: string = "Internal Server Error") {
    super(message, 500, false)
    Object.setPrototypeOf(this, InternalServerError.prototype)
  }
}

/**
 * Centralized API Error Handler
 * Converts errors to standardized NextResponse objects with appropriate status codes.
 * Logs errors for debugging and monitoring.
 */
export function handleApiError(error: unknown): NextResponse {
  if (error instanceof ApiError) {
    // Log operational errors for debugging
    if (error.isOperational) {
      console.warn(`[API Error] ${error.statusCode}: ${error.message}`)
    } else {
      console.error(`[Unhandled API Error] ${error.statusCode}: ${error.message}`)
    }

    // Return standardized error response
    const response: Record<string, unknown> = {
      success: false,
      error: error.message,
    }

    // Include validation errors if present
    if (error instanceof ValidationError && error.errors) {
      response.errors = error.errors
    }

    return NextResponse.json(response, { status: error.statusCode })
  }

  if (error instanceof Error) {
    console.error(`[Unhandled Error] ${error.message}`, error.stack)
    return NextResponse.json(
      { success: false, error: "Internal Server Error" },
      { status: 500 }
    )
  }

  console.error("[Unknown Error]", error)
  return NextResponse.json(
    { success: false, error: "Internal Server Error" },
    { status: 500 }
  )
}

/**
 * Type guard to check if an error is an ApiError
 */
export function isApiError(error: unknown): error is ApiError {
  return error instanceof ApiError
}
