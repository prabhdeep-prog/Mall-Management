/**
 * Razorpay POS Webhook Receiver
 * ─────────────────────────────────────────────────────────────────────────────
 * Receives payment and refund events from Razorpay POS.
 *
 * Registered URL: https://{slug}.mallos.com/api/webhooks/pos/razorpay-pos
 * Header: X-Razorpay-Signature: <hex_digest>
 * Header: X-Razorpay-Account-ID: <account_id>  (used for routing)
 *
 * Events handled:
 *   payment.captured   → billable transaction
 *   refund.processed   → refund row
 *   payment.failed     → ignored
 */

import { type NextRequest, NextResponse } from "next/server"
import { serviceDb } from "@/lib/db"
import { sql } from "drizzle-orm"
import { decryptApiKey } from "@/lib/crypto/api-key"
import {
  verifyRazorpayPOSSignature,
  parseRazorpayPOSWebhook,
  type RazorpayPOSWebhookPayload,
} from "@/lib/pos/providers/razorpay-pos"

export const runtime = "nodejs"

export async function POST(req: NextRequest) {
  const rawBody   = await req.text()
  const signature = req.headers.get("x-razorpay-signature") ?? ""
  const accountId = req.headers.get("x-razorpay-account-id") ?? ""

  if (!accountId) {
    return NextResponse.json({ error: "Missing X-Razorpay-Account-ID" }, { status: 400 })
  }

  // ── 1. Look up integration by account ID ─────────────────────────────────
  const integrations = await serviceDb.execute<{
    id:                 string
    organization_id:    string
    tenant_id:          string
    webhook_secret_enc: string | null
  }>(sql`
    SELECT id, organization_id, tenant_id,
           metadata->>'webhook_secret_enc' AS webhook_secret_enc
    FROM pos_integrations
    WHERE provider_key = 'razorpay_pos'
      AND metadata->>'account_id' = ${accountId}
      AND is_active = true
    LIMIT 1
  `)

  if (integrations.length === 0) {
    return NextResponse.json({ ok: false }, { status: 200 })
  }

  const integration = integrations[0]

  // ── 2. Verify HMAC ────────────────────────────────────────────────────────
  if (integration.webhook_secret_enc) {
    const secret = decryptApiKey(integration.webhook_secret_enc)
    if (!verifyRazorpayPOSSignature(rawBody, signature, secret)) {
      return NextResponse.json({ error: "Invalid signature" }, { status: 401 })
    }
  }

  // ── 3. Parse ──────────────────────────────────────────────────────────────
  let payload: RazorpayPOSWebhookPayload
  try {
    payload = JSON.parse(rawBody) as RazorpayPOSWebhookPayload
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 })
  }

  // Skip payment.failed
  if (payload.event === "payment.failed") {
    return NextResponse.json({ ok: true, skipped: "payment.failed" })
  }

  const tx = parseRazorpayPOSWebhook(payload)
  if (!tx) {
    return NextResponse.json({ ok: true, skipped: "unhandled event" })
  }

  // ── 4. Ingest ──────────────────────────────────────────────────────────────
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
        'razorpay_pos',
        ${tx.transactionDate.toISOString().slice(0, 10)}::date,
        ${tx.transactionTime?.toISOString() ?? null}::timestamptz,
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

    await serviceDb.execute(sql`
      UPDATE pos_integrations
      SET last_sync_at = NOW(), sync_status = 'healthy'
      WHERE id = ${integration.id}::uuid
    `)
  } catch (err) {
    console.error("[razorpay-pos-webhook] DB error:", err)
    return NextResponse.json({ error: "Internal error" }, { status: 500 })
  }

  return NextResponse.json({ ok: true, txId: tx.providerTxId })
}
