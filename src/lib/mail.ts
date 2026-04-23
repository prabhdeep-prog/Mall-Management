/**
 * Reusable mail utility
 * ─────────────────────
 * Thin wrapper over nodemailer with lazy-initialized singleton transporter.
 * All SMTP config is read from env vars at first use.
 *
 * Usage:
 *   import { sendMail } from "@/lib/mail"
 *   await sendMail({ to: "a@b.com", subject: "Hi", html: "<p>Hello</p>" })
 */
import nodemailer from "nodemailer"
import type { Transporter } from "nodemailer"

let _transporter: Transporter | null = null

function getTransporter(): Transporter {
  if (_transporter) return _transporter

  const host = process.env.SMTP_HOST
  const port = parseInt(process.env.SMTP_PORT ?? "587", 10)
  const user = process.env.SMTP_USER
  const pass = process.env.SMTP_PASS
  const secure = process.env.SMTP_SECURE === "true"

  if (!host || !user || !pass) {
    throw new Error(
      "SMTP not configured. Set SMTP_HOST, SMTP_USER, and SMTP_PASS env vars.",
    )
  }

  _transporter = nodemailer.createTransport({
    host,
    port,
    secure,
    auth: { user, pass },
  })

  return _transporter
}

const DEFAULT_FROM =
  process.env.SMTP_FROM ?? `MallOS Notifications <${process.env.SMTP_USER}>`

export interface SendMailOptions {
  to: string
  subject: string
  html: string
}

export interface SendMailResult {
  success: boolean
  messageId?: string
  error?: string
}

export async function sendMail({
  to,
  subject,
  html,
}: SendMailOptions): Promise<SendMailResult> {
  // Dev fallback: log to console when SMTP is not configured.
  if (!process.env.SMTP_HOST) {
    console.log(`[MAIL DEV] To: ${to} | Subject: ${subject}`)
    return { success: true, messageId: `dev-${Date.now()}` }
  }

  try {
    const transporter = getTransporter()
    const info = await transporter.sendMail({
      from: DEFAULT_FROM,
      to,
      subject,
      html,
    })
    return { success: true, messageId: info.messageId }
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown SMTP error"
    console.error("[sendMail] error:", message)
    return { success: false, error: message }
  }
}
