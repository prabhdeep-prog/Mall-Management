// ── Variable Registry ────────────────────────────────────────────────────────
// Defines available template variables per event type.

export interface VariableDefinition {
  key: string
  label: string
  description: string
  sample: string
}

export const EVENT_TYPES = [
  "invoice_created",
  "payment_due",
  "lease_expiry",
  "cam_generated",
  "support_request",
  "work_order_update",
] as const

export type EventType = (typeof EVENT_TYPES)[number]

export const EVENT_TYPE_LABELS: Record<EventType, string> = {
  invoice_created: "Invoice Created",
  payment_due: "Payment Due",
  lease_expiry: "Lease Expiry",
  cam_generated: "CAM Generated",
  support_request: "Support Request Received",
  work_order_update: "Work Order Status Update",
}

export const CHANNELS = ["email", "whatsapp", "sms"] as const
export type Channel = (typeof CHANNELS)[number]

export const CHANNEL_LABELS: Record<Channel, string> = {
  email: "Email",
  whatsapp: "WhatsApp",
  sms: "SMS",
}

// ── Variables by event type ──────────────────────────────────────────────────

const COMMON_VARS: VariableDefinition[] = [
  { key: "tenant_name", label: "Tenant Name", description: "Business name of the tenant", sample: "Nike Store" },
  { key: "property_name", label: "Property Name", description: "Name of the property/mall", sample: "Phoenix MarketCity" },
]

const INVOICE_VARS: VariableDefinition[] = [
  ...COMMON_VARS,
  { key: "invoice_number", label: "Invoice Number", description: "Unique invoice reference", sample: "INV-2026-004521" },
  { key: "invoice_amount", label: "Invoice Amount", description: "Total invoice amount", sample: "₹1,25,000" },
  { key: "due_date", label: "Due Date", description: "Payment due date", sample: "15 Apr 2026" },
]

const PAYMENT_VARS: VariableDefinition[] = [
  ...COMMON_VARS,
  { key: "invoice_number", label: "Invoice Number", description: "Invoice reference", sample: "INV-2026-004521" },
  { key: "invoice_amount", label: "Invoice Amount", description: "Amount due", sample: "₹1,25,000" },
  { key: "due_date", label: "Due Date", description: "Payment due date", sample: "15 Apr 2026" },
  { key: "days_overdue", label: "Days Overdue", description: "Number of days past due", sample: "7" },
]

const LEASE_VARS: VariableDefinition[] = [
  ...COMMON_VARS,
  { key: "lease_end_date", label: "Lease End Date", description: "Lease expiry date", sample: "31 Dec 2026" },
  { key: "unit_number", label: "Unit Number", description: "Leased unit identifier", sample: "G-12" },
  { key: "days_until_expiry", label: "Days Until Expiry", description: "Days remaining on lease", sample: "30" },
]

const CAM_VARS: VariableDefinition[] = [
  ...COMMON_VARS,
  { key: "cam_category", label: "CAM Category", description: "Expense category", sample: "Electricity" },
  { key: "cam_amount", label: "CAM Amount", description: "Allocated CAM charge", sample: "₹12,500" },
  { key: "cam_period", label: "CAM Period", description: "Charge period", sample: "Mar 2026" },
]

const SUPPORT_REQUEST_VARS: VariableDefinition[] = [
  ...COMMON_VARS,
  { key: "work_order_number", label: "Work Order Number", description: "Reference number", sample: "WO-2026-1234" },
  { key: "request_title", label: "Request Title", description: "Issue title submitted by tenant", sample: "AC not working in unit G-12" },
  { key: "category", label: "Category", description: "Issue category", sample: "hvac" },
  { key: "priority", label: "Priority", description: "Issue priority", sample: "high" },
]

const WORK_ORDER_UPDATE_VARS: VariableDefinition[] = [
  ...COMMON_VARS,
  { key: "work_order_number", label: "Work Order Number", description: "Reference number", sample: "WO-2026-1234" },
  { key: "request_title", label: "Request Title", description: "Issue title", sample: "AC not working in unit G-12" },
  { key: "new_status", label: "New Status", description: "Updated work order status", sample: "In Progress" },
  { key: "status_message", label: "Status Message", description: "Status description", sample: "A technician has been assigned to your request" },
]

