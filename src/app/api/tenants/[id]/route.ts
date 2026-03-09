import { NextRequest, NextResponse } from "next/server"
import { db } from "@/lib/db"
import { tenants, leases, invoices, workOrders, properties } from "@/lib/db/schema"
import { eq, and, desc, sql } from "drizzle-orm"
import { PERMISSIONS, requirePermission } from "@/lib/auth/rbac"
import { auth } from "@/lib/auth"

// Extended fields stored in metadata
interface TenantMetadata {
  brandName?: string
  businessType?: string
  designation?: string
  authorizedSignatory?: string
  signatoryPhone?: string
  signatoryEmail?: string
  tan?: string
  cin?: string
  fssaiLicense?: string
  shopEstablishmentNumber?: string
  registeredAddress?: string
  registeredCity?: string
  registeredState?: string
  registeredPincode?: string
  bankName?: string
  bankBranch?: string
  accountNumber?: string
  ifscCode?: string
  accountHolderName?: string
  emergencyContactName?: string
  emergencyContactPhone?: string
  website?: string
}

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const { authorized, error } = await requirePermission(PERMISSIONS.TENANTS_VIEW)
    if (!authorized) {
      return NextResponse.json({ error }, { status: 403 })
    }

    const tenantId = params.id

    // Validate UUID format
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
    if (!uuidRegex.test(tenantId)) {
      return NextResponse.json(
        { success: false, error: "Invalid tenant ID format" },
        { status: 400 }
      )
    }

    // Fetch tenant with property info
    const tenant = await db.query.tenants.findFirst({
      where: eq(tenants.id, tenantId),
      with: {
        property: true,
      },
    })

    if (!tenant) {
      return NextResponse.json(
        { success: false, error: "Tenant not found" },
        { status: 404 }
      )
    }

    // ── IDOR guard: org isolation ────────────────────────────────────────────
    // Tenants belong to a property which belongs to an org.
    // A user from org-A must never read a tenant from org-B — return 404
    // (not 403) to avoid leaking resource existence.
    const session = await auth()
    if (
      session?.user?.role !== "super_admin" &&
      tenant.property?.organizationId !== session?.user?.organizationId
    ) {
      return NextResponse.json(
        { success: false, error: "Tenant not found" },
        { status: 404 }
      )
    }

    // Extract extended fields from metadata
    const metadata = (tenant.metadata || {}) as TenantMetadata

    // Fetch leases for this tenant
    const tenantLeases = await db
      .select()
      .from(leases)
      .where(eq(leases.tenantId, tenantId))
      .orderBy(desc(leases.startDate))

    // Fetch invoices for this tenant's leases
    const leaseIds = tenantLeases.map(l => l.id)
    let tenantInvoices: typeof invoices.$inferSelect[] = []
    if (leaseIds.length > 0) {
      tenantInvoices = await db
        .select()
        .from(invoices)
        .where(sql`${invoices.leaseId} IN ${leaseIds}`)
        .orderBy(desc(invoices.createdAt))
        .limit(20)
    }

    // Fetch work orders for this tenant
    const tenantWorkOrders = await db
      .select()
      .from(workOrders)
      .where(eq(workOrders.tenantId, tenantId))
      .orderBy(desc(workOrders.createdAt))
      .limit(20)

    // Calculate financial summary
    const totalRent = tenantLeases.reduce((sum, l) => sum + (parseFloat(l.baseRent || "0")), 0)
    const totalInvoiced = tenantInvoices.reduce((sum, i) => sum + (parseFloat(i.totalAmount || "0")), 0)
    const totalPaid = tenantInvoices
      .filter(i => i.status === "paid")
      .reduce((sum, i) => sum + (parseFloat(i.totalAmount || "0")), 0)
    const totalPending = tenantInvoices
      .filter(i => i.status === "pending" || i.status === "overdue")
      .reduce((sum, i) => sum + (parseFloat(i.totalAmount || "0")), 0)
    
    // Calculate work order stats
    const openWorkOrders = tenantWorkOrders.filter(w => w.status === "open" || w.status === "in_progress").length
    const resolvedWorkOrders = tenantWorkOrders.filter(w => w.status === "resolved" || w.status === "closed").length

    // Get active lease
    const activeLease = tenantLeases.find(l => l.status === "active")

    // Flatten metadata fields into the response
    const tenantDetails = {
      ...tenant,
      // Extended fields from metadata
      brandName: metadata.brandName || null,
      businessType: metadata.businessType || null,
      designation: metadata.designation || null,
      authorizedSignatory: metadata.authorizedSignatory || null,
      signatoryPhone: metadata.signatoryPhone || null,
      signatoryEmail: metadata.signatoryEmail || null,
      tan: metadata.tan || null,
      cin: metadata.cin || null,
      fssaiLicense: metadata.fssaiLicense || null,
      shopEstablishmentNumber: metadata.shopEstablishmentNumber || null,
      registeredAddress: metadata.registeredAddress || null,
      registeredCity: metadata.registeredCity || null,
      registeredState: metadata.registeredState || null,
      registeredPincode: metadata.registeredPincode || null,
      bankName: metadata.bankName || null,
      bankBranch: metadata.bankBranch || null,
      accountNumber: metadata.accountNumber || null,
      ifscCode: metadata.ifscCode || null,
      accountHolderName: metadata.accountHolderName || null,
      emergencyContactName: metadata.emergencyContactName || null,
      emergencyContactPhone: metadata.emergencyContactPhone || null,
      website: metadata.website || null,
      // Related data
      leases: tenantLeases,
      invoices: tenantInvoices,
      workOrders: tenantWorkOrders,
      activeLease,
      financialSummary: {
        monthlyRent: totalRent,
        totalInvoiced,
        totalPaid,
        totalPending,
        collectionRate: totalInvoiced > 0 ? ((totalPaid / totalInvoiced) * 100).toFixed(1) : "0",
      },
      workOrderSummary: {
        total: tenantWorkOrders.length,
        open: openWorkOrders,
        resolved: resolvedWorkOrders,
      },
    }

    return NextResponse.json({ success: true, data: tenantDetails })
  } catch (error) {
    console.error("Error fetching tenant:", error)
    return NextResponse.json(
      { success: false, error: "Failed to fetch tenant" },
      { status: 500 }
    )
  }
}

