import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { serviceDb } from "@/lib/db"
import { sql } from "drizzle-orm"
import { logDocumentEvent } from "@/lib/documents/audit"

// ── Row types ────────────────────────────────────────────────────────────────

interface InsertedRow extends Record<string, unknown> { id: string }

interface DocRow extends Record<string, unknown> {
  id:              string
  name:            string
  document_type:   string
  category:        string
  description:     string | null
  file_url:        string
  file_key:        string | null
  mime_type:       string | null
  file_size:       string | null
  version:         string
  is_active:       string
  tags:            unknown
  uploaded_by:     string | null
  created_at:      string
  tenant_name:     string | null
  property_name:   string | null
  vendor_name:     string | null
  lease_unit:      string | null
}

interface CountRow extends Record<string, unknown> { total: string }

/**
 * POST /api/documents — Save document metadata after S3 upload
 */
export async function POST(request: NextRequest) {
  const session = await auth()
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const body = await request.json()
  const {
    name, documentType, category, description,
    organizationId, tenantId, leaseId, vendorId, propertyId,
    fileKey, fileUrl, mimeType, fileSize, tags,
  } = body

  // Fall back to session organizationId if not provided in body
  const resolvedOrgId = organizationId || session.user.organizationId

  if (!name || !documentType || !category || !fileKey || !fileUrl || !resolvedOrgId) {
    return NextResponse.json(
      { success: false, error: "name, documentType, category, fileKey, fileUrl are required" },
      { status: 400 },
    )
  }

  try {
    const [inserted] = await serviceDb.execute<InsertedRow>(sql`
      INSERT INTO documents (
        organization_id, tenant_id, lease_id, vendor_id, property_id,
        name, document_type, category, description,
        url, file_key, mime_type, file_size,
        version, is_active, tags,
        uploaded_by, created_at
      ) VALUES (
        ${resolvedOrgId}::uuid,
        ${tenantId ?? null}::uuid,
        ${leaseId ?? null}::uuid,
        ${vendorId ?? null}::uuid,
        ${propertyId ?? null}::uuid,
        ${name},
        ${documentType},
        ${category},
        ${description ?? null},
        ${fileUrl},
        ${fileKey},
        ${mimeType ?? null},
        ${fileSize ?? null},
        1, true,
        ${JSON.stringify(tags ?? [])}::jsonb,
        ${session.user.id}::uuid,
        NOW()
      )
      RETURNING id
    `)

    await logDocumentEvent({
      organizationId: resolvedOrgId,
      documentId: inserted.id,
      action:     "document_upload",
      actorId:    session.user.id,
      details:    { name, documentType, category, fileKey, mimeType, fileSize },
    })

    return NextResponse.json({ success: true, data: { id: inserted.id } }, { status: 201 })
  } catch (error) {
    console.error("Document create error:", error)
    return NextResponse.json(
      { success: false, error: "Failed to save document" },
      { status: 500 },
    )
  }
}

/**
 * GET /api/documents — List documents with filters, search, pagination
 *
 * Query params:
 *   tenantId, propertyId, vendorId, category, documentType, tags, search
 *   page (default 1), limit (default 20, max 100)
 */
export async function GET(request: NextRequest) {
  const session = await auth()
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const { searchParams } = request.nextUrl
  const tenantId       = searchParams.get("tenantId")
  const propertyId     = searchParams.get("propertyId")
  const vendorId       = searchParams.get("vendorId")
  const category       = searchParams.get("category")
  const documentType   = searchParams.get("documentType")
  const tagsParam      = searchParams.get("tags")
  const search         = searchParams.get("search")

  const page   = Math.max(1, parseInt(searchParams.get("page") ?? "1", 10) || 1)
  const limit  = Math.min(100, Math.max(1, parseInt(searchParams.get("limit") ?? "20", 10) || 20))
  const offset = (page - 1) * limit

  const tenantFilter   = tenantId     ? sql`AND d.tenant_id = ${tenantId}::uuid`         : sql``
  const propertyFilter = propertyId   ? sql`AND d.property_id = ${propertyId}::uuid`     : sql``
  const vendorFilter   = vendorId     ? sql`AND d.vendor_id = ${vendorId}::uuid`         : sql``
  const categoryFilter = category     ? sql`AND d.category = ${category}`                 : sql``
  const typeFilter     = documentType ? sql`AND d.document_type = ${documentType}`        : sql``
  const searchFilter   = search       ? sql`AND d.name ILIKE ${"%" + search + "%"}`      : sql``
  const tagsFilter     = tagsParam    ? sql`AND d.tags @> ${JSON.stringify(tagsParam.split(","))}::jsonb` : sql``

  const filters = sql`
    d.is_active = true
    ${tenantFilter}
    ${propertyFilter}
    ${vendorFilter}
    ${categoryFilter}
    ${typeFilter}
    ${searchFilter}
    ${tagsFilter}
  `

  try {
    const [countRow] = await serviceDb.execute<CountRow>(sql`
      SELECT COUNT(*) AS total FROM documents d WHERE ${filters}
    `)
    const total = parseInt(countRow?.total ?? "0", 10)

    const rows = await serviceDb.execute<DocRow>(sql`
      SELECT
        d.id, d.name, d.document_type, d.category, d.description,
        d.url AS file_url, d.file_key, d.mime_type,
        d.file_size::text AS file_size,
        d.version::text AS version,
        d.is_active::text AS is_active,
        d.tags, d.uploaded_by, d.created_at,
        t.business_name AS tenant_name,
        p.name          AS property_name,
        v.name          AS vendor_name,
        l.unit_number   AS lease_unit
      FROM documents d
      LEFT JOIN tenants    t ON t.id = d.tenant_id
      LEFT JOIN properties p ON p.id = d.property_id
      LEFT JOIN vendors    v ON v.id = d.vendor_id
      LEFT JOIN leases     l ON l.id = d.lease_id
      WHERE ${filters}
      ORDER BY d.created_at DESC
      LIMIT ${limit} OFFSET ${offset}
    `)

    const documents = (Array.isArray(rows) ? rows : []).map((r) => ({
      id:           r.id,
      name:         r.name,
      documentType: r.document_type,
      category:     r.category,
      description:  r.description,
      fileUrl:      r.file_url,
      fileKey:      r.file_key,
      mimeType:     r.mime_type,
      fileSize:     r.file_size ? parseInt(r.file_size, 10) : null,
      version:      parseInt(r.version, 10),
      tags:         r.tags,
      uploadedBy:   r.uploaded_by,
      createdAt:    r.created_at,
      tenantName:   r.tenant_name,
      propertyName: r.property_name,
      vendorName:   r.vendor_name,
      leaseUnit:    r.lease_unit,
    }))

    return NextResponse.json({
      success: true,
      data: {
        documents,
        pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
      },
    })
  } catch (error) {
    console.error("Document list error:", error)
    return NextResponse.json(
      { success: false, error: "Failed to fetch documents" },
      { status: 500 },
    )
  }
}
