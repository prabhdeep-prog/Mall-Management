import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { serviceDb } from "@/lib/db"
import { sql } from "drizzle-orm"
import { logDocumentEvent } from "@/lib/documents/audit"

interface DocRow extends Record<string, unknown> {
  id: string
  organization_id: string
}

/**
 * DELETE /api/documents/[id]
 *
 * Soft delete — sets is_active = false.
 * Only org_admin and super_admin can delete.
 */
export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await auth()
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const role = (session.user as { role?: string }).role
  if (role !== "super_admin" && role !== "organization_admin") {
    return NextResponse.json({ error: "Forbidden — admin only" }, { status: 403 })
  }

  const { id } = await params

  try {
    const rows = await serviceDb.execute<DocRow>(sql`
      UPDATE documents
      SET is_active = false, updated_at = NOW()
      WHERE id = ${id}::uuid AND is_active = true
      RETURNING id, organization_id
    `)

    if (rows.length === 0) {
      return NextResponse.json({ success: false, error: "Document not found" }, { status: 404 })
    }

    await logDocumentEvent({
      organizationId: rows[0].organization_id,
      documentId:     rows[0].id,
      action:         "document_delete",
      actorId:        session.user.id,
    })

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error("Document delete error:", error)
    return NextResponse.json(
      { success: false, error: "Failed to delete document" },
      { status: 500 },
    )
  }
}
