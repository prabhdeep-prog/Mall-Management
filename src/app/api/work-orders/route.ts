import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { db } from "@/lib/db"
import { withOrgContext } from "@/lib/db/with-org-context"
import { workOrders, tenants, vendors } from "@/lib/db/schema"
import { eq, desc, and } from "drizzle-orm"
import { getCachedOrFetch, CACHE_KEYS, CACHE_TTL, invalidateEntityCache } from "@/lib/cache"
import { PERMISSIONS, requirePermission } from "@/lib/auth/rbac"
import { randomUUID } from "crypto"
import { onWorkOrderCreated, sendDirectEmail } from "@/lib/notifications/dispatcher"

export async function GET(request: NextRequest) {
  try {
    const { authorized, error } = await requirePermission(PERMISSIONS.WORK_ORDERS_VIEW)
    if (!authorized) {
      return NextResponse.json({ error }, { status: 403 })
    }

    const session = await auth()
    const organizationId = session?.user?.organizationId || "default"

    const { searchParams } = new URL(request.url)
    const propertyId = searchParams.get("propertyId")
    const tenantId = searchParams.get("tenantId")
    const status = searchParams.get("status")
    const priority = searchParams.get("priority")
    const refresh = searchParams.get("refresh") === "true"

    // Cache key based on filters
    const cacheKey = propertyId 
      ? CACHE_KEYS.WORK_ORDER_LIST(organizationId, propertyId)
      : `${organizationId}:workorders:list:all:${tenantId || "all"}:${status || "all"}:${priority || "all"}`

    // Invalidate cache if refresh requested
    if (refresh && propertyId) {
      await invalidateEntityCache("workorder", propertyId, propertyId, organizationId)
    }

    const result = await getCachedOrFetch(
      cacheKey,
      async () => {
        return withOrgContext(organizationId, async (tx) => {
          const workOrdersWithTenants = await tx
            .select({
              workOrder: workOrders,
              tenant: tenants,
              vendor: vendors,
            })
            .from(workOrders)
            .leftJoin(tenants, eq(workOrders.tenantId, tenants.id))
            .leftJoin(vendors, eq(workOrders.assignedTo, vendors.id))
            .where(
              and(
                propertyId ? eq(workOrders.propertyId, propertyId) : undefined,
                tenantId ? eq(workOrders.tenantId, tenantId) : undefined,
                status ? eq(workOrders.status, status) : undefined,
                priority ? eq(workOrders.priority, priority) : undefined
              )
            )
            .orderBy(desc(workOrders.createdAt))

          return workOrdersWithTenants.map(({ workOrder, tenant, vendor }) => {
            // SLA tracking: compute deadline and breach status
            const slaHours: Record<string, number> = { critical: 4, high: 8, medium: 24, low: 72 }
            const prioritySla = slaHours[workOrder.priority ?? "medium"] ?? 24
            const createdAt = new Date(workOrder.createdAt)
            const slaDeadline = new Date(createdAt.getTime() + prioritySla * 3600000)
            const now = new Date()
            const isCompleted = ["completed", "resolved", "cancelled"].includes(workOrder.status ?? "")
            const resolvedAt = workOrder.completedAt ? new Date(workOrder.completedAt) : null
            const slaBreached = isCompleted
              ? (resolvedAt ? resolvedAt > slaDeadline : false)
              : now > slaDeadline

            return {
              ...workOrder,
              tenant: tenant
                ? {
                    id: tenant.id,
                    businessName: tenant.businessName,
                    contactPerson: tenant.contactPerson,
                  }
                : null,
              assignedVendor: vendor
                ? { id: vendor.id, name: vendor.name, type: vendor.type }
                : null,
              sla: {
                deadlineHours: prioritySla,
                deadline: slaDeadline.toISOString(),
                breached: slaBreached,
                remainingMs: isCompleted ? null : Math.max(0, slaDeadline.getTime() - now.getTime()),
              },
            }
          })
        })
      },
      CACHE_TTL.SHORT // 1 minute for work orders (more real-time)
    )

    return NextResponse.json({ success: true, data: result })
  } catch (error) {
    console.error("Get work orders error:", error)
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    )
  }
}

export async function POST(request: NextRequest) {
  try {
    const { authorized, error } = await requirePermission(PERMISSIONS.WORK_ORDERS_CREATE)
    if (!authorized) {
      return NextResponse.json({ error }, { status: 403 })
    }

    const session = await auth()
    const organizationId = session?.user?.organizationId || "default"
    const userId = session?.user?.id

    const body = await request.json()
    const {
      propertyId,
      tenantId,
      category,
      priority,
      title,
      description,
      location,
    } = body

    if (!propertyId || !title || !category) {
      return NextResponse.json(
        { error: "Property ID, title, and category are required" },
        { status: 400 }
      )
    }

    const workOrderId = randomUUID()
    const workOrderNumber = `WO-${new Date().getFullYear()}-${Math.floor(
      Math.random() * 10000
    )
      .toString()
      .padStart(4, "0")}`

    const newWorkOrder = await withOrgContext(organizationId, async (tx) => {
      await tx.insert(workOrders).values({
        id: workOrderId,
        propertyId,
        tenantId,
        workOrderNumber,
        category,
        priority: priority || "medium",
        title,
        description,
        location,
        status: "open",
        createdBy: userId,
      })

      return tx.query.workOrders.findFirst({
        where: eq(workOrders.id, workOrderId),
      })
    })

    // Invalidate work order list cache
    await invalidateEntityCache("workorder", workOrderId, propertyId, organizationId)

    // Notify tenant (fire-and-forget)
    ;(async () => {
      try {
        if (tenantId) {
          const tenant = await db.query.tenants.findFirst({ where: eq(tenants.id, tenantId) })
          if (tenant?.email && organizationId !== "default") {
            await onWorkOrderCreated({
              organizationId,
              tenantId,
              tenantEmail: tenant.email,
              data: {
                tenant_name: tenant.businessName,
                work_order_number: workOrderNumber,
                work_order_title: title,
                work_order_priority: priority || "medium",
                property_name: "Metro Mall",
              },
            })
          }
        }
      } catch {}
    })()

    return NextResponse.json({ success: true, data: newWorkOrder }, { status: 201 })
  } catch (error) {
    console.error("Create work order error:", error)
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    )
  }
}

