/**
 * POST /api/email/send
 *
 * Sends a direct email to a tenant via SMTP.
 *
 * Body: { to, subject, message, tenantId, cc?, templateId? }
 */

import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { db } from "@/lib/db"
import { tenants } from "@/lib/db/schema"
import { eq } from "drizzle-orm"
import { requirePermission, PERMISSIONS } from "@/lib/auth/rbac"
import { sendEmail } from "@/lib/notifications/email"
import { writeAuditLog, extractRequestMeta } from "@/lib/audit/log"

// ── Simple in-memory rate limiter (10 sends / minute per user) ───────────────
const rateLimitMap = new Map<string, { count: number; resetAt: number }>()
const RATE_LIMIT    = 10
const WINDOW_MS     = 60_000

function checkRateLimit(userId: string): boolean {
  const now  = Date.now()
  const entry = rateLimitMap.get(userId)
  if (!entry || now > entry.resetAt) {
    rateLimitMap.set(userId, { count: 1, resetAt: now + WINDOW_MS })
    return true
  }
  if (entry.count >= RATE_LIMIT) return false
  entry.count++
  return true
}

// ── Basic HTML sanitiser (strips tags, keeps plain text + line breaks) ────────
function sanitizeHtml(raw: string): string {
  return raw
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<style[\s\S]*?<\/style>/gi,  "")
    .replace(/<[^>]+>/g, "")           // strip remaining tags
    .trim()
}

// ── Email template builder ────────────────────────────────────────────────────
function buildHtml(params: {
  tenantName: string
  senderName: string
  subject: string
  message: string
}): string {
  const { tenantName, senderName, subject, message } = params
  const lines = sanitizeHtml(message).split("\n").map(l => `<p style="margin:0 0 10px 0">${l || "&nbsp;"}</p>`).join("")
  const year  = new Date().getFullYear()

  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width,initial-scale=1" />
  <title>${subject}</title>
</head>
<body style="margin:0;padding:0;background:#f4f6f8;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f4f6f8;padding:32px 0">
    <tr><td align="center">
      <table width="600" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:8px;overflow:hidden;box-shadow:0 1px 4px rgba(0,0,0,.08)">

        <!-- Header -->
        <tr>
          <td style="background:#1d4ed8;padding:24px 32px">
            <p style="margin:0;color:#ffffff;font-size:18px;font-weight:700">MallOS</p>
            <p style="margin:4px 0 0;color:#bfdbfe;font-size:12px">Mall Management Platform</p>
          </td>
        </tr>

        <!-- Body -->
        <tr>
          <td style="padding:32px">
            <p style="margin:0 0 8px;font-size:14px;color:#6b7280">Dear ${tenantName},</p>
            <h2 style="margin:0 0 20px;font-size:20px;font-weight:600;color:#111827">${subject}</h2>
            <div style="font-size:14px;line-height:1.7;color:#374151">${lines}</div>
          </td>
        </tr>

        <!-- Divider -->
        <tr><td style="padding:0 32px"><hr style="border:none;border-top:1px solid #e5e7eb" /></td></tr>

        <!-- Footer -->
        <tr>
          <td style="padding:16px 32px">
            <p style="margin:0;font-size:12px;color:#9ca3af">
              Sent by <strong>${senderName}</strong> via MallOS &mdash; ${year}
            </p>
            <p style="margin:4px 0 0;font-size:11px;color:#d1d5db">
              This is an automated message from your property management team.
            </p>
          </td>
        </tr>

      </table>
    </td></tr>
  </table>
</body>
</html>`
}

// ── Route handler ─────────────────────────────────────────────────────────────
export async function POST(request: NextRequest) {
  try {
    // Auth
    const { authorized, error } = await requirePermission(PERMISSIONS.TENANTS_VIEW)
    if (!authorized) return NextResponse.json({ error }, { status: 403 })

    const session = await auth()
    const userId  = session?.user?.id ?? "unknown"

    // Rate limit
    if (!checkRateLimit(userId)) {
      return NextResponse.json(
        { error: "Rate limit exceeded. You can send at most 10 emails per minute." },
        { status: 429 },
      )
    }

    // Parse body
    const body = await request.json()
    const { to, subject, message, tenantId, cc } = body as {
      to: string
      subject: string
      message: string
      tenantId?: string
      cc?: string
    }

    // Validate
    const missing: string[] = []
    if (!to?.trim())      missing.push("to")
    if (!subject?.trim()) missing.push("subject")
    if (!message?.trim()) missing.push("message")
    if (missing.length) {
      return NextResponse.json(
        { error: `Missing required fields: ${missing.join(", ")}` },
        { status: 400 },
      )
    }

    // Basic email format check
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(to.trim())) {
      return NextResponse.json({ error: "Invalid email address" }, { status: 400 })
    }

    // Fetch tenant name for personalisation
    let tenantName = "Valued Tenant"
    if (tenantId) {
      const tenant = await db.query.tenants.findFirst({
        where: eq(tenants.id, tenantId),
      })
      if (tenant) tenantName = tenant.businessName
    }

    const senderName = session?.user?.name ?? "Mall Management"

    // Build HTML
    const html = buildHtml({ tenantName, senderName, subject: subject.trim(), message: message.trim() })

    // Send
    const result = await sendEmail(to.trim(), subject.trim(), html)

    if (!result.success) {
      return NextResponse.json(
        { error: result.error ?? "Failed to send email" },
        { status: 502 },
      )
    }

    // Audit log
    const meta = extractRequestMeta(request)
    void writeAuditLog({
      organizationId: session?.user?.organizationId ?? "",
      action:         "email.send",
      entity:         "tenant",
      entityId:       tenantId ?? to,
      before:         null,
      after:          { to, subject, status: "sent", messageId: result.messageId } as Record<string, unknown>,
      changedFields:  null,
      userId,
      ...meta,
    })

    return NextResponse.json({
      success: true,
      messageId: result.messageId,
      message:   "Email sent successfully",
    })
  } catch (err) {
    console.error("POST /api/email/send error:", err)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
