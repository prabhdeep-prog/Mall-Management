import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { serviceDb } from "@/lib/db"
import { sql } from "drizzle-orm"
import { createPresignedDownloadUrl } from "@/lib/storage/s3"
import { logDocumentEvent } from "@/lib/documents/audit"

interface DocRow extends Record<string, unknown> {
  id:              string
  name:            string
  file_key:        string | null
  file_url:        string
  organization_id: string
}

/**
 * GET /api/documents/[id]/download
 *
 * Generates a presigned S3 download URL (or falls back to stored URL).
 * Logs a document_download audit event.
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await auth()
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const { id } = await params

  try {
    const rows = await serviceDb.execute<DocRow>(sql`
      SELECT id, name, file_key, url AS file_url, organization_id
      FROM documents
      WHERE id = ${id}::uuid AND is_active = true
      LIMIT 1
    `)

    if (rows.length === 0) {
      return NextResponse.json({ success: false, error: "Document not found" }, { status: 404 })
    }

    const doc = rows[0]

    let downloadUrl: string
    if (doc.file_key) {
      downloadUrl = await createPresignedDownloadUrl(doc.file_key, doc.name)
    } else {
      downloadUrl = doc.file_url
    }

    await logDocumentEvent({
      organizationId: doc.organization_id,
      documentId:     doc.id,
      action:         "document_download",
      actorId:        session.user.id,
    })

    return NextResponse.json({ success: true, data: { downloadUrl } })
  } catch (error) {
    console.error("Document download error:", error)
    return NextResponse.json(
      { success: false, error: "Failed to generate download URL" },
      { status: 500 },
    )
  }
}
