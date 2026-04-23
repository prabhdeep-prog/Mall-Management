/**
 * Tenant Sentiment Engine
 * ----------------------------------------------------------------------------
 * Analyses text content and assigns a sentiment label + numeric score.
 *
 * Scoring approach (keyword-based, no ML):
 *   • Negative keywords  → score moves towards -1
 *   • Positive keywords  → score moves towards +1
 *   • No strong signals  → neutral (0)
 *
 * The engine also provides helpers to:
 *   • Record a sentiment entry for a tenant
 *   • Retrieve recent entries
 *   • Compute a rolling 30-day average and update the tenant record
 */
import { db } from "@/lib/db"
import { tenantSentiment, tenants } from "@/lib/db/schema"
import { eq, desc, gte, and } from "drizzle-orm"

export type Sentiment = "positive" | "neutral" | "negative"

export interface SentimentResult {
  sentiment: Sentiment
  score: number // -1 to 1
  matchedKeywords: string[]
}

export interface SentimentEntry {
  id: string
  tenantId: string
  sentiment: Sentiment
  score: number
  source: string
  content: string | null
  createdAt: string
}

export interface TenantSentimentSummary {
  averageScore: number
  sentiment: Sentiment
  totalEntries: number
  entries: SentimentEntry[]
}

// ── Keyword dictionaries ────────────────────────────────────────────────────

const NEGATIVE_KEYWORDS = [
  "issue",
  "complaint",
  "delay",
  "problem",
  "broken",
  "damaged",
  "unhappy",
  "dissatisfied",
  "frustrated",
  "poor",
  "terrible",
  "worst",
  "unacceptable",
  "disappointed",
  "annoyed",
  "escalate",
  "urgent",
  "overdue",
  "leak",
  "failure",
]

const POSITIVE_KEYWORDS = [
  "thanks",
  "thank",
  "good",
  "happy",
  "great",
  "excellent",
  "wonderful",
  "satisfied",
  "pleased",
  "appreciate",
  "helpful",
  "resolved",
  "quick",
  "fast",
  "impressive",
  "love",
  "perfect",
  "amazing",
  "fantastic",
  "well done",
]

// ── Core analysis ───────────────────────────────────────────────────────────

/**
 * Analyze a piece of text and return its sentiment label and score.
 */
export function analyzeSentiment(text: string): SentimentResult {
  const lower = text.toLowerCase()
  const matchedKeywords: string[] = []

  let positiveHits = 0
  let negativeHits = 0

  for (const kw of POSITIVE_KEYWORDS) {
    if (lower.includes(kw)) {
      positiveHits++
      matchedKeywords.push(`+${kw}`)
    }
  }

  for (const kw of NEGATIVE_KEYWORDS) {
    if (lower.includes(kw)) {
      negativeHits++
      matchedKeywords.push(`-${kw}`)
    }
  }

  const totalHits = positiveHits + negativeHits

  if (totalHits === 0) {
    return { sentiment: "neutral", score: 0, matchedKeywords }
  }

  // Score: ranges from -1 (all negative) to +1 (all positive)
  const rawScore = (positiveHits - negativeHits) / totalHits
  // Clamp to [-1, 1] and round to 3 decimals
  const score = Math.round(Math.max(-1, Math.min(1, rawScore)) * 1000) / 1000

  let sentiment: Sentiment
  if (score > 0.1) sentiment = "positive"
  else if (score < -0.1) sentiment = "negative"
  else sentiment = "neutral"

  return { sentiment, score, matchedKeywords }
}

// ── Persistence ─────────────────────────────────────────────────────────────

/**
 * Analyze text, store the result, and update the tenant's rolling sentiment score.
 */
export async function recordSentiment(
  tenantId: string,
  text: string,
  source: string,
): Promise<SentimentEntry> {
  const analysis = analyzeSentiment(text)

  const [inserted] = await db
    .insert(tenantSentiment)
    .values({
      tenantId,
      sentiment: analysis.sentiment,
      score: analysis.score.toFixed(3),
      source,
      content: text,
    })
    .returning()

  // Update rolling average on the tenant record
  await updateTenantSentimentScore(tenantId)

  return {
    id: inserted.id,
    tenantId: inserted.tenantId,
    sentiment: inserted.sentiment as Sentiment,
    score: Number(inserted.score),
    source: inserted.source,
    content: inserted.content,
    createdAt: inserted.createdAt.toISOString(),
  }
}

/**
 * Get recent sentiment entries for a tenant.
 */
export async function getRecentSentiment(
  tenantId: string,
  limit = 5,
): Promise<SentimentEntry[]> {
  const rows = await db
    .select()
    .from(tenantSentiment)
    .where(eq(tenantSentiment.tenantId, tenantId))
    .orderBy(desc(tenantSentiment.createdAt))
    .limit(limit)

  return rows.map((r) => ({
    id: r.id,
    tenantId: r.tenantId,
    sentiment: r.sentiment as Sentiment,
    score: Number(r.score),
    source: r.source,
    content: r.content,
    createdAt: r.createdAt.toISOString(),
  }))
}

/**
 * Compute the average sentiment score from the last 30 days and return a summary.
 */
export async function getSentimentSummary(
  tenantId: string,
): Promise<TenantSentimentSummary> {
  const thirtyDaysAgo = new Date()
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30)

  const rows = await db
    .select()
    .from(tenantSentiment)
    .where(
      and(
        eq(tenantSentiment.tenantId, tenantId),
        gte(tenantSentiment.createdAt, thirtyDaysAgo),
      )
    )
    .orderBy(desc(tenantSentiment.createdAt))

  const entries: SentimentEntry[] = rows.map((r) => ({
    id: r.id,
    tenantId: r.tenantId,
    sentiment: r.sentiment as Sentiment,
    score: Number(r.score),
    source: r.source,
    content: r.content,
    createdAt: r.createdAt.toISOString(),
  }))

  if (entries.length === 0) {
    return {
      averageScore: 0,
      sentiment: "neutral",
      totalEntries: 0,
      entries: [],
    }
  }

  const averageScore =
    Math.round(
      (entries.reduce((sum, e) => sum + e.score, 0) / entries.length) * 1000
    ) / 1000

  let sentiment: Sentiment
  if (averageScore > 0.1) sentiment = "positive"
  else if (averageScore < -0.1) sentiment = "negative"
  else sentiment = "neutral"

  // Return only the 5 most recent for the response
  return {
    averageScore,
    sentiment,
    totalEntries: entries.length,
    entries: entries.slice(0, 5),
  }
}

/**
 * Recompute the 30-day rolling average and persist it to tenants.sentiment_score.
 */
async function updateTenantSentimentScore(tenantId: string): Promise<void> {
  const thirtyDaysAgo = new Date()
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30)

  const rows = await db
    .select({ score: tenantSentiment.score })
    .from(tenantSentiment)
    .where(
      and(
        eq(tenantSentiment.tenantId, tenantId),
        gte(tenantSentiment.createdAt, thirtyDaysAgo),
      )
    )

  if (rows.length === 0) return

  const avg = rows.reduce((sum, r) => sum + Number(r.score), 0) / rows.length
  const clamped = Math.max(-1, Math.min(1, Math.round(avg * 100) / 100))

  await db
    .update(tenants)
    .set({ sentimentScore: clamped.toFixed(2) })
    .where(eq(tenants.id, tenantId))
}
