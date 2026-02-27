// @ts-nocheck - Temporary: Schema alignment needed
import { z } from "zod"
import { db } from "@/lib/db"
import { invoices, payments, leases, tenants, expenses } from "@/lib/db/schema"
import { eq, and, desc, sql, gte, lte, sum } from "drizzle-orm"
import type { Tool, AgentContext, ToolResult } from "@/types/agents"

// Tool: Analyze Payment Patterns
export const analyzePaymentPatternsTool: Tool = {
  name: "analyze_payment_patterns",
  description: "Analyze tenant payment patterns to predict future payment behavior",
  parameters: z.object({
    tenantId: z.string().optional().describe("Specific tenant to analyze, or all if not provided"),
    monthsToAnalyze: z.number().optional().describe("Number of months to analyze (default: 6)"),
  }),
  handler: async (params, context): Promise<ToolResult> => {
    const { tenantId, monthsToAnalyze = 6 } = params as { tenantId?: string; monthsToAnalyze?: number }

    try {
      const startDate = new Date()
      startDate.setMonth(startDate.getMonth() - monthsToAnalyze)

      // Get invoices and their payment status
      const invoiceData = await db
        .select({
          invoice: invoices,
          lease: leases,
          tenant: tenants,
        })
        .from(invoices)
        .leftJoin(leases, eq(invoices.leaseId, leases.id))
        .leftJoin(tenants, eq(leases.tenantId, tenants.id))
        .where(
          and(
            tenantId ? eq(leases.tenantId, tenantId) : undefined,
            gte(invoices.createdAt, startDate)
          )
        )
        .orderBy(desc(invoices.createdAt))

      // Calculate payment metrics
      const totalInvoices = invoiceData.length
      const paidOnTime = invoiceData.filter(
        (d) => d.invoice.status === "paid" && d.invoice.paidDate && 
        new Date(d.invoice.paidDate) <= new Date(d.invoice.dueDate)
      ).length
      const paidLate = invoiceData.filter(
        (d) => d.invoice.status === "paid" && d.invoice.paidDate && 
        new Date(d.invoice.paidDate) > new Date(d.invoice.dueDate)
      ).length
      const overdue = invoiceData.filter((d) => d.invoice.status === "overdue").length

      const onTimeRate = totalInvoices > 0 ? (paidOnTime / totalInvoices) * 100 : 0

      // Group by tenant for individual patterns
      const tenantPatterns = new Map<string, { onTime: number; late: number; total: number }>()
      
      invoiceData.forEach(({ invoice, tenant }) => {
        if (!tenant) return
        const current = tenantPatterns.get(tenant.id) || { onTime: 0, late: 0, total: 0 }
        current.total++
        if (invoice.status === "paid") {
          if (invoice.paidDate && new Date(invoice.paidDate) <= new Date(invoice.dueDate)) {
            current.onTime++
          } else {
            current.late++
          }
        }
        tenantPatterns.set(tenant.id, current)
      })

      // Find at-risk tenants
      const atRiskTenants = Array.from(tenantPatterns.entries())
        .filter(([_, pattern]) => pattern.total > 0 && (pattern.onTime / pattern.total) < 0.7)
        .map(([id, pattern]) => ({
          tenantId: id,
          onTimeRate: ((pattern.onTime / pattern.total) * 100).toFixed(1),
          totalInvoices: pattern.total,
        }))

      return {
        success: true,
        data: {
          period: `${monthsToAnalyze} months`,
          summary: {
            totalInvoices,
            paidOnTime,
            paidLate,
            currentlyOverdue: overdue,
            onTimePaymentRate: `${onTimeRate.toFixed(1)}%`,
          },
          atRiskTenants,
          prediction: {
            expectedCollectionRate: Math.min(95, onTimeRate + 10).toFixed(1),
            confidence: onTimeRate > 80 ? "high" : onTimeRate > 60 ? "medium" : "low",
          },
        },
      }
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : "Failed to analyze payment patterns",
      }
    }
  },
}

// Tool: Predict Payment Date
export const predictPaymentDateTool: Tool = {
  name: "predict_payment_date",
  description: "Predict when a specific invoice will be paid based on tenant history",
  parameters: z.object({
    invoiceId: z.string().describe("The invoice ID to predict payment for"),
  }),
  handler: async (params, context): Promise<ToolResult> => {
    const { invoiceId } = params as { invoiceId: string }

    try {
      const invoice = await db.query.invoices.findFirst({
        where: eq(invoices.id, invoiceId),
      })

      if (!invoice) {
        return { success: false, error: "Invoice not found" }
      }

      const lease = await db.query.leases.findFirst({
        where: eq(leases.id, invoice.leaseId!),
      })

      if (!lease) {
        return { success: false, error: "Lease not found" }
      }

      // Get historical payment data for this tenant
      const historicalInvoices = await db
        .select()
        .from(invoices)
        .leftJoin(leases, eq(invoices.leaseId, leases.id))
        .where(
          and(
            eq(leases.tenantId, lease.tenantId!),
            eq(invoices.status, "paid")
          )
        )
        .limit(12)

      // Calculate average days to payment
      let totalDays = 0
      let count = 0

      historicalInvoices.forEach(({ invoices: inv }) => {
        if (inv.paidDate && inv.dueDate) {
          const dueDate = new Date(inv.dueDate)
          const paidDate = new Date(inv.paidDate)
          const daysDiff = Math.ceil((paidDate.getTime() - dueDate.getTime()) / (1000 * 60 * 60 * 24))
          totalDays += daysDiff
          count++
        }
      })

      const avgDaysFromDue = count > 0 ? totalDays / count : 0
      const dueDate = new Date(invoice.dueDate)
      const predictedDate = new Date(dueDate.getTime() + avgDaysFromDue * 24 * 60 * 60 * 1000)

      // Calculate confidence based on data points and consistency
      const confidence = Math.min(0.95, 0.5 + (count * 0.05))

      return {
        success: true,
        data: {
          invoiceId,
          invoiceNumber: invoice.invoiceNumber,
          dueDate: invoice.dueDate,
          predictedPaymentDate: predictedDate.toISOString().split("T")[0],
          averageDaysFromDue: avgDaysFromDue.toFixed(1),
          confidence: confidence.toFixed(2),
          basedOnInvoices: count,
          recommendation: avgDaysFromDue > 5 
            ? "Consider sending early reminder" 
            : "Payment expected on or before due date",
        },
      }
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : "Failed to predict payment date",
      }
    }
  },
}