export const VARIABLES_BY_EVENT: Record<EventType, VariableDefinition[]> = {
  invoice_created: INVOICE_VARS,
  payment_due: PAYMENT_VARS,
  lease_expiry: LEASE_VARS,
  cam_generated: CAM_VARS,
  support_request: SUPPORT_REQUEST_VARS,
  work_order_update: WORK_ORDER_UPDATE_VARS,
}

// Sample data for preview rendering
export const SAMPLE_DATA: Record<EventType, Record<string, string>> = {
  support_request: {
    tenant_name: "Nike Store",
    property_name: "Phoenix MarketCity",
    work_order_number: "WO-2026-1234",
    request_title: "AC not working in unit G-12",
    category: "hvac",
    priority: "high",
  },
  work_order_update: {
    tenant_name: "Nike Store",
    property_name: "Phoenix MarketCity",
    work_order_number: "WO-2026-1234",
    request_title: "AC not working in unit G-12",
    new_status: "In Progress",
    status_message: "A technician has been assigned to your request",
  },
  invoice_created: {
    tenant_name: "Nike Store",
    property_name: "Phoenix MarketCity",
    invoice_number: "INV-2026-004521",
    invoice_amount: "₹1,25,000",
    due_date: "15 Apr 2026",
  },
  payment_due: {
    tenant_name: "Nike Store",
    property_name: "Phoenix MarketCity",
    invoice_number: "INV-2026-004521",
    invoice_amount: "₹1,25,000",
    due_date: "15 Apr 2026",
    days_overdue: "7",
  },
  lease_expiry: {
    tenant_name: "Nike Store",
    property_name: "Phoenix MarketCity",
    lease_end_date: "31 Dec 2026",
    unit_number: "G-12",
    days_until_expiry: "30",
  },
  cam_generated: {
    tenant_name: "Nike Store",
    property_name: "Phoenix MarketCity",
    cam_category: "Electricity",
    cam_amount: "₹12,500",
    cam_period: "Mar 2026",
  },
}

// ── Default templates (seeded per org) ───────────────────────────────────────

export interface DefaultTemplate {
  name: string
  channel: Channel
  eventType: EventType
  subject: string | null
  body: string
}

export const DEFAULT_TEMPLATES: DefaultTemplate[] = [
  {
    name: "Invoice Created – Email",
    channel: "email",
    eventType: "invoice_created",
    subject: "New Invoice {{invoice_number}} – {{property_name}}",
    body: `Dear {{tenant_name}},

A new invoice has been generated for your unit at {{property_name}}.

Invoice: {{invoice_number}}
Amount: {{invoice_amount}}
Due Date: {{due_date}}

Please ensure timely payment to avoid late fees.

Regards,
{{property_name}} Management`,
  },
  {
    name: "Payment Reminder – Email",
    channel: "email",
    eventType: "payment_due",
    subject: "Payment Reminder – Invoice {{invoice_number}}",
    body: `Dear {{tenant_name}},

This is a reminder that invoice {{invoice_number}} for {{invoice_amount}} was due on {{due_date}}.

It is now {{days_overdue}} days overdue. Please arrange payment at the earliest.

Regards,
{{property_name}} Management`,
  },
  {
    name: "Payment Reminder – SMS",
    channel: "sms",
    eventType: "payment_due",
    subject: null,
    body: "Hi {{tenant_name}}, your payment of {{invoice_amount}} (Inv: {{invoice_number}}) is overdue by {{days_overdue}} days. Please pay immediately. – {{property_name}}",
  },
  {
    name: "Lease Expiry Notice – Email",
    channel: "email",
    eventType: "lease_expiry",
    subject: "Lease Expiry Notice – Unit {{unit_number}}",
    body: `Dear {{tenant_name}},

Your lease for unit {{unit_number}} at {{property_name}} is expiring on {{lease_end_date}} ({{days_until_expiry}} days remaining).

Please contact the leasing office to discuss renewal options.

Regards,
{{property_name}} Management`,
  },
  {
    name: "CAM Charge Generated – Email",
    channel: "email",
    eventType: "cam_generated",
    subject: "CAM Charge – {{cam_category}} for {{cam_period}}",
    body: `Dear {{tenant_name}},

A Common Area Maintenance charge has been generated for your unit at {{property_name}}.

Category: {{cam_category}}
Amount: {{cam_amount}}
Period: {{cam_period}}

This will be reflected in your next invoice.

Regards,
{{property_name}} Management`,
  },
]
