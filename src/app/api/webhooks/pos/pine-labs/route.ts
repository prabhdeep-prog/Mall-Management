/**
 * Pine Labs POS Webhook Receiver
 * ─────────────────────────────────────────────────────────────────────────────
 * Receives transaction and settlement events from Pine Labs.
 *
 * Registered URL: https://{slug}.mallos.com/api/webhooks/pos/pine-labs
 * Header: X-Pine-Labs-Signature: <hex_digest>
 * Header: X-Merchant-ID: <merchant_id>
 *
 * Idempotency: UNIQUE constraint on (pos_integration_id, provider_tx_id)
 * Security:    HMAC-SHA256 over raw body, timing-safe comparison
 */

import { type NextRequest, NextResponse } from "next/server"
import { serviceDb } from "@/lib/db"
import { sql } from "drizzle-orm"
import { decryptApiKey } from "@/lib/crypto/api-key"
import {
  verifyPineLabsSignature,
  parsePineLabsWebhook,
  type PineLabsWebhookPayload,
} from "@/lib/pos/providers/pine-labs"

export const runtime = "nodejs"

// ── Route handler ─────────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  const rawBody  = await req.text()
  const signature = req.headers.get("x-pine-labs-signature") ?? ""
  const merchantId = req.headers.get("x-merchant-id") ?? ""

  if (!merchantId) {
    return NextResponse.json({ error: "Missing X-Merchant-ID header" }, { status: 400 })
  }

  // ── 1. Look up POS integration by merchant ID ─────────────────────────────
  const integrations = await serviceDb.execute<{
    id:                  string
    organization_id:     string
    tenant_id:           string
    api_key_encrypted:   string
    webhook_secret_enc:  string | null
  }>(sql`
    SELECT id, organization_id, tenant_id, api_key_encrypted,
           metadata->>'webhook_secret_enc' AS webhook_secret_enc
    FROM pos_integrations
    WHERE provider_key = 'pine_labs'
      AND metadata->>'merchant_id' = ${merchantId}
      AND is_active = true
    LIMIT 1
  `)

  if (integrations.length === 0) {
    // Return 200 to prevent Pine Labs from retrying with bogus merchant IDs
    return NextResponse.json({ ok: false, reason: "Unknown merchant" }, { status: 200 })
  }

  const integration = integrations[0]

  // ── 2. Verify HMAC signature ────────────────────────────────────────────────
  if (integration.webhook_secret_enc) {
    const webhookSecret = decryptApiKey(integration.webhook_secret_enc)
    if (!verifyPineLabsSignature(rawBody, signature, webhookSecret)) {
      return NextResponse.json({ error: "Invalid signature" }, { status: 401 })
    }
  }

  // ── 3. Parse payload ────────────────────────────────────────────────────────
  let payload: PineLabsWebhookPayload
  try {
    payload = JSON.parse(rawBody) as PineLabsWebhookPayload
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 })
  }

  // Only process completed transactions (not pending/failed)
  if (payload.event_type !== "transaction.completed") {
    return NextResponse.json({ ok: true, skipped: payload.event_type })
  }

  const tx = parsePineLabsWebhook(payload)

  // ── 4. Ingest into pos_transactions (idempotent) ────────────────────────────
  try {
    await serviceDb.execute(sql`
      INSERT INTO pos_transactions (
        organization_id, tenant_id, pos_integration_id,
        provider_tx_id, provider_key,
        transaction_date, transaction_time,
        gross_amount, refund_amount, discount_amount,
        payment_mode, category,
        raw_payload, ingestion_source
      ) VALUES (
        ${integration.organization_id}::uuid,
        ${integration.tenant_id}::uuid,
        ${integration.id}::uuid,
        ${tx.providerTxId},
        'pine_labs',
        ${tx.transactionDate.toISOString().slice(0, 10)}::date,
        ${tx.transactionDate.toISOString()}::timestamptz,
        ${tx.grossAmount},
        ${tx.refundAmount},
        ${tx.discountAmount},
        ${tx.paymentMode},
        ${tx.category},
        ${JSON.stringify(tx.rawPayload)}::jsonb,
        'webhook'
      )
      ON CONFLICT (pos_integration_id, provider_tx_id) DO NOTHING
    `)

    // Update last_sync_at on integration
    await serviceDb.execute(sql`
      UPDATE pos_integrations
      SET last_sync_at = NOW(), sync_status = 'healthy'
      WHERE id = ${integration.id}::uuid
    `)

  } catch (err) {
    console.error("[pine-labs-webhook] DB error:", err)
    // Return 500 so Pine Labs retries
    return NextResponse.json({ error: "Internal error" }, { status: 500 })
  }

  return NextResponse.json({ ok: true, txId: tx.providerTxId })
}
