import {
  pgTable,
  uuid,
  varchar,
  text,
  timestamp,
  integer,
  smallint,
  decimal,
  boolean,
  jsonb,
  date,
  time,
  char,
  index,
  uniqueIndex,
} from "drizzle-orm/pg-core"
import { relations } from "drizzle-orm"

// ============================================================================
// ORGANIZATIONS & PROPERTIES
// ============================================================================

export const organizations = pgTable("organizations", {
  id: uuid("id").defaultRandom().primaryKey(),
  name: varchar("name", { length: 255 }).notNull(),
  code: varchar("code", { length: 50 }).unique().notNull(),
  type: varchar("type", { length: 50 }).notNull(), // 'corporate', 'property_manager'
  settings: jsonb("settings").default({}),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
})

// ============================================================================
// BILLING
// ============================================================================

export const billingPlans = pgTable("billing_plans", {
  id:                      uuid("id").defaultRandom().primaryKey(),
  slug:                    varchar("slug", { length: 50 }).unique().notNull(),
  name:                    varchar("name", { length: 100 }).notNull(),
  description:             text("description"),
  currency:                char("currency", { length: 3 }).notNull().default("INR"),
  amountMonthly:           integer("amount_monthly").notNull(),
  amountYearly:            integer("amount_yearly"),
  maxProperties:           integer("max_properties"),
  maxTenants:              integer("max_tenants"),
  maxUsers:                integer("max_users"),
  features:                jsonb("features").notNull().default([]),
  isActive:                boolean("is_active").notNull().default(true),
  isPublic:                boolean("is_public").notNull().default(true),
  sortOrder:               smallint("sort_order").notNull().default(0),
  razorpayPlanIdMonthly:   varchar("razorpay_plan_id_monthly", { length: 100 }),
  razorpayPlanIdYearly:    varchar("razorpay_plan_id_yearly",  { length: 100 }),
  stripePriceIdMonthly:    varchar("stripe_price_id_monthly",  { length: 100 }),
  stripePriceIdYearly:     varchar("stripe_price_id_yearly",   { length: 100 }),
  createdAt:               timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt:               timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
})

