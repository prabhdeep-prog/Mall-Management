/**
 * AES-256-GCM Encryption Module
 * ─────────────────────────────────────────────────────────────────────────────
 * Encrypts/decrypts sensitive data (bank details, POS API keys) at the
 * application layer before writing to the database.
 *
 * Requires ENCRYPTION_KEY env var (64 hex chars = 32 bytes).
 * Generate one: openssl rand -hex 32
 */

import crypto from "crypto"

const ALGORITHM = "aes-256-gcm"
const IV_LENGTH = 12      // GCM standard: 96-bit IV
const TAG_LENGTH = 16     // 128-bit auth tag
const ENCODING = "hex"

function getKey(): Buffer {
  const key = process.env.ENCRYPTION_KEY
  if (!key || key.length !== 64) {
    throw new Error(
      "ENCRYPTION_KEY must be set (64 hex chars = 32 bytes). Generate with: openssl rand -hex 32"
    )
  }
  return Buffer.from(key, "hex")
}

/**
 * Encrypt a plaintext string. Returns format: iv:authTag:ciphertext (all hex).
 */
export function encrypt(plaintext: string): string {
  const key = getKey()
  const iv = crypto.randomBytes(IV_LENGTH)
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv)

  let encrypted = cipher.update(plaintext, "utf8", ENCODING)
  encrypted += cipher.final(ENCODING)

  const authTag = cipher.getAuthTag()

  return `${iv.toString(ENCODING)}:${authTag.toString(ENCODING)}:${encrypted}`
}

/**
 * Decrypt a ciphertext string in format: iv:authTag:ciphertext (all hex).
 */
export function decrypt(ciphertext: string): string {
  const key = getKey()
  const parts = ciphertext.split(":")

  if (parts.length !== 3) {
    throw new Error("Invalid encrypted data format")
  }

  const [ivHex, authTagHex, encryptedHex] = parts
  const iv = Buffer.from(ivHex, ENCODING)
  const authTag = Buffer.from(authTagHex, ENCODING)

  const decipher = crypto.createDecipheriv(ALGORITHM, key, iv)
  decipher.setAuthTag(authTag)

  let decrypted = decipher.update(encryptedHex, ENCODING, "utf8")
  decrypted += decipher.final("utf8")

  return decrypted
}

/**
 * Encrypt a JSON-serializable object. Returns encrypted string.
 */
export function encryptObject(obj: unknown): string {
  return encrypt(JSON.stringify(obj))
}

/**
 * Decrypt to a JSON object.
 */
export function decryptObject<T = unknown>(ciphertext: string): T {
  return JSON.parse(decrypt(ciphertext)) as T
}

/**
 * Check if a value looks like it's already encrypted (iv:tag:cipher format).
 */
export function isEncrypted(value: string): boolean {
  if (!value || typeof value !== "string") return false
  const parts = value.split(":")
  return parts.length === 3 && parts.every(p => /^[0-9a-f]+$/i.test(p))
}

/**
 * Safely encrypt — if already encrypted, return as-is.
 */
export function safeEncrypt(plaintext: string): string {
  if (isEncrypted(plaintext)) return plaintext
  return encrypt(plaintext)
}

/**
 * Safely decrypt — if not in encrypted format, return as-is (migration-safe).
 */
export function safeDecrypt(ciphertext: string): string {
  if (!isEncrypted(ciphertext)) return ciphertext
  try {
    return decrypt(ciphertext)
  } catch {
    return ciphertext  // Return as-is if decryption fails (unencrypted legacy data)
  }
}
