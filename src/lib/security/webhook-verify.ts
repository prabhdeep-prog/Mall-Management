/**
 * Webhook Signature Verification
 * ─────────────────────────────────────────────────────────────────────────────
 * Verifies HMAC signatures on incoming webhook payloads from POS providers.
 */

import crypto from "crypto"

/**
 * Verify HMAC-SHA256 signature.
 */
export function verifyHmacSha256(params: {
  payload: string | Buffer
  signature: string
  secret: string
  encoding?: "hex" | "base64"
}): boolean {
  const { payload, signature, secret, encoding = "hex" } = params

  if (!payload || !signature || !secret) return false

  const expected = crypto
    .createHmac("sha256", secret)
    .update(payload)
    .digest(encoding)

  // Timing-safe comparison to prevent timing attacks
  try {
    const sigBuf = Buffer.from(signature, encoding)
    const expBuf = Buffer.from(expected, encoding)
    if (sigBuf.length !== expBuf.length) return false
    return crypto.timingSafeEqual(sigBuf, expBuf)
  } catch {
    return false
  }
}

/**
 * Verify Pine Labs webhook signature.
 */
export function verifyPineLabsSignature(payload: string, signature: string): boolean {
  const secret = process.env.PINE_LABS_WEBHOOK_SECRET
  if (!secret) return false
  return verifyHmacSha256({ payload, signature, secret })
}

/**
 * Verify Razorpay POS webhook signature.
 */
export function verifyRazorpayPosSignature(payload: string, signature: string): boolean {
  const secret = process.env.RAZORPAY_POS_WEBHOOK_SECRET
  if (!secret) return false
  return verifyHmacSha256({ payload, signature, secret })
}

/**
 * Verify Petpooja webhook signature.
 */
export function verifyPetpoojaSignature(payload: string, signature: string): boolean {
  const secret = process.env.PETPOOJA_WEBHOOK_SECRET
  if (!secret) return false
  return verifyHmacSha256({ payload, signature, secret })
}
