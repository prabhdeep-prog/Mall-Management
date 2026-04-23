import { db } from "@/lib/db"
import {
  camCharges,
  camAllocations,
  leases,
  tenants,
  tenantFootfall,
  invoices,
} from "@/lib/db/schema"
import { eq, and, sql, gte, lte } from "drizzle-orm"

// ── Types ────────────────────────────────────────────────────────────────────

export interface AllocationResult {
  tenantId: string
  tenantName: string
  leaseId: string | null
  unitNumber: string
  areaSqft: string
  ratio: number
  allocatedAmount: number
}

export interface AllocationPreview {
  chargeId?: string
  category: string
  totalAmount: number
  allocationMethod: string
  periodStart: string
  periodEnd: string
  allocations: AllocationResult[]
}

// ── Helpers ──────────────────────────────────────────────────────────────────

async function getActiveTenantsForProperty(propertyId: string) {
  const results = await db
    .select({
      tenantId: tenants.id,
      tenantName: tenants.businessName,
      leaseId: leases.id,
      unitNumber: leases.unitNumber,
      areaSqft: leases.areaSqft,
    })
    .from(leases)
    .innerJoin(tenants, eq(leases.tenantId, tenants.id))
    .where(
      and(
        eq(leases.propertyId, propertyId),
        eq(leases.status, "active"),
        eq(tenants.status, "active")
      )
    )

  return results
}

// ── Allocation Formulas ──────────────────────────────────────────────────────

function allocatePerSqft(
  tenantLeases: Awaited<ReturnType<typeof getActiveTenantsForProperty>>,
  totalAmount: number
): AllocationResult[] {
  const totalArea = tenantLeases.reduce(
    (sum, t) => sum + parseFloat(t.areaSqft),
    0
  )

  if (totalArea === 0) return []

  return tenantLeases.map((t) => {
    const area = parseFloat(t.areaSqft)
    const ratio = area / totalArea
    return {
      tenantId: t.tenantId,
      tenantName: t.tenantName,
      leaseId: t.leaseId,
      unitNumber: t.unitNumber,
      areaSqft: t.areaSqft,
      ratio: Math.round(ratio * 10000) / 10000,
      allocatedAmount: Math.round(totalAmount * ratio * 100) / 100,
    }
  })
}

function allocateEqual(
  tenantLeases: Awaited<ReturnType<typeof getActiveTenantsForProperty>>,
  totalAmount: number
): AllocationResult[] {
  const count = tenantLeases.length
  if (count === 0) return []

  const perTenant = Math.round((totalAmount / count) * 100) / 100
  const ratio = Math.round((1 / count) * 10000) / 10000

  return tenantLeases.map((t) => ({
    tenantId: t.tenantId,
    tenantName: t.tenantName,
    leaseId: t.leaseId,
    unitNumber: t.unitNumber,
    areaSqft: t.areaSqft,
    ratio,
    allocatedAmount: perTenant,
  }))
}

async function allocateByFootfall(
  tenantLeases: Awaited<ReturnType<typeof getActiveTenantsForProperty>>,
  totalAmount: number,
  periodStart: string,
  periodEnd: string
): Promise<AllocationResult[]> {
  if (tenantLeases.length === 0) return []

  const tenantIds = tenantLeases.map((t) => t.tenantId)

  const footfallRows = await db
    .select({
      tenantId: tenantFootfall.tenantId,
      total: sql<number>`COALESCE(SUM(${tenantFootfall.footfall}), 0)`.as("total"),
    })
    .from(tenantFootfall)
    .where(
      and(
        sql`${tenantFootfall.tenantId} IN ${tenantIds}`,
        gte(tenantFootfall.date, periodStart),
        lte(tenantFootfall.date, periodEnd)
      )
    )
    .groupBy(tenantFootfall.tenantId)

  const footfallMap = new Map(
    footfallRows.map((r) => [r.tenantId, Number(r.total)])
  )

  const totalFootfall = footfallRows.reduce(
    (sum, r) => sum + Number(r.total),
    0
  )

  // If no footfall data, fall back to equal split
  if (totalFootfall === 0) {
    return allocateEqual(tenantLeases, totalAmount)
  }

  return tenantLeases.map((t) => {
    const ff = footfallMap.get(t.tenantId) ?? 0
    const ratio = ff / totalFootfall
    return {
      tenantId: t.tenantId,
      tenantName: t.tenantName,
      leaseId: t.leaseId,
      unitNumber: t.unitNumber,
      areaSqft: t.areaSqft,
      ratio: Math.round(ratio * 10000) / 10000,
      allocatedAmount: Math.round(totalAmount * ratio * 100) / 100,
    }
  })
}

// ── Rounding remainder adjustment ────────────────────────────────────────────

function adjustRemainder(allocations: AllocationResult[], totalAmount: number): void {
  if (allocations.length === 0) return
  const totalAllocated = allocations.reduce((s, a) => s + a.allocatedAmount, 0)
  const remainder = Math.round((totalAmount - totalAllocated) * 100) / 100
  if (remainder !== 0) {
    allocations[allocations.length - 1].allocatedAmount += remainder
  }
}

