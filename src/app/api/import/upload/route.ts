import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { db } from "@/lib/db"
import { importJobs } from "@/lib/db/schema"
import { eq } from "drizzle-orm"
import { requirePermission, PERMISSIONS } from "@/lib/auth/rbac"
import { processImport } from "@/lib/import/processor"

const VALID_TYPES = ["tenants", "leases", "vendors", "sales"]
const MAX_FILE_SIZE = 10 * 1024 * 1024 // 10 MB

export async function POST(request: NextRequest) {
  try {
    const session = await auth()
    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const { authorized, error } = await requirePermission(PERMISSIONS.IMPORT_CREATE)
    if (!authorized) return NextResponse.json({ error }, { status: 403 })

    const formData = await request.formData()
    const file = formData.get("file") as File | null
    const type = formData.get("type") as string | null

    if (!file || !type) {
      return NextResponse.json(
        { error: "Missing required fields: file, type" },
        { status: 400 }
      )
    }

    if (!VALID_TYPES.includes(type)) {
      return NextResponse.json(
        { error: `Invalid type. Must be one of: ${VALID_TYPES.join(", ")}` },
        { status: 400 }
      )
    }

    if (!file.name.endsWith(".csv")) {
      return NextResponse.json(
        { error: "Only .csv files are accepted" },
        { status: 400 }
      )
    }

    if (file.size > MAX_FILE_SIZE) {
      return NextResponse.json(
        { error: "File size exceeds 10 MB limit" },
        { status: 400 }
      )
    }

    // Read file text
    const csvText = await file.text()

    // Create job record
    const [job] = await db
      .insert(importJobs)
      .values({
        organizationId: session.user.organizationId!,
        type,
        fileName: file.name,
        status: "pending",
        createdBy: session.user.id,
      })
      .returning()

    // Process asynchronously (fire-and-forget)
    processImport(job.id, csvText).catch((err) => {
      console.error(`Import job ${job.id} failed:`, err)
      db.update(importJobs)
        .set({
          status: "failed",
          errorLog: [{ row: 0, data: {}, error: err instanceof Error ? err.message : "Unknown error" }],
          updatedAt: new Date(),
        })
        .where(eq(importJobs.id, job.id))
        .catch(console.error)
    })

    return NextResponse.json(
      { success: true, data: { jobId: job.id, status: job.status } },
      { status: 201 }
    )
  } catch (error) {
    console.error("Import upload error:", error)
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    )
  }
}
