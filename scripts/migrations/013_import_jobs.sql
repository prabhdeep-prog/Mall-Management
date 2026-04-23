-- ============================================================
-- Migration 013: Bulk CSV Import Jobs
-- ============================================================
-- Tracks bulk CSV import operations with progress and error log.
-- ============================================================

BEGIN;

CREATE TABLE IF NOT EXISTS import_jobs (
  id               UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id  UUID          NOT NULL REFERENCES organizations(id),
  type             TEXT          NOT NULL,  -- tenants, leases, vendors, sales
  file_name        TEXT          NOT NULL,
  status           TEXT          NOT NULL DEFAULT 'pending',  -- pending, processing, completed, failed
  total_rows       INTEGER       NOT NULL DEFAULT 0,
  processed_rows   INTEGER       NOT NULL DEFAULT 0,
  error_rows       INTEGER       NOT NULL DEFAULT 0,
  error_log        JSONB         NOT NULL DEFAULT '[]',
  created_by       UUID,
  created_at       TIMESTAMPTZ   NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_import_jobs_org    ON import_jobs(organization_id);
CREATE INDEX IF NOT EXISTS idx_import_jobs_status ON import_jobs(status);

-- Grants
GRANT SELECT, INSERT, UPDATE ON import_jobs TO app_user;
GRANT SELECT, INSERT, UPDATE ON import_jobs TO app_service;

-- Enable RLS
ALTER TABLE import_jobs ENABLE ROW LEVEL SECURITY;

-- Organization isolation
CREATE POLICY import_jobs_org_isolation ON import_jobs
  FOR ALL
  USING (organization_id = current_setting('app.current_organization_id')::uuid)
  WITH CHECK (organization_id = current_setting('app.current_organization_id')::uuid);

COMMIT;
