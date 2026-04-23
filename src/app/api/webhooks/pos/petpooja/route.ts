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
 *   order.placed    → ignored (not yet billable)
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
import { verifyPetpoojaSignature } from "@/lib/pos/providers/petpooja"
import { ingestTransaction, type POSIntegrationRow } from "@/lib/pos/ingest"
import { enqueuePosTransaction } from "@/lib/queues/pos-ingestion"
import { logger } from "@/lib/logger"

export const runtime = "nodejs"

export async function POST(req: NextRequest) {
  const rawBody      = await req.text()
  const signature    = req.headers.get("x-petpooja-signature") ?? ""
  const restaurantId = req.headers.get("x-restaurant-id") ?? ""
  const timestamp    = Number(req.headers.get("x-webhook-timestamp"))

  if (!restaurantId) {
    return NextResponse.json({ error: "Missing X-Restaurant-ID" }, { status: 400 })
  }

  if (!timestamp || Math.abs(Date.now() - timestamp) > 300_000) {
    return new Response("Unauthorized", { status: 401 })
  }

  // ── 1. Look up integration ────────────────────────────────────────────────
  const integrations = await serviceDb.execute<
    POSIntegrationRow & { webhook_secret_enc: string | null }
  >(sql`
    SELECT id, organization_id, tenant_id, property_id, lease_id,
           metadata->>'webhook_secret_enc' AS webhook_secret_enc
    FROM pos_integrations
    WHERE provider_key = 'petpooja'
      AND metadata->>'restaurant_id' = ${restaurantId}
      AND is_active = true
    LIMIT 1
  `)

  if (integrations.length === 0) {
    // Return 200 to prevent provider from treating unknown merchant as an error
    return NextResponse.json({ ok: false, reason: "Unknown restaurant" }, { status: 200 })
  }

  const integration = integrations[0]

  // ── 2. Verify HMAC signature — required; reject if secret is missing ──────
  if (!integration.webhook_secret_enc) {
    return new Response("Unauthorized", { status: 401 })
  }

  const secret = decryptApiKey(integration.webhook_secret_enc)
  if (!verifyPetpoojaSignature(rawBody, signature, secret)) {
    logger.warn("petpooja-webhook: invalid signature", {
      integrationId: integration.id,
      restaurantId,
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

  // Skip voided orders — never collected payment
  if (payload.event === "order.voided") {
    return NextResponse.json({ ok: true, skipped: "voided" })
  }

  // Only process completed orders and refunds
  if (payload.event !== "order.completed" && payload.event !== "order.refunded") {
    return NextResponse.json({ ok: true, skipped: payload.event })
  }

  // ── 4. Enqueue for async processing ──────────────────────────────────────
  const jobId = await enqueuePosTransaction("petpooja", integration.id, payload)

  if (jobId !== null) {
    // Happy path — return 200 immediately; worker handles the rest
    return NextResponse.json({ ok: true, queued: true, jobId })
  }

  // ── 4b. Fallback: Redis unavailable — process synchronously ──────────────
  logger.warn("petpooja-webhook: Redis unavailable, falling back to sync ingestion", {
    integrationId: integration.id,
  })

  try {
    const result = await ingestTransaction("petpooja", integration, payload)
    return NextResponse.json({ ok: true, queued: false, inserted: result.inserted, externalId: result.externalId })
  } catch (err) {
    logger.error("petpooja-webhook: sync fallback ingest error", {
      integrationId: integration.id,
      error: err,
    })
    return NextResponse.json({ error: "Internal error" }, { status: 500 })
  }
}
