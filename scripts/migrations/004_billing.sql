-- ============================================================================
-- Migration 004: Subscription & Billing Infrastructure
-- ============================================================================
-- Tables
-- ──────
--   billing_plans       Plan catalogue (Starter / Growth / Enterprise)
--   subscriptions       One per org; tracks lifecycle & provider IDs
--   billing_events      Append-only webhook event log (idempotency source)
--   dunning_attempts    Payment-failure retry schedule
--   mrr_snapshots       Daily MRR rollups for the admin dashboard
--
-- RLS notes
-- ──────────
--   billing_plans    → global (no RLS); any authenticated user can read
--   subscriptions    → org-scoped; USING organization_id
--   billing_events   → platform table; only app_service can write
--   dunning_attempts → org-scoped via subscription FK
--   mrr_snapshots    → platform; only app_admin / app_auditor can read
-- ============================================================================

-- ── 1. billing_plans ─────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS billing_plans (
  id                 UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  slug               VARCHAR(50)  UNIQUE NOT NULL,  -- 'starter' | 'growth' | 'enterprise'
  name               VARCHAR(100) NOT NULL,
  description        TEXT,

  -- Pricing (stored in smallest currency unit: paise for INR, cents for USD)
  currency           CHAR(3)      NOT NULL DEFAULT 'INR',
  amount_monthly     INTEGER      NOT NULL,           -- 0 = free / POA
  amount_yearly      INTEGER,                         -- NULL = no yearly option

  -- Limits (NULL = unlimited)
  max_properties     INTEGER,
  max_tenants        INTEGER,
  max_users          INTEGER,

  features           JSONB        NOT NULL DEFAULT '[]',
  is_active          BOOLEAN      NOT NULL DEFAULT true,
  is_public          BOOLEAN      NOT NULL DEFAULT true,   -- false = enterprise (contact sales)
  sort_order         SMALLINT     NOT NULL DEFAULT 0,

  -- Provider plan/price IDs (populated after creating plans in each provider)
  razorpay_plan_id_monthly  VARCHAR(100),
  razorpay_plan_id_yearly   VARCHAR(100),
  stripe_price_id_monthly   VARCHAR(100),
  stripe_price_id_yearly    VARCHAR(100),

  created_at         TIMESTAMPTZ  NOT NULL DEFAULT now(),
  updated_at         TIMESTAMPTZ  NOT NULL DEFAULT now()
);

-- ── Seed plans ────────────────────────────────────────────────────────────────
INSERT INTO billing_plans
  (slug, name, description, currency, amount_monthly, amount_yearly,
   max_properties, max_tenants, max_users, features, sort_order)
VALUES
  -- Starter: ₹4,999/mo  (₹49,999/yr)
  ('starter', 'Starter', 'Perfect for single-property operators',
   'INR', 499900, 4999900,
   2, 50, 10,
   '["up_to_2_properties","up_to_50_tenants","basic_reports","email_support",
     "work_orders","lease_management","invoice_generation"]'::jsonb,
   1),

  -- Growth: ₹14,999/mo  (₹1,49,999/yr)
  ('growth', 'Growth', 'For multi-property management companies',
   'INR', 1499900, 14999900,
   10, 250, 50,
   '["up_to_10_properties","up_to_250_tenants","advanced_reports","priority_support",
     "ai_agents","pos_integrations","compliance_tracking","custom_roles"]'::jsonb,
   2),

  -- Enterprise: POA
  ('enterprise', 'Enterprise', 'Unlimited scale with custom SLA',
   'INR', 0, NULL,
   NULL, NULL, NULL,
   '["unlimited_properties","unlimited_tenants","dedicated_support","custom_sla",
     "sso","audit_logs","custom_integrations","on_prem_option"]'::jsonb,
   3)

ON CONFLICT (slug) DO NOTHING;