// Tool: Generate Financial Summary
export const generateFinancialSummaryTool: Tool = {
  name: "generate_financial_summary",
  description: "Generate a comprehensive financial summary for the property",
  parameters: z.object({
    propertyId: z.string().describe("The property's unique identifier"),
    period: z.enum(["month", "quarter", "year"]).optional().describe("Period for summary"),
  }),
  handler: async (params, context): Promise<ToolResult> => {
    const { period = "month" } = params as { period?: string }

    try {
      const startDate = new Date()
      if (period === "month") startDate.setMonth(startDate.getMonth() - 1)
      else if (period === "quarter") startDate.setMonth(startDate.getMonth() - 3)
      else startDate.setFullYear(startDate.getFullYear() - 1)

      // Get all invoices for the period
      const periodInvoices = await db
        .select()
        .from(invoices)
        .leftJoin(leases, eq(invoices.leaseId, leases.id))
        .where(
          and(
            eq(leases.propertyId, context.propertyId),
            gte(invoices.createdAt, startDate)
          )
        )

      const totalBilled = periodInvoices.reduce(
        (sum, { invoices: inv }) => sum + parseFloat(inv.totalAmount),
        0
      )

      const totalCollected = periodInvoices
        .filter(({ invoices: inv }) => inv.status === "paid")
        .reduce((sum, { invoices: inv }) => sum + parseFloat(inv.paidAmount || "0"), 0)

      const totalOutstanding = periodInvoices
        .filter(({ invoices: inv }) => inv.status !== "paid")
        .reduce((sum, { invoices: inv }) => sum + parseFloat(inv.totalAmount), 0)

      // Get expenses
      const periodExpenses = await db
        .select()
        .from(expenses)
        .where(
          and(
            eq(expenses.propertyId, context.propertyId),
            gte(expenses.expenseDate, startDate.toISOString().split("T")[0])
          )
        )

      const totalExpenses = periodExpenses.reduce(
        (sum, exp) => sum + parseFloat(exp.amount),
        0
      )

      const netIncome = totalCollected - totalExpenses

      return {
        success: true,
        data: {
          period: period,
          startDate: startDate.toISOString().split("T")[0],
          endDate: new Date().toISOString().split("T")[0],
          revenue: {
            totalBilled: totalBilled.toFixed(2),
            totalCollected: totalCollected.toFixed(2),
            outstanding: totalOutstanding.toFixed(2),
            collectionRate: totalBilled > 0 
              ? ((totalCollected / totalBilled) * 100).toFixed(1) 
              : "0",
          },
          expenses: {
            total: totalExpenses.toFixed(2),
            categories: {}, // Would be broken down by category
          },
          profitability: {
            netIncome: netIncome.toFixed(2),
            margin: totalCollected > 0 
              ? ((netIncome / totalCollected) * 100).toFixed(1) 
              : "0",
          },
          invoiceCount: periodInvoices.length,
        },
      }
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : "Failed to generate financial summary",
      }
    }
  },
}

// Tool: Send Payment Reminder
export const sendPaymentReminderTool: Tool = {
  name: "send_payment_reminder",
  description: "Send a payment reminder for an overdue or upcoming invoice",
  parameters: z.object({
    invoiceId: z.string().describe("The invoice ID to send reminder for"),
    reminderType: z.enum(["gentle", "urgent", "final"]).describe("Type of reminder to send"),
  }),
  handler: async (params, context): Promise<ToolResult> => {
    const { invoiceId, reminderType } = params as { invoiceId: string; reminderType: string }

    try {
      const invoice = await db.query.invoices.findFirst({
        where: eq(invoices.id, invoiceId),
      })

      if (!invoice) {
        return { success: false, error: "Invoice not found" }
      }

      // Update reminder count
      await db
        .update(invoices)
        .set({
          remindersSent: (invoice.remindersSent || 0) + 1,
          lastReminderDate: new Date().toISOString().split("T")[0],
        })
        .where(eq(invoices.id, invoiceId))

      // In production, this would send actual email/SMS
      console.log(`[Reminder] Sent ${reminderType} reminder for invoice ${invoice.invoiceNumber}`)

      return {
        success: true,
        data: {
          invoiceId,
          invoiceNumber: invoice.invoiceNumber,
          reminderType,
          sentAt: new Date().toISOString(),
          totalRemindersSent: (invoice.remindersSent || 0) + 1,
        },
      }
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : "Failed to send reminder",
      }
    }
  },
}

export const financialTools: Tool[] = [
  analyzePaymentPatternsTool,
  predictPaymentDateTool,
  generateFinancialSummaryTool,
  sendPaymentReminderTool,
]

