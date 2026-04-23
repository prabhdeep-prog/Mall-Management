/**
 * POST /api/tenants/onboarding/start
 * ─────────────────────────────────────────────────────────────────────────────
 * Creates a new tenant record in LEAD_CREATED state and seeds the onboarding
 * checklist + approval rows.
 *
 * Body:
 *   businessName, brandName, legalEntityName, category, gstin, pan,
 *   contactPerson, email, phone, address, emergencyContact,
 *   targetOpeningDate, propertyId (optional — can attach later)
 */

import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { db } from "@/lib/db"
import { tenants, tenantOnboardingChecklist, tenantOnboardingApprovals } from "@/lib/db/schema"
import { eq } from "drizzle-orm"
import { requirePermission, PERMISSIONS } from "@/lib/auth/rbac"
import { writeAuditLog } from "@/lib/audit/log"
import { sanitizeString } from "@/lib/security/sanitize"

// GST format: 15-char alphanumeric  (2-digit state + 10-char PAN + 1Z + checksum)
const GST_RE  = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$/
const PAN_RE  = /^[A-Z]{5}[0-9]{4}[A-Z]{1}$/
const PHONE_RE = /^[+]?[0-9\s\-().]{7,20}$/

// Default checklist items seeded for every new tenant
const DEFAULT_CHECKLIST = [
  { item: "gst_certificate",      label: "GST Registration Certificate",      required: true  },
  { item: "pan_card",             label: "PAN Card Copy",                      required: true  },
  { item: "incorporation_cert",   label: "Company Incorporation Certificate",  required: true  },
  { item: "brand_logo",           label: "Brand Logo (PNG/SVG, high-res)",     required: true  },
  { item: "insurance_cert",       label: "Insurance Certificate",              required: true  },
  { item: "fire_compliance",      label: "Fire Compliance NOC",                required: false },
  { item: "trade_license",        label: "Trade / Shop Establishment License", required: true  },
  { item: "bank_details",         label: "Bank Account Details (cancelled cheque)", required: true  },
]

// Approval roles required before tenant can be activated
const APPROVAL_ROLES = ["leasing_manager", "finance_manager", "operations_manager"]

export async function POST(request: NextRequest) {
  const { authorized, error } = await requirePermission(PERMISSIONS.ONBOARDING_MANAGE)
  if (!authorized) return NextResponse.json({ error }, { status: 403 })

  const session = await auth()
  const organizationId = session?.user?.organizationId
  if (!organizationId) return NextResponse.json({ error: "No organization context" }, { status: 400 })

  let body: Record<string, unknown>
  try { body = await request.json() }
  catch { return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 }) }

  // ── Validation ───────────────────────────────────────────────────────────────
  const errors: string[] = []

  const businessName    = sanitizeString(String(body.businessName    || "").trim())
  const brandName       = sanitizeString(String(body.brandName       || "").trim())
  const legalEntityName = sanitizeString(String(body.legalEntityName || "").trim())
  const category        = sanitizeString(String(body.category        || "").trim())
  const gstin           = sanitizeString(String(body.gstin           || "").trim().toUpperCase())
  const pan             = sanitizeString(String(body.pan             || "").trim().toUpperCase())
  const contactPerson   = sanitizeString(String(body.contactPerson   || "").trim())
  const email           = sanitizeString(String(body.email           || "").trim().toLowerCase())
  const phone           = sanitizeString(String(body.phone           || "").trim())
  const propertyId      = body.propertyId ? String(body.propertyId) : null
  const targetOpeningDate = body.targetOpeningDate ? String(body.targetOpeningDate) : null
  const emergencyContact = body.emergencyContact as Record<string, string> | undefined

  if (!businessName)  errors.push("businessName is required")
  if (!contactPerson) errors.push("contactPerson is required")
  if (!email)         errors.push("email is required")
  if (!phone)         errors.push("phone is required")

  if (gstin && !GST_RE.test(gstin))   errors.push("Invalid GST number format")
  if (pan  && !PAN_RE.test(pan))       errors.push("Invalid PAN number format")
  if (phone && !PHONE_RE.test(phone))  errors.push("Invalid phone number format")
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) errors.push("Invalid email format")

  if (errors.length) return NextResponse.json({ error: "Validation failed", errors }, { status: 422 })

  // ── Email uniqueness check ────────────────────────────────────────────────────
  if (email) {
    const existing = await db.query.tenants.findFirst({ where: eq(tenants.email, email) })
    if (existing) return NextResponse.json({ error: "A tenant with this email already exists" }, { status: 409 })
  }

  // ── Create tenant + checklist + approvals ─────────────────────────────────────
  const tenantId = crypto.randomUUID()

  await db.insert(tenants).values({
    id:               tenantId,
    propertyId:       propertyId ?? undefined,
    businessName,
    brandName:        brandName || null,
    legalEntityName:  legalEntityName || null,
    category:         category || null,
    contactPerson,
    email,
    phone,
    gstin:            gstin || null,
    pan:              pan   || null,
    status:           "inactive", // stays inactive until ACTIVE stage
    onboardingStatus: "LEAD_CREATED",
    onboardingStartedAt: new Date(),
    targetOpeningDate:   targetOpeningDate ?? undefined,
    emergencyContact:    emergencyContact ?? {},
    metadata: { createdBy: session.user?.id, source: "onboarding_wizard" },
  })

  // Seed checklist
  await db.insert(tenantOnboardingChecklist).values(
    DEFAULT_CHECKLIST.map((c) => ({
      tenantId,
      item:     c.item,
      label:    c.label,
      required: c.required,
    }))
  )

  // Seed approval rows
  await db.insert(tenantOnboardingApprovals).values(
    APPROVAL_ROLES.map((role) => ({ tenantId, approverRole: role }))
  )

  // Audit log
  await writeAuditLog({
    organizationId,
    action:   "onboarding.start",
    entity:   "tenant",
    entityId: tenantId,
    after:    { tenantId, businessName, onboardingStatus: "LEAD_CREATED" },
    userId:   session.user?.id,
    ipAddress: request.headers.get("x-forwarded-for") ?? null,
  })

  return NextResponse.json({
    success: true,
    data: { tenantId, onboardingStatus: "LEAD_CREATED", message: "Onboarding started" },
  }, { status: 201 })
}