export const subscriptions = pgTable("subscriptions", {
  id:                    uuid("id").defaultRandom().primaryKey(),
  organizationId:        uuid("organization_id").notNull().references(() => organizations.id, { onDelete: "cascade" }),
  planId:                uuid("plan_id").notNull().references(() => billingPlans.id),
  provider:              varchar("provider", { length: 20 }).notNull().default("razorpay"),
  providerSubscriptionId:varchar("provider_subscription_id", { length: 255 }),
  providerCustomerId:    varchar("provider_customer_id",     { length: 255 }),
  status:                varchar("status", { length: 30 }).notNull().default("trialing"),
  billingCycle:          varchar("billing_cycle", { length: 10 }).notNull().default("monthly"),
  trialEndsAt:           timestamp("trial_ends_at",       { withTimezone: true }),
  currentPeriodStart:    timestamp("current_period_start", { withTimezone: true }),
  currentPeriodEnd:      timestamp("current_period_end",   { withTimezone: true }),
  cancelAt:              timestamp("cancel_at",            { withTimezone: true }),
  cancelledAt:           timestamp("cancelled_at",         { withTimezone: true }),
  paymentFailedAt:       timestamp("payment_failed_at",    { withTimezone: true }),
  paymentFailureCount:   smallint("payment_failure_count").notNull().default(0),
  nextRetryAt:           timestamp("next_retry_at",        { withTimezone: true }),
  gracePeriodEndsAt:     timestamp("grace_period_ends_at", { withTimezone: true }),
  previousPlanId:        uuid("previous_plan_id").references(() => billingPlans.id),
  planChangedAt:         timestamp("plan_changed_at",      { withTimezone: true }),
  metadata:              jsonb("metadata").notNull().default({}),
  createdAt:             timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt:             timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => ({
  orgIdx:    index("idx_subscriptions_org").on(table.organizationId),
  statusIdx: index("idx_subscriptions_status").on(table.status),
}))

export const billingEvents = pgTable("billing_events", {
  id:             uuid("id").defaultRandom().primaryKey(),
  idempotencyKey: varchar("idempotency_key", { length: 255 }).unique().notNull(),
  provider:       varchar("provider",   { length: 20  }).notNull(),
  eventType:      varchar("event_type", { length: 100 }).notNull(),
  payload:        jsonb("payload").notNull().default({}),
  organizationId: uuid("organization_id").references(() => organizations.id),
  subscriptionId: uuid("subscription_id").references(() => subscriptions.id),
  status:         varchar("status", { length: 20 }).notNull().default("pending"),
  errorDetail:    text("error_detail"),
  processedAt:    timestamp("processed_at", { withTimezone: true }),
  createdAt:      timestamp("created_at",   { withTimezone: true }).defaultNow().notNull(),
}, (table) => ({
  orgIdx:    index("idx_billing_events_org").on(table.organizationId),
  statusIdx: index("idx_billing_events_status").on(table.status),
}))

export const dunningAttempts = pgTable("dunning_attempts", {
  id:             uuid("id").defaultRandom().primaryKey(),
  subscriptionId: uuid("subscription_id").notNull().references(() => subscriptions.id, { onDelete: "cascade" }),
  organizationId: uuid("organization_id").notNull().references(() => organizations.id, { onDelete: "cascade" }),
  attemptNumber:  smallint("attempt_number").notNull(),
  attemptType:    varchar("attempt_type", { length: 30 }).notNull(),
  scheduledAt:    timestamp("scheduled_at",  { withTimezone: true }).notNull(),
  executedAt:     timestamp("executed_at",   { withTimezone: true }),
  status:         varchar("status", { length: 20 }).notNull().default("scheduled"),
  result:         jsonb("result"),
  createdAt:      timestamp("created_at",    { withTimezone: true }).defaultNow().notNull(),
}, (table) => ({
  scheduledIdx: index("idx_dunning_scheduled").on(table.scheduledAt, table.status),
}))

export const mrrSnapshots = pgTable("mrr_snapshots", {
  id:              uuid("id").defaultRandom().primaryKey(),
  snapshotDate:    date("snapshot_date").notNull().unique(),
  currency:        char("currency", { length: 3 }).notNull().default("INR"),
  mrrPaise:        integer("mrr_paise").notNull().default(0),
  arrPaise:        integer("arr_paise").notNull().default(0),
  activeCount:     integer("active_count").notNull().default(0),
  trialingCount:   integer("trialing_count").notNull().default(0),
  newCount:        integer("new_count").notNull().default(0),
  churnedCount:    integer("churned_count").notNull().default(0),
  upgradedCount:   integer("upgraded_count").notNull().default(0),
  downgradedCount: integer("downgraded_count").notNull().default(0),
  planBreakdown:   jsonb("plan_breakdown").notNull().default({}),
  createdAt:       timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
})

export const properties = pgTable("properties", {
  id: uuid("id").defaultRandom().primaryKey(),
  organizationId: uuid("organization_id").references(() => organizations.id, { onDelete: "cascade" }),
  name: varchar("name", { length: 255 }).notNull(),
  code: varchar("code", { length: 50 }).unique().notNull(),
  type: varchar("type", { length: 50 }).notNull(), // 'mall', 'office', 'retail'
  address: text("address"),
  city: varchar("city", { length: 100 }),
  state: varchar("state", { length: 100 }),
  country: varchar("country", { length: 100 }).default("India"),
  pincode: varchar("pincode", { length: 20 }),
  totalAreaSqft: decimal("total_area_sqft", { precision: 12, scale: 2 }),
  leasableAreaSqft: decimal("leasable_area_sqft", { precision: 12, scale: 2 }),
  floors: integer("floors"),
  zones: jsonb("zones").default([]), // Array of zone definitions
  operatingHours: jsonb("operating_hours").default({}),
  amenities: jsonb("amenities").default([]),
  status: varchar("status", { length: 50 }).default("active"), // active, under_construction, closed
  metadata: jsonb("metadata").default({}),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => ({
  orgIdx: index("idx_properties_org").on(table.organizationId),
  statusIdx: index("idx_properties_status").on(table.status),
}))

// ============================================================================
// TENANTS & LEASES
// ============================================================================

export const tenants = pgTable("tenants", {
  id: uuid("id").defaultRandom().primaryKey(),
  propertyId: uuid("property_id").references(() => properties.id, { onDelete: "restrict" }),
  businessName: varchar("business_name", { length: 255 }).notNull(),
  legalEntityName: varchar("legal_entity_name", { length: 255 }),
  brandName: varchar("brand_name", { length: 255 }),
  category: varchar("category", { length: 100 }), // 'fashion', 'electronics', 'food', 'entertainment'
  subcategory: varchar("subcategory", { length: 100 }),
  contactPerson: varchar("contact_person", { length: 255 }),
  email: varchar("email", { length: 255 }),
  phone: varchar("phone", { length: 20 }),
  alternatePhone: varchar("alternate_phone", { length: 20 }),
  gstin: varchar("gstin", { length: 20 }),
  pan: varchar("pan", { length: 20 }),
  tradeLicense: varchar("trade_license", { length: 100 }),
  status: varchar("status", { length: 50 }).default("active"), // active, inactive, suspended
  // ── Onboarding lifecycle ────────────────────────────────────────────────────
  onboardingStatus: varchar("onboarding_status", { length: 50 }).default("LEAD_CREATED"),
  // LEAD_CREATED | DOCUMENTS_PENDING | LEASE_PENDING | APPROVAL_PENDING | SETUP_PENDING | GO_LIVE_READY | ACTIVE
  onboardingStartedAt: timestamp("onboarding_started_at"),
  onboardingCompletedAt: timestamp("onboarding_completed_at"),
  targetOpeningDate: date("target_opening_date"),
  emergencyContact: jsonb("emergency_contact").default({}),
  // ── Scoring ─────────────────────────────────────────────────────────────────
  sentimentScore: decimal("sentiment_score", { precision: 3, scale: 2 }), // -1 to 1, calculated by agent
  riskScore: decimal("risk_score", { precision: 3, scale: 2 }), // 0 to 1, payment risk
  satisfactionScore: decimal("satisfaction_score", { precision: 3, scale: 2 }), // 0 to 5, from surveys
  metadata: jsonb("metadata").default({}),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => ({
  propertyIdx: index("idx_tenants_property").on(table.propertyId),
  statusIdx: index("idx_tenants_status").on(table.status),
  onboardingStatusIdx: index("idx_tenants_onboarding_status").on(table.onboardingStatus),
}))

export const tenantSatisfaction = pgTable("tenant_satisfaction", {
  id: uuid("id").defaultRandom().primaryKey(),
  tenantId: uuid("tenant_id").references(() => tenants.id, { onDelete: "cascade" }).notNull(),
  score: integer("score").notNull(), // 0-100
  level: varchar("level", { length: 20 }).notNull(), // high, medium, low
  breakdown: jsonb("breakdown").default({}).notNull(), // { payment, maintenance, complaints, renewal }
  calculatedAt: timestamp("calculated_at").defaultNow().notNull(),
  source: varchar("source", { length: 50 }).default("calculated").notNull(),
}, (table) => ({
  tenantIdx: index("idx_tenant_satisfaction_tenant").on(table.tenantId),
  calculatedAtIdx: index("idx_tenant_satisfaction_calculated_at").on(table.calculatedAt),
}))

export const tenantSentiment = pgTable("tenant_sentiment", {
  id: uuid("id").defaultRandom().primaryKey(),
  tenantId: uuid("tenant_id").references(() => tenants.id, { onDelete: "cascade" }).notNull(),
  sentiment: varchar("sentiment", { length: 20 }).notNull(), // positive, neutral, negative
  score: decimal("score", { precision: 4, scale: 3 }).notNull(), // -1.000 to 1.000
  source: varchar("source", { length: 50 }).notNull(), // email, note, call, chat
  content: text("content"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => ({
  tenantIdx: index("idx_tenant_sentiment_tenant").on(table.tenantId),
  createdAtIdx: index("idx_tenant_sentiment_created_at").on(table.createdAt),
}))

export const leases = pgTable("leases", {
  id: uuid("id").defaultRandom().primaryKey(),
  tenantId: uuid("tenant_id").references(() => tenants.id, { onDelete: "cascade" }),
  propertyId: uuid("property_id").references(() => properties.id, { onDelete: "cascade" }),
  unitNumber: varchar("unit_number", { length: 50 }).notNull(),
  floor: integer("floor"),
  zone: varchar("zone", { length: 100 }),
  areaSqft: decimal("area_sqft", { precision: 10, scale: 2 }).notNull(),
  leaseType: varchar("lease_type", { length: 50 }), // 'fixed_rent', 'revenue_share', 'hybrid'
  baseRent: decimal("base_rent", { precision: 12, scale: 2 }),
  revenueSharePercentage: decimal("revenue_share_percentage", { precision: 5, scale: 2 }),
  camCharges: decimal("cam_charges", { precision: 12, scale: 2 }),
  // MG billing fields (added in migration 005)
  monthlyMg: decimal("monthly_mg", { precision: 14, scale: 2 }).default("0").notNull(),
  camCapPerSqft: decimal("cam_cap_per_sqft", { precision: 10, scale: 4 }),
  revShareBreakpoint: decimal("rev_share_breakpoint", { precision: 14, scale: 2 }),
  securityDeposit: decimal("security_deposit", { precision: 12, scale: 2 }),
  lockInPeriodMonths: integer("lock_in_period_months"),
  noticePeriodMonths: integer("notice_period_months"),
  rentEscalationPercentage: decimal("rent_escalation_percentage", { precision: 5, scale: 2 }),
  escalationFrequencyMonths: integer("escalation_frequency_months"),
  startDate: date("start_date").notNull(),
  endDate: date("end_date").notNull(),
  status: varchar("status", { length: 50 }).default("active"), // draft, active, expired, terminated
  renewalStatus: varchar("renewal_status", { length: 50 }), // null, recommended, not_recommended
  renewalRecommendationReason: text("renewal_recommendation_reason"),
  paymentTerms: jsonb("payment_terms").default({}),
  clauses: jsonb("clauses").default([]),
  documents: jsonb("documents").default([]),
  metadata: jsonb("metadata").default({}),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => ({
  tenantIdx: index("idx_leases_tenant").on(table.tenantId),
  propertyIdx: index("idx_leases_property").on(table.propertyId),
  datesIdx: index("idx_leases_dates").on(table.startDate, table.endDate),
}))

// ============================================================================
// FINANCIAL
// ============================================================================

export const invoices = pgTable("invoices", {
  id: uuid("id").defaultRandom().primaryKey(),
  leaseId: uuid("lease_id").references(() => leases.id, { onDelete: "cascade" }),
  invoiceNumber: varchar("invoice_number", { length: 100 }).unique().notNull(),
  invoiceType: varchar("invoice_type", { length: 50 }), // 'rent', 'cam', 'late_fee', 'other'
  periodStart: date("period_start").notNull(),
  periodEnd: date("period_end").notNull(),
  amount: decimal("amount", { precision: 12, scale: 2 }).notNull(),
  gstAmount: decimal("gst_amount", { precision: 12, scale: 2 }).default("0"),
  totalAmount: decimal("total_amount", { precision: 12, scale: 2 }).notNull(),
  dueDate: date("due_date").notNull(),
  status: varchar("status", { length: 50 }).default("pending"), // pending, paid, overdue, cancelled
  lifecycleStatus: varchar("lifecycle_status", { length: 20 }).default("draft").notNull(), // draft | posted | cancelled
  paidAmount: decimal("paid_amount", { precision: 12, scale: 2 }).default("0"),
  paidDate: date("paid_date"),
  paymentMethod: varchar("payment_method", { length: 50 }),
  paymentReference: varchar("payment_reference", { length: 255 }),
  predictedPaymentDate: date("predicted_payment_date"), // Agent prediction
  predictionConfidence: decimal("prediction_confidence", { precision: 3, scale: 2 }), // 0 to 1
  remindersSent: integer("reminders_sent").default(0),
  lastReminderDate: date("last_reminder_date"),
  notes: text("notes"),
  metadata: jsonb("metadata").default({}),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
  createdBy: uuid("created_by"), // Agent ID or User ID
  updatedBy: uuid("updated_by"),
}, (table) => ({
  leaseIdx: index("idx_invoices_lease").on(table.leaseId),
  statusIdx: index("idx_invoices_status").on(table.status),
  dueDateIdx: index("idx_invoices_due_date").on(table.dueDate),
}))

export const payments = pgTable("payments", {
  id: uuid("id").defaultRandom().primaryKey(),
  invoiceId: uuid("invoice_id").references(() => invoices.id, { onDelete: "cascade" }),
  amount: decimal("amount", { precision: 12, scale: 2 }).notNull(),
  paymentDate: date("payment_date").notNull(),
  paymentMethod: varchar("payment_method", { length: 50 }), // 'cash', 'cheque', 'neft', 'upi'
  referenceNumber: varchar("reference_number", { length: 255 }),
  bankName: varchar("bank_name", { length: 255 }),
  reconciled: boolean("reconciled").default(false),
  reconciledAt: timestamp("reconciled_at"),
  reconciledBy: uuid("reconciled_by"),
  notes: text("notes"),
  metadata: jsonb("metadata").default({}),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => ({
  invoiceIdx: index("idx_payments_invoice").on(table.invoiceId),
}))

export const expenses = pgTable("expenses", {
  id: uuid("id").defaultRandom().primaryKey(),
  propertyId: uuid("property_id").references(() => properties.id, { onDelete: "cascade" }),
  category: varchar("category", { length: 100 }).notNull(), // 'maintenance', 'utilities', 'security', 'marketing'
  subcategory: varchar("subcategory", { length: 100 }),
  vendorId: uuid("vendor_id"), // References vendors table
  amount: decimal("amount", { precision: 12, scale: 2 }).notNull(),
  gstAmount: decimal("gst_amount", { precision: 12, scale: 2 }).default("0"),
  totalAmount: decimal("total_amount", { precision: 12, scale: 2 }).notNull(),
  expenseDate: date("expense_date").notNull(),
  paymentStatus: varchar("payment_status", { length: 50 }).default("pending"),
  paymentDate: date("payment_date"),
  paymentMethod: varchar("payment_method", { length: 50 }),
  invoiceNumber: varchar("invoice_number", { length: 100 }),
  description: text("description"),
  autoCategorized: boolean("auto_categorized").default(false), // By agent
  confidenceScore: decimal("confidence_score", { precision: 3, scale: 2 }), // If auto-categorized
  approvalRequired: boolean("approval_required").default(false),
  approvedBy: uuid("approved_by"),
  approvedAt: timestamp("approved_at"),
  metadata: jsonb("metadata").default({}),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => ({
  propertyIdx: index("idx_expenses_property").on(table.propertyId),
  dateIdx: index("idx_expenses_date").on(table.expenseDate),
}))

// ============================================================================
// MAINTENANCE & OPERATIONS
// ============================================================================

export const equipment = pgTable("equipment", {
  id: uuid("id").defaultRandom().primaryKey(),
  propertyId: uuid("property_id").references(() => properties.id, { onDelete: "cascade" }),
  name: varchar("name", { length: 255 }).notNull(),
  type: varchar("type", { length: 100 }), // 'hvac', 'elevator', 'escalator', 'generator', 'fire_system'
  make: varchar("make", { length: 100 }),
  model: varchar("model", { length: 100 }),
  serialNumber: varchar("serial_number", { length: 100 }),
  location: varchar("location", { length: 255 }), // Where in the property
  installationDate: date("installation_date"),
  warrantyExpiry: date("warranty_expiry"),
  maintenanceFrequencyDays: integer("maintenance_frequency_days"), // Recommended frequency
  lastMaintenanceDate: date("last_maintenance_date"),
  nextMaintenanceDate: date("next_maintenance_date"),
  predictedFailureDate: date("predicted_failure_date"), // Agent prediction
  predictionConfidence: decimal("prediction_confidence", { precision: 3, scale: 2 }),
  healthScore: decimal("health_score", { precision: 3, scale: 2 }), // 0 to 1, calculated by agent
  status: varchar("status", { length: 50 }).default("operational"), // operational, maintenance, failed, decommissioned
  specifications: jsonb("specifications").default({}),
  maintenanceHistory: jsonb("maintenance_history").default([]),
  metadata: jsonb("metadata").default({}),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => ({
  propertyIdx: index("idx_equipment_property").on(table.propertyId),
  nextMaintenanceIdx: index("idx_equipment_next_maintenance").on(table.nextMaintenanceDate),
}))

export const workOrders = pgTable("work_orders", {
  id: uuid("id").defaultRandom().primaryKey(),
  propertyId: uuid("property_id").references(() => properties.id, { onDelete: "cascade" }),
  equipmentId: uuid("equipment_id").references(() => equipment.id, { onDelete: "set null" }),
  tenantId: uuid("tenant_id").references(() => tenants.id, { onDelete: "set null" }),
  workOrderNumber: varchar("work_order_number", { length: 100 }).unique().notNull(),
  type: varchar("type", { length: 50 }), // 'maintenance', 'repair', 'inspection', 'installation'
  priority: varchar("priority", { length: 50 }).default("medium"), // low, medium, high, critical
  category: varchar("category", { length: 100 }),
  title: varchar("title", { length: 255 }).notNull(),
  description: text("description"),
  location: varchar("location", { length: 255 }),
  assignedTo: uuid("assigned_to"), // Vendor ID
  assignedAt: timestamp("assigned_at"),
  scheduledDate: date("scheduled_date"),
  scheduledTime: time("scheduled_time"),
  status: varchar("status", { length: 50 }).default("open"), // open, assigned, in_progress, completed, cancelled
  startedAt: timestamp("started_at"),
  completedAt: timestamp("completed_at"),
  estimatedCost: decimal("estimated_cost", { precision: 12, scale: 2 }),
  actualCost: decimal("actual_cost", { precision: 12, scale: 2 }),
  estimatedDurationHours: integer("estimated_duration_hours"),
  actualDurationHours: integer("actual_duration_hours"),
  qualityRating: decimal("quality_rating", { precision: 2, scale: 1 }), // 1 to 5
  autoCreated: boolean("auto_created").default(false), // Created by agent
  predictive: boolean("predictive").default(false), // Preventive maintenance
  resolutionNotes: text("resolution_notes"),
  attachments: jsonb("attachments").default([]),
  metadata: jsonb("metadata").default({}),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
  createdBy: uuid("created_by"), // Agent ID or User ID
}, (table) => ({
  propertyIdx: index("idx_work_orders_property").on(table.propertyId),
  statusIdx: index("idx_work_orders_status").on(table.status),
  scheduledIdx: index("idx_work_orders_scheduled").on(table.scheduledDate),
}))

export const vendors = pgTable("vendors", {
  id: uuid("id").defaultRandom().primaryKey(),
  name: varchar("name", { length: 255 }).notNull(),
  type: varchar("type", { length: 100 }), // 'hvac', 'electrical', 'plumbing', 'security', 'cleaning'
  contactPerson: varchar("contact_person", { length: 255 }),
  email: varchar("email", { length: 255 }),
  phone: varchar("phone", { length: 20 }),
  address: text("address"),
  gstin: varchar("gstin", { length: 20 }),
  pan: varchar("pan", { length: 20 }),
  rating: decimal("rating", { precision: 2, scale: 1 }), // 1 to 5
  performanceScore: decimal("performance_score", { precision: 3, scale: 2 }), // 0 to 1, calculated by agent
  totalJobs: integer("total_jobs").default(0),
  completedJobs: integer("completed_jobs").default(0),
  cancelledJobs: integer("cancelled_jobs").default(0),
  avgResponseTimeHours: decimal("avg_response_time_hours", { precision: 6, scale: 2 }),
  avgCompletionTimeHours: decimal("avg_completion_time_hours", { precision: 6, scale: 2 }),
  slaCompliancePercentage: decimal("sla_compliance_percentage", { precision: 5, scale: 2 }),
  costEfficiencyScore: decimal("cost_efficiency_score", { precision: 3, scale: 2 }), // Compared to average
  status: varchar("status", { length: 50 }).default("active"),
  metadata: jsonb("metadata").default({}),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
})

// ============================================================================
// COMMUNICATION & INTERACTIONS
// ============================================================================

export const conversations = pgTable("conversations", {
  id: uuid("id").defaultRandom().primaryKey(),
  propertyId: uuid("property_id").references(() => properties.id, { onDelete: "cascade" }),
  tenantId: uuid("tenant_id").references(() => tenants.id, { onDelete: "set null" }),
  userId: uuid("user_id"), // If initiated by staff
  channel: varchar("channel", { length: 50 }), // 'chat', 'email', 'whatsapp', 'phone'
  status: varchar("status", { length: 50 }).default("active"), // active, resolved, escalated
  sentiment: varchar("sentiment", { length: 50 }), // positive, neutral, negative
  category: varchar("category", { length: 100 }), // Auto-categorized by agent
  priority: varchar("priority", { length: 50 }).default("normal"),
  assignedAgent: varchar("assigned_agent", { length: 100 }), // Which agent is handling
  assignedHuman: uuid("assigned_human"), // If escalated
  resolvedAt: timestamp("resolved_at"),
  resolutionTimeMinutes: integer("resolution_time_minutes"),
  satisfactionRating: decimal("satisfaction_rating", { precision: 2, scale: 1 }), // 1 to 5
  metadata: jsonb("metadata").default({}),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => ({
  propertyIdx: index("idx_conversations_property").on(table.propertyId),
  tenantIdx: index("idx_conversations_tenant").on(table.tenantId),
}))

export const messages = pgTable("messages", {
  id: uuid("id").defaultRandom().primaryKey(),
  conversationId: uuid("conversation_id").references(() => conversations.id, { onDelete: "cascade" }),
  senderType: varchar("sender_type", { length: 50 }), // 'tenant', 'agent', 'staff'
  senderId: uuid("sender_id"), // Tenant ID, Agent ID, or User ID
  content: text("content").notNull(),
  messageType: varchar("message_type", { length: 50 }).default("text"), // text, image, document, system
  attachments: jsonb("attachments").default([]),
  metadata: jsonb("metadata").default({}),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => ({
  conversationIdx: index("idx_messages_conversation").on(table.conversationId),
}))

export const notifications = pgTable("notifications", {
  id: uuid("id").defaultRandom().primaryKey(),
  recipientId: uuid("recipient_id").notNull(), // User ID or Tenant ID
  recipientType: varchar("recipient_type", { length: 50 }), // 'user', 'tenant'
  type: varchar("type", { length: 100 }), // 'payment_reminder', 'maintenance_scheduled', 'lease_expiry'
  channel: varchar("channel", { length: 50 }), // 'email', 'whatsapp', 'sms', 'in_app'
  title: varchar("title", { length: 255 }),
  content: text("content"),
  status: varchar("status", { length: 50 }).default("pending"), // pending, sent, delivered, failed
  sentAt: timestamp("sent_at"),
  deliveredAt: timestamp("delivered_at"),
  readAt: timestamp("read_at"),
  autoGenerated: boolean("auto_generated").default(false), // By agent
  metadata: jsonb("metadata").default({}),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => ({
  recipientIdx: index("idx_notifications_recipient").on(table.recipientId, table.recipientType),
}))

// ============================================================================
// AGENT FRAMEWORK
// ============================================================================

export const agents = pgTable("agents", {
  id: uuid("id").defaultRandom().primaryKey(),
  name: varchar("name", { length: 100 }).unique().notNull(),
  type: varchar("type", { length: 100 }).notNull(), // 'operations_commander', 'tenant_relations', etc.
  description: text("description"),
  status: varchar("status", { length: 50 }).default("active"), // active, inactive, training
  model: varchar("model", { length: 100 }).default("claude-opus-4-20250514"),
  systemPrompt: text("system_prompt").notNull(),
  capabilities: jsonb("capabilities").default([]), // List of tools/functions
  config: jsonb("config").default({}), // Temperature, max_tokens, etc.
  performanceMetrics: jsonb("performance_metrics").default({}),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
})

export const agentActions = pgTable("agent_actions", {
  id: uuid("id").defaultRandom().primaryKey(),
  agentId: uuid("agent_id").references(() => agents.id, { onDelete: "cascade" }),
  propertyId: uuid("property_id").references(() => properties.id, { onDelete: "cascade" }),
  actionType: varchar("action_type", { length: 100 }).notNull(), // 'create_work_order', 'send_reminder', etc.
  entityType: varchar("entity_type", { length: 100 }), // 'invoice', 'work_order', 'tenant', etc.
  entityId: uuid("entity_id"), // ID of affected entity
  trigger: varchar("trigger", { length: 255 }), // What triggered this action
  reasoning: text("reasoning"), // Agent's explanation
  confidence: decimal("confidence", { precision: 3, scale: 2 }), // 0 to 1
  status: varchar("status", { length: 50 }).default("pending"), // pending, approved, executed, rejected, failed
  requiresApproval: boolean("requires_approval").default(false),
  approvedBy: uuid("approved_by"),
  approvedAt: timestamp("approved_at"),
  executedAt: timestamp("executed_at"),
  result: jsonb("result"), // Execution result
  error: text("error"), // If failed
  inputData: jsonb("input_data"), // Action parameters
  outputData: jsonb("output_data"), // Action results
  metadata: jsonb("metadata").default({}),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => ({
  agentIdx: index("idx_agent_actions_agent").on(table.agentId),
  propertyIdx: index("idx_agent_actions_property").on(table.propertyId),
  statusIdx: index("idx_agent_actions_status").on(table.status),
}))

export const agentDecisions = pgTable("agent_decisions", {
  id: uuid("id").defaultRandom().primaryKey(),
  agentId: uuid("agent_id").references(() => agents.id, { onDelete: "cascade" }),
  decisionType: varchar("decision_type", { length: 100 }).notNull(),
  context: jsonb("context").notNull(), // Input data for decision
  reasoning: text("reasoning").notNull(), // Agent's thought process
  recommendation: jsonb("recommendation").notNull(), // The decision/recommendation
  confidence: decimal("confidence", { precision: 3, scale: 2 }), // 0 to 1
  alternatives: jsonb("alternatives").default([]), // Other options considered
  dataSources: jsonb("data_sources").default([]), // What data was used
  outcome: varchar("outcome", { length: 50 }), // accepted, rejected, modified, pending
  humanFeedback: text("human_feedback"),
  actualResult: jsonb("actual_result"), // What happened after decision was implemented
  metadata: jsonb("metadata").default({}),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => ({
  agentIdx: index("idx_agent_decisions_agent").on(table.agentId),
}))

// ============================================================================
// POS INTEGRATION & REVENUE TRACKING
// ============================================================================

export const posIntegrations = pgTable("pos_integrations", {
  id: uuid("id").defaultRandom().primaryKey(),
  tenantId: uuid("tenant_id").references(() => tenants.id, { onDelete: "cascade" }),
  propertyId: uuid("property_id").references(() => properties.id, { onDelete: "cascade" }),
  leaseId: uuid("lease_id").references(() => leases.id, { onDelete: "cascade" }),
  provider: varchar("provider", { length: 50 }).notNull(), // 'pine_labs', 'razorpay_pos', 'petpooja', 'shopify', 'square', 'lightspeed', 'vend'
  storeId: varchar("store_id", { length: 255 }), // Provider-specific store identifier
  locationId: varchar("location_id", { length: 255 }), // Provider-specific location identifier
  apiKeyEncrypted: text("api_key_encrypted"), // Encrypted API key/secret
  webhookUrl: varchar("webhook_url", { length: 500 }),
  syncFrequency: varchar("sync_frequency", { length: 50 }).default("daily"), // 'real_time', 'hourly', 'daily'
  status: varchar("status", { length: 50 }).default("disconnected"), // 'connected', 'disconnected', 'error', 'syncing'
  lastSyncAt: timestamp("last_sync_at"),
  lastSyncStatus: varchar("last_sync_status", { length: 50 }), // 'success', 'failed', 'partial'
  totalTransactionsSynced: integer("total_transactions_synced").default(0),
  config: jsonb("config").default({}), // Provider-specific configuration
  metadata: jsonb("metadata").default({}),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => ({
  tenantIdx: index("idx_pos_integrations_tenant").on(table.tenantId),
  propertyIdx: index("idx_pos_integrations_property").on(table.propertyId),
  leaseIdx: index("idx_pos_integrations_lease").on(table.leaseId),
  statusIdx: index("idx_pos_integrations_status").on(table.status),
}))

export const posTransactions = pgTable("pos_transactions", {
  id: uuid("id").defaultRandom().primaryKey(),
  externalId: text("external_id").notNull(),
  posIntegrationId: uuid("pos_integration_id").references(() => posIntegrations.id),
  tenantId: uuid("tenant_id").references(() => tenants.id),
  propertyId: uuid("property_id").references(() => properties.id),
  organizationId: uuid("organization_id").references(() => organizations.id),

  grossAmount: decimal("gross_amount", { precision: 12, scale: 2 }).notNull(),
  netAmount: decimal("net_amount", { precision: 12, scale: 2 }).notNull(),
  discountAmount: decimal("discount_amount", { precision: 12, scale: 2 }).default("0"),
  taxAmount: decimal("tax_amount", { precision: 12, scale: 2 }).default("0"),
  refundAmount: decimal("refund_amount", { precision: 12, scale: 2 }).default("0"),

  transactionType: text("transaction_type").notNull(), // 'sale', 'refund', 'void', 'partial_payment'
  paymentMethod: text("payment_method"), // 'card', 'upi', 'cash', 'wallet', 'mixed'
  status: text("status").notNull(), // 'completed', 'refunded', 'voided', 'pending'
  currency: varchar("currency", { length: 3 }).default("INR"),

  terminalId: text("terminal_id"),
  merchantId: text("merchant_id"),
  operatorId: text("operator_id"),

  lineItems: jsonb("line_items").default([]),
  rawPayload: jsonb("raw_payload"),

  transactedAt: timestamp("transacted_at", { withTimezone: true }).notNull(),
  syncedAt: timestamp("synced_at", { withTimezone: true }).defaultNow(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
}, (table) => ({
  dedupIdx: uniqueIndex("pos_transactions_dedup").on(table.posIntegrationId, table.externalId),
  tenantDateIdx: index("idx_pos_txn_tenant_date").on(table.tenantId, table.transactedAt),
  paymentMethodIdx: index("idx_pos_txn_payment_method").on(table.paymentMethod),
}))

export const posReconciliation = pgTable("pos_reconciliation", {
  id: uuid("id").defaultRandom().primaryKey(),
  tenantId: uuid("tenant_id").references(() => tenants.id),
  leaseId: uuid("lease_id").references(() => leases.id),
  organizationId: uuid("organization_id").references(() => organizations.id),
  periodStart: date("period_start").notNull(),
  periodEnd: date("period_end").notNull(),
  posTotal: decimal("pos_total", { precision: 12, scale: 2 }).notNull(),
  invoiceTotal: decimal("invoice_total", { precision: 12, scale: 2 }).notNull(),
  variance: decimal("variance", { precision: 12, scale: 2 }).notNull(),
  status: text("status").notNull(), // 'matched', 'variance_detected', 'resolved', 'pending'
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
}, (table) => ({
  tenantPeriodIdx: index("idx_pos_recon_tenant_period").on(table.tenantId, table.periodStart, table.periodEnd),
  statusIdx: index("idx_pos_recon_status").on(table.status),
}))

export const posSalesData = pgTable("pos_sales_data", {
  id: uuid("id").defaultRandom().primaryKey(),
  posIntegrationId: uuid("pos_integration_id").references(() => posIntegrations.id, { onDelete: "cascade" }),
  tenantId: uuid("tenant_id").references(() => tenants.id, { onDelete: "cascade" }),
  propertyId: uuid("property_id").references(() => properties.id, { onDelete: "cascade" }),
  leaseId: uuid("lease_id").references(() => leases.id, { onDelete: "cascade" }),
  salesDate: date("sales_date").notNull(),
  grossSales: decimal("gross_sales", { precision: 14, scale: 2 }).notNull(),
  netSales: decimal("net_sales", { precision: 14, scale: 2 }).notNull(),
  refunds: decimal("refunds", { precision: 12, scale: 2 }).default("0"),
  discounts: decimal("discounts", { precision: 12, scale: 2 }).default("0"),
  transactionCount: integer("transaction_count").default(0),
  avgTransactionValue: decimal("avg_transaction_value", { precision: 12, scale: 2 }),
  categoryBreakdown: jsonb("category_breakdown").default({}), // Sales by product category
  hourlyBreakdown: jsonb("hourly_breakdown").default({}), // Sales by hour of day
  source: varchar("source", { length: 50 }).default("pos_api"), // 'pos_api', 'manual_upload', 'bank_statement'
  verified: boolean("verified").default(false),
  verifiedAt: timestamp("verified_at"),
  verifiedBy: uuid("verified_by"),
  metadata: jsonb("metadata").default({}),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => ({
  posIntegrationDateIdx: uniqueIndex("idx_pos_sales_integration_date").on(table.posIntegrationId, table.salesDate),
  tenantIdx: index("idx_pos_sales_tenant").on(table.tenantId),
  propertyIdx: index("idx_pos_sales_property").on(table.propertyId),
  leaseIdx: index("idx_pos_sales_lease").on(table.leaseId),
  salesDateIdx: index("idx_pos_sales_date").on(table.salesDate),
}))

// ============================================================================
// COMPLIANCE & DOCUMENTATION
// ============================================================================

export const complianceRequirements = pgTable("compliance_requirements", {
  id: uuid("id").defaultRandom().primaryKey(),
  propertyId: uuid("property_id").references(() => properties.id, { onDelete: "cascade" }),
  requirementType: varchar("requirement_type", { length: 100 }), // 'license', 'permit', 'inspection', 'audit'
  title: varchar("title", { length: 255 }).notNull(),
  description: text("description"),
  authority: varchar("authority", { length: 255 }), // Issuing authority
  frequency: varchar("frequency", { length: 50 }), // 'annual', 'monthly', 'one-time'
  dueDate: date("due_date"),
  nextDueDate: date("next_due_date"),
  status: varchar("status", { length: 50 }).default("pending"), // pending, in_progress, completed, overdue
  riskLevel: varchar("risk_level", { length: 50 }).default("medium"), // low, medium, high, critical
  autoReminder: boolean("auto_reminder").default(true),
  reminderDays: jsonb("reminder_days").default([30, 15, 7, 2]),
  documentsRequired: jsonb("documents_required").default([]),
  metadata: jsonb("metadata").default({}),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => ({
  propertyIdx: index("idx_compliance_property").on(table.propertyId),
  dueDateIdx: index("idx_compliance_due_date").on(table.nextDueDate),
}))

// ============================================================================
// ANALYTICS & REPORTING
// ============================================================================

export const dailyMetrics = pgTable("daily_metrics", {
  id: uuid("id").defaultRandom().primaryKey(),
  propertyId: uuid("property_id").references(() => properties.id, { onDelete: "cascade" }),
  metricDate: date("metric_date").notNull(),
  occupancyRate: decimal("occupancy_rate", { precision: 5, scale: 2 }),
  collectionRate: decimal("collection_rate", { precision: 5, scale: 2 }),
  tenantSatisfaction: decimal("tenant_satisfaction", { precision: 3, scale: 2 }),
  maintenanceTickets: integer("maintenance_tickets"),
  maintenanceResolved: integer("maintenance_resolved"),
  agentActionsTaken: integer("agent_actions_taken"),
  agentActionsApproved: integer("agent_actions_approved"),
  revenue: decimal("revenue", { precision: 12, scale: 2 }),
  expenses: decimal("expenses", { precision: 12, scale: 2 }),
  footTraffic: integer("foot_traffic"), // If available
  metadata: jsonb("metadata").default({}),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => ({
  propertyDateIdx: uniqueIndex("idx_daily_metrics_property_date").on(table.propertyId, table.metricDate),
}))

// ============================================================================
// ADMIN ACCESS LOG & PROVISIONING (migration 003)
// ============================================================================

export const adminAccessLog = pgTable("admin_access_log", {
  id:             uuid("id").defaultRandom().primaryKey(),
  adminUserId:    uuid("admin_user_id").notNull(),
  adminEmail:     text("admin_email").notNull(),
  targetOrgId:    uuid("target_org_id").notNull().references(() => organizations.id),
  targetOrgName:  text("target_org_name"),
  reason:         text("reason").notNull(),
  ticketRef:      text("ticket_ref"),
  grantedAt:      timestamp("granted_at", { withTimezone: true }).defaultNow().notNull(),
  revokedAt:      timestamp("revoked_at", { withTimezone: true }),
  requestIp:      text("request_ip"),
  userAgent:      text("user_agent"),
  sessionId:      text("session_id"),
})

export const provisioningEvents = pgTable("provisioning_events", {
  id:               uuid("id").defaultRandom().primaryKey(),
  idempotencyKey:   uuid("idempotency_key").unique().notNull(),
  organizationId:   uuid("organization_id"),
  step:             varchar("step", { length: 50 }).notNull(),
  status:           varchar("status", { length: 20 }).notNull().default("started"),
  errorDetail:      text("error_detail"),
  metadata:         jsonb("metadata").notNull().default({}),
  createdAt:        timestamp("created_at",   { withTimezone: true }).defaultNow().notNull(),
  completedAt:      timestamp("completed_at", { withTimezone: true }),
})

// ============================================================================
// REVENUE INTELLIGENCE TABLES (migration 005)
// ============================================================================

export const revenueCalculations = pgTable("revenue_calculations", {
  id:                 uuid("id").defaultRandom().primaryKey(),
  organizationId:     uuid("organization_id").notNull().references(() => organizations.id),
  tenantId:           uuid("tenant_id").notNull().references(() => tenants.id),
  leaseId:            uuid("lease_id").notNull().references(() => leases.id),
  periodStart:        date("period_start").notNull(),
  periodEnd:          date("period_end").notNull(),
  // period_days is a GENERATED ALWAYS AS (period_end - period_start + 1) STORED column — omitted here
  grossSales:         decimal("gross_sales",        { precision: 14, scale: 2 }).notNull(),
  netSales:           decimal("net_sales",          { precision: 14, scale: 2 }).notNull(),
  totalRefunds:       decimal("total_refunds",      { precision: 14, scale: 2 }).notNull().default("0"),
  totalDiscounts:     decimal("total_discounts",    { precision: 14, scale: 2 }).notNull().default("0"),
  transactionCount:   integer("transaction_count").notNull().default(0),
  leaseRevSharePct:   decimal("lease_rev_share_pct",{ precision: 6, scale: 4 }).notNull(),
  leaseMonthlyMg:     decimal("lease_monthly_mg",   { precision: 14, scale: 2 }).notNull(),
  leaseBreakpoint:    decimal("lease_breakpoint",   { precision: 14, scale: 2 }),
  leaseAreaSqft:      decimal("lease_area_sqft",    { precision: 10, scale: 2 }),
  minimumGuarantee:   decimal("minimum_guarantee",  { precision: 14, scale: 2 }).notNull(),
  revShareBase:       decimal("rev_share_base",     { precision: 14, scale: 2 }).notNull(),
  revShareAmount:     decimal("rev_share_amount",   { precision: 14, scale: 2 }).notNull(),
  amountDue:          decimal("amount_due",         { precision: 14, scale: 2 }).notNull(),
  excessOverMg:       decimal("excess_over_mg",     { precision: 14, scale: 2 }).notNull(),
  metadata:           jsonb("metadata").default({}),
  createdAt:          timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => ({
  orgIdx:    index("idx_rev_calc_org").on(table.organizationId),
  tenantIdx: index("idx_rev_calc_tenant").on(table.tenantId),
  leaseIdx:  index("idx_rev_calc_lease").on(table.leaseId),
}))

export const revenueAdjustments = pgTable("revenue_adjustments", {
  id:                uuid("id").defaultRandom().primaryKey(),
  organizationId:    uuid("organization_id").notNull().references(() => organizations.id),
  tenantId:          uuid("tenant_id").notNull().references(() => tenants.id),
  revenueCalcId:     uuid("revenue_calc_id").references(() => revenueCalculations.id),
  adjustmentType:    text("adjustment_type").notNull(),
  amount:            decimal("amount", { precision: 14, scale: 2 }).notNull(),
  reason:            text("reason").notNull(),
  evidenceUrls:      text("evidence_urls").array(),
  status:            text("status").notNull().default("pending"),
  requestedBy:       uuid("requested_by").notNull().references(() => users.id),
  requestedAt:       timestamp("requested_at", { withTimezone: true }).defaultNow().notNull(),
  reviewedBy:        uuid("reviewed_by").references(() => users.id),
  reviewedAt:        timestamp("reviewed_at",  { withTimezone: true }),
  reviewNotes:       text("review_notes"),
  posTransactionId:  uuid("pos_transaction_id").references(() => posTransactions.id),
}, (table) => ({
  calcIdx:      index("idx_adjustments_calc").on(table.revenueCalcId),
  orgStatusIdx: index("idx_adjustments_org_status").on(table.organizationId, table.status),
}))

export const tenantRiskScores = pgTable("tenant_risk_scores", {
  id:                 uuid("id").defaultRandom().primaryKey(),
  organizationId:     uuid("organization_id").notNull().references(() => organizations.id),
  tenantId:           uuid("tenant_id").notNull().references(() => tenants.id),
  scoreDate:          date("score_date").notNull(),
  riskScore:          integer("risk_score").notNull(), // 0..100
  riskLevel:          varchar("risk_level", { length: 16 }).notNull(), // low|medium|high|critical
  // Per-signal contributions (transparency for the dashboard)
  latePaymentPoints:  integer("late_payment_points").notNull().default(0),
  salesDropPoints:    integer("sales_drop_points").notNull().default(0),
  complaintPoints:    integer("complaint_points").notNull().default(0),
  leaseExpiryPoints:  integer("lease_expiry_points").notNull().default(0),
  signals:            jsonb("signals").default({}),         // raw counts/values
  recommendedActions: jsonb("recommended_actions").default([]), // ["offer_discount", ...]
  modelVersion:       varchar("model_version", { length: 32 }).notNull(),
  createdAt:          timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => ({
  orgTenantDateIdx: index("idx_risk_org_tenant_date").on(table.organizationId, table.tenantId, table.scoreDate),
  orgLevelIdx:      index("idx_risk_org_level").on(table.organizationId, table.riskLevel),
  uniqueDaily:      uniqueIndex("uq_risk_tenant_day").on(table.tenantId, table.scoreDate),
}))

export const revenueForecasts = pgTable("revenue_forecasts", {
  id:               uuid("id").defaultRandom().primaryKey(),
  organizationId:   uuid("organization_id").notNull().references(() => organizations.id),
  propertyId:       uuid("property_id").notNull().references(() => properties.id),
  zoneId:           uuid("zone_id"),
  forecastDate:     date("forecast_date").notNull(),
  predictedRevenue: decimal("predicted_revenue", { precision: 14, scale: 2 }).notNull(),
  confidenceScore: decimal("confidence_score",  { precision: 4,  scale: 3 }).notNull(),
  modelVersion:     varchar("model_version", { length: 32 }).notNull(),
  createdAt:        timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => ({
  orgPropDateIdx: index("idx_rev_forecast_org_prop_date").on(table.organizationId, table.propertyId, table.forecastDate),
  uniqueForecast: uniqueIndex("uq_rev_forecast_scope_date_version").on(
    table.organizationId, table.propertyId, table.zoneId, table.forecastDate, table.modelVersion,
  ),
}))

export const footfallData = pgTable("footfall_data", {
  id:                uuid("id").defaultRandom().primaryKey(),
  organizationId:    uuid("organization_id").notNull().references(() => organizations.id),
  dataDate:          date("data_date").notNull(),
  zone:              text("zone"),
  floor:             text("floor"),
  visitorCount:      integer("visitor_count").notNull(),
  peakHour:          integer("peak_hour"),
  avgDwellMinutes:   integer("avg_dwell_minutes"),
  source:            text("source").notNull().default("manual"),
  createdAt:         timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => ({
  dedupIdx: uniqueIndex("footfall_date_zone_unique").on(table.organizationId, table.dataDate, table.zone, table.floor),
}))

export const revenueAuditLog = pgTable("revenue_audit_log", {
  id:             integer("id").primaryKey().generatedAlwaysAsIdentity(),
  organizationId: uuid("organization_id").notNull(),
  entityType:     text("entity_type").notNull(),
  entityId:       uuid("entity_id").notNull(),
  action:         text("action").notNull(),
  actorId:        uuid("actor_id"),
  actorRole:      text("actor_role"),
  oldValues:      jsonb("old_values"),
  newValues:      jsonb("new_values"),
  ipAddress:      text("ip_address"),
  userAgent:      text("user_agent"),
  occurredAt:     timestamp("occurred_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => ({
  entityIdx:  index("idx_revenue_audit_entity").on(table.entityType, table.entityId),
  orgTimeIdx: index("idx_revenue_audit_org_time").on(table.organizationId, table.occurredAt),
}))

// ============================================================================
// AUDIT LOGS
// ============================================================================

export const auditLogs = pgTable("audit_logs", {
  id: uuid("id").defaultRandom().primaryKey(),
  organizationId: uuid("organization_id").notNull().references(() => organizations.id),
  action: text("action").notNull(),        // e.g. invoice.update, payment.create, lease.create, pos.override
  entity: text("entity").notNull(),        // e.g. invoice, payment, lease, pos_sales_data
  entityId: text("entity_id").notNull(),
  before: jsonb("before_data"),            // full snapshot before change
  after: jsonb("after_data"),              // full snapshot after change
  changedFields: jsonb("changed_fields"),  // compact diff { field: { from, to } }
  userId: text("user_id"),                 // session.user.id of the actor
  ipAddress: text("ip_address"),
  userAgent: text("user_agent"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => ({
  orgIdx:        index("idx_audit_logs_org").on(table.organizationId),
  entityIdx:     index("idx_audit_logs_entity").on(table.entity, table.entityId),
  createdIdx:    index("idx_audit_logs_created").on(table.createdAt),
  orgCreatedIdx: index("idx_audit_logs_org_created").on(table.organizationId, table.createdAt),
  actionIdx:     index("idx_audit_logs_action").on(table.action),
  userIdx:       index("idx_audit_logs_user").on(table.userId),
}))

// ============================================================================
// NOTIFICATION TEMPLATES
// ============================================================================

export const notificationTemplates = pgTable("notification_templates", {
  id: uuid("id").defaultRandom().primaryKey(),
  organizationId: uuid("organization_id").notNull().references(() => organizations.id),
  name: text("name").notNull(),
  channel: text("channel").notNull(), // email, whatsapp, sms
  eventType: text("event_type").notNull(), // invoice_created, payment_due, lease_expiry, cam_generated
  subject: text("subject"), // email only
  body: text("body").notNull(),
  isActive: boolean("is_active").notNull().default(true),
  createdBy: uuid("created_by"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }),
}, (table) => ({
  orgIdx: index("idx_notif_tpl_org").on(table.organizationId),
  eventTypeIdx: index("idx_notif_tpl_event_type").on(table.eventType),
  channelIdx: index("idx_notif_tpl_channel").on(table.channel),
}))

// ============================================================================
// IMPORT JOBS
// ============================================================================

export const importJobs = pgTable("import_jobs", {
  id: uuid("id").defaultRandom().primaryKey(),
  organizationId: uuid("organization_id").notNull().references(() => organizations.id),
  type: text("type").notNull(), // tenants, leases, vendors, sales
  fileName: text("file_name").notNull(),
  status: text("status").notNull().default("pending"), // pending, processing, completed, failed
  totalRows: integer("total_rows").notNull().default(0),
  processedRows: integer("processed_rows").notNull().default(0),
  errorRows: integer("error_rows").notNull().default(0),
  errorLog: jsonb("error_log").notNull().default([]),
  createdBy: uuid("created_by"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }),
}, (table) => ({
  orgIdx: index("idx_import_jobs_org").on(table.organizationId),
  statusIdx: index("idx_import_jobs_status").on(table.status),
}))

// ============================================================================
// CAM (Common Area Maintenance)
// ============================================================================

export const camCharges = pgTable("cam_charges", {
  id: uuid("id").defaultRandom().primaryKey(),
  organizationId: uuid("organization_id").notNull().references(() => organizations.id),
  propertyId: uuid("property_id").notNull().references(() => properties.id, { onDelete: "cascade" }),
  periodStart: date("period_start").notNull(),
  periodEnd: date("period_end").notNull(),
  category: text("category").notNull(), // electricity, housekeeping, security, shared_utilities
  totalAmount: decimal("total_amount", { precision: 12, scale: 2 }).notNull(),
  allocationMethod: text("allocation_method").notNull().default("per_sqft"), // per_sqft, equal, footfall
  status: text("status").notNull().default("draft"), // draft, allocated, invoiced
  createdBy: uuid("created_by"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }),
}, (table) => ({
  orgIdx: index("idx_cam_charges_org").on(table.organizationId),
  propertyIdx: index("idx_cam_charges_property").on(table.propertyId),
  periodIdx: index("idx_cam_charges_period").on(table.periodStart, table.periodEnd),
  statusIdx: index("idx_cam_charges_status").on(table.status),
}))

export const camAllocations = pgTable("cam_allocations", {
  id: uuid("id").defaultRandom().primaryKey(),
  chargeId: uuid("charge_id").notNull().references(() => camCharges.id, { onDelete: "cascade" }),
  tenantId: uuid("tenant_id").notNull().references(() => tenants.id, { onDelete: "cascade" }),
  leaseId: uuid("lease_id").references(() => leases.id, { onDelete: "set null" }),
  ratio: decimal("ratio", { precision: 8, scale: 4 }).notNull(),
  allocatedAmount: decimal("allocated_amount", { precision: 12, scale: 2 }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => ({
  chargeIdx: index("idx_cam_alloc_charge").on(table.chargeId),
  tenantIdx: index("idx_cam_alloc_tenant").on(table.tenantId),
}))

export const tenantFootfall = pgTable("tenant_footfall", {
  id: uuid("id").defaultRandom().primaryKey(),
  tenantId: uuid("tenant_id").notNull().references(() => tenants.id, { onDelete: "cascade" }),
  date: date("date").notNull(),
  footfall: integer("footfall").notNull().default(0),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => ({
  dedupIdx: uniqueIndex("idx_tenant_footfall_dedup").on(table.tenantId, table.date),
}))

// ============================================================================
// DOCUMENTS
// ============================================================================

export const documents = pgTable("documents", {
  id:             uuid("id").defaultRandom().primaryKey(),
  organizationId: uuid("organization_id").references(() => organizations.id),
  tenantId:       uuid("tenant_id").references(() => tenants.id, { onDelete: "cascade" }),
  propertyId:     uuid("property_id").references(() => properties.id, { onDelete: "cascade" }),
  leaseId:        uuid("lease_id").references(() => leases.id, { onDelete: "set null" }),
  vendorId:       uuid("vendor_id").references(() => vendors.id),

  name:           varchar("name", { length: 255 }).notNull(),
  type:           varchar("type", { length: 100 }),                 // legacy column from migration 008
  documentType:   text("document_type").notNull().default("other"), // lease, compliance, insurance, vendor_contract, property_doc, tenant_doc
  category:       varchar("category", { length: 100 }).notNull().default("other"),
  description:    text("description"),

  fileUrl:        text("url").notNull(),
  fileKey:        text("file_key"),
  mimeType:       varchar("mime_type", { length: 100 }),
  fileSize:       integer("file_size"),

  version:        integer("version").notNull().default(1),
  isActive:       boolean("is_active").notNull().default(true),
  tags:           jsonb("tags").default([]),

  expiresAt:      timestamp("expires_at", { withTimezone: true }), // legacy from migration 008
  uploadedBy:     uuid("uploaded_by"),
  metadata:       jsonb("metadata").default({}),
  createdAt:      timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt:      timestamp("updated_at", { withTimezone: true }),
}, (table) => ({
  orgIdx:          index("idx_documents_org").on(table.organizationId),
  tenantIdx:       index("idx_documents_tenant").on(table.tenantId),
  propertyIdx:     index("idx_documents_property").on(table.propertyId),
  categoryIdx:     index("idx_documents_category").on(table.category),
  documentTypeIdx: index("idx_documents_document_type").on(table.documentType),
  vendorIdx:       index("idx_documents_vendor").on(table.vendorId),
}))

// ============================================================================
// TENANT PORTAL — separate credential namespace from internal users
// ============================================================================

export const tenantUsers = pgTable("tenant_users", {
  id:           uuid("id").defaultRandom().primaryKey(),
  tenantId:     uuid("tenant_id").notNull().references(() => tenants.id, { onDelete: "cascade" }),
  email:        text("email").unique().notNull(),
  passwordHash: text("password_hash").notNull(),
  name:         text("name"),
  isActive:     boolean("is_active").default(true).notNull(),
  lastLoginAt:  timestamp("last_login_at", { withTimezone: true }),
  createdAt:    timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => ({
  tenantIdx: index("idx_tenant_users_tenant").on(table.tenantId),
}))

export const tenantSessions = pgTable("tenant_sessions", {
  id:            uuid("id").defaultRandom().primaryKey(),
  tenantUserId:  uuid("tenant_user_id").notNull().references(() => tenantUsers.id, { onDelete: "cascade" }),
  expiresAt:     timestamp("expires_at", { withTimezone: true }).notNull(),
  createdAt:     timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => ({
  userIdx:    index("idx_tenant_sessions_user").on(table.tenantUserId),
  expiryIdx:  index("idx_tenant_sessions_expiry").on(table.expiresAt),
}))

// ============================================================================
// USERS & RBAC
// ============================================================================

export const users = pgTable("users", {
  id: uuid("id").defaultRandom().primaryKey(),
  email: varchar("email", { length: 255 }).unique().notNull(),
  password: varchar("password", { length: 255 }), // Hashed
  name: varchar("name", { length: 255 }),
  phone: varchar("phone", { length: 20 }),
  roleId: uuid("role_id"), // References your RBAC roles table
  organizationId: uuid("organization_id").references(() => organizations.id, { onDelete: "cascade" }),
  properties: jsonb("properties").default([]), // Property IDs user has access to
  status: varchar("status", { length: 50 }).default("active"),
  preferences: jsonb("preferences").default({}),
  emailVerified: timestamp("email_verified"),
  image: varchar("image", { length: 255 }),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
})

export const roles = pgTable("roles", {
  id: uuid("id").defaultRandom().primaryKey(),
  name: varchar("name", { length: 100 }).unique().notNull(),
  description: text("description"),
  permissions: jsonb("permissions").default([]), // Array of permission strings
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
})

// ============================================================================
// RELATIONS
// ============================================================================

export const organizationsRelations = relations(organizations, ({ many }) => ({
  properties: many(properties),
  users: many(users),
}))

export const propertiesRelations = relations(properties, ({ one, many }) => ({
  organization: one(organizations, {
    fields: [properties.organizationId],
    references: [organizations.id],
  }),
  tenants: many(tenants),
  leases: many(leases),
  workOrders: many(workOrders),
  equipment: many(equipment),
  conversations: many(conversations),
  expenses: many(expenses),
  dailyMetrics: many(dailyMetrics),
  complianceRequirements: many(complianceRequirements),
  agentActions: many(agentActions),
}))

export const tenantsRelations = relations(tenants, ({ one, many }) => ({
  property: one(properties, {
    fields: [tenants.propertyId],
    references: [properties.id],
  }),
  leases: many(leases),
  workOrders: many(workOrders),
  conversations: many(conversations),
  posIntegrations: many(posIntegrations),
  posSalesData: many(posSalesData),
  tenantUsers: many(tenantUsers),
  documents: many(documents),
}))

export const documentsRelations = relations(documents, ({ one }) => ({
  tenant: one(tenants, {
    fields: [documents.tenantId],
    references: [tenants.id],
  }),
  property: one(properties, {
    fields: [documents.propertyId],
    references: [properties.id],
  }),
  lease: one(leases, {
    fields: [documents.leaseId],
    references: [leases.id],
  }),
}))

export const notificationTemplatesRelations = relations(notificationTemplates, ({ one }) => ({
  organization: one(organizations, {
    fields: [notificationTemplates.organizationId],
    references: [organizations.id],
  }),
}))

export const importJobsRelations = relations(importJobs, ({ one }) => ({
  organization: one(organizations, {
    fields: [importJobs.organizationId],
    references: [organizations.id],
  }),
}))

export const camChargesRelations = relations(camCharges, ({ one, many }) => ({
  property: one(properties, {
    fields: [camCharges.propertyId],
    references: [properties.id],
  }),
  organization: one(organizations, {
    fields: [camCharges.organizationId],
    references: [organizations.id],
  }),
  allocations: many(camAllocations),
}))

export const camAllocationsRelations = relations(camAllocations, ({ one }) => ({
  charge: one(camCharges, {
    fields: [camAllocations.chargeId],
    references: [camCharges.id],
  }),
  tenant: one(tenants, {
    fields: [camAllocations.tenantId],
    references: [tenants.id],
  }),
  lease: one(leases, {
    fields: [camAllocations.leaseId],
    references: [leases.id],
  }),
}))

export const tenantFootfallRelations = relations(tenantFootfall, ({ one }) => ({
  tenant: one(tenants, {
    fields: [tenantFootfall.tenantId],
    references: [tenants.id],
  }),
}))

export const tenantUsersRelations = relations(tenantUsers, ({ one, many }) => ({
  tenant: one(tenants, {
    fields: [tenantUsers.tenantId],
    references: [tenants.id],
  }),
  sessions: many(tenantSessions),
}))

export const tenantSessionsRelations = relations(tenantSessions, ({ one }) => ({
  tenantUser: one(tenantUsers, {
    fields: [tenantSessions.tenantUserId],
    references: [tenantUsers.id],
  }),
}))

export const leasesRelations = relations(leases, ({ one, many }) => ({
  tenant: one(tenants, {
    fields: [leases.tenantId],
    references: [tenants.id],
  }),
  property: one(properties, {
    fields: [leases.propertyId],
    references: [properties.id],
  }),
  invoices: many(invoices),
  posIntegrations: many(posIntegrations),
  posSalesData: many(posSalesData),
}))

export const invoicesRelations = relations(invoices, ({ one, many }) => ({
  lease: one(leases, {
    fields: [invoices.leaseId],
    references: [leases.id],
  }),
  payments: many(payments),
}))

export const paymentsRelations = relations(payments, ({ one }) => ({
  invoice: one(invoices, {
    fields: [payments.invoiceId],
    references: [invoices.id],
  }),
}))

export const conversationsRelations = relations(conversations, ({ one, many }) => ({
  property: one(properties, {
    fields: [conversations.propertyId],
    references: [properties.id],
  }),
  tenant: one(tenants, {
    fields: [conversations.tenantId],
    references: [tenants.id],
  }),
  messages: many(messages),
}))

export const messagesRelations = relations(messages, ({ one }) => ({
  conversation: one(conversations, {
    fields: [messages.conversationId],
    references: [conversations.id],
  }),
}))

export const usersRelations = relations(users, ({ one }) => ({
  organization: one(organizations, {
    fields: [users.organizationId],
    references: [organizations.id],
  }),
  role: one(roles, {
    fields: [users.roleId],
    references: [roles.id],
  }),
}))

export const agentActionsRelations = relations(agentActions, ({ one }) => ({
  agent: one(agents, {
    fields: [agentActions.agentId],
    references: [agents.id],
  }),
  property: one(properties, {
    fields: [agentActions.propertyId],
    references: [properties.id],
  }),
}))

export const posIntegrationsRelations = relations(posIntegrations, ({ one, many }) => ({
  tenant: one(tenants, {
    fields: [posIntegrations.tenantId],
    references: [tenants.id],
  }),
  property: one(properties, {
    fields: [posIntegrations.propertyId],
    references: [properties.id],
  }),
  lease: one(leases, {
    fields: [posIntegrations.leaseId],
    references: [leases.id],
  }),
  salesData: many(posSalesData),
}))

export const posSalesDataRelations = relations(posSalesData, ({ one }) => ({
  posIntegration: one(posIntegrations, {
    fields: [posSalesData.posIntegrationId],
    references: [posIntegrations.id],
  }),
  tenant: one(tenants, {
    fields: [posSalesData.tenantId],
    references: [tenants.id],
  }),
  property: one(properties, {
    fields: [posSalesData.propertyId],
    references: [properties.id],
  }),
  lease: one(leases, {
    fields: [posSalesData.leaseId],
    references: [leases.id],
  }),
}))

// Type exports
export type Organization = typeof organizations.$inferSelect
export type NewOrganization = typeof organizations.$inferInsert
export type Property = typeof properties.$inferSelect
export type NewProperty = typeof properties.$inferInsert
export type Tenant = typeof tenants.$inferSelect
export type NewTenant = typeof tenants.$inferInsert
export type Lease = typeof leases.$inferSelect
export type NewLease = typeof leases.$inferInsert
export type Invoice = typeof invoices.$inferSelect
export type NewInvoice = typeof invoices.$inferInsert
export type Payment = typeof payments.$inferSelect
export type NewPayment = typeof payments.$inferInsert
export type WorkOrder = typeof workOrders.$inferSelect
export type NewWorkOrder = typeof workOrders.$inferInsert
export type Conversation = typeof conversations.$inferSelect
export type NewConversation = typeof conversations.$inferInsert
export type Message = typeof messages.$inferSelect
export type NewMessage = typeof messages.$inferInsert
export type User = typeof users.$inferSelect
export type NewUser = typeof users.$inferInsert
export type Agent = typeof agents.$inferSelect
export type NewAgent = typeof agents.$inferInsert
export type AgentAction = typeof agentActions.$inferSelect
export type NewAgentAction = typeof agentActions.$inferInsert
export type AgentDecision = typeof agentDecisions.$inferSelect
export type NewAgentDecision = typeof agentDecisions.$inferInsert
export type PosIntegration = typeof posIntegrations.$inferSelect
export type NewPosIntegration = typeof posIntegrations.$inferInsert
export type PosSalesData = typeof posSalesData.$inferSelect
export type NewPosSalesData = typeof posSalesData.$inferInsert
export type TenantUser = typeof tenantUsers.$inferSelect
export type NewTenantUser = typeof tenantUsers.$inferInsert
export type TenantSession = typeof tenantSessions.$inferSelect
export type NewTenantSession = typeof tenantSessions.$inferInsert
export type AuditLog = typeof auditLogs.$inferSelect
export type NewAuditLog = typeof auditLogs.$inferInsert
export type NotificationTemplate = typeof notificationTemplates.$inferSelect
export type NewNotificationTemplate = typeof notificationTemplates.$inferInsert
export type ImportJob = typeof importJobs.$inferSelect
export type NewImportJob = typeof importJobs.$inferInsert
export type CamCharge = typeof camCharges.$inferSelect
export type NewCamCharge = typeof camCharges.$inferInsert
export type CamAllocation = typeof camAllocations.$inferSelect
export type NewCamAllocation = typeof camAllocations.$inferInsert
export type TenantFootfall = typeof tenantFootfall.$inferSelect
export type NewTenantFootfall = typeof tenantFootfall.$inferInsert

// ============================================================================
// TENANT ONBOARDING
// ============================================================================

export const tenantOnboardingChecklist = pgTable("tenant_onboarding_checklist", {
  id:          uuid("id").defaultRandom().primaryKey(),
  tenantId:    uuid("tenant_id").references(() => tenants.id, { onDelete: "cascade" }).notNull(),
  item:        varchar("item", { length: 100 }).notNull(),   // machine key
  label:       varchar("label", { length: 255 }).notNull(),  // human label
  required:    boolean("required").default(true).notNull(),
  completed:   boolean("completed").default(false).notNull(),
  completedAt: timestamp("completed_at"),
  completedBy: uuid("completed_by"),
  documentId:  uuid("document_id").references(() => documents.id, { onDelete: "set null" }),
  metadata:    jsonb("metadata").default({}),
  createdAt:   timestamp("created_at").defaultNow().notNull(),
  updatedAt:   timestamp("updated_at").defaultNow().notNull(),
}, (table) => ({
  tenantIdx: index("idx_ob_checklist_tenant").on(table.tenantId),
}))

export const tenantOnboardingApprovals = pgTable("tenant_onboarding_approvals", {
  id:           uuid("id").defaultRandom().primaryKey(),
  tenantId:     uuid("tenant_id").references(() => tenants.id, { onDelete: "cascade" }).notNull(),
  approverRole: varchar("approver_role", { length: 100 }).notNull(),
  // 'leasing_manager' | 'finance_manager' | 'operations_manager'
  status:       varchar("status", { length: 50 }).default("pending").notNull(),
  // pending | approved | rejected
  approvedBy:   uuid("approved_by"),
  approvedAt:   timestamp("approved_at"),
  comments:     text("comments"),
  createdAt:    timestamp("created_at").defaultNow().notNull(),
  updatedAt:    timestamp("updated_at").defaultNow().notNull(),
}, (table) => ({
  tenantIdx:  index("idx_ob_approvals_tenant").on(table.tenantId),
  uniqueIdx:  uniqueIndex("idx_ob_approvals_unique").on(table.tenantId, table.approverRole),
}))

export const tenantOnboardingChecklistRelations = relations(tenantOnboardingChecklist, ({ one }) => ({
  tenant: one(tenants, { fields: [tenantOnboardingChecklist.tenantId], references: [tenants.id] }),
}))

export const tenantOnboardingApprovalsRelations = relations(tenantOnboardingApprovals, ({ one }) => ({
  tenant: one(tenants, { fields: [tenantOnboardingApprovals.tenantId], references: [tenants.id] }),
}))

export type TenantOnboardingChecklist    = typeof tenantOnboardingChecklist.$inferSelect
export type NewTenantOnboardingChecklist = typeof tenantOnboardingChecklist.$inferInsert
export type TenantOnboardingApproval     = typeof tenantOnboardingApprovals.$inferSelect
export type NewTenantOnboardingApproval  = typeof tenantOnboardingApprovals.$inferInsert

// ============================================================================
// SMART TENANT ONBOARDING
// ============================================================================

export const tenantOnboarding = pgTable("tenant_onboarding", {
  id:               uuid("id").defaultRandom().primaryKey(),
  tenantId:         uuid("tenant_id").notNull().unique().references(() => tenants.id, { onDelete: "cascade" }),
  kycCompleted:     boolean("kyc_completed").notNull().default(false),
  leaseSigned:      boolean("lease_signed").notNull().default(false),
  depositPaid:      boolean("deposit_paid").notNull().default(false),
  posConnected:     boolean("pos_connected").notNull().default(false),
  storeOpeningDate: timestamp("store_opening_date", { withTimezone: true }),
  completedAt:      timestamp("completed_at", { withTimezone: true }),
  createdAt:        timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt:        timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
})

export const tenantDocuments = pgTable("tenant_documents", {
  id:         uuid("id").defaultRandom().primaryKey(),
  tenantId:   uuid("tenant_id").notNull().references(() => tenants.id, { onDelete: "cascade" }),
  type:       varchar("type", { length: 20 }).notNull(), // GST, PAN, AGREEMENT, LOGO, OTHER
  status:     varchar("status", { length: 20 }).notNull().default("pending"), // pending, uploaded, verified
  fileUrl:    text("file_url"),
  uploadedAt: timestamp("uploaded_at", { withTimezone: true }),
  verifiedAt: timestamp("verified_at", { withTimezone: true }),
  createdAt:  timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => ({
  tenantIdx:     index("idx_tenant_documents_tenant").on(table.tenantId),
  uniqueTypeIdx: uniqueIndex("uq_tenant_doc_type").on(table.tenantId, table.type),
}))

export const tenantOnboardingRelations = relations(tenantOnboarding, ({ one }) => ({
  tenant: one(tenants, { fields: [tenantOnboarding.tenantId], references: [tenants.id] }),
}))

export const tenantDocumentsRelations = relations(tenantDocuments, ({ one }) => ({
  tenant: one(tenants, { fields: [tenantDocuments.tenantId], references: [tenants.id] }),
}))

export type TenantOnboarding     = typeof tenantOnboarding.$inferSelect
export type NewTenantOnboarding  = typeof tenantOnboarding.$inferInsert
export type TenantDocument       = typeof tenantDocuments.$inferSelect
export type NewTenantDocument    = typeof tenantDocuments.$inferInsert

