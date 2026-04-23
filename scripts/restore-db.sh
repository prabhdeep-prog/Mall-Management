#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# restore-db.sh — Restore PostgreSQL from a backup dump file
# ─────────────────────────────────────────────────────────────────────────────
#
# Usage:
#   ./scripts/restore-db.sh                                      # uses latest from S3
#   ./scripts/restore-db.sh db/daily/backup-2024-01-15-0200.dump # S3 key
#   ./scripts/restore-db.sh s3://mallos-backups/db/daily/...     # full S3 URI
#   ./scripts/restore-db.sh /tmp/backup-2024-01-15-0200.dump     # local file
#
# ⚠️  This script DROPS and recreates the target database.
#     All existing data is permanently destroyed.
# ─────────────────────────────────────────────────────────────────────────────
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ENV_FILE="${SCRIPT_DIR}/../.env.local"
if [[ -f "$ENV_FILE" ]]; then
  set -a
  # shellcheck disable=SC1090
  source "$ENV_FILE"
  set +a
fi

: "${DATABASE_URL:?DATABASE_URL is required}"

BACKUP_BUCKET="${BACKUP_S3_BUCKET:-mallos-backups}"
export AWS_DEFAULT_REGION="${AWS_DEFAULT_REGION:-ap-south-1}"

# ── Parse DATABASE_URL ────────────────────────────────────────────────────────
# Format: postgresql://user:pass@host:port/dbname?params
# or:     postgres://user:pass@host/dbname
strip_scheme() { echo "${1#*://}"; }
STRIPPED=$(strip_scheme "$DATABASE_URL")
DB_USER="${STRIPPED%%:*}"
AFTER_USER="${STRIPPED#*:}"
DB_PASS="${AFTER_USER%%@*}"
AFTER_PASS="${AFTER_USER#*@}"
DB_HOST="${AFTER_PASS%%:*}"
AFTER_HOST="${AFTER_PASS#*:}"
DB_PORT="${AFTER_HOST%%/*}"
[[ "$DB_PORT" =~ ^[0-9]+$ ]] || DB_PORT="5432"
AFTER_PORT="${AFTER_HOST#*/}"
DB_NAME="${AFTER_PORT%%\?*}"

# Admin URL connects to postgres db to run DROP/CREATE
ADMIN_URL=$(echo "$DATABASE_URL" | sed -E "s|/${DB_NAME}([?].*)?$|/postgres|")

LOCAL_DUMP="/tmp/mallos-restore-$$.dump"
DOWNLOADED=false

# ── Logging ───────────────────────────────────────────────────────────────────
log_info()  { echo "$(date -u +%FT%TZ) [INFO]  restore-db: $*"; }
log_error() { echo "$(date -u +%FT%TZ) [ERROR] restore-db: $*" >&2; }

cleanup() {
  if [[ "$DOWNLOADED" == true ]]; then
    rm -f "$LOCAL_DUMP"
    log_info "Cleaned up temporary file"
  fi
}
trap cleanup EXIT

# ─────────────────────────────────────────────────────────────────────────────
# Step 1: Resolve source
# ─────────────────────────────────────────────────────────────────────────────
SOURCE="${1:-}"

if [[ -z "$SOURCE" ]]; then
  log_info "No source specified — fetching latest backup key from status file"
  STATUS=$(aws s3 cp "s3://${BACKUP_BUCKET}/db/status/latest.json" - 2>/dev/null) || {
    log_error "Could not read s3://${BACKUP_BUCKET}/db/status/latest.json"
    log_error "Run backup-db.sh first or specify a backup file explicitly"
    exit 1
  }
  # Extract backup_key from JSON without jq dependency
  SOURCE=$(echo "$STATUS" | grep -o '"backup_key":"[^"]*"' | cut -d'"' -f4)
  if [[ -z "$SOURCE" ]]; then
    log_error "status/latest.json does not contain a backup_key (last backup may have failed)"
    exit 1
  fi
  log_info "Latest backup: ${SOURCE}"
fi

if [[ "$SOURCE" == s3://* ]]; then
  # Full S3 URI provided
  log_info "Downloading ${SOURCE}"
  aws s3 cp "$SOURCE" "$LOCAL_DUMP"
  DOWNLOADED=true
elif [[ "$SOURCE" == /* || "$SOURCE" == ./* ]]; then
  # Local filesystem path
  LOCAL_DUMP="$SOURCE"
  log_info "Using local file: ${LOCAL_DUMP}"
else
  # Treat as S3 key relative to bucket
  S3_URI="s3://${BACKUP_BUCKET}/${SOURCE}"
  log_info "Downloading ${S3_URI}"
  aws s3 cp "$S3_URI" "$LOCAL_DUMP"
  DOWNLOADED=true
fi

[[ -f "$LOCAL_DUMP" ]] || { log_error "Dump file not found: ${LOCAL_DUMP}"; exit 1; }

DUMP_SIZE=$(wc -c < "$LOCAL_DUMP" | tr -d ' ')
log_info "Dump file ready — ${DUMP_SIZE} bytes"

# ─────────────────────────────────────────────────────────────────────────────
# Step 2: Safety confirmation
# ─────────────────────────────────────────────────────────────────────────────
echo ""
echo "  ⚠️  WARNING"
echo "  ─────────────────────────────────────────────────────────"
echo "  This will DROP the database '${DB_NAME}' on host '${DB_HOST}'"
echo "  and restore from: ${SOURCE}"
echo ""
echo "  ALL EXISTING DATA WILL BE PERMANENTLY DESTROYED."
echo "  ─────────────────────────────────────────────────────────"
echo ""
read -rp "  Type 'yes-destroy-data' to proceed: " CONFIRM
echo ""

if [[ "$CONFIRM" != "yes-destroy-data" ]]; then
  log_info "Restore cancelled — no changes made"
  exit 0
fi

# ─────────────────────────────────────────────────────────────────────────────
# Step 3: Terminate active connections
# ─────────────────────────────────────────────────────────────────────────────
log_info "Terminating active connections to '${DB_NAME}'"
PGPASSWORD="$DB_PASS" psql "$ADMIN_URL" -c \
  "SELECT pg_terminate_backend(pid)
   FROM pg_stat_activity
   WHERE datname = '${DB_NAME}'
     AND pid <> pg_backend_pid();" \
  || true

# ─────────────────────────────────────────────────────────────────────────────
# Step 4: Drop and recreate database
# ─────────────────────────────────────────────────────────────────────────────
log_info "Dropping database '${DB_NAME}'"
PGPASSWORD="$DB_PASS" dropdb \
  --host="$DB_HOST" --port="$DB_PORT" --username="$DB_USER" \
  --if-exists "$DB_NAME"

log_info "Creating database '${DB_NAME}'"
PGPASSWORD="$DB_PASS" createdb \
  --host="$DB_HOST" --port="$DB_PORT" --username="$DB_USER" \
  "$DB_NAME"

# ─────────────────────────────────────────────────────────────────────────────
# Step 5: pg_restore
# ─────────────────────────────────────────────────────────────────────────────
log_info "Restoring into '${DB_NAME}' (this may take a while)"
PGPASSWORD="$DB_PASS" pg_restore \
  --clean \
  --if-exists \
  --no-acl \
  --no-owner \
  --exit-on-error \
  --host="$DB_HOST" \
  --port="$DB_PORT" \
  --username="$DB_USER" \
  --dbname="$DB_NAME" \
  "$LOCAL_DUMP"

log_info "Restore complete ✓  Database '${DB_NAME}' is ready"
