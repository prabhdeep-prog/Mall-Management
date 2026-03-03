/**
 * POS Daily Sync Cron
 * ─────────────────────────────────────────────────────────────────────────────
 * Polls daily sales from POS providers that don't support real-time webhooks
 * (POSist, Shopify) or as a reconciliation step for webhook-based providers.
 *
 * Schedule: 0 2 * * * (daily at 2 AM UTC = 7:30 AM IST)
 * Protected: Bearer CRON_SECRET
 *
 * For each active POS integration:
 *   1. Fetch yesterday's settlement data from the provider API
 *   2. Upsert into pos_sales_data (daily aggregate table)
 *   3. Update sync_status and last_sync_at
 */

import { type NextRequest, NextResponse } from "next/server"
import { serviceDb } from "@/lib/db"
import { sql } from "drizzle-orm"
import { decryptApiKey } from "@/lib/crypto/api-key"
import { getPOSProvider, isDemoMode } from "@/lib/pos"
import type { POSProviderKey, POSProviderConfig } from "@/lib/pos/types"

export const runtime = "nodejs"
export const maxDuration = 300   // 5 min for Vercel Pro; adjust per plan

export async function GET(req: NextRequest) {
  // ── Auth ───────────────────────────────────────────────────────────────────
  const authHeader = req.headers.get("authorization")
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const startedAt = Date.now()

  // Yesterday in IST (UTC+5:30) → we sync completed business days
  const yesterday = new Date()
  yesterday.setUTCDate(yesterday.getUTCDate() - 1)
  const targetDate = yesterday

  if (isDemoMode()) {
    return NextResponse.json({
      ok:         true,
      demo:       true,
      message:    "Mock mode — no real sync performed",
      targetDate: targetDate.toISOString().slice(0, 10),
    })
  }

  // ── Fetch all active integrations ─────────────────────────────────────────
  const integrations = await serviceDb.execute<{
    id:                string
    organization_id:   string
    tenant_id:         string
    provider_key:      string
    api_key_encrypted: string
    metadata:          string
  }>(sql`
    SELECT id, organization_id, tenant_id, provider_key,
           api_key_encrypted, metadata::text AS metadata
    FROM pos_integrations
    WHERE is_active = true
      AND provider_key IN ('posist', 'shopify', 'pine_labs', 'razorpay_pos')
    ORDER BY organization_id, tenant_id
  `)

  const results = {
    total:     integrations.length,
    synced:    0,
    skipped:   0,
    failed:    0,
    errors:    [] as Array<{ integrationId: string; error: string }>,
  }

  for (const row of integrations) {
    try {
      const meta = JSON.parse(row.metadata ?? "{}") as Record<string, string>

      // Decrypt API key
      const apiKey = decryptApiKey(row.api_key_encrypted)

      const config: POSProviderConfig = {
        apiKey,
        merchantId:  meta.merchant_id  ?? meta.restaurant_id,
        clientId:    meta.client_id,
        outletId:    meta.outlet_id,
        storeId:     meta.store_id,
        locationId:  meta.location_id,
      }

      const provider = getPOSProvider(row.provider_key as POSProviderKey, config)

      // Fetch yesterday's data
      const record = await provider.fetchDailySales(targetDate)

      const dateStr = targetDate.toISOString().slice(0, 10)

      // Upsert into pos_sales_data
      await serviceDb.execute(sql`
        INSERT INTO pos_sales_data (
          organization_id, tenant_id, pos_integration_id,
          sale_date, gross_sales, net_sales,
          refunds, discounts, transaction_count, avg_transaction_value,
          updated_at
        ) VALUES (
          ${row.organization_id}::uuid,
          ${row.tenant_id}::uuid,
          ${row.id}::uuid,
          ${dateStr}::date,
          ${record.grossSales},
          ${record.netSales},
          ${record.refunds},
          ${record.discounts},
          ${record.transactionCount},
          ${record.avgTransactionValue},
          NOW()
        )
        ON CONFLICT (pos_integration_id, sale_date)
        DO UPDATE SET
          gross_sales           = EXCLUDED.gross_sales,
          net_sales             = EXCLUDED.net_sales,
          refunds               = EXCLUDED.refunds,
          discounts             = EXCLUDED.discounts,
          transaction_count     = EXCLUDED.transaction_count,
          avg_transaction_value = EXCLUDED.avg_transaction_value,
          updated_at            = NOW()
      `)

      // Mark sync healthy
      await serviceDb.execute(sql`
        UPDATE pos_integrations
        SET last_sync_at = NOW(), sync_status = 'healthy'
        WHERE id = ${row.id}::uuid
      `)

      results.synced++
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      results.failed++
      results.errors.push({ integrationId: row.id, error: message })

      // Mark sync error
      await serviceDb.execute(sql`
        UPDATE pos_integrations
        SET sync_status = 'error', last_error = ${message}
        WHERE id = ${row.id}::uuid
      `).catch(() => {/* best-effort */})
    }
  }

  return NextResponse.json({
    ok:          true,
    targetDate:  targetDate.toISOString().slice(0, 10),
    durationMs:  Date.now() - startedAt,
    ...results,
  })
}
