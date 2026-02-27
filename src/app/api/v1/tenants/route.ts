/**
 * Tenants API Route
 * Handles HTTP requests for tenant management.
 * This is a thin controller that delegates business logic to the tenant service.
 */

import { NextRequest, NextResponse } from "next/server"
import { requirePermission, PERMISSIONS } from "@/core/auth/rbac"
import { handleApiError, ForbiddenError, BadRequestError } from "@/core/errors"
import { logger } from "@/core/logging"
import {
  getTenants,
  createTenant,
  getTenantById,
} from "@/features/tenants/services/tenant-service"
import { tenantSchema, tenantQuickAddSchema } from "@/features/tenants/validations/tenant"
import type { TenantFilterParams } from "@/features/tenants/types"

const moduleLogger = logger

/**
 * GET /api/v1/tenants
 * Retrieve tenants with optional filtering
 */
export async function GET(request: NextRequest) {
  try {
    // Check permissions
    const { authorized } = await requirePermission(PERMISSIONS.TENANTS_VIEW)
    if (!authorized) {
      throw new ForbiddenError("You do not have permission to view tenants.")
    }

    // Parse query parameters
    const { searchParams } = new URL(request.url)
    const filters: TenantFilterParams = {
      propertyId: searchParams.get("propertyId") || undefined,
      status: searchParams.get("status") || undefined,
      category: searchParams.get("category") || undefined,
      search: searchParams.get("search") || undefined,
    }
    const refresh = searchParams.get("refresh") === "true"

    moduleLogger.debug("GET /api/v1/tenants", { filters, refresh })

    // Fetch tenants
    const tenantList = await getTenants(filters, refresh)

    return NextResponse.json({
      success: true,
      data: tenantList,
    })
  } catch (error) {
    return handleApiError(error)
  }
}

/**
 * POST /api/v1/tenants
 * Create a new tenant
 */
export async function POST(request: NextRequest) {
  try {
    // Check permissions
    const { authorized } = await requirePermission(PERMISSIONS.TENANTS_CREATE)
    if (!authorized) {
      throw new ForbiddenError("You do not have permission to create tenants.")
    }

    // Parse request body
    const body = await request.json()

    moduleLogger.debug("POST /api/v1/tenants", { body })

    // Validate input
    const validationResult = tenantQuickAddSchema.safeParse(body)
    if (!validationResult.success) {
      throw new BadRequestError("Validation failed", 422, true)
    }

    const validatedData = validationResult.data

    // Create tenant
    const newTenant = await createTenant({
      propertyId: validatedData.propertyId || "",
      businessName: validatedData.businessName,
      category: validatedData.category,
      contactPerson: validatedData.contactPerson,
      phone: validatedData.phone,
      email: validatedData.email,
      gstin: validatedData.gstin,
    })

    moduleLogger.info("Tenant created successfully", { tenantId: newTenant.id })

    return NextResponse.json(
      {
        success: true,
        data: newTenant,
      },
      { status: 201 }
    )
  } catch (error) {
    return handleApiError(error)
  }
}
