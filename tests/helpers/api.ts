import { NextRequest } from "next/server"

/**
 * Create a mock NextRequest for testing API route handlers.
 */
export function createRequest(
  url: string,
  options: {
    method?: string
    body?: unknown
    headers?: Record<string, string>
    searchParams?: Record<string, string>
  } = {}
): NextRequest {
  const { method = "GET", body, headers = {}, searchParams = {} } = options

  const fullUrl = new URL(url, "http://localhost:3001")
  for (const [key, value] of Object.entries(searchParams)) {
    fullUrl.searchParams.set(key, value)
  }

  return new NextRequest(fullUrl.toString(), {
    method,
    headers: {
      "Content-Type": "application/json",
      ...headers,
    },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  })
}

/**
 * Parse a NextResponse body as JSON.
 */
export async function parseJsonResponse<T = unknown>(
  response: Response
): Promise<{ data: T; status: number }> {
  const data = (await response.json()) as T
  return { data, status: response.status }
}
