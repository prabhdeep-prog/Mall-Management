import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import {
  validateUpload,
  generateFileKey,
  createPresignedUploadUrl,
} from "@/lib/storage/s3"

/**
 * POST /api/documents/presign
 *
 * Body: { filename, contentType, organizationId }
 *
 * Returns: { uploadUrl, fileKey, publicUrl }
 */
export async function POST(request: NextRequest) {
  const session = await auth()
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const body = await request.json()
  const { filename, contentType, organizationId } = body

  if (!filename || !contentType || !organizationId) {
    return NextResponse.json(
      { success: false, error: "filename, contentType, and organizationId are required" },
      { status: 400 },
    )
  }

  const validationError = validateUpload(filename, contentType)
  if (validationError) {
    return NextResponse.json({ success: false, error: validationError }, { status: 400 })
  }

  try {
    const fileKey = generateFileKey(organizationId, filename)
    const result  = await createPresignedUploadUrl(fileKey, contentType)

    return NextResponse.json({ success: true, data: result })
  } catch (error) {
    console.error("Presign error:", error)
    return NextResponse.json(
      { success: false, error: "Failed to generate upload URL" },
      { status: 500 },
    )
  }
}
