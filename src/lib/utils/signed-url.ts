/**
 * HMAC-signed URL utility for secure document downloads.
 *
 * Generates time-limited signed URLs so document links can't be
 * shared or reused beyond their expiry window.
 *
 * Uses AUTH_SECRET as the HMAC key (always available in this app).
 */

import { createHmac } from "crypto"

const HMAC_SECRET = process.env.AUTH_SECRET ?? "dev-fallback-secret"
const DEFAULT_EXPIRY_SECONDS = 3600 // 1 hour

/**
 * Signs a document URL with HMAC-SHA256 and an expiry timestamp.
 *
 * @param url      The raw document URL (e.g. S3 path or internal path)
 * @param tenantId The tenant requesting the download (bound to signature)
 * @param expiry   Seconds until the signature expires (default 1 hour)
 * @returns        URL with ?expires=...&tenant=...&sig=... appended
 */
export function signDocumentUrl(
  url: string,
  tenantId: string,
  expiry: number = DEFAULT_EXPIRY_SECONDS,
): string {
  const expires = Math.floor(Date.now() / 1000) + expiry
  const payload = `${url}:${tenantId}:${expires}`
  const sig = createHmac("sha256", HMAC_SECRET)
    .update(payload)
    .digest("hex")

  const signed = new URL(url, "https://placeholder.local")
  signed.searchParams.set("expires", String(expires))
  signed.searchParams.set("tenant", tenantId)
  signed.searchParams.set("sig", sig)

  // Return just the path+query if the url was relative
  if (!url.startsWith("http")) {
    return `${signed.pathname}${signed.search}`
  }
  return signed.toString()
}

/**
 * Verifies a signed document URL.
 *
 * @returns true if the signature is valid and not expired
 */
export function verifySignedUrl(
  url: string,
  tenantId: string,
  sig: string,
  expires: string,
): boolean {
  const expiresNum = parseInt(expires, 10)
  if (isNaN(expiresNum) || expiresNum < Math.floor(Date.now() / 1000)) {
    return false // Expired
  }

  // Strip query params to get the base URL for verification
  const baseUrl = url.split("?")[0]
  const payload = `${baseUrl}:${tenantId}:${expiresNum}`
  const expected = createHmac("sha256", HMAC_SECRET)
    .update(payload)
    .digest("hex")

  // Constant-time comparison
  if (sig.length !== expected.length) return false
  let diff = 0
  for (let i = 0; i < sig.length; i++) {
    diff |= sig.charCodeAt(i) ^ expected.charCodeAt(i)
  }
  return diff === 0
}
