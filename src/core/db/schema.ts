import {
  pgTable,
  uuid,
  varchar,
  text,
  timestamp,
  integer,
  decimal,
  boolean,
  jsonb,
  date,
  time,
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
  propertyId: uuid("property_id").references(() => properties.id, { onDelete: "cascade" }),
  businessName: varchar("business_name", { length: 255 }).notNull(),
  legalEntityName: varchar("legal_entity_name", { length: 255 }),
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
  sentimentScore: decimal("sentiment_score", { precision: 3, scale: 2 }), // -1 to 1, calculated by agent
  riskScore: decimal("risk_score", { precision: 3, scale: 2 }), // 0 to 1, payment risk
  satisfactionScore: decimal("satisfaction_score", { precision: 3, scale: 2 }), // 0 to 5, from surveys
  metadata: jsonb("metadata").default({}),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => ({
  propertyIdx: index("idx_tenants_property").on(table.propertyId),
  statusIdx: index("idx_tenants_status").on(table.status),
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

