/**
 * POS API Key Encryption — AES-256-GCM
 * ──────────────────────────────────────────────────────────────────────────
 * Uses Node.js built-in `crypto` (no external deps).
 * The encryption key is a 32-byte (256-bit) value stored in ENCRYPTION_KEY
 * env var as a 64-char hex string.
 *
 * Format of ciphertext stored in DB:
 *   <iv_hex>:<authTag_hex>:<ciphertext_hex>
 *   (12 bytes IV : 16 bytes GCM auth tag : variable ciphertext)
 *
 * Security properties:
 *   • Authenticated encryption — tampering detected via GCM tag
 *   • Unique IV per encryption — same plaintext produces different ciphertext
 *   • Key never leaves server memory — only the ciphertext stored in DB
 */

import { createCipheriv, createDecipheriv, randomBytes, timingSafeEqual } from "crypto"

// ── Constants ─────────────────────────────────────────────────────────────────

const ALGORITHM = "aes-256-gcm"
const IV_LENGTH = 12          // 96-bit IV (GCM recommended)
const TAG_LENGTH = 16         // 128-bit auth tag
const SEPARATOR = ":"

// ── Key derivation ────────────────────────────────────────────────────────────

/**
 * Loads and validates the encryption key from environment.
 * Throws at startup if misconfigured — fail-fast over silent misconfig.
 */
function loadEncryptionKey(): Buffer {
  const hex = process.env.ENCRYPTION_KEY
  if (!hex) {
    throw new Error(
      "[crypto/api-key] ENCRYPTION_KEY env var is required. " +
      "Generate with: openssl rand -hex 32"
    )
  }
  if (hex.length !== 64) {
    throw new Error(
      `[crypto/api-key] ENCRYPTION_KEY must be 64 hex chars (32 bytes). Got ${hex.length} chars.`
    )
  }
  return Buffer.from(hex, "hex")
}

// Lazy-init — avoids crashing at import time during build
let _key: Buffer | null = null
function getKey(): Buffer {
  if (!_key) _key = loadEncryptionKey()
  return _key
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Encrypts a plaintext API key for storage in the database.
 *
 * @param plaintext  The raw API key string (e.g. "pk_live_xxxxx")
 * @returns          Ciphertext string: "<iv>:<tag>:<data>" (all hex-encoded)
 */
export function encryptApiKey(plaintext: string): string {
  const key = getKey()
  const iv  = randomBytes(IV_LENGTH)

  const cipher = createCipheriv(ALGORITHM, key, iv)
  const encrypted = Buffer.concat([
    cipher.update(plaintext, "utf8"),
    cipher.final(),
  ])
  const tag = cipher.getAuthTag()

  return [
    iv.toString("hex"),
    tag.toString("hex"),
    encrypted.toString("hex"),
  ].join(SEPARATOR)
}

/**
 * Decrypts a ciphertext from the database back to the raw API key.
 *
 * @param ciphertext  The stored string "<iv>:<tag>:<data>"
 * @returns           The original plaintext API key
 * @throws            If the ciphertext is tampered, malformed, or the key is wrong
 */
export function decryptApiKey(ciphertext: string): string {
  const key    = getKey()
  const parts  = ciphertext.split(SEPARATOR)

  if (parts.length !== 3) {
    throw new Error("[crypto/api-key] Malformed ciphertext: expected iv:tag:data format")
  }

  const [ivHex, tagHex, dataHex] = parts

  const iv   = Buffer.from(ivHex,   "hex")
  const tag  = Buffer.from(tagHex,  "hex")
  const data = Buffer.from(dataHex, "hex")

  if (iv.length !== IV_LENGTH) {
    throw new Error(`[crypto/api-key] Malformed IV: expected ${IV_LENGTH} bytes`)
  }
  if (tag.length !== TAG_LENGTH) {
    throw new Error(`[crypto/api-key] Malformed auth tag: expected ${TAG_LENGTH} bytes`)
  }

  const decipher = createDecipheriv(ALGORITHM, key, iv)
  decipher.setAuthTag(tag)

  try {
    const decrypted = Buffer.concat([decipher.update(data), decipher.final()])
    return decrypted.toString("utf8")
  } catch {
    throw new Error("[crypto/api-key] Decryption failed — ciphertext may be tampered or key is wrong")
  }
}

/**
 * Returns true if the provided ciphertext decrypts successfully.
 * Does NOT throw — safe to use in health-check routes.
 */
export function canDecrypt(ciphertext: string): boolean {
  try {
    decryptApiKey(ciphertext)
    return true
  } catch {
    return false
  }
}

/**
 * Rotates an encrypted API key to a new encryption key.
 * Pass the old key as hex via `oldKeyHex` parameter.
 * Useful for key rotation without exposing plaintext outside this module.
 */
export function rotateApiKey(
  ciphertext: string,
  oldKeyHex: string,
): string {
  if (oldKeyHex.length !== 64) {
    throw new Error("[crypto/api-key] oldKeyHex must be 64 hex chars")
  }

  // Decrypt with old key
  const oldKey = Buffer.from(oldKeyHex, "hex")
  const parts  = ciphertext.split(SEPARATOR)
  if (parts.length !== 3) throw new Error("[crypto/api-key] Malformed ciphertext")

  const [ivHex, tagHex, dataHex] = parts
  const iv   = Buffer.from(ivHex,   "hex")
  const tag  = Buffer.from(tagHex,  "hex")
  const data = Buffer.from(dataHex, "hex")

  const decipher = createDecipheriv(ALGORITHM, oldKey, iv)
  decipher.setAuthTag(tag)
  const plaintext = Buffer.concat([decipher.update(data), decipher.final()]).toString("utf8")

  // Re-encrypt with current (new) key
  return encryptApiKey(plaintext)
}

/**
 * Safely compares a candidate API key against a stored encrypted one.
 * Uses timing-safe comparison to prevent timing attacks.
 */
export function verifyApiKey(candidate: string, storedCiphertext: string): boolean {
  try {
    const plaintext = decryptApiKey(storedCiphertext)
    // Convert both to buffers for timing-safe compare
    const a = Buffer.from(candidate, "utf8")
    const b = Buffer.from(plaintext, "utf8")
    if (a.length !== b.length) return false
    return timingSafeEqual(a, b)
  } catch {
    return false
  }
}
