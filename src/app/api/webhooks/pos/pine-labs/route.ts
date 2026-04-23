/**
 * Pine Labs POS Webhook Receiver
 * ─────────────────────────────────────────────────────────────────────────────
 * Receives transaction and settlement events from Pine Labs.
 *
 * Registered URL: https://{slug}.mallos.com/api/webhooks/pos/pine-labs
 * Header: X-Pine-Labs-Signature: <hex_digest>
 * Header: X-Merchant-ID: <merchant_id>
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
import { verifyPineLabsSignature } from "@/lib/pos/providers/pine-labs"
import { ingestTransaction, type POSIntegrationRow } from "@/lib/pos/ingest"
import { enqueuePosTransaction } from "@/lib/queues/pos-ingestion"
import { logger } from "@/lib/logger"

export const runtime = "nodejs"

export async function POST(req: NextRequest) {
  const rawBody    = await req.text()
  const signature  = req.headers.get("x-pine-labs-signature") ?? ""
  const merchantId = req.headers.get("x-merchant-id") ?? ""
  const timestamp  = Number(req.headers.get("x-webhook-timestamp"))

  if (!merchantId) {
    return NextResponse.json({ error: "Missing X-Merchant-ID header" }, { status: 400 })
  }

  if (!timestamp || Math.abs(Date.now() - timestamp) > 300_000) {
    return new Response("Unauthorized", { status: 401 })
  }

  // ── 1. Look up POS integration by merchant ID ─────────────────────────────
  const integrations = await serviceDb.execute<
    POSIntegrationRow & { webhook_secret_enc: string | null }
  >(sql`
    SELECT id, organization_id, tenant_id, property_id, lease_id,
           metadata->>'webhook_secret_enc' AS webhook_secret_enc
    FROM pos_integrations
    WHERE provider_key = 'pine_labs'
      AND metadata->>'merchant_id' = ${merchantId}
      AND is_active = true
    LIMIT 1
  `)

  if (integrations.length === 0) {
    return NextResponse.json({ ok: false, reason: "Unknown merchant" }, { status: 200 })
  }

  const integration = integrations[0]

  // ── 2. Verify HMAC signature — required; reject if secret is missing ──────
  if (!integration.webhook_secret_enc) {
    return new Response("Unauthorized", { status: 401 })
  }

  const webhookSecret = decryptApiKey(integration.webhook_secret_enc)
  if (!verifyPineLabsSignature(rawBody, signature, webhookSecret)) {
    logger.warn("pine-labs-webhook: invalid signature", {
      integrationId: integration.id,
      merchantId,
    })
    return NextResponse.json({ error: "Invalid signature" }, { status: 401 })
  }

  // ── 3. Parse event ────────────────────────────────────────────────────────
  let payload: Record<string, unknown>
  try {
    payload = JSON.parse(rawBody) as Record<string, unknown>
    // Strict validation before enqueuing or sync processing
    const { validateProviderPayload, POSValidationError } = await import("@/lib/pos/normalizer")
    validateProviderPayload("pine_labs", payload)
  } catch (err) {
    if (err instanceof SyntaxError) {
      return NextResponse.json({ error: "Invalid JSON" }, { status: 400 })
    }
    const { POSValidationError } = await import("@/lib/pos/normalizer")
    if (err instanceof POSValidationError) {
      return NextResponse.json({ 
        error: "Invalid payload", 
        details: err.errors.format() 
      }, { status: 400 })
    }
    throw err
  }

  // Only process completed transactions
  if (payload.event_type !== "transaction.completed") {
    return NextResponse.json({ ok: true, skipped: payload.event_type })
  }

  // ── 4. Enqueue for async processing ──────────────────────────────────────
  const jobId = await enqueuePosTransaction("pine_labs", integration.id, payload)

  if (jobId !== null) {
    return NextResponse.json({ ok: true, queued: true, jobId })
  }

  // ── 4b. Fallback: Redis unavailable — process synchronously ──────────────
  logger.warn("pine-labs-webhook: Redis unavailable, falling back to sync ingestion", {
    integrationId: integration.id,
  })

  try {
    const result = await ingestTransaction("pine_labs", integration, payload)
    return NextResponse.json({ ok: true, queued: false, inserted: result.inserted, externalId: result.externalId })
  } catch (err) {
    logger.error("pine-labs-webhook: sync fallback ingest error", {
      integrationId: integration.id,
      error: err,
    })
    return NextResponse.json({ error: "Internal error" }, { status: 500 })
  }
}
