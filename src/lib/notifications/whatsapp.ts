// ── WhatsApp Sender (Stub) ───────────────────────────────────────────────────
// Replace with actual WhatsApp Business API integration (e.g., Twilio, Gupshup).

export async function sendWhatsApp(
  to: string,
  message: string
): Promise<{ success: boolean; messageId?: string; error?: string }> {
  if (!process.env.WHATSAPP_API_KEY) {
    console.warn("[WhatsApp] Not configured – message logged only")
    console.log(`[WhatsApp → ${to}] ${message}`)
    return { success: true, messageId: `wa-stub-${Date.now()}` }
  }

  // TODO: Implement actual WhatsApp Business API call
  // const response = await fetch("https://api.whatsapp.provider.com/send", {
  //   method: "POST",
  //   headers: { Authorization: `Bearer ${process.env.WHATSAPP_API_KEY}` },
  //   body: JSON.stringify({ to, message }),
  // })

  console.log(`[WhatsApp → ${to}] ${message}`)
  return { success: true, messageId: `wa-stub-${Date.now()}` }
}
