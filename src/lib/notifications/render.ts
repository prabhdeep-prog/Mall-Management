// ── Template Render Engine ────────────────────────────────────────────────────
// Replaces {{variable}} placeholders with actual data values.

/**
 * Render a template string by replacing all {{variable}} placeholders.
 * Unknown variables are left as-is so the caller can spot missing data.
 */
export function renderTemplate(
  template: string,
  data: Record<string, string>
): string {
  return template.replace(/\{\{(\w+)\}\}/g, (match, key: string) => {
    return key in data ? data[key] : match
  })
}

/**
 * Extract all variable keys from a template string.
 */
export function extractVariables(template: string): string[] {
  const matches = template.matchAll(/\{\{(\w+)\}\}/g)
  return [...new Set([...matches].map((m) => m[1]))]
}

/**
 * Validate that all variables in a template exist in the provided registry.
 */
export function validateTemplate(
  template: string,
  availableKeys: string[]
): { valid: boolean; unknownVars: string[] } {
  const used = extractVariables(template)
  const unknownVars = used.filter((v) => !availableKeys.includes(v))
  return { valid: unknownVars.length === 0, unknownVars }
}
