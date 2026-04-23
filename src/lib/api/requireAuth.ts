import { NextResponse } from "next/server"
import { auth } from "@/lib/auth"

/**
 * Reusable auth guard for API routes.
 * Returns the session or a 401 response.
 */
export async function requireAuth() {
  const session = await auth()
  if (!session?.user) {
    return {
      session: null as never,
      error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }),
    }
  }
  return { session, error: null }
}
