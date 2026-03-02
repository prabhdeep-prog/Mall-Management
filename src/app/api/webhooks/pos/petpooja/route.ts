/**
 * Petpooja POS Webhook Receiver
 * ─────────────────────────────────────────────────────────────────────────────
 * Receives order events from Petpooja (India's leading restaurant POS).
 * Used for food court tenants.
 *
 * Registered URL: https://{slug}.mallos.com/api/webhooks/pos/petpooja
 * Header: X-Petpooja-Signature: sha256=<hex_digest>
 * Header: X-Restaurant-ID: <restaurant_id>
 *
 * Events:
 *   order.completed → billable transaction
 *   order.refunded  → negative adjustment
 *   order.voided    → ignored (never collected payment)
 */

import { type NextRequest, NextResponse } from "next/server"
import { serviceDb } from "@/lib/db"
import { sql } from "drizzle-orm"
import { decryptApiKey } from "@/lib/crypto/api-key"
import {
  verifyPetpoojaSignature,
  parsePetpoojaWebhook,
  type PetpoojaWebhookPayload,
} from "@/lib/pos/providers/petpooja"

export const runtime = "nodejs"

export async function POST(req: NextRequest) {
  const rawBody      = await req.text()
  const signature    = req.headers.get("x-petpooja-signature") ?? ""
  const restaurantId = req.headers.get("x-restaurant-id") ?? ""

  if (!restaurantId) {
    return NextResponse.json({ error: "Missing X-Restaurant-ID" }, { status: 400 })
  }

  // ── 1. Look up integration ────────────────────────────────────────────────
  const integrations = await serviceDb.execute<{
    id:                 string
    organization_id:    string
    tenant_id:          string
    webhook_secret_enc: string | null
  }>(sql`
    SELECT id, organization_id, tenant_id,
           metadata->>'webhook_secret_enc' AS webhook_secret_enc
    FROM pos_integrations
    WHERE provider_key = 'petpooja'
      AND metadata->>'restaurant_id' = ${restaurantId}
      AND is_active = true
    LIMIT 1
  `)

  if (integrations.length === 0) {
    return NextResponse.json({ ok: false }, { status: 200 })
  }

  const integration = integrations[0]

  // ── 2. Verify signature ───────────────────────────────────────────────────
  if (integration.webhook_secret_enc) {
    const secret = decryptApiKey(integration.webhook_secret_enc)
    if (!verifyPetpoojaSignature(rawBody, signature, secret)) {
      return NextResponse.json({ error: "Invalid signature" }, { status: 401 })
    }
  }

  // ── 3. Parse ──────────────────────────────────────────────────────────────
  let payload: PetpoojaWebhookPayload
  try {
    payload = JSON.parse(rawBody) as PetpoojaWebhookPayload
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 })
  }

  // Skip voided orders — they never collected payment
  if (payload.event === "order.voided") {
    return NextResponse.json({ ok: true, skipped: "voided" })
  }

  const tx = parsePetpoojaWebhook(payload)

  // Skip non-billable events
  if (!tx.isBillable && payload.event !== "order.refunded") {
    return NextResponse.json({ ok: true, skipped: payload.event })
  }

  // ── 4. Ingest ──────────────────────────────────────────────────────────────
  try {
    // For refunds, generate a unique refund ID based on order + event
    const txId = payload.event === "order.refunded"
      ? `${payload.order_id}_refund`
      : payload.order_id

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
        ${txId},
        'petpooja',
        ${tx.transactionDate.toISOString().slice(0, 10)}::date,
        ${tx.transactionTime?.toISOString() ?? null}::timestamptz,
        ${payload.event === "order.refunded" ? 0 : tx.grossAmount},
        ${payload.event === "order.refunded" ? tx.grossAmount : 0},
        ${tx.discountAmount},
        ${tx.paymentMode},
        ${tx.category},
        ${JSON.stringify(tx.rawPayload)}::jsonb,
        'webhook'
      )
      ON CONFLICT (pos_integration_id, provider_tx_id) DO NOTHING
    `)

    await serviceDb.execute(sql`
      UPDATE pos_integrations
      SET last_sync_at = NOW(), sync_status = 'healthy'
      WHERE id = ${integration.id}::uuid
    `)
  } catch (err) {
    console.error("[petpooja-webhook] DB error:", err)
    return NextResponse.json({ error: "Internal error" }, { status: 500 })
  }

  return NextResponse.json({ ok: true })
}
