/**
 * Smart Tenant Onboarding Service
 * ──────────────────────────────────
 * Pure business logic — no auth checks. API routes call this after permission
 * gates. All queries run inside an org-scoped transaction (RLS).
 */
import { eq, and } from "drizzle-orm"
import { db } from "@/lib/db"
import {
  tenants,
  tenantOnboarding,
  tenantDocuments,
} from "@/lib/db/schema"
import type { TenantOnboarding, TenantDocument } from "@/lib/db/schema"

// ── constants ──────────────────────────────────────────────────────────────

const VALID_DOC_TYPES = ["GST", "PAN", "AGREEMENT", "LOGO", "OTHER"] as const
export type DocType = (typeof VALID_DOC_TYPES)[number]

const VALID_DOC_STATUSES = ["pending", "uploaded", "verified"] as const
export type DocStatus = (typeof VALID_DOC_STATUSES)[number]

const REQUIRED_DOC_TYPES: DocType[] = ["GST", "PAN", "AGREEMENT"]

const CHECKLIST_FIELDS = [
  "kycCompleted",
  "leaseSigned",
  "depositPaid",
  "posConnected",
  "storeOpeningDate",
] as const

// Checklist = 70 %, documents = 30 %. Each checklist field is equal share.
const CHECKLIST_WEIGHT = 70
const DOCUMENT_WEIGHT = 30
const CHECKLIST_ITEM_VALUE = CHECKLIST_WEIGHT / CHECKLIST_FIELDS.length // 14

// ── helpers ────────────────────────────────────────────────────────────────

export function isValidDocType(t: string): t is DocType {
  return (VALID_DOC_TYPES as readonly string[]).includes(t)
}

export function isValidDocStatus(s: string): s is DocStatus {
  return (VALID_DOC_STATUSES as readonly string[]).includes(s)
}

// ── tenant existence check ─────────────────────────────────────────────────

export async function ensureTenantExists(tenantId: string): Promise<boolean> {
  const [row] = await db
    .select({ id: tenants.id })
    .from(tenants)
    .where(eq(tenants.id, tenantId))
    .limit(1)
  return !!row
}

// ── get or create onboarding row ───────────────────────────────────────────

export async function getOrCreateOnboarding(tenantId: string): Promise<TenantOnboarding> {
  const [existing] = await db
    .select()
    .from(tenantOnboarding)
    .where(eq(tenantOnboarding.tenantId, tenantId))
    .limit(1)

  if (existing) return existing

  const [created] = await db
    .insert(tenantOnboarding)
    .values({ tenantId })
    .returning()

  return created
}

// ── get documents ──────────────────────────────────────────────────────────

export async function getDocuments(tenantId: string): Promise<TenantDocument[]> {
  return db
    .select()
    .from(tenantDocuments)
    .where(eq(tenantDocuments.tenantId, tenantId))
}

// ── progress ───────────────────────────────────────────────────────────────

export interface OnboardingProgress {
  progress: number
  checklistProgress: number
  documentProgress: number
  status: "not_started" | "in_progress" | "completed"
}

export function computeProgress(
  onboarding: TenantOnboarding,
  docs: TenantDocument[],
): OnboardingProgress {
  // Checklist: each boolean true or non-null storeOpeningDate counts.
  let checklistDone = 0
  if (onboarding.kycCompleted) checklistDone++
  if (onboarding.leaseSigned) checklistDone++
  if (onboarding.depositPaid) checklistDone++
  if (onboarding.posConnected) checklistDone++
  if (onboarding.storeOpeningDate) checklistDone++
  const checklistProgress = Math.round(checklistDone * CHECKLIST_ITEM_VALUE * 100) / 100

  // Documents: each *verified* required doc contributes equally.
  const verifiedRequired = REQUIRED_DOC_TYPES.filter((t) =>
    docs.some((d) => d.type === t && d.status === "verified"),
  ).length
  const docItemValue = REQUIRED_DOC_TYPES.length > 0 ? DOCUMENT_WEIGHT / REQUIRED_DOC_TYPES.length : 0
  const documentProgress = Math.round(verifiedRequired * docItemValue * 100) / 100

  const progress = Math.round(checklistProgress + documentProgress)

  let status: OnboardingProgress["status"] = "not_started"
  if (progress >= 100 || onboarding.completedAt) {
    status = "completed"
  } else if (progress > 0) {
    status = "in_progress"
  }

  return { progress: Math.min(progress, 100), checklistProgress, documentProgress, status }
}

// ── auto-complete ──────────────────────────────────────────────────────────

