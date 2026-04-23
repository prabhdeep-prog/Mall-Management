import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { db } from "@/lib/db"
import { leases, tenants, properties, posIntegrations } from "@/lib/db/schema"
import { eq, desc, and, lte, gte } from "drizzle-orm"
import { PERMISSIONS, requirePermission } from "@/lib/auth/rbac"
import { getPOSProvider } from "@/lib/pos"
import type { POSProviderKey } from "@/lib/pos/types"
import { writeAuditLog, extractRequestMeta } from "@/lib/audit/log"

export async function GET(request: NextRequest) {
  try {
    const { authorized, error } = await requirePermission(PERMISSIONS.LEASES_VIEW)
    if (!authorized) {
      return NextResponse.json({ error }, { status: 403 })
    }

    const { searchParams } = new URL(request.url)
    const propertyId = searchParams.get("propertyId")
    const tenantId = searchParams.get("tenantId")
    const status = searchParams.get("status")

    // Build conditions
    const conditions = []
    if (propertyId) conditions.push(eq(leases.propertyId, propertyId))
    if (tenantId) conditions.push(eq(leases.tenantId, tenantId))
    if (status) conditions.push(eq(leases.status, status))

    const allLeases = await db
      .select({
        lease: leases,
        tenant: tenants,
        property: properties,
      })
      .from(leases)
      .leftJoin(tenants, eq(leases.tenantId, tenants.id))
      .leftJoin(properties, eq(leases.propertyId, properties.id))
      .where(conditions.length > 0 ? and(...conditions) : undefined)
      .orderBy(desc(leases.startDate))

    const result = allLeases.map(({ lease, tenant, property }) => ({
      ...lease,
      tenant: tenant ? {
        id: tenant.id,
        businessName: tenant.businessName,
        contactPerson: tenant.contactPerson,
      } : null,
      property: property ? {
        id: property.id,
        name: property.name,
        code: property.code,
      } : null,
    }))

    return NextResponse.json({ success: true, data: result })
  } catch (error) {
    console.error("Get leases error:", error)
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    )
  }
}

