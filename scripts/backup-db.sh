#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# backup-db.sh — Automated PostgreSQL backup with S3 upload & retention
# ─────────────────────────────────────────────────────────────────────────────
#
# Schedule via cron (runs at 02:00 UTC daily):
#   0 2 * * * /path/to/scripts/backup-db.sh >> /var/log/mallos-backup.log 2>&1
#
# Required environment variables:
#   DATABASE_URL        — PostgreSQL connection string
#   AWS_ACCESS_KEY_ID   — AWS credentials with s3:PutObject, s3:DeleteObject, s3:ListBucket
#   AWS_SECRET_ACCESS_KEY
#
# Optional:
#   BACKUP_S3_BUCKET    — defaults to "mallos-backups"
#   AWS_DEFAULT_REGION  — defaults to "ap-south-1"
#   ALERT_WEBHOOK_URL   — POST a JSON payload here on failure (optional)
# ─────────────────────────────────────────────────────────────────────────────
set -euo pipefail

# ── Load .env.local if running locally ───────────────────────────────────────
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ENV_FILE="${SCRIPT_DIR}/../.env.local"
if [[ -f "$ENV_FILE" ]]; then
  set -a
  # shellcheck disable=SC1090
  source "$ENV_FILE"
  set +a
fi

# ── Validate required vars ────────────────────────────────────────────────────
: "${DATABASE_URL:?DATABASE_URL is required}"
: "${AWS_ACCESS_KEY_ID:?AWS_ACCESS_KEY_ID is required}"
: "${AWS_SECRET_ACCESS_KEY:?AWS_SECRET_ACCESS_KEY is required}"

BACKUP_BUCKET="${BACKUP_S3_BUCKET:-mallos-backups}"
export AWS_DEFAULT_REGION="${AWS_DEFAULT_REGION:-ap-south-1}"

# ── Timestamps ────────────────────────────────────────────────────────────────
TIMESTAMP=$(date -u +%F-%H%M)          # e.g. 2024-01-15-0200
DAY_OF_WEEK=$(date -u +%u)             # 1=Mon … 7=Sun
DAY_OF_MONTH=$(date -u +%-d)           # 1-31 (no leading zero)
NOW_ISO=$(date -u +%FT%TZ)
NOW_EPOCH=$(date -u +%s)

BACKUP_FILE="/tmp/mallos-backup-${TIMESTAMP}.dump"

# ── Retention limits ──────────────────────────────────────────────────────────
# daily:   7 days   = 604800 s
# weekly:  4 weeks  = 2419200 s
# monthly: 6 months = 15897600 s
declare -A RETENTION=([daily]=604800 [weekly]=2419200 [monthly]=15897600)

# ── Logging ───────────────────────────────────────────────────────────────────
log_info()  { echo "${NOW_ISO} [INFO]  backup-db: $*"; }
log_error() { echo "${NOW_ISO} [ERROR] backup-db: $*" >&2; }

# ── Cleanup on exit ───────────────────────────────────────────────────────────
cleanup() { rm -f "$BACKUP_FILE"; }
trap cleanup EXIT

# ── Failure handler ───────────────────────────────────────────────────────────
fail() {
  local msg="$1"
  log_error "$msg"

  # Write failure status to S3 so /api/backup-status reflects it
  local payload
  payload=$(printf '{"timestamp":"%s","status":"failed","error":"%s"}' "$NOW_ISO" "$msg")
  echo "$payload" | aws s3 cp - \
    "s3://${BACKUP_BUCKET}/db/status/latest.json" \
    --content-type application/json 2>/dev/null || true

  # Optional alert webhook (e.g. PagerDuty, Slack incoming webhook)
  if [[ -n "${ALERT_WEBHOOK_URL:-}" ]]; then
    curl -sf -X POST "$ALERT_WEBHOOK_URL" \
      -H "Content-Type: application/json" \
      -d "{\"text\":\"[mallos] Backup FAILED at ${NOW_ISO}: ${msg}\"}" \
      || true
  fi

  exit 1
}

