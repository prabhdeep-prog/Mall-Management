import { NextResponse } from "next/server"
import { requireTenantSession } from "@/lib/auth/tenant-session"
import { withTenantContext } from "@/lib/db/with-tenant-context"
import { signDocumentUrl } from "@/lib/utils/signed-url"
import { sql } from "drizzle-orm"

/**
 * GET /api/tenant/documents
 *
 * Returns all documents belonging to the authenticated tenant.
 * Filtered by tenant_id only — RLS enforced via current_setting('app.current_tenant_id').
 *
 * Each row: name, type, uploadedAt, downloadUrl
 */
export async function GET() {
  let ctx
  try {
    ctx = await requireTenantSession()
  } catch (res) {
    return res as Response
  }

  const { tenantId } = ctx

  try {
    const data = await withTenantContext(tenantId, async (tx) => {
      const rows = await tx.execute<{
        id: string
        name: string
        type: string | null
        category: string
        file_size: number | null
        mime_type: string | null
        download_url: string
        uploaded_at: string
      }>(sql`
        SELECT
          d.id,
          d.name,
          d.type,
          d.category,
          d.file_size,
          d.mime_type,
          d.url        AS download_url,
          d.created_at AS uploaded_at
        FROM documents d
        WHERE d.tenant_id = current_setting('app.current_tenant_id')::uuid
        ORDER BY d.created_at DESC
      `)

      const documents = Array.isArray(rows) ? rows : []

      return documents.map((r) => ({
        id:          r.id,
        name:        r.name,
        type:        r.type,
        category:    r.category,
        fileSize:    r.file_size,
        mimeType:    r.mime_type,
        downloadUrl: signDocumentUrl(r.download_url, tenantId),
        uploadedAt:  r.uploaded_at,
      }))
    })

    return NextResponse.json({ success: true, data })
  } catch (err) {
    console.error("Tenant documents error:", err)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
