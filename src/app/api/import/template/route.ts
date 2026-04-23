import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { requirePermission, PERMISSIONS } from "@/lib/auth/rbac"
import { CSV_TEMPLATES } from "@/lib/import/processor"

const VALID_TYPES = ["tenants", "leases", "vendors", "sales"] as const

export async function GET(request: NextRequest) {
  try {
    const session = await auth()
    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const { authorized, error } = await requirePermission(PERMISSIONS.IMPORT_VIEW)
    if (!authorized) return NextResponse.json({ error }, { status: 403 })

    const { searchParams } = new URL(request.url)
    const type = searchParams.get("type") as (typeof VALID_TYPES)[number] | null

    if (!type || !VALID_TYPES.includes(type)) {
      return NextResponse.json(
        { error: `Invalid type. Must be one of: ${VALID_TYPES.join(", ")}` },
        { status: 400 }
      )
    }

    const csv = CSV_TEMPLATES[type]

    return new NextResponse(csv, {
      status: 200,
      headers: {
        "Content-Type": "text/csv",
        "Content-Disposition": `attachment; filename="${type}_template.csv"`,
      },
    })
  } catch (error) {
    console.error("Template download error:", error)
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    )
  }
}
