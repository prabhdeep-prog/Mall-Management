/**
 * Onboarding Reminder Email Template
 * ────────────────────────────────────
 * Returns a self-contained HTML string — no external CSS, compatible with
 * all major email clients.
 */

export interface OnboardingReminderData {
  tenantName: string
  pendingItems: string[]
}

export function onboardingReminderTemplate({
  tenantName,
  pendingItems,
}: OnboardingReminderData): string {
  const itemsHtml = pendingItems
    .map((item) => `<li style="padding:4px 0">${item}</li>`)
    .join("")

  return `
<!DOCTYPE html>
<html lang="en">
<head><meta charset="utf-8"></head>
<body style="margin:0;padding:0;font-family:Arial,Helvetica,sans-serif;background:#f4f4f5">
  <table width="100%" cellpadding="0" cellspacing="0" style="padding:32px 0">
    <tr>
      <td align="center">
        <table width="560" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:8px;border:1px solid #e4e4e7">
          <!-- Header -->
          <tr>
            <td style="padding:24px 32px;border-bottom:1px solid #e4e4e7">
              <h1 style="margin:0;font-size:20px;color:#18181b">MallOS</h1>
            </td>
          </tr>

          <!-- Body -->
          <tr>
            <td style="padding:32px">
              <p style="margin:0 0 16px;font-size:16px;color:#18181b">
                Hi <strong>${tenantName}</strong>,
              </p>
              <p style="margin:0 0 16px;font-size:14px;color:#3f3f46;line-height:1.6">
                Your onboarding is still in progress. The following items need your attention:
              </p>
              <ul style="margin:0 0 24px;padding-left:20px;font-size:14px;color:#3f3f46;line-height:1.8">
                ${itemsHtml}
              </ul>
              <p style="margin:0 0 8px;font-size:14px;color:#3f3f46;line-height:1.6">
                Please complete these at your earliest convenience so we can get your store up and running.
              </p>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="padding:16px 32px;border-top:1px solid #e4e4e7;font-size:12px;color:#a1a1aa">
              This is an automated message from MallOS. Please do not reply directly.
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`.trim()
}