-- ── 2. subscriptions ─────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS subscriptions (
  id                     UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id        UUID         NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  plan_id                UUID         NOT NULL REFERENCES billing_plans(id),

  -- Payment provider
  provider               VARCHAR(20)  NOT NULL DEFAULT 'razorpay',
                                                -- 'razorpay' | 'stripe' | 'manual'
  provider_subscription_id VARCHAR(255),        -- Razorpay sub_xxx / Stripe sub_xxx
  provider_customer_id     VARCHAR(255),        -- Razorpay cust_xxx / Stripe cus_xxx

  -- Lifecycle
  status                 VARCHAR(30)  NOT NULL DEFAULT 'trialing',
  -- 'trialing' | 'active' | 'past_due' | 'paused' | 'cancelled' | 'expired'
  billing_cycle          VARCHAR(10)  NOT NULL DEFAULT 'monthly',  -- 'monthly' | 'yearly'

  -- Dates
  trial_ends_at          TIMESTAMPTZ,
  current_period_start   TIMESTAMPTZ,
  current_period_end     TIMESTAMPTZ,
  cancel_at              TIMESTAMPTZ,           -- scheduled future cancellation
  cancelled_at           TIMESTAMPTZ,           -- when it was actually cancelled

  -- Dunning state (denormalised for fast reads)
  payment_failed_at      TIMESTAMPTZ,
  payment_failure_count  SMALLINT     NOT NULL DEFAULT 0,
  next_retry_at          TIMESTAMPTZ,
  grace_period_ends_at   TIMESTAMPTZ,           -- after this → downgrade

  -- Upgrade/downgrade tracking
  previous_plan_id       UUID REFERENCES billing_plans(id),
  plan_changed_at        TIMESTAMPTZ,

  metadata               JSONB        NOT NULL DEFAULT '{}',
  created_at             TIMESTAMPTZ  NOT NULL DEFAULT now(),
  updated_at             TIMESTAMPTZ  NOT NULL DEFAULT now()
);

-- One ACTIVE subscription per org (cancelled/expired may accumulate as history)
CREATE UNIQUE INDEX uq_org_active_subscription
  ON subscriptions (organization_id)
  WHERE status NOT IN ('cancelled', 'expired');

CREATE INDEX idx_subscriptions_org        ON subscriptions (organization_id);
CREATE INDEX idx_subscriptions_status     ON subscriptions (status);
CREATE INDEX idx_subscriptions_renewal    ON subscriptions (current_period_end)
  WHERE status = 'active';
CREATE INDEX idx_subscriptions_retry      ON subscriptions (next_retry_at)
  WHERE status = 'past_due';

-- ── 3. billing_events ────────────────────────────────────────────────────────
-- Append-only webhook event log.
-- The idempotency_key (= provider event ID) prevents double-processing.
CREATE TABLE IF NOT EXISTS billing_events (
  id               UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  idempotency_key  VARCHAR(255) UNIQUE NOT NULL,  -- provider event ID

  provider         VARCHAR(20)  NOT NULL,
  event_type       VARCHAR(100) NOT NULL,          -- 'subscription.charged', etc.
  payload          JSONB        NOT NULL,           -- full raw webhook body

  -- Resolved foreign keys (may be NULL if resolution fails)
  organization_id  UUID REFERENCES organizations(id),
  subscription_id  UUID REFERENCES subscriptions(id),

  status           VARCHAR(20)  NOT NULL DEFAULT 'pending',
  -- 'pending' | 'processed' | 'failed' | 'skipped'
  error_detail     TEXT,
  processed_at     TIMESTAMPTZ,

  created_at       TIMESTAMPTZ  NOT NULL DEFAULT now()
);

CREATE INDEX idx_billing_events_org    ON billing_events (organization_id);
CREATE INDEX idx_billing_events_status ON billing_events (status, created_at)
  WHERE status = 'pending';

-- ── 4. dunning_attempts ──────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS dunning_attempts (
  id               UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  subscription_id  UUID         NOT NULL REFERENCES subscriptions(id) ON DELETE CASCADE,
  organization_id  UUID         NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,

  attempt_number   SMALLINT     NOT NULL,           -- 1 = first failure, 2, 3 …
  attempt_type     VARCHAR(30)  NOT NULL,
  -- 'email_warning' | 'payment_retry' | 'downgrade' | 'cancellation'

  scheduled_at     TIMESTAMPTZ  NOT NULL,
  executed_at      TIMESTAMPTZ,

  status           VARCHAR(20)  NOT NULL DEFAULT 'scheduled',
  -- 'scheduled' | 'executed' | 'succeeded' | 'failed' | 'cancelled'

  result           JSONB,                           -- response from provider or email
  created_at       TIMESTAMPTZ  NOT NULL DEFAULT now()
);

CREATE INDEX idx_dunning_scheduled ON dunning_attempts (scheduled_at, status)
  WHERE status = 'scheduled';
CREATE INDEX idx_dunning_sub       ON dunning_attempts (subscription_id);

