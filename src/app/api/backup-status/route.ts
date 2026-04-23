/**
 * GET /api/backup-status
 * ──────────────────────
 * Returns the last backup timestamp and metadata by reading the status
 * file that backup-db.sh writes to S3 after each successful (or failed) run.
 *
 * Healthy condition: status=success AND last backup is < 26 hours old.
 * (26 h gives one hour of slack around the 24 h cron interval)
 */

import { NextResponse } from "next/server"
import { S3Client, GetObjectCommand, NoSuchKey } from "@aws-sdk/client-s3"
import { logger } from "@/lib/logger"

export const dynamic  = "force-dynamic"
export const revalidate = 0

const BACKUP_BUCKET = process.env.BACKUP_S3_BUCKET ?? "mallos-backups"
const STATUS_KEY    = "db/status/latest.json"
const STALE_HOURS   = 26  // alert threshold

interface BackupStatus {
  timestamp:  string
  backup_key: string
  size_bytes: number
  types:      string[]
  status:     "success" | "failed"
  error?:     string
}

function makeS3Client() {
  return new S3Client({
    region: process.env.AWS_S3_REGION ?? "ap-south-1",
    credentials: {
      accessKeyId:     process.env.AWS_ACCESS_KEY_ID     ?? "",
      secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY ?? "",
    },
  })
}

export async function GET() {
  if (!process.env.AWS_ACCESS_KEY_ID || !process.env.AWS_SECRET_ACCESS_KEY) {
    return NextResponse.json(
      { healthy: false, message: "AWS credentials not configured" },
      { status: 503 },
    )
  }

  const s3 = makeS3Client()

  let raw: string
  try {
    const res = await s3.send(new GetObjectCommand({
      Bucket: BACKUP_BUCKET,
      Key:    STATUS_KEY,
    }))
    raw = (await res.Body?.transformToString()) ?? ""
  } catch (err) {
    if (err instanceof NoSuchKey) {
      // Backup has never run — not yet an error, but not healthy
      return NextResponse.json({
        lastBackupAt: null,
        backupStatus: "never",
        healthy:      false,
        message:      "No backup status file found — backup has not run yet",
      })
    }

    logger.error("backup-status: failed to fetch status from S3", {
      bucket: BACKUP_BUCKET,
      key:    STATUS_KEY,
      error:  err,
    })

    return NextResponse.json(
      {
        lastBackupAt: null,
        backupStatus: "error",
        healthy:      false,
        message:      err instanceof Error ? err.message : "Failed to read backup status",
      },
      { status: 503 },
    )
  }

  let status: BackupStatus
  try {
    status = JSON.parse(raw) as BackupStatus
  } catch {
    return NextResponse.json(
      { healthy: false, message: "Malformed status file" },
      { status: 503 },
    )
  }

  const lastBackupAt  = new Date(status.timestamp)
  const ageMs         = Date.now() - lastBackupAt.getTime()
  const ageHours      = ageMs / 3_600_000
  const isRecent      = ageHours < STALE_HOURS
  const healthy       = status.status === "success" && isRecent

  if (!healthy) {
    logger.error("backup-status: backup is unhealthy", {
      backupStatus: status.status,
      ageHours:     Math.round(ageHours * 10) / 10,
      lastBackupAt: status.timestamp,
    })
  }

  return NextResponse.json({
    lastBackupAt:  status.timestamp,
    backupKey:     status.backup_key,
    sizeBytes:     status.size_bytes,
    types:         status.types,
    backupStatus:  status.status,
    errorDetail:   status.error ?? null,
    ageHours:      Math.round(ageHours * 10) / 10,
    staleThresholdHours: STALE_HOURS,
    healthy,
  })
}