export async function PUT(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const { authorized, error } = await requirePermission(PERMISSIONS.TENANTS_EDIT)
    if (!authorized) {
      return NextResponse.json({ error }, { status: 403 })
    }

    const tenantId = params.id

    // Validate UUID format
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
    if (!uuidRegex.test(tenantId)) {
      return NextResponse.json(
        { success: false, error: "Invalid tenant ID format" },
        { status: 400 }
      )
    }

    const body = await request.json()
    
    // Core fields (stored directly in tenants table)
    const {
      businessName,
      legalEntityName,
      category,
      subcategory,
      contactPerson,
      email,
      phone,
      alternatePhone,
      gstin,
      pan,
      tradeLicense,
      status,
    } = body

    // Extended fields (stored in metadata JSON)
    const {
      brandName,
      businessType,
      designation,
      authorizedSignatory,
      signatoryPhone,
      signatoryEmail,
      tan,
      cin,
      fssaiLicense,
      shopEstablishmentNumber,
      registeredAddress,
      registeredCity,
      registeredState,
      registeredPincode,
      bankName,
      bankBranch,
      accountNumber,
      ifscCode,
      accountHolderName,
      emergencyContactName,
      emergencyContactPhone,
      website,
    } = body

    // Check if tenant exists (include property for org-scoping)
    const existingTenant = await db.query.tenants.findFirst({
      where: eq(tenants.id, tenantId),
      with: { property: true },
    })

    if (!existingTenant) {
      return NextResponse.json(
        { success: false, error: "Tenant not found" },
        { status: 404 }
      )
    }

    // ── IDOR guard: org isolation ────────────────────────────────────────────
    const session = await auth()
    if (
      session?.user?.role !== "super_admin" &&
      existingTenant.property?.organizationId !== session?.user?.organizationId
    ) {
      return NextResponse.json(
        { success: false, error: "Tenant not found" },
        { status: 404 }
      )
    }

    // Build metadata object with existing + new values
    const existingMetadata = (existingTenant.metadata || {}) as TenantMetadata
    const newMetadata: TenantMetadata = {
      ...existingMetadata,
      ...(brandName !== undefined && { brandName }),
      ...(businessType !== undefined && { businessType }),
      ...(designation !== undefined && { designation }),
      ...(authorizedSignatory !== undefined && { authorizedSignatory }),
      ...(signatoryPhone !== undefined && { signatoryPhone }),
      ...(signatoryEmail !== undefined && { signatoryEmail }),
      ...(tan !== undefined && { tan }),
      ...(cin !== undefined && { cin }),
      ...(fssaiLicense !== undefined && { fssaiLicense }),
      ...(shopEstablishmentNumber !== undefined && { shopEstablishmentNumber }),
      ...(registeredAddress !== undefined && { registeredAddress }),
      ...(registeredCity !== undefined && { registeredCity }),
      ...(registeredState !== undefined && { registeredState }),
      ...(registeredPincode !== undefined && { registeredPincode }),
      ...(bankName !== undefined && { bankName }),
      ...(bankBranch !== undefined && { bankBranch }),
      ...(accountNumber !== undefined && { accountNumber }),
      ...(ifscCode !== undefined && { ifscCode }),
      ...(accountHolderName !== undefined && { accountHolderName }),
      ...(emergencyContactName !== undefined && { emergencyContactName }),
      ...(emergencyContactPhone !== undefined && { emergencyContactPhone }),
      ...(website !== undefined && { website }),
    }

    // Update tenant
    const [updatedTenant] = await db
      .update(tenants)
      .set({
        ...(businessName && { businessName }),
        ...(legalEntityName !== undefined && { legalEntityName }),
        ...(category && { category }),
        ...(subcategory !== undefined && { subcategory }),
        ...(contactPerson !== undefined && { contactPerson }),
        ...(email !== undefined && { email }),
        ...(phone !== undefined && { phone }),
        ...(alternatePhone !== undefined && { alternatePhone }),
        ...(gstin !== undefined && { gstin }),
        ...(pan !== undefined && { pan }),
        ...(tradeLicense !== undefined && { tradeLicense }),
        ...(status && { status }),
        metadata: newMetadata,
        updatedAt: new Date(),
      })
      .where(eq(tenants.id, tenantId))
      .returning()

    return NextResponse.json({ success: true, data: updatedTenant })
  } catch (error) {
    console.error("Error updating tenant:", error)
    return NextResponse.json(
      { success: false, error: "Failed to update tenant" },
      { status: 500 }
    )
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const { authorized, error } = await requirePermission(PERMISSIONS.TENANTS_DELETE)
    if (!authorized) {
      return NextResponse.json({ error }, { status: 403 })
    }

    const tenantId = params.id

    // Validate UUID format
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
    if (!uuidRegex.test(tenantId)) {
      return NextResponse.json(
        { success: false, error: "Invalid tenant ID format" },
        { status: 400 }
      )
    }

    // Check if tenant exists (include property for org-scoping)
    const existingTenant = await db.query.tenants.findFirst({
      where: eq(tenants.id, tenantId),
      with: { property: true },
    })

    if (!existingTenant) {
      return NextResponse.json(
        { success: false, error: "Tenant not found" },
        { status: 404 }
      )
    }

    // ── IDOR guard: org isolation ────────────────────────────────────────────
    const session = await auth()
    if (
      session?.user?.role !== "super_admin" &&
      existingTenant.property?.organizationId !== session?.user?.organizationId
    ) {
      return NextResponse.json(
        { success: false, error: "Tenant not found" },
        { status: 404 }
      )
    }

    // Check for active leases
    const activeLeases = await db
      .select()
      .from(leases)
      .where(and(
        eq(leases.tenantId, tenantId),
        eq(leases.status, "active")
      ))

    if (activeLeases.length > 0) {
      return NextResponse.json(
        { success: false, error: "Cannot delete tenant with active leases. Please terminate all leases first." },
        { status: 400 }
      )
    }

    // Delete tenant (cascade will handle related records based on schema)
    await db.delete(tenants).where(eq(tenants.id, tenantId))

    return NextResponse.json({ success: true, message: "Tenant deleted successfully" })
  } catch (error) {
    console.error("Error deleting tenant:", error)
    return NextResponse.json(
      { success: false, error: "Failed to delete tenant" },
      { status: 500 }
    )
  }
}