-- ── 5. mrr_snapshots ─────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS mrr_snapshots (
  id                UUID    PRIMARY KEY DEFAULT gen_random_uuid(),
  snapshot_date     DATE    NOT NULL UNIQUE,

  currency          CHAR(3) NOT NULL DEFAULT 'INR',
  mrr_paise         BIGINT  NOT NULL DEFAULT 0,     -- Total MRR in paise
  arr_paise         BIGINT  NOT NULL DEFAULT 0,     -- ARR = MRR × 12

  -- Cohort counts
  active_count      INTEGER NOT NULL DEFAULT 0,
  trialing_count    INTEGER NOT NULL DEFAULT 0,
  new_count         INTEGER NOT NULL DEFAULT 0,     -- new this period
  churned_count     INTEGER NOT NULL DEFAULT 0,     -- churned this period
  upgraded_count    INTEGER NOT NULL DEFAULT 0,
  downgraded_count  INTEGER NOT NULL DEFAULT 0,

  -- Plan breakdown: { starter: { count, mrr }, growth: { count, mrr }, ... }
  plan_breakdown    JSONB   NOT NULL DEFAULT '{}',

  created_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ============================================================================
-- RLS Policies
-- ============================================================================

-- billing_plans: global read; no writes from app_user
ALTER TABLE billing_plans ENABLE ROW LEVEL SECURITY;
ALTER TABLE billing_plans FORCE  ROW LEVEL SECURITY;
CREATE POLICY read_all ON billing_plans
  FOR SELECT TO app_user, app_service, app_admin USING (true);
CREATE POLICY service_write ON billing_plans
  FOR ALL TO app_service USING (true) WITH CHECK (true);

-- subscriptions: org-scoped
ALTER TABLE subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE subscriptions FORCE  ROW LEVEL SECURITY;
CREATE POLICY sel ON subscriptions FOR SELECT TO app_user, app_service, app_admin
  USING (organization_id = app_current_org_id());
CREATE POLICY ins ON subscriptions FOR INSERT TO app_service
  WITH CHECK (organization_id = app_current_org_id());
CREATE POLICY upd ON subscriptions FOR UPDATE TO app_service
  USING      (organization_id = app_current_org_id())
  WITH CHECK (organization_id = app_current_org_id());

-- billing_events: platform audit log — app_service writes, app_admin reads
ALTER TABLE billing_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE billing_events FORCE  ROW LEVEL SECURITY;
CREATE POLICY service_all ON billing_events
  FOR ALL TO app_service USING (true) WITH CHECK (true);
CREATE POLICY admin_read ON billing_events
  FOR SELECT TO app_admin USING (true);

-- dunning_attempts: org-scoped
ALTER TABLE dunning_attempts ENABLE ROW LEVEL SECURITY;
ALTER TABLE dunning_attempts FORCE  ROW LEVEL SECURITY;
CREATE POLICY sel ON dunning_attempts FOR SELECT TO app_service, app_admin
  USING (organization_id = app_current_org_id());
CREATE POLICY ins ON dunning_attempts FOR INSERT TO app_service
  WITH CHECK (organization_id = app_current_org_id());
CREATE POLICY upd ON dunning_attempts FOR UPDATE TO app_service
  USING      (organization_id = app_current_org_id())
  WITH CHECK (organization_id = app_current_org_id());

-- mrr_snapshots: platform; admin + auditor only
ALTER TABLE mrr_snapshots ENABLE ROW LEVEL SECURITY;
ALTER TABLE mrr_snapshots FORCE  ROW LEVEL SECURITY;
CREATE POLICY admin_all ON mrr_snapshots
  FOR ALL TO app_service, app_admin USING (true) WITH CHECK (true);
CREATE POLICY auditor_read ON mrr_snapshots
  FOR SELECT TO app_auditor USING (true);

-- ── Default privileges for new tables ────────────────────────────────────────
GRANT SELECT ON billing_plans   TO app_user;
GRANT ALL    ON billing_plans   TO app_service, app_admin;
GRANT ALL    ON subscriptions   TO app_service;
GRANT SELECT ON subscriptions   TO app_user, app_admin;
GRANT ALL    ON billing_events  TO app_service;
GRANT SELECT ON billing_events  TO app_admin, app_auditor;
GRANT ALL    ON dunning_attempts TO app_service;
GRANT SELECT ON dunning_attempts TO app_admin;
GRANT ALL    ON mrr_snapshots   TO app_service, app_admin;
