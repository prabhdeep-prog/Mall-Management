/**
 * Pagination utility for API list endpoints.
 */

export interface PaginationParams {
  page: number
  limit: number
  offset: number
}

const DEFAULT_LIMIT = 50
const MAX_LIMIT = 200

export function parsePagination(searchParams: URLSearchParams): PaginationParams {
  const page = Math.max(1, parseInt(searchParams.get("page") || "1", 10) || 1)
  const limit = Math.min(
    MAX_LIMIT,
    Math.max(1, parseInt(searchParams.get("limit") || String(DEFAULT_LIMIT), 10) || DEFAULT_LIMIT)
  )
  const offset = (page - 1) * limit
  return { page, limit, offset }
}

export function paginationMeta(total: number, params: PaginationParams) {
  return {
    page: params.page,
    limit: params.limit,
    total,
    totalPages: Math.ceil(total / params.limit),
  }
}