# ─────────────────────────────────────────────────────────────────────────────
# Step 1: pg_dump
# ─────────────────────────────────────────────────────────────────────────────
log_info "Starting pg_dump → ${BACKUP_FILE}"
if ! pg_dump --format=custom --no-password "$DATABASE_URL" > "$BACKUP_FILE"; then
  fail "pg_dump exited with a non-zero status"
fi

BACKUP_SIZE=$(wc -c < "$BACKUP_FILE" | tr -d ' ')
log_info "Dump complete — ${BACKUP_SIZE} bytes"

# ─────────────────────────────────────────────────────────────────────────────
# Step 2: Determine backup tier(s)
# Always upload as daily. Also weekly (Sunday) and monthly (1st of month).
# ─────────────────────────────────────────────────────────────────────────────
BACKUP_TYPES=("daily")
[[ "$DAY_OF_WEEK"   == "7" ]] && BACKUP_TYPES+=("weekly")
[[ "$DAY_OF_MONTH"  == "1" ]] && BACKUP_TYPES+=("monthly")

PRIMARY_KEY=""
for TYPE in "${BACKUP_TYPES[@]}"; do
  S3_KEY="db/${TYPE}/backup-${TIMESTAMP}.dump"
  log_info "Uploading → s3://${BACKUP_BUCKET}/${S3_KEY}"
  if ! aws s3 cp "$BACKUP_FILE" "s3://${BACKUP_BUCKET}/${S3_KEY}" \
      --storage-class STANDARD_IA; then
    fail "S3 upload failed for tier=${TYPE}"
  fi
  [[ -z "$PRIMARY_KEY" ]] && PRIMARY_KEY="$S3_KEY"
done

# ─────────────────────────────────────────────────────────────────────────────
# Step 3: Write status file for /api/backup-status health endpoint
# ─────────────────────────────────────────────────────────────────────────────
TYPES_JSON=$(printf '"%s",' "${BACKUP_TYPES[@]}")
TYPES_JSON="[${TYPES_JSON%,}]"

STATUS_JSON=$(printf \
  '{"timestamp":"%s","backup_key":"%s","size_bytes":%s,"types":%s,"status":"success"}' \
  "$NOW_ISO" "$PRIMARY_KEY" "$BACKUP_SIZE" "$TYPES_JSON")

echo "$STATUS_JSON" | aws s3 cp - \
  "s3://${BACKUP_BUCKET}/db/status/latest.json" \
  --content-type application/json \
  || fail "Failed to write status file to S3"

log_info "Status written → s3://${BACKUP_BUCKET}/db/status/latest.json"

# ─────────────────────────────────────────────────────────────────────────────
# Step 4: Retention cleanup
# ─────────────────────────────────────────────────────────────────────────────
for TYPE in daily weekly monthly; do
  MAX_AGE="${RETENTION[$TYPE]}"
  log_info "Retention check: ${TYPE} (max ${MAX_AGE}s)"

  while IFS= read -r line; do
    # aws s3 ls format: "2024-01-08 02:00:12       123456 backup-2024-01-08-0200.dump"
    FILE_DATE_STR=$(echo "$line" | awk '{print $1, $2}')
    FILE_NAME=$(echo "$line" | awk '{print $4}')
    [[ -z "$FILE_NAME" ]] && continue

    # Parse file date — handles both GNU (Linux) and BSD (macOS) date
    if date --version &>/dev/null 2>&1; then
      # GNU date (Linux)
      FILE_EPOCH=$(date -u -d "$FILE_DATE_STR" +%s 2>/dev/null || echo 0)
    else
      # BSD date (macOS)
      FILE_EPOCH=$(date -u -j -f "%Y-%m-%d %H:%M:%S" "$FILE_DATE_STR" +%s 2>/dev/null || echo 0)
    fi

    AGE=$(( NOW_EPOCH - FILE_EPOCH ))
    if (( AGE > MAX_AGE )); then
      log_info "Deleting expired ${TYPE} backup: ${FILE_NAME} (age ${AGE}s > ${MAX_AGE}s)"
      aws s3 rm "s3://${BACKUP_BUCKET}/db/${TYPE}/${FILE_NAME}" || true
    fi
  done < <(aws s3 ls "s3://${BACKUP_BUCKET}/db/${TYPE}/" 2>/dev/null || true)
done

log_info "Backup finished successfully ✓"