// ── Preview (dry-run, no DB writes) ──────────────────────────────────────────

export async function previewCAM(params: {
  propertyId: string
  category: string
  totalAmount: number
  allocationMethod: string
  periodStart: string
  periodEnd: string
}): Promise<AllocationPreview> {
  const tenantLeases = await getActiveTenantsForProperty(params.propertyId)

  if (tenantLeases.length === 0) {
    throw new Error("No active tenants found for this property")
  }

  let allocations: AllocationResult[]

  switch (params.allocationMethod) {
    case "per_sqft":
      allocations = allocatePerSqft(tenantLeases, params.totalAmount)
      break
    case "equal":
      allocations = allocateEqual(tenantLeases, params.totalAmount)
      break
    case "footfall":
      allocations = await allocateByFootfall(
        tenantLeases,
        params.totalAmount,
        params.periodStart,
        params.periodEnd
      )
      break
    default:
      throw new Error(`Unknown allocation method: ${params.allocationMethod}`)
  }

  adjustRemainder(allocations, params.totalAmount)

  return {
    category: params.category,
    totalAmount: params.totalAmount,
    allocationMethod: params.allocationMethod,
    periodStart: params.periodStart,
    periodEnd: params.periodEnd,
    allocations,
  }
}

// ── Allocate (persist to DB) ─────────────────────────────────────────────────

export async function allocateCAM(chargeId: string): Promise<AllocationPreview> {
  // 1. Fetch the CAM charge
  const charge = await db.query.camCharges.findFirst({
    where: eq(camCharges.id, chargeId),
  })

  if (!charge) throw new Error("CAM charge not found")
  if (charge.status === "allocated") throw new Error("CAM charge already allocated")

  // 2. Get active tenants for the property
  const tenantLeases = await getActiveTenantsForProperty(charge.propertyId)

  if (tenantLeases.length === 0) {
    throw new Error("No active tenants found for this property")
  }

  const totalAmount = parseFloat(charge.totalAmount)

  // 3. Calculate allocations based on method
  let allocations: AllocationResult[]

  switch (charge.allocationMethod) {
    case "per_sqft":
      allocations = allocatePerSqft(tenantLeases, totalAmount)
      break
    case "equal":
      allocations = allocateEqual(tenantLeases, totalAmount)
      break
    case "footfall":
      allocations = await allocateByFootfall(
        tenantLeases,
        totalAmount,
        charge.periodStart,
        charge.periodEnd
      )
      break
    default:
      throw new Error(`Unknown allocation method: ${charge.allocationMethod}`)
  }

  adjustRemainder(allocations, totalAmount)

  // 4. Insert allocations + update charge status in a transaction
  await db.transaction(async (tx) => {
    // Insert all allocations
    await tx.insert(camAllocations).values(
      allocations.map((a) => ({
        chargeId,
        tenantId: a.tenantId,
        leaseId: a.leaseId,
        ratio: a.ratio.toString(),
        allocatedAmount: a.allocatedAmount.toString(),
      }))
    )

    // Mark charge as allocated
    await tx
      .update(camCharges)
      .set({ status: "allocated", updatedAt: new Date() })
      .where(eq(camCharges.id, chargeId))
  })

  return {
    chargeId,
    category: charge.category,
    totalAmount,
    allocationMethod: charge.allocationMethod,
    periodStart: charge.periodStart,
    periodEnd: charge.periodEnd,
    allocations,
  }
}

// ── Invoice generation from allocations ──────────────────────────────────────

export async function createCAMInvoices(
  chargeId: string,
  dueDate: string,
  createdBy?: string
) {
  const charge = await db.query.camCharges.findFirst({
    where: eq(camCharges.id, chargeId),
  })

  if (!charge) throw new Error("CAM charge not found")
  if (charge.status !== "allocated") throw new Error("CAM charge must be allocated first")

  const allocs = await db
    .select({
      allocation: camAllocations,
      lease: leases,
    })
    .from(camAllocations)
    .innerJoin(leases, eq(camAllocations.leaseId, leases.id))
    .where(eq(camAllocations.chargeId, chargeId))

  const created: string[] = []

  await db.transaction(async (tx) => {
    for (const { allocation, lease } of allocs) {
      const invoiceNumber = `CAM-${new Date().getFullYear()}-${Math.floor(Math.random() * 100000).toString().padStart(6, "0")}`

      const [inv] = await tx
        .insert(invoices)
        .values({
          leaseId: lease.id,
          invoiceNumber,
          invoiceType: "cam",
          periodStart: charge.periodStart,
          periodEnd: charge.periodEnd,
          amount: allocation.allocatedAmount,
          gstAmount: "0",
          totalAmount: allocation.allocatedAmount,
          dueDate,
          status: "pending",
          createdBy,
          metadata: {
            camChargeId: chargeId,
            camCategory: charge.category,
            camAllocationId: allocation.id,
          },
        })
        .returning({ id: invoices.id })

      created.push(inv.id)
    }

    // Mark charge as invoiced
    await tx
      .update(camCharges)
      .set({ status: "invoiced", updatedAt: new Date() })
      .where(eq(camCharges.id, chargeId))
  })

  return created
}
