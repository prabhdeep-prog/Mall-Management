import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { serviceDb } from "@/lib/db"
import { sql } from "drizzle-orm"
import { logDocumentEvent } from "@/lib/documents/audit"

interface VersionRow extends Record<string, unknown> {
  current_version:  string
  organization_id:  string
  document_type:    string
  category:         string
  tenant_id:        string | null
  lease_id:         string | null
  vendor_id:        string | null
  property_id:      string | null
}

interface InsertedRow extends Record<string, unknown> { id: string }

/**
 * POST /api/documents/[id]/version
 *
 * Creates a new version of an existing document.
 * 1. Marks the current version as is_active=false
 * 2. Inserts a new row with version+1
 *
 * Body: { name, fileKey, fileUrl, mimeType, fileSize }
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await auth()
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const { id } = await params
  const body = await request.json()
  const { name, fileKey, fileUrl, mimeType, fileSize } = body

  if (!fileKey || !fileUrl) {
    return NextResponse.json(
      { success: false, error: "fileKey and fileUrl are required" },
      { status: 400 },
    )
  }

  try {
    // Get current version info
    const rows = await serviceDb.execute<VersionRow>(sql`
      SELECT version::text AS current_version, organization_id,
             document_type, category,
             tenant_id, lease_id, vendor_id, property_id
      FROM documents
      WHERE id = ${id}::uuid AND is_active = true
      LIMIT 1
    `)

    if (rows.length === 0) {
      return NextResponse.json(
        { success: false, error: "Document not found" },
        { status: 404 },
      )
    }

    const prev = rows[0]
    const newVersion = parseInt(prev.current_version, 10) + 1

    // Deactivate current version
    await serviceDb.execute(sql`
      UPDATE documents SET is_active = false, updated_at = NOW()
      WHERE id = ${id}::uuid
    `)

    // Insert new version
    const [inserted] = await serviceDb.execute<InsertedRow>(sql`
      INSERT INTO documents (
        organization_id, tenant_id, lease_id, vendor_id, property_id,
        name, document_type, category,
        url, file_key, mime_type, file_size,
        version, is_active, tags,
        uploaded_by, created_at
      )
      SELECT
        organization_id, tenant_id, lease_id, vendor_id, property_id,
        COALESCE(${name ?? null}, d.name),
        d.document_type, d.category,
        ${fileUrl}, ${fileKey}, ${mimeType ?? null}, ${fileSize ?? null},
        ${newVersion}, true, d.tags,
        ${session.user.id}::uuid, NOW()
      FROM documents d
      WHERE d.id = ${id}::uuid
      RETURNING id
    `)

    await logDocumentEvent({
      organizationId: prev.organization_id,
      documentId:     inserted.id,
      action:         "document_update",
      actorId:        session.user.id,
      details:        { previousId: id, version: newVersion, fileKey },
    })

    return NextResponse.json({
      success: true,
      data: { id: inserted.id, version: newVersion },
    }, { status: 201 })
  } catch (error) {
    console.error("Document version error:", error)
    return NextResponse.json(
      { success: false, error: "Failed to create new version" },
      { status: 500 },
    )
  }
}
