/**
 * Common Types Shared Across Features
 * These types are used by multiple features and do not belong to any specific domain.
 */

/**
 * Standard API Response Format
 */
export interface ApiResponse<T = unknown> {
  success: boolean
  data?: T
  error?: string
  errors?: Record<string, string[]>
}

/**
 * Pagination Parameters
 */
export interface PaginationParams {
  page: number
  limit: number
  offset?: number
}

/**
 * Pagination Metadata
 */
export interface PaginationMeta {
  page: number
  limit: number
  total: number
  totalPages: number
  hasNextPage: boolean
  hasPreviousPage: boolean
}

/**
 * Paginated Response
 */
export interface PaginatedResponse<T> {
  data: T[]
  meta: PaginationMeta
}

/**
 * Sort Direction
 */
export type SortDirection = "asc" | "desc"

/**
 * Sort Parameters
 */
export interface SortParams {
  sortBy?: string
  sortDirection?: SortDirection
}

/**
 * Filter Parameters (Base)
 */
export interface FilterParams {
  search?: string
  status?: string
}

/**
 * Date Range Filter
 */
export interface DateRangeFilter {
  startDate?: Date | string
  endDate?: Date | string
}

/**
 * Query Parameters (Combines pagination, sorting, and filtering)
 */
export interface QueryParams extends PaginationParams, SortParams, FilterParams {}

/**
 * Audit Trail Information
 */
export interface AuditTrail {
  createdAt: Date
  createdBy?: string
  updatedAt: Date
  updatedBy?: string
  deletedAt?: Date
  deletedBy?: string
}

/**
 * Status Enum (Common across entities)
 */
export enum EntityStatus {
  ACTIVE = "active",
  INACTIVE = "inactive",
  SUSPENDED = "suspended",
  ARCHIVED = "archived",
}

/**
 * Generic Entity with ID and Timestamps
 */
export interface Entity {
  id: string
  createdAt: Date
  updatedAt: Date
}

/**
 * API Error Response
 */
export interface ApiErrorResponse {
  success: false
  error: string
  errors?: Record<string, string[]>
  statusCode?: number
}

/**
 * Async Operation Status
 */
export enum AsyncStatus {
  IDLE = "idle",
  LOADING = "loading",
  SUCCESS = "success",
  ERROR = "error",
}

/**
 * Async Operation State
 */
export interface AsyncState<T> {
  status: AsyncStatus
  data?: T
  error?: string
  isLoading: boolean
  isError: boolean
  isSuccess: boolean
}
