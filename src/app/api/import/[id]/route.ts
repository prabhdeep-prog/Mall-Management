import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { db } from "@/lib/db"
import { importJobs } from "@/lib/db/schema"
import { eq } from "drizzle-orm"
import { requirePermission, PERMISSIONS } from "@/lib/auth/rbac"

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const session = await auth()
    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const { authorized, error } = await requirePermission(PERMISSIONS.IMPORT_VIEW)
    if (!authorized) return NextResponse.json({ error }, { status: 403 })

    const job = await db.query.importJobs.findFirst({
      where: eq(importJobs.id, params.id),
    })

    if (!job) {
      return NextResponse.json({ error: "Import job not found" }, { status: 404 })
    }

    const progress =
      job.totalRows > 0
        ? Math.round((job.processedRows / job.totalRows) * 100)
        : 0

    return NextResponse.json({
      success: true,
      data: {
        ...job,
        progress,
      },
    })
  } catch (error) {
    console.error("Get import job error:", error)
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    )
  }
}
