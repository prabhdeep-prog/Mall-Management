/**
 * Tenant Score Computation Cron
 * ─────────────────────────────────────────────────────────────────────────────
 * Runs daily. Computes risk score and sentiment score for all active tenants.
 *
 * Risk Score (0-1): Based on payment behavior
 *   - Late payment ratio (weight: 0.5)
 *   - Outstanding amount ratio (weight: 0.3)
 *   - Payment trend (weight: 0.2)
 *
 * Sentiment Score (-1 to 1): Based on support interactions
 *   - Open support requests (negative signal)
 *   - Resolution time trend
 *   - Satisfaction ratings
 */

import { NextResponse } from "next/server"
import { serviceDb } from "@/lib/db"
import { sql } from "drizzle-orm"
import { logger } from "@/lib/logger"

export const runtime = "nodejs"
export const maxDuration = 120

export async function GET(request: Request) {
  const authHeader = request.headers.get("authorization")
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  try {
    let updated = 0

    // Get all active tenants
    const tenants = await serviceDb.execute<{ id: string }>(sql`
      SELECT id FROM tenants WHERE status = 'active'
    `)

    for (const tenant of tenants) {
      try {
        // ── Risk Score ──────────────────────────────────────────────────────
        // Payment behavior over last 6 months
        const paymentMetrics = await serviceDb.execute<{
          total_invoices: string
          late_invoices: string
          total_amount: string
          outstanding_amount: string
        }>(sql`
          SELECT
            COUNT(*) as total_invoices,
            COUNT(CASE WHEN i.status = 'overdue' OR (i.paid_date IS NOT NULL AND i.paid_date > i.due_date) THEN 1 END) as late_invoices,
            COALESCE(SUM(i.total_amount::numeric), 0) as total_amount,
            COALESCE(SUM(CASE WHEN i.status IN ('pending', 'overdue') THEN i.total_amount::numeric ELSE 0 END), 0) as outstanding_amount
          FROM invoices i
          JOIN leases l ON i.lease_id = l.id
          WHERE l.tenant_id = ${tenant.id}::uuid
            AND i.created_at >= NOW() - INTERVAL '6 months'
        `)

        const pm = paymentMetrics[0]
        const totalInvoices = parseInt(pm?.total_invoices ?? "0")
        const lateInvoices = parseInt(pm?.late_invoices ?? "0")
        const totalAmount = parseFloat(pm?.total_amount ?? "0")
        const outstandingAmount = parseFloat(pm?.outstanding_amount ?? "0")

        const lateRatio = totalInvoices > 0 ? lateInvoices / totalInvoices : 0
        const outstandingRatio = totalAmount > 0 ? outstandingAmount / totalAmount : 0

        // Risk: higher = riskier (0 to 1)
        const riskScore = Math.min(1, Math.max(0,
          lateRatio * 0.5 + outstandingRatio * 0.3 + (totalInvoices === 0 ? 0.2 : 0)
        ))

        // ── Sentiment Score ─────────────────────────────────────────────────
        // Based on support tickets and satisfaction
        const sentimentMetrics = await serviceDb.execute<{
          open_tickets: string
          avg_satisfaction: string
          total_conversations: string
        }>(sql`
          SELECT
            COUNT(CASE WHEN c.status IN ('active', 'escalated') THEN 1 END) as open_tickets,
            COALESCE(AVG(c.satisfaction_rating::numeric), 3) as avg_satisfaction,
            COUNT(*) as total_conversations
          FROM conversations c
          WHERE c.tenant_id = ${tenant.id}::uuid
            AND c.created_at >= NOW() - INTERVAL '3 months'
        `)

        const sm = sentimentMetrics[0]
        const openTickets = parseInt(sm?.open_tickets ?? "0")
        const avgSatisfaction = parseFloat(sm?.avg_satisfaction ?? "3")
        const totalConversations = parseInt(sm?.total_conversations ?? "0")

        // Normalize satisfaction from 1-5 scale to -1 to 1
        const satisfactionNorm = (avgSatisfaction - 3) / 2
        // Open tickets penalty
        const ticketPenalty = Math.min(1, openTickets * 0.2)

        // Sentiment: higher = more positive (-1 to 1)
        const sentimentScore = Math.max(-1, Math.min(1,
          totalConversations > 0
            ? satisfactionNorm * 0.7 - ticketPenalty * 0.3
            : 0
        ))

        // Update tenant scores
        await serviceDb.execute(sql`
          UPDATE tenants SET
            risk_score = ${riskScore.toFixed(2)},
            sentiment_score = ${sentimentScore.toFixed(2)},
            updated_at = NOW()
          WHERE id = ${tenant.id}::uuid
        `)

        updated++
      } catch (err) {
        logger.error("tenant-scores: computation failed", { tenantId: tenant.id, error: err })
      }
    }

    logger.info("tenant-scores: completed", { updated, total: tenants.length })
    return NextResponse.json({ success: true, updated, total: tenants.length })
  } catch (err) {
    logger.error("tenant-scores: cron failed", { error: err })
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
