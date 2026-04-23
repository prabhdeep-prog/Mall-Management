/**
 * AWS S3 Storage Utility
 * ─────────────────────────────────────────────────────────────────────────────
 * Generates presigned PUT/GET URLs for direct browser uploads and secure
 * downloads.  All files are stored under a per-org prefix for isolation.
 *
 * Environment variables:
 *   AWS_S3_BUCKET          — bucket name
 *   AWS_S3_REGION          — e.g. ap-south-1
 *   AWS_ACCESS_KEY_ID      — IAM credentials
 *   AWS_SECRET_ACCESS_KEY  — IAM credentials
 */

import { S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectCommand } from "@aws-sdk/client-s3"
import { getSignedUrl } from "@aws-sdk/s3-request-presigner"
import { randomUUID } from "crypto"

// ── Client ───────────────────────────────────────────────────────────────────

const BUCKET = process.env.AWS_S3_BUCKET ?? ""
const REGION = process.env.AWS_S3_REGION ?? "ap-south-1"

let _client: S3Client | null = null

function getClient(): S3Client {
  if (!_client) {
    _client = new S3Client({
      region: REGION,
      credentials: {
        accessKeyId:     process.env.AWS_ACCESS_KEY_ID ?? "",
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY ?? "",
      },
    })
  }
  return _client
}

// ── Configuration ────────────────────────────────────────────────────────────

const MAX_FILE_SIZE = 20 * 1024 * 1024 // 20 MB

const ALLOWED_MIME_TYPES = new Set([
  "application/pdf",
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "text/csv",
  "text/plain",
])

const BLOCKED_EXTENSIONS = new Set([
  ".exe", ".bat", ".cmd", ".sh", ".ps1", ".msi", ".dll", ".com", ".scr",
  ".vbs", ".js", ".jsx", ".ts", ".tsx", ".jar", ".py", ".rb", ".php", ".phtml",
  ".html", ".htm", ".svg", ".xml",
  ".zip", ".tar", ".gz", ".rar", ".7z", ".bz2",
  ".app", ".deb", ".dmg", ".rpm", ".apk", ".phar", ".asp", ".aspx",
])

// ── Validation ───────────────────────────────────────────────────────────────

export function validateUpload(filename: string, contentType: string, fileSize?: number): string | null {
  const ext = filename.substring(filename.lastIndexOf(".")).toLowerCase()

  if (BLOCKED_EXTENSIONS.has(ext)) {
    return `File type ${ext} is not allowed`
  }

  if (!ALLOWED_MIME_TYPES.has(contentType)) {
    return `Content type ${contentType} is not allowed`
  }

  if (fileSize != null && fileSize > MAX_FILE_SIZE) {
    return `File size exceeds maximum of ${MAX_FILE_SIZE / (1024 * 1024)}MB`
  }

  return null
}

/** Strip unsafe characters from filename, keeping extension. */
export function sanitizeFilename(filename: string): string {
  return filename
    .replace(/[^a-zA-Z0-9._-]/g, "_")
    .replace(/_{2,}/g, "_")
    .substring(0, 255)
}

// ── Key generation ───────────────────────────────────────────────────────────

/**
 * Generates a unique S3 key scoped to an organization.
 * Format: documents/{orgId}/{yyyy}/{uuid}/{sanitized-filename}
 */
export function generateFileKey(organizationId: string, filename: string): string {
  const year  = new Date().getUTCFullYear()
  const id    = randomUUID()
  const safe  = sanitizeFilename(filename)
  return `documents/${organizationId}/${year}/${id}/${safe}`
}

// ── Presigned URLs ───────────────────────────────────────────────────────────

/** Generate a presigned PUT URL for direct browser upload (5 min expiry). */
export async function createPresignedUploadUrl(
  fileKey:     string,
  contentType: string,
): Promise<{ uploadUrl: string; fileKey: string; publicUrl: string }> {
  const client  = getClient()
  const command = new PutObjectCommand({
    Bucket:      BUCKET,
    Key:         fileKey,
    ContentType: contentType,
  })

  const uploadUrl = await getSignedUrl(client, command, { expiresIn: 300 })
  const publicUrl = `https://${BUCKET}.s3.${REGION}.amazonaws.com/${fileKey}`

  return { uploadUrl, fileKey, publicUrl }
}

/** Generate a presigned GET URL for secure download (1 hour expiry). */
export async function createPresignedDownloadUrl(
  fileKey:  string,
  filename: string,
): Promise<string> {
  const client  = getClient()
  const command = new GetObjectCommand({
    Bucket:                     BUCKET,
    Key:                        fileKey,
    ResponseContentDisposition: `attachment; filename="${sanitizeFilename(filename)}"`,
  })

  return getSignedUrl(client, command, { expiresIn: 3600 })
}

/** Delete an object from S3 (best-effort). */
export async function deleteS3Object(fileKey: string): Promise<void> {
  const client = getClient()
  await client.send(new DeleteObjectCommand({ Bucket: BUCKET, Key: fileKey }))
}