export async function POST(request: NextRequest) {
  try {
    const { authorized, error } = await requirePermission(PERMISSIONS.LEASES_CREATE)
    if (!authorized) {
      return NextResponse.json({ error }, { status: 403 })
    }

    const body = await request.json()
    const {
      tenantId,
      propertyId,
      unitNumber,
      floor,
      zone,
      areaSqft,
      leaseType = "fixed_rent",
      baseRent,
      revenueSharePercentage,
      camCharges,
      maintenanceCharges,
      securityDeposit,
      startDate,
      endDate,
      escalationRate,
      escalationFrequency,
      lockInPeriod,
      fitOutPeriod,
      rentFreePeriod,
      terminationNoticeDays,
      status = "active",
      // POS Integration fields (only used for revenue_share/hybrid/minimum_guarantee)
      posProvider,
      posStoreId,
      posApiKey,
      posSyncFrequency,
    } = body

    // Validate required fields
    if (!tenantId || !propertyId || !unitNumber || !areaSqft || !startDate || !endDate) {
      return NextResponse.json(
        { error: "Missing required fields: tenantId, propertyId, unitNumber, areaSqft, startDate, endDate" },
        { status: 400 }
      )
    }

    // Validate tenant exists
    const tenant = await db.query.tenants.findFirst({
      where: eq(tenants.id, tenantId),
    })
    if (!tenant) {
      return NextResponse.json({ error: "Tenant not found" }, { status: 404 })
    }

    // Validate property exists
    const property = await db.query.properties.findFirst({
      where: eq(properties.id, propertyId),
    })
    if (!property) {
      return NextResponse.json({ error: "Property not found" }, { status: 404 })
    }

    // Check for overlapping leases on the same unit (date-range overlap check)
    const overlappingLease = await db.query.leases.findFirst({
      where: and(
        eq(leases.propertyId, propertyId),
        eq(leases.unitNumber, unitNumber),
        eq(leases.status, "active"),
        // Date range overlap: existing.startDate <= new.endDate AND existing.endDate >= new.startDate
        lte(leases.startDate, endDate),
        gte(leases.endDate, startDate)
      ),
    })
    if (overlappingLease) {
      return NextResponse.json(
        { error: `Unit ${unitNumber} already has an active lease for this period (${overlappingLease.startDate} to ${overlappingLease.endDate}). Choose different dates or a different unit.` },
        { status: 400 }
      )
    }

    // Parse floor - can be number or text like "Ground", "Basement"
    let floorNumber: number | null = null
    if (floor) {
      const parsed = parseInt(floor)
      if (!isNaN(parsed)) {
        floorNumber = parsed
      } else if (floor.toLowerCase() === "ground" || floor.toLowerCase() === "g") {
        floorNumber = 0
      } else if (floor.toLowerCase() === "basement" || floor.toLowerCase() === "b1") {
        floorNumber = -1
      }
    }

    // Create lease
    const [newLease] = await db
      .insert(leases)
      .values({
        tenantId,
        propertyId,
        unitNumber,
        floor: floorNumber,
        zone: zone || null,
        areaSqft: areaSqft.toString(),
        leaseType,
        baseRent: baseRent?.toString() || null,
        revenueSharePercentage: revenueSharePercentage?.toString() || null,
        camCharges: camCharges?.toString() || null,
        securityDeposit: securityDeposit?.toString() || null,
        startDate: startDate,
        endDate: endDate,
        rentEscalationPercentage: escalationRate?.toString() || null,
        escalationFrequencyMonths: escalationFrequency ? parseInt(escalationFrequency.toString()) : null,
        lockInPeriodMonths: lockInPeriod ? parseInt(lockInPeriod.toString()) : null,
        noticePeriodMonths: terminationNoticeDays ? Math.ceil(parseInt(terminationNoticeDays.toString()) / 30) : null,
        status,
        // Store additional fields in metadata JSON
        metadata: {
          fitOutPeriod: fitOutPeriod || null,
          rentFreePeriod: rentFreePeriod || null,
          terminationNoticeDays: terminationNoticeDays || 90,
          maintenanceCharges: maintenanceCharges || null,
          floorName: floor || null, // Store original floor name
        },
      })
      .returning()

    // If this is a revenue-share/hybrid lease with POS details, create POS integration
    const isRevShareLease = ["revenue_share", "hybrid", "minimum_guarantee"].includes(leaseType)
    let posIntegration = null

    if (isRevShareLease && posProvider && posStoreId && posApiKey) {
      try {
        // Test connection first
        const posProviderAdapter = getPOSProvider(posProvider as POSProviderKey, {
          apiKey: posApiKey,
          storeId: posStoreId,
        })
        const testResult = await posProviderAdapter.testConnection()

        if (!testResult.ok) {
          return NextResponse.json({
            success: true,
            data: newLease,
            message: `Lease created, but POS connection failed: ${testResult.error}. You can connect POS later from Revenue Intelligence.`,
            posError: testResult.error,
          })
        }

        // Create POS integration record (no mock data sync — use POS Simulator)
        const [newPosIntegration] = await db
          .insert(posIntegrations)
          .values({
            tenantId,
            propertyId,
            leaseId: newLease.id,
            provider: posProvider,
            storeId: posStoreId,
            locationId: null,
            apiKeyEncrypted: posApiKey,
            syncFrequency: posSyncFrequency || "daily",
            status: "connected",
            lastSyncAt: new Date(),
            lastSyncStatus: "success",
          })
          .returning()
        posIntegration = newPosIntegration
      } catch (posError) {
        console.error("POS integration error (lease was created):", posError)
      }
    }

    // ── Audit log ─────────────────────────────────────────────────────────────
    const session = await auth()
    const meta = extractRequestMeta(request)
    void writeAuditLog({
      organizationId: session?.user?.organizationId ?? "",
      action:        "lease.create",
      entity:        "lease",
      entityId:      newLease.id,
      before:        null,
      after:         newLease as unknown as Record<string, unknown>,
      changedFields: null,
      userId:        session?.user?.id,
      ...meta,
    })
    // ── End audit ─────────────────────────────────────────────────────────────

    return NextResponse.json({
      success: true,
      data: newLease,
      posIntegration,
      message: posIntegration
        ? "Lease created with POS integration. Use POS Simulator to enter sales."
        : "Lease created successfully",
    })
  } catch (error) {
    console.error("Create lease error:", error)
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    )
  }
}
