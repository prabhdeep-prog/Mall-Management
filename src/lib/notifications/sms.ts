// ── SMS Sender (Stub) ────────────────────────────────────────────────────────
// Replace with actual SMS gateway integration (e.g., Twilio, MSG91, Kaleyra).

export async function sendSMS(
  to: string,
  message: string
): Promise<{ success: boolean; messageId?: string; error?: string }> {
  if (!process.env.SMS_API_KEY) {
    console.warn("[SMS] Not configured – message logged only")
    console.log(`[SMS → ${to}] ${message}`)
    return { success: true, messageId: `sms-stub-${Date.now()}` }
  }

  // TODO: Implement actual SMS API call
  // const response = await fetch("https://api.sms-provider.com/send", {
  //   method: "POST",
  //   headers: { Authorization: `Bearer ${process.env.SMS_API_KEY}` },
  //   body: JSON.stringify({ to, message }),
  // })

  console.log(`[SMS → ${to}] ${message}`)
  return { success: true, messageId: `sms-stub-${Date.now()}` }
}
