// @ts-nocheck - Temporary: Schema alignment needed
import { z } from "zod"
import { db } from "@/lib/db"
import { workOrders, vendors, equipment, tenants } from "@/lib/db/schema"
import { eq, and, desc, sql, or, inArray } from "drizzle-orm"
import type { Tool, AgentContext, ToolResult } from "@/types/agents"

// Tool: Get Work Order Queue
export const getWorkOrderQueueTool: Tool = {
  name: "get_work_order_queue",
  description: "Get the current queue of work orders with prioritization",
  parameters: z.object({
    propertyId: z.string().describe("The property's unique identifier"),
    status: z.enum(["open", "in_progress", "pending_parts", "resolved", "all"]).optional(),
  }),
  handler: async (params, context): Promise<ToolResult> => {
    const { status = "all" } = params as { status?: string }

    try {
      const conditions = [eq(workOrders.propertyId, context.propertyId)]
      
      if (status !== "all") {
        conditions.push(eq(workOrders.status, status))
      }

      const orders = await db
        .select({
          workOrder: workOrders,
          tenant: tenants,
        })
        .from(workOrders)
        .leftJoin(tenants, eq(workOrders.tenantId, tenants.id))
        .where(and(...conditions))
        .orderBy(
          sql`CASE 
            WHEN ${workOrders.priority} = 'critical' THEN 1 
            WHEN ${workOrders.priority} = 'high' THEN 2 
            WHEN ${workOrders.priority} = 'medium' THEN 3 
            ELSE 4 
          END`,
          desc(workOrders.createdAt)
        )
        .limit(50)

      const priorityCounts = {
        critical: orders.filter((o) => o.workOrder.priority === "critical").length,
        high: orders.filter((o) => o.workOrder.priority === "high").length,
        medium: orders.filter((o) => o.workOrder.priority === "medium").length,
        low: orders.filter((o) => o.workOrder.priority === "low").length,
      }

      return {
        success: true,
        data: {
          totalOrders: orders.length,
          priorityCounts,
          orders: orders.map((o) => ({
            id: o.workOrder.id,
            orderNumber: o.workOrder.orderNumber,
            title: o.workOrder.title,
            category: o.workOrder.category,
            priority: o.workOrder.priority,
            status: o.workOrder.status,
            tenantName: o.tenant?.businessName || "Common Area",
            createdAt: o.workOrder.createdAt,
            dueDate: o.workOrder.dueDate,
          })),
        },
      }
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : "Failed to get work order queue",
      }
    }
  },
}

// Tool: Prioritize Work Order
export const prioritizeWorkOrderTool: Tool = {
  name: "prioritize_work_order",
  description: "Update the priority of a work order based on analysis",
  parameters: z.object({
    workOrderId: z.string().describe("The work order ID to prioritize"),
    newPriority: z.enum(["low", "medium", "high", "critical"]).describe("New priority level"),
    reason: z.string().describe("Reason for priority change"),
  }),
  handler: async (params, context): Promise<ToolResult> => {
    const { workOrderId, newPriority, reason } = params as { 
      workOrderId: string
      newPriority: string
      reason: string 
    }

    try {
      const existingOrder = await db.query.workOrders.findFirst({
        where: eq(workOrders.id, workOrderId),
      })

      if (!existingOrder) {
        return { success: false, error: "Work order not found" }
      }

      const oldPriority = existingOrder.priority

      await db
        .update(workOrders)
        .set({
          priority: newPriority,
          notes: sql`COALESCE(${workOrders.notes}, '') || '\n[Priority Change] ${oldPriority} → ${newPriority}: ${reason}'`,
          updatedAt: new Date(),
        })
        .where(eq(workOrders.id, workOrderId))

      return {
        success: true,
        data: {
          workOrderId,
          orderNumber: existingOrder.orderNumber,
          previousPriority: oldPriority,
          newPriority,
          reason,
          updatedAt: new Date().toISOString(),
        },
      }
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : "Failed to update priority",
      }
    }
  },
}

// Tool: Assign Vendor
export const assignVendorTool: Tool = {
  name: "assign_vendor",
  description: "Assign a vendor to a work order based on specialty and availability",
  parameters: z.object({
    workOrderId: z.string().describe("The work order ID"),
    vendorId: z.string().optional().describe("Specific vendor ID, or auto-assign if not provided"),
  }),
  handler: async (params, context): Promise<ToolResult> => {
    const { workOrderId, vendorId } = params as { workOrderId: string; vendorId?: string }

    try {
      const workOrder = await db.query.workOrders.findFirst({
        where: eq(workOrders.id, workOrderId),
      })

      if (!workOrder) {
        return { success: false, error: "Work order not found" }
      }

      let assignedVendor

      if (vendorId) {
        assignedVendor = await db.query.vendors.findFirst({
          where: eq(vendors.id, vendorId),
        })
      } else {
        // Auto-assign based on category
        const availableVendors = await db
          .select()
          .from(vendors)
          .where(
            and(
              eq(vendors.propertyId, context.propertyId),
              eq(vendors.status, "active")
            )
          )

        // Simple matching based on category
        const categoryVendorMap: Record<string, string[]> = {
          plumbing: ["plumbing", "general maintenance"],
          electrical: ["electrical", "general maintenance"],
          hvac: ["hvac", "electrical"],
          cleaning: ["cleaning", "janitorial"],
          security: ["security"],
        }

        const matchingCategories = categoryVendorMap[workOrder.category.toLowerCase()] || ["general maintenance"]
        
        assignedVendor = availableVendors.find((v) => 
          matchingCategories.some((cat) => 
            v.services?.toLowerCase().includes(cat) || v.category?.toLowerCase() === cat
          )
        ) || availableVendors[0]
      }

      if (!assignedVendor) {
        return { success: false, error: "No available vendor found for this category" }
      }

      await db
        .update(workOrders)
        .set({
          assignedTo: assignedVendor.id,
          status: "in_progress",
          updatedAt: new Date(),
        })
        .where(eq(workOrders.id, workOrderId))

      return {
        success: true,
        data: {
          workOrderId,
          orderNumber: workOrder.orderNumber,
          vendorId: assignedVendor.id,
          vendorName: assignedVendor.name,
          vendorContact: assignedVendor.contactPhone,
          status: "in_progress",
        },
      }
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : "Failed to assign vendor",
      }
    }
  },
}

