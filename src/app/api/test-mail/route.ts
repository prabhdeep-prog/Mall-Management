import { NextRequest, NextResponse } from "next/server"
import { sendMail } from "@/lib/mail"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/**
 * GET /api/test-mail?to=someone@example.com
 *
 * Sends a short test email via SMTP and returns the result.
 * Falls back to SMTP_USER as recipient if `to` is not provided.
 */
export async function GET(req: NextRequest) {
  const to =
    req.nextUrl.searchParams.get("to") ||
    process.env.SMTP_USER

  if (!to) {
    return NextResponse.json(
      { success: false, error: "No recipient. Pass ?to= or set SMTP_USER." },
      { status: 400 },
    )
  }

  try {
    const result = await sendMail({
      to,
      subject: "MallOS SMTP Test",
      html: `
        <div style="font-family:Arial,sans-serif;padding:24px">
          <h2 style="color:#18181b">SMTP Test Successful</h2>
          <p style="color:#3f3f46">
            This email confirms that the MallOS SMTP configuration is working.
          </p>
          <p style="color:#a1a1aa;font-size:12px">
            Sent at ${new Date().toISOString()}
          </p>
        </div>
      `.trim(),
    })

    const status = result.success ? 200 : 502
    return NextResponse.json(result, { status })
  } catch (err) {
    console.error("[test-mail] unexpected error:", err)
    return NextResponse.json(
      { success: false, error: err instanceof Error ? err.message : "Unknown error" },
      { status: 500 },
    )
  }
}
