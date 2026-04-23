// ── Email Sender (SMTP via Nodemailer) ───────────────────────────────────────

import nodemailer from "nodemailer"
import type { Transporter } from "nodemailer"

let _transporter: Transporter | null = null

function getTransporter(): Transporter {
  if (_transporter) return _transporter

  const host     = process.env.SMTP_HOST
  const port     = parseInt(process.env.SMTP_PORT ?? "587")
  const user     = process.env.SMTP_USER
  const pass     = process.env.SMTP_PASS
  const secure   = process.env.SMTP_SECURE === "true" // true for port 465

  if (!host || !user || !pass) {
    throw new Error("SMTP not configured. Set SMTP_HOST, SMTP_USER, and SMTP_PASS env vars.")
  }

  _transporter = nodemailer.createTransport({
    host,
    port,
    secure,
    auth: { user, pass },
    pool: true,
    maxConnections: 5,
    rateDelta: 1000,
    rateLimit: 10,
  })

  return _transporter
}

const DEFAULT_FROM = process.env.SMTP_FROM ?? `MallOS Notifications <${process.env.SMTP_USER}>`

export async function sendEmail(
  to: string,
  subject: string,
  html: string
): Promise<{ success: boolean; messageId?: string; error?: string }> {
  // Dev fallback: if no SMTP configured, log to console and succeed silently
  if (!process.env.SMTP_HOST) {
    console.log(`[EMAIL DEV] To: ${to} | Subject: ${subject}`)
    console.log("[EMAIL DEV] Configure SMTP_HOST, SMTP_USER, SMTP_PASS to send real emails.")
    return { success: true, messageId: `dev-${Date.now()}` }
  }

  try {
    const transporter = getTransporter()
    const info = await transporter.sendMail({
      from: DEFAULT_FROM,
      to,
      subject,
      html: html.replace(/\n/g, "<br>"),
    })
    return { success: true, messageId: info.messageId }
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error"
    console.error("Email send error:", message)
    return { success: false, error: message }
  }
}
