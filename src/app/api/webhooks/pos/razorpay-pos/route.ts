/**
 * Razorpay POS Webhook Receiver
 * ─────────────────────────────────────────────────────────────────────────────
 * Receives payment and refund events from Razorpay POS.
 *
 * Registered URL: https://{slug}.mallos.com/api/webhooks/pos/razorpay-pos
 * Header: X-Razorpay-Signature: <hex_digest>
 * Header: X-Razorpay-Account-ID: <account_id>
 *
 * Events handled:
 *   payment.captured   → billable transaction
 *   refund.processed   → refund row
 *   payment.failed     → ignored
 *
 * Pipeline (async):
 *   verify HMAC → parse event → enqueue to BullMQ → return 200 immediately
 *   Worker picks up:  normalize → insert → dedup → aggregate → broadcast
 *
 * Fallback:
 *   If Redis / BullMQ is unavailable, falls back to synchronous ingestTransaction()
 *   so no data is lost during Redis downtime.
 */

import { type NextRequest, NextResponse } from "next/server"
import { serviceDb } from "@/lib/db"
import { sql } from "drizzle-orm"
import { decryptApiKey } from "@/lib/crypto/api-key"
import { verifyRazorpayPOSSignature } from "@/lib/pos/providers/razorpay-pos"
import { ingestTransaction, type POSIntegrationRow } from "@/lib/pos/ingest"
import { enqueuePosTransaction } from "@/lib/queues/pos-ingestion"
import { logger } from "@/lib/logger"

export const runtime = "nodejs"

export async function POST(req: NextRequest) {
  const rawBody   = await req.text()
  const signature = req.headers.get("x-razorpay-signature") ?? ""
  const accountId = req.headers.get("x-razorpay-account-id") ?? ""
  const timestamp = Number(req.headers.get("x-webhook-timestamp"))

  if (!accountId) {
    return NextResponse.json({ error: "Missing X-Razorpay-Account-ID" }, { status: 400 })
  }

  if (!timestamp || Math.abs(Date.now() - timestamp) > 300_000) {
    return new Response("Unauthorized", { status: 401 })
  }

  // ── 1. Look up integration by account ID ─────────────────────────────────
  const integrations = await serviceDb.execute<
    POSIntegrationRow & { webhook_secret_enc: string | null }
  >(sql`
    SELECT id, organization_id, tenant_id, property_id, lease_id,
           metadata->>'webhook_secret_enc' AS webhook_secret_enc
    FROM pos_integrations
    WHERE provider_key = 'razorpay_pos'
      AND metadata->>'account_id' = ${accountId}
      AND is_active = true
    LIMIT 1
  `)

  if (integrations.length === 0) {
    return NextResponse.json({ ok: false, reason: "Unknown account" }, { status: 200 })
  }

  const integration = integrations[0]

  // ── 2. Verify HMAC signature — required; reject if secret is missing ──────
  if (!integration.webhook_secret_enc) {
    return new Response("Unauthorized", { status: 401 })
  }

  const secret = decryptApiKey(integration.webhook_secret_enc)
  if (!verifyRazorpayPOSSignature(rawBody, signature, secret)) {
    logger.warn("razorpay-pos-webhook: invalid signature", {
      integrationId: integration.id,
      accountId,
    })
    return NextResponse.json({ error: "Invalid signature" }, { status: 401 })
  }

  // ── 3. Parse event ────────────────────────────────────────────────────────
  let payload: Record<string, unknown>
  try {
    payload = JSON.parse(rawBody) as Record<string, unknown>
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 })
  }

  // Skip payment.failed — no financial impact
  if (payload.event === "payment.failed") {
    return NextResponse.json({ ok: true, skipped: "payment.failed" })
  }

  // Only handle payment.captured and refund.processed
  if (payload.event !== "payment.captured" && payload.event !== "refund.processed") {
    return NextResponse.json({ ok: true, skipped: payload.event })
  }

  // ── 4. Enqueue for async processing ──────────────────────────────────────
  const jobId = await enqueuePosTransaction("razorpay_pos", integration.id, payload)

  if (jobId !== null) {
    return NextResponse.json({ ok: true, queued: true, jobId })
  }

  // ── 4b. Fallback: Redis unavailable — process synchronously ──────────────
  logger.warn("razorpay-pos-webhook: Redis unavailable, falling back to sync ingestion", {
    integrationId: integration.id,
  })

  try {
    const result = await ingestTransaction("razorpay_pos", integration, payload)
    return NextResponse.json({ ok: true, queued: false, inserted: result.inserted, externalId: result.externalId })
  } catch (err) {
    logger.error("razorpay-pos-webhook: sync fallback ingest error", {
      integrationId: integration.id,
      error: err,
    })
    return NextResponse.json({ error: "Internal error" }, { status: 500 })
  }
}