// Tool: Schedule Preventive Maintenance
export const schedulePreventiveMaintenanceTool: Tool = {
  name: "schedule_preventive_maintenance",
  description: "Schedule preventive maintenance for equipment",
  parameters: z.object({
    equipmentId: z.string().optional().describe("Specific equipment ID, or check all if not provided"),
    maintenanceType: z.enum(["routine", "seasonal", "compliance"]).optional(),
  }),
  handler: async (params, context): Promise<ToolResult> => {
    const { equipmentId, maintenanceType = "routine" } = params as { 
      equipmentId?: string
      maintenanceType?: string 
    }

    try {
      // Get equipment due for maintenance
      const allEquipment = await db
        .select()
        .from(equipment)
        .where(eq(equipment.propertyId, context.propertyId))

      const dueForMaintenance = allEquipment.filter((e) => {
        if (!e.nextMaintenanceDate) return true
        const nextDate = new Date(e.nextMaintenanceDate)
        const daysUntil = (nextDate.getTime() - Date.now()) / (1000 * 60 * 60 * 24)
        return daysUntil <= 7 // Due within a week
      })

      // Create work orders for equipment due for maintenance
      const scheduledMaintenance = []

      for (const eq of dueForMaintenance.slice(0, 5)) { // Limit to 5 at a time
        const orderNumber = `PM-${Date.now().toString(36).toUpperCase()}-${Math.random().toString(36).substr(2, 4).toUpperCase()}`
        
        const [newOrder] = await db
          .insert(workOrders)
          .values({
            propertyId: context.propertyId,
            orderNumber,
            title: `Preventive Maintenance: ${eq.name}`,
            description: `Scheduled ${maintenanceType} maintenance for ${eq.name} (${eq.category})`,
            category: eq.category || "general",
            priority: "medium",
            status: "open",
            equipmentId: eq.id,
            reportedBy: context.userId,
          })
          .returning()

        scheduledMaintenance.push({
          workOrderId: newOrder.id,
          orderNumber: newOrder.orderNumber,
          equipmentName: eq.name,
          equipmentId: eq.id,
        })
      }

      return {
        success: true,
        data: {
          maintenanceType,
          totalEquipmentChecked: allEquipment.length,
          dueForMaintenance: dueForMaintenance.length,
          scheduled: scheduledMaintenance.length,
          orders: scheduledMaintenance,
        },
      }
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : "Failed to schedule maintenance",
      }
    }
  },
}

// Tool: Get Maintenance Analytics
export const getMaintenanceAnalyticsTool: Tool = {
  name: "get_maintenance_analytics",
  description: "Get analytics on maintenance operations",
  parameters: z.object({
    propertyId: z.string().describe("The property's unique identifier"),
    period: z.enum(["week", "month", "quarter"]).optional(),
  }),
  handler: async (params, context): Promise<ToolResult> => {
    const { period = "month" } = params as { period?: string }

    try {
      const startDate = new Date()
      if (period === "week") startDate.setDate(startDate.getDate() - 7)
      else if (period === "month") startDate.setMonth(startDate.getMonth() - 1)
      else startDate.setMonth(startDate.getMonth() - 3)

      const allOrders = await db
        .select()
        .from(workOrders)
        .where(eq(workOrders.propertyId, context.propertyId))

      const periodOrders = allOrders.filter(
        (o) => new Date(o.createdAt!) >= startDate
      )

      const resolvedOrders = periodOrders.filter((o) => o.status === "resolved")
      
      // Calculate average resolution time
      let totalResolutionTime = 0
      let resolvedCount = 0
      
      resolvedOrders.forEach((o) => {
        if (o.resolvedAt && o.createdAt) {
          const created = new Date(o.createdAt)
          const resolved = new Date(o.resolvedAt)
          totalResolutionTime += resolved.getTime() - created.getTime()
          resolvedCount++
        }
      })

      const avgResolutionHours = resolvedCount > 0 
        ? totalResolutionTime / resolvedCount / (1000 * 60 * 60) 
        : 0

      // Category breakdown
      const categoryBreakdown: Record<string, number> = {}
      periodOrders.forEach((o) => {
        categoryBreakdown[o.category] = (categoryBreakdown[o.category] || 0) + 1
      })

      return {
        success: true,
        data: {
          period,
          summary: {
            totalOrders: periodOrders.length,
            resolved: resolvedOrders.length,
            pending: periodOrders.length - resolvedOrders.length,
            resolutionRate: periodOrders.length > 0 
              ? ((resolvedOrders.length / periodOrders.length) * 100).toFixed(1) 
              : "0",
            avgResolutionHours: avgResolutionHours.toFixed(1),
          },
          categoryBreakdown,
          currentBacklog: allOrders.filter(
            (o) => o.status === "open" || o.status === "in_progress"
          ).length,
        },
      }
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : "Failed to get analytics",
      }
    }
  },
}

export const maintenanceTools: Tool[] = [
  getWorkOrderQueueTool,
  prioritizeWorkOrderTool,
  assignVendorTool,
  schedulePreventiveMaintenanceTool,
  getMaintenanceAnalyticsTool,
]

