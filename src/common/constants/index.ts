/**
 * Application-Wide Constants
 * Centralized constants used across multiple features.
 */

/**
 * Pagination Constants
 */
export const PAGINATION = {
  DEFAULT_PAGE: 1,
  DEFAULT_LIMIT: 20,
  MAX_LIMIT: 100,
  MIN_LIMIT: 1,
} as const

/**
 * Cache Duration Constants (in seconds)
 */
export const CACHE_DURATION = {
  VERY_SHORT: 30, // 30 seconds
  SHORT: 60, // 1 minute
  MEDIUM: 300, // 5 minutes
  LONG: 3600, // 1 hour
  VERY_LONG: 86400, // 24 hours
  ONE_WEEK: 604800, // 7 days
} as const

/**
 * HTTP Status Codes
 */
export const HTTP_STATUS = {
  OK: 200,
  CREATED: 201,
  ACCEPTED: 202,
  NO_CONTENT: 204,
  BAD_REQUEST: 400,
  UNAUTHORIZED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  CONFLICT: 409,
  UNPROCESSABLE_ENTITY: 422,
  INTERNAL_SERVER_ERROR: 500,
  SERVICE_UNAVAILABLE: 503,
} as const

/**
 * Date Formats
 */
export const DATE_FORMATS = {
  ISO: "yyyy-MM-dd'T'HH:mm:ss.SSSxxx",
  DATE_ONLY: "yyyy-MM-dd",
  TIME_ONLY: "HH:mm:ss",
  DISPLAY: "MMM dd, yyyy",
  DISPLAY_WITH_TIME: "MMM dd, yyyy HH:mm",
} as const

/**
 * Regex Patterns
 */
export const REGEX_PATTERNS = {
  EMAIL: /^[^\s@]+@[^\s@]+\.[^\s@]+$/,
  PHONE_INDIA: /^(\+91[-\s]?)?[6-9]\d{9}$/,
  GSTIN: /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$/,
  PAN: /^[A-Z]{5}[0-9]{4}[A-Z]{1}$/,
  IFSC: /^[A-Z]{4}0[A-Z0-9]{6}$/,
  PINCODE: /^\d{6}$/,
  URL: /^https?:\/\/.+/,
  ALPHANUMERIC: /^[a-zA-Z0-9]+$/,
  NUMERIC: /^\d+$/,
} as const

/**
 * Entity Status Values
 */
export const ENTITY_STATUS = {
  ACTIVE: "active",
  INACTIVE: "inactive",
  SUSPENDED: "suspended",
  ARCHIVED: "archived",
  ONBOARDING: "onboarding",
  DRAFT: "draft",
  PENDING: "pending",
  APPROVED: "approved",
  REJECTED: "rejected",
  CANCELLED: "cancelled",
} as const

/**
 * Error Messages
 */
export const ERROR_MESSAGES = {
  UNAUTHORIZED: "You are not authorized to perform this action.",
  FORBIDDEN: "You do not have permission to access this resource.",
  NOT_FOUND: "The requested resource was not found.",
  BAD_REQUEST: "The request contains invalid data.",
  INTERNAL_ERROR: "An unexpected error occurred. Please try again later.",
  VALIDATION_FAILED: "Validation failed. Please check your input.",
  DUPLICATE_ENTRY: "This resource already exists.",
  OPERATION_FAILED: "The operation failed. Please try again.",
} as const

/**
 * Success Messages
 */
export const SUCCESS_MESSAGES = {
  CREATED: "Resource created successfully.",
  UPDATED: "Resource updated successfully.",
  DELETED: "Resource deleted successfully.",
  FETCHED: "Resource fetched successfully.",
  ACTION_COMPLETED: "Action completed successfully.",
} as const

/**
 * Route Paths
 */
export const ROUTES = {
  HOME: "/",
  DASHBOARD: "/dashboard",
  LOGIN: "/auth/login",
  LOGOUT: "/auth/logout",
  PROPERTIES: "/properties",
  TENANTS: "/tenants",
  LEASES: "/leases",
  FINANCIALS: "/financials",
  WORK_ORDERS: "/work-orders",
  EQUIPMENT: "/equipment",
  VENDORS: "/vendors",
  COMPLIANCE: "/compliance",
  AGENTS: "/agents",
  APPROVALS: "/approvals",
  USERS: "/users",
  ROLES: "/roles",
  SETTINGS: "/settings",
} as const

/**
 * API Endpoint Paths
 */
export const API_ENDPOINTS = {
  TENANTS: "/api/v1/tenants",
  PROPERTIES: "/api/v1/properties",
  LEASES: "/api/v1/leases",
  INVOICES: "/api/v1/invoices",
  PAYMENTS: "/api/v1/payments",
  WORK_ORDERS: "/api/v1/work-orders",
  EQUIPMENT: "/api/v1/equipment",
  VENDORS: "/api/v1/vendors",
  COMPLIANCE: "/api/v1/compliance",
  AGENTS: "/api/v1/agents",
  DASHBOARD: "/api/v1/dashboard",
  USERS: "/api/v1/users",
  ROLES: "/api/v1/roles",
} as const

/**
 * Timeout Constants (in milliseconds)
 */
export const TIMEOUTS = {
  SHORT: 3000, // 3 seconds
  MEDIUM: 10000, // 10 seconds
  LONG: 30000, // 30 seconds
  VERY_LONG: 60000, // 1 minute
} as const

/**
 * Retry Constants
 */
export const RETRY = {
  MAX_ATTEMPTS: 3,
  INITIAL_DELAY: 1000, // 1 second
  MAX_DELAY: 10000, // 10 seconds
  BACKOFF_MULTIPLIER: 2,
} as const