export function isFullyComplete(onboarding: TenantOnboarding, docs: TenantDocument[]): boolean {
  const allChecklist =
    onboarding.kycCompleted &&
    onboarding.leaseSigned &&
    onboarding.depositPaid &&
    onboarding.posConnected &&
    !!onboarding.storeOpeningDate

  const allDocs = REQUIRED_DOC_TYPES.every((t) =>
    docs.some((d) => d.type === t && d.status === "verified"),
  )

  return allChecklist && allDocs
}

async function maybeAutoComplete(tenantId: string): Promise<void> {
  const onboarding = await getOrCreateOnboarding(tenantId)
  if (onboarding.completedAt) return

  const docs = await getDocuments(tenantId)
  if (!isFullyComplete(onboarding, docs)) return

  const now = new Date()
  await db
    .update(tenantOnboarding)
    .set({ completedAt: now, updatedAt: now })
    .where(eq(tenantOnboarding.tenantId, tenantId))
}

// ── update checklist ───────────────────────────────────────────────────────

export interface ChecklistUpdate {
  kycCompleted?: boolean
  leaseSigned?: boolean
  depositPaid?: boolean
  posConnected?: boolean
  storeOpeningDate?: string | null // ISO-8601
}

export async function updateChecklist(
  tenantId: string,
  patch: ChecklistUpdate,
): Promise<TenantOnboarding> {
  await getOrCreateOnboarding(tenantId)

  const now = new Date()
  const set: Record<string, unknown> = { updatedAt: now }

  if (patch.kycCompleted !== undefined) set.kycCompleted = patch.kycCompleted
  if (patch.leaseSigned !== undefined) set.leaseSigned = patch.leaseSigned
  if (patch.depositPaid !== undefined) set.depositPaid = patch.depositPaid
  if (patch.posConnected !== undefined) set.posConnected = patch.posConnected
  if (patch.storeOpeningDate !== undefined) {
    set.storeOpeningDate = patch.storeOpeningDate ? new Date(patch.storeOpeningDate) : null
  }

  // If a field is flipped to false, clear completedAt.
  const anyFalse = Object.values(patch).some((v) => v === false || v === null)
  if (anyFalse) set.completedAt = null

  const [updated] = await db
    .update(tenantOnboarding)
    .set(set)
    .where(eq(tenantOnboarding.tenantId, tenantId))
    .returning()

  await maybeAutoComplete(tenantId)

  // Re-fetch in case autoComplete changed it.
  const [final] = await db
    .select()
    .from(tenantOnboarding)
    .where(eq(tenantOnboarding.tenantId, tenantId))
    .limit(1)

  return final
}

// ── upsert document ────────────────────────────────────────────────────────

export interface DocumentUpsert {
  type: DocType
  fileUrl?: string | null
}

export async function upsertDocument(
  tenantId: string,
  input: DocumentUpsert,
): Promise<TenantDocument> {
  const now = new Date()
  const [existing] = await db
    .select()
    .from(tenantDocuments)
    .where(and(eq(tenantDocuments.tenantId, tenantId), eq(tenantDocuments.type, input.type)))
    .limit(1)

  if (existing) {
    const [updated] = await db
      .update(tenantDocuments)
      .set({
        status: "uploaded",
        fileUrl: input.fileUrl ?? existing.fileUrl,
        uploadedAt: now,
      })
      .where(eq(tenantDocuments.id, existing.id))
      .returning()

    await maybeAutoComplete(tenantId)
    return updated
  }

  const [created] = await db
    .insert(tenantDocuments)
    .values({
      tenantId,
      type: input.type,
      status: "uploaded",
      fileUrl: input.fileUrl ?? null,
      uploadedAt: now,
    })
    .returning()

  await maybeAutoComplete(tenantId)
  return created
}

// ── update document status ─────────────────────────────────────────────────

export async function updateDocumentStatus(
  tenantId: string,
  docId: string,
  status: DocStatus,
): Promise<TenantDocument | null> {
  const [doc] = await db
    .select()
    .from(tenantDocuments)
    .where(and(eq(tenantDocuments.id, docId), eq(tenantDocuments.tenantId, tenantId)))
    .limit(1)

  if (!doc) return null

  const now = new Date()
  const set: Record<string, unknown> = { status }
  if (status === "verified") set.verifiedAt = now

  const [updated] = await db
    .update(tenantDocuments)
    .set(set)
    .where(eq(tenantDocuments.id, docId))
    .returning()

  await maybeAutoComplete(tenantId)
  return updated
}
