-- ============================================================
-- Migration 014: Notification Templates
-- ============================================================
-- Reusable notification templates with variable interpolation
-- for email, WhatsApp, and SMS channels.
-- ============================================================

BEGIN;

CREATE TABLE IF NOT EXISTS notification_templates (
  id               UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id  UUID          NOT NULL REFERENCES organizations(id),
  name             TEXT          NOT NULL,
  channel          TEXT          NOT NULL,  -- email, whatsapp, sms
  event_type       TEXT          NOT NULL,  -- invoice_created, payment_due, lease_expiry, cam_generated
  subject          TEXT,                    -- email subject (null for sms/whatsapp)
  body             TEXT          NOT NULL,
  is_active        BOOLEAN       NOT NULL DEFAULT true,
  created_by       UUID,
  created_at       TIMESTAMPTZ   NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_notif_tpl_org        ON notification_templates(organization_id);
CREATE INDEX IF NOT EXISTS idx_notif_tpl_event_type ON notification_templates(event_type);
CREATE INDEX IF NOT EXISTS idx_notif_tpl_channel    ON notification_templates(channel);

-- Grants
GRANT SELECT, INSERT, UPDATE, DELETE ON notification_templates TO app_user;
GRANT SELECT, INSERT, UPDATE, DELETE ON notification_templates TO app_service;

-- Enable RLS
ALTER TABLE notification_templates ENABLE ROW LEVEL SECURITY;

-- Organization isolation
CREATE POLICY notif_tpl_org_isolation ON notification_templates
  FOR ALL
  USING (organization_id = current_setting('app.current_organization_id')::uuid)
  WITH CHECK (organization_id = current_setting('app.current_organization_id')::uuid);

-- ─── Default seed templates (org_id must be set per-org at deploy time) ─────
-- These are provided as reference; actual seeding happens in application code.

COMMIT;
