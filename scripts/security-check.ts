#!/usr/bin/env npx tsx
/**
 * Security Check Script
 * ─────────────────────
 * Scans the codebase for common security issues:
 *   1. API routes missing auth()
 *   2. API routes missing requirePermission()
 *   3. sql.raw() usage (SQL injection risk)
 *   4. Hardcoded secrets
 *   5. dangerouslySetInnerHTML usage
 *
 * Usage:  npx tsx scripts/security-check.ts
 */

import { readFileSync, readdirSync, statSync } from "fs"
import { join, relative } from "path"

const ROOT = join(__dirname, "..")
const API_DIR = join(ROOT, "src/app/api")

interface Finding {
  severity: "CRITICAL" | "HIGH" | "MEDIUM" | "LOW"
  file: string
  issue: string
}

const findings: Finding[] = []

// ── Helpers ──────────────────────────────────────────────────────────────────

function walkDir(dir: string, ext: string): string[] {
  const results: string[] = []
  try {
    for (const entry of readdirSync(dir)) {
      const full = join(dir, entry)
      const stat = statSync(full)
      if (stat.isDirectory()) {
        results.push(...walkDir(full, ext))
      } else if (full.endsWith(ext)) {
        results.push(full)
      }
    }
  } catch {
    // skip inaccessible dirs
  }
  return results
}

function rel(path: string): string {
  return relative(ROOT, path)
}

// ── 1. Check API routes for auth ─────────────────────────────────────────────

const SKIP_AUTH = [
  "api/auth",
  "api/health",
  "api/webhooks",
  "api/cron",
]

const apiRoutes = walkDir(API_DIR, "route.ts")

for (const file of apiRoutes) {
  const relPath = rel(file)
  if (SKIP_AUTH.some((s) => relPath.includes(s))) continue

  const content = readFileSync(file, "utf-8")

  // Check for auth()
  if (!content.includes("await auth()") && !content.includes("requireTenantSession") && !content.includes("requireAuth")) {
    findings.push({
      severity: "CRITICAL",
      file: relPath,
      issue: "Missing authentication — no auth() call found",
    })
  }

  // Check for requirePermission on write operations
  const hasPost = content.includes("export async function POST")
  const hasPut = content.includes("export async function PUT")
  const hasDelete = content.includes("export async function DELETE")
  const hasPatch = content.includes("export async function PATCH")
  const hasWriteOp = hasPost || hasPut || hasDelete || hasPatch

  if (hasWriteOp && !content.includes("requirePermission") && !content.includes("requireRole") && !content.includes("requireTenantSession")) {
    findings.push({
      severity: "HIGH",
      file: relPath,
      issue: "Write operation without permission check",
    })
  }
}

// ── 2. Check for sql.raw() usage ─────────────────────────────────────────────

const srcFiles = walkDir(join(ROOT, "src"), ".ts")

for (const file of srcFiles) {
  const content = readFileSync(file, "utf-8")
  if (content.includes("sql.raw(") || content.includes("sql.raw`")) {
    findings.push({
      severity: "CRITICAL",
      file: rel(file),
      issue: "sql.raw() usage — potential SQL injection",
    })
  }
}

// ── 3. Check for hardcoded secrets ───────────────────────────────────────────

const SECRET_PATTERNS = [
  /(?:api[_-]?key|secret|password|token)\s*[:=]\s*["'][a-zA-Z0-9+/=]{16,}["']/gi,
]

for (const file of srcFiles) {
  if (file.includes("node_modules") || file.includes(".d.ts")) continue
  const content = readFileSync(file, "utf-8")
  for (const pattern of SECRET_PATTERNS) {
    pattern.lastIndex = 0
    if (pattern.test(content)) {
      findings.push({
        severity: "HIGH",
        file: rel(file),
        issue: "Possible hardcoded secret detected",
      })
      break
    }
  }
}

// ── 4. Check for dangerouslySetInnerHTML ─────────────────────────────────────

const tsxFiles = walkDir(join(ROOT, "src"), ".tsx")

for (const file of tsxFiles) {
  const content = readFileSync(file, "utf-8")
  if (content.includes("dangerouslySetInnerHTML")) {
    findings.push({
      severity: "MEDIUM",
      file: rel(file),
      issue: "dangerouslySetInnerHTML usage — XSS risk",
    })
  }
}

// ── Report ───────────────────────────────────────────────────────────────────

console.log("\n🔒 MallOS Security Check Report")
console.log("=" .repeat(60))

const bySeverity = {
  CRITICAL: findings.filter((f) => f.severity === "CRITICAL"),
  HIGH: findings.filter((f) => f.severity === "HIGH"),
  MEDIUM: findings.filter((f) => f.severity === "MEDIUM"),
  LOW: findings.filter((f) => f.severity === "LOW"),
}

for (const [severity, items] of Object.entries(bySeverity)) {
  if (items.length === 0) continue
  console.log(`\n${severity} (${items.length}):`)
  for (const item of items) {
    console.log(`  ✗ ${item.file}`)
    console.log(`    ${item.issue}`)
  }
}

const total = findings.length
console.log(`\n${"─".repeat(60)}`)
console.log(`Total findings: ${total}`)
console.log(`  Critical: ${bySeverity.CRITICAL.length}`)
console.log(`  High:     ${bySeverity.HIGH.length}`)
console.log(`  Medium:   ${bySeverity.MEDIUM.length}`)
console.log(`  Low:      ${bySeverity.LOW.length}`)

if (bySeverity.CRITICAL.length > 0) {
  console.log("\n⚠️  CRITICAL issues found — fix before deploying to production!")
  process.exit(1)
}

if (total === 0) {
  console.log("\n✅ No security issues detected.")
}

process.exit(0)
