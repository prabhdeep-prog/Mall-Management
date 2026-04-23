/**
 * Daily Metrics Cron Job
 * ─────────────────────────────────────────────────────────────────────────────
 * Runs at midnight (0 0 * * *) to pre-compute dashboard KPIs per property.
 * Writes to daily_metrics table so dashboard reads from pre-computed data.
 */

import { NextResponse } from "next/server"
import { serviceDb } from "@/lib/db"
import { sql } from "drizzle-orm"
import { logger } from "@/lib/logger"

export const runtime = "nodejs"
export const maxDuration = 60

export async function GET(request: Request) {
  // Verify cron secret
  const authHeader = request.headers.get("authorization")
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  try {
    const yesterday = new Date()
    yesterday.setDate(yesterday.getDate() - 1)
    const metricDate = yesterday.toISOString().slice(0, 10)

    logger.info("daily-metrics: starting computation", { metricDate })

    // Get all active properties
    const properties = await serviceDb.execute<{ id: string; organization_id: string }>(sql`
      SELECT id, organization_id FROM properties WHERE status = 'active'
    `)

    let computed = 0

    for (const prop of properties) {
      try {
        // Compute occupancy: active leases / total leasable units
        const occupancy = await serviceDb.execute<{ rate: string }>(sql`
          SELECT CASE
            WHEN COUNT(*) = 0 THEN 0
            ELSE ROUND(COUNT(CASE WHEN l.status = 'active' THEN 1 END)::numeric / GREATEST(COUNT(*), 1) * 100, 2)
          END as rate
          FROM leases l
          WHERE l.property_id = ${prop.id}::uuid
            AND l.start_date <= ${metricDate}::date
            AND (l.end_date IS NULL OR l.end_date >= ${metricDate}::date)
        `)

        // Compute collection rate: paid invoices / total invoices for the month
        const collection = await serviceDb.execute<{ rate: string }>(sql`
          SELECT CASE
            WHEN COALESCE(SUM(total_amount::numeric), 0) = 0 THEN 0
            ELSE ROUND(COALESCE(SUM(paid_amount::numeric), 0) / SUM(total_amount::numeric) * 100, 2)
          END as rate
          FROM invoices i
          JOIN leases l ON i.lease_id = l.id
          WHERE l.property_id = ${prop.id}::uuid
            AND i.period_start >= (${metricDate}::date - INTERVAL '30 days')::date
            AND i.period_end <= ${metricDate}::date
        `)

        // Work order metrics
        const woMetrics = await serviceDb.execute<{ tickets: string; resolved: string }>(sql`
          SELECT
            COUNT(*) as tickets,
            COUNT(CASE WHEN status IN ('completed', 'resolved') THEN 1 END) as resolved
          FROM work_orders
          WHERE property_id = ${prop.id}::uuid
            AND created_at::date = ${metricDate}::date
        `)

        // Revenue for the day
        const revenue = await serviceDb.execute<{ total: string }>(sql`
          SELECT COALESCE(SUM(psd.net_sales::numeric), 0) as total
          FROM pos_sales_data psd
          JOIN pos_integrations pi ON psd.pos_integration_id = pi.id
          WHERE pi.property_id = ${prop.id}::uuid
            AND psd.sales_date = ${metricDate}::date
        `)

        // Expenses for the day
        const expenses = await serviceDb.execute<{ total: string }>(sql`
          SELECT COALESCE(SUM(total_amount::numeric), 0) as total
          FROM expenses
          WHERE property_id = ${prop.id}::uuid
            AND expense_date = ${metricDate}::date
        `)

        // Agent actions
        const agentMetrics = await serviceDb.execute<{ taken: string; approved: string }>(sql`
          SELECT
            COUNT(*) as taken,
            COUNT(CASE WHEN status = 'executed' THEN 1 END) as approved
          FROM agent_actions
          WHERE property_id = ${prop.id}::uuid
            AND created_at::date = ${metricDate}::date
        `)

        // Upsert daily metrics
        await serviceDb.execute(sql`
          INSERT INTO daily_metrics (
            property_id, metric_date,
            occupancy_rate, collection_rate,
            maintenance_tickets, maintenance_resolved,
            revenue, expenses,
            agent_actions_taken, agent_actions_approved,
            created_at
          ) VALUES (
            ${prop.id}::uuid, ${metricDate}::date,
            ${occupancy[0]?.rate ?? "0"}, ${collection[0]?.rate ?? "0"},
            ${parseInt(woMetrics[0]?.tickets ?? "0")}, ${parseInt(woMetrics[0]?.resolved ?? "0")},
            ${revenue[0]?.total ?? "0"}, ${expenses[0]?.total ?? "0"},
            ${parseInt(agentMetrics[0]?.taken ?? "0")}, ${parseInt(agentMetrics[0]?.approved ?? "0")},
            NOW()
          )
          ON CONFLICT (property_id, metric_date) DO UPDATE SET
            occupancy_rate = EXCLUDED.occupancy_rate,
            collection_rate = EXCLUDED.collection_rate,
            maintenance_tickets = EXCLUDED.maintenance_tickets,
            maintenance_resolved = EXCLUDED.maintenance_resolved,
            revenue = EXCLUDED.revenue,
            expenses = EXCLUDED.expenses,
            agent_actions_taken = EXCLUDED.agent_actions_taken,
            agent_actions_approved = EXCLUDED.agent_actions_approved
        `)

        computed++
      } catch (err) {
        logger.error("daily-metrics: property computation failed", { propertyId: prop.id, error: err })
      }
    }

    logger.info("daily-metrics: completed", { metricDate, computed, total: properties.length })

    return NextResponse.json({ success: true, metricDate, computed, total: properties.length })
  } catch (err) {
    logger.error("daily-metrics: cron failed", { error: err })
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
