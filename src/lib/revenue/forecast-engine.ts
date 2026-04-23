/**
 * Revenue Forecast Engine
 * ----------------------------------------------------------------------------
 * Generates a 30-day revenue forecast for a mall (property) and optional zone
 * from the last 90 days of POS sales. Uses a 7-day rolling average combined
 * with a weekday/weekend seasonality factor — deterministic, no external ML.
 *
 * Returned forecasts are not persisted automatically; the API route and the
 * Revenue Forecast Agent decide when to upsert them into `revenue_forecasts`.
 */
import { sql } from "drizzle-orm"
import { db } from "@/lib/db"

export const FORECAST_MODEL_VERSION = "rolling-7d-seasonal-v1"
export const FORECAST_HORIZON_DAYS = 30
export const FORECAST_LOOKBACK_DAYS = 90

export interface DailyRevenuePoint {
  date: string            // YYYY-MM-DD
  revenue: number         // gross sales
  isWeekend: boolean
}

export interface ForecastPoint {
  date: string
  predictedRevenue: number
  confidenceScore: number // 0..1
  isAnomaly?: boolean
}

export interface ForecastResult {
  modelVersion: string
  generatedAt: string
  lookbackDays: number
  history: DailyRevenuePoint[]
  forecast: ForecastPoint[]
  meta: {
    rolling7dAvg: number
    weekdayAvg: number
    weekendAvg: number
    weekendUplift: number    // multiplicative factor vs weekday
    sampleSize: number
  }
}

/**
 * Pull daily aggregated POS revenue for a property (and optional zone) for the
 * last `lookbackDays` days. Relies on RLS — caller must have already set
 * `app.current_organization_id` on the connection (or use the API route which
 * scopes via session).
 */
async function loadHistory(
  organizationId: string,
  propertyId: string,
  zoneId: string | null,
  lookbackDays: number,
): Promise<DailyRevenuePoint[]> {
  const rows = await db.execute<{ d: string; gross: string }>(sql`
    SELECT
      to_char(s.sales_date, 'YYYY-MM-DD')        AS d,
      COALESCE(SUM(s.gross_sales), 0)::text      AS gross
    FROM pos_sales_data s
    LEFT JOIN leases l ON l.id = s.lease_id
    WHERE s.property_id = ${propertyId}::uuid
      AND s.sales_date >= (CURRENT_DATE - ${lookbackDays}::int)
      AND s.sales_date <  CURRENT_DATE
      ${zoneId ? sql`AND l.zone_id = ${zoneId}::uuid` : sql``}
    GROUP BY s.sales_date
    ORDER BY s.sales_date ASC
  `)

  return (rows as unknown as Array<{ d: string; gross: string }>).map((r) => {
    const day = new Date(r.d + "T00:00:00Z").getUTCDay() // 0=Sun..6=Sat
    return {
      date: r.d,
      revenue: Number(r.gross) || 0,
      isWeekend: day === 0 || day === 6,
    }
  })
}

function rollingAverage(values: number[], window: number): number {
  if (values.length === 0) return 0
  const slice = values.slice(-window)
  return slice.reduce((a, b) => a + b, 0) / slice.length
}

function stddev(values: number[]): number {
  if (values.length < 2) return 0
  const mean = values.reduce((a, b) => a + b, 0) / values.length
  const variance = values.reduce((acc, v) => acc + (v - mean) ** 2, 0) / values.length
  return Math.sqrt(variance)
}

/**
 * Build a 30-day forecast from historical points.
 * - baseline = 7-day rolling avg of the most recent week
 * - apply weekday/weekend seasonality multiplier
 * - confidence shrinks the further out we project and the noisier the history
 * - flag historical anomalies (>2σ from rolling mean) so the widget can highlight them
 */
export function buildForecast(history: DailyRevenuePoint[]): Omit<ForecastResult, "history"> & { history: DailyRevenuePoint[] } {
  const values = history.map((h) => h.revenue)
  const rolling7 = rollingAverage(values, 7)

  const weekdayVals = history.filter((h) => !h.isWeekend).map((h) => h.revenue)
  const weekendVals = history.filter((h) =>  h.isWeekend).map((h) => h.revenue)
  const weekdayAvg = weekdayVals.length ? weekdayVals.reduce((a, b) => a + b, 0) / weekdayVals.length : rolling7
  const weekendAvg = weekendVals.length ? weekendVals.reduce((a, b) => a + b, 0) / weekendVals.length : rolling7
  const weekendUplift = weekdayAvg > 0 ? weekendAvg / weekdayAvg : 1

  const sigma = stddev(values)
  const noiseRatio = rolling7 > 0 ? sigma / rolling7 : 1

  // Historical anomaly flagging (>2σ from the rolling mean)
  const meanForFlag = values.length ? values.reduce((a, b) => a + b, 0) / values.length : 0
  const annotatedHistory = history.map<DailyRevenuePoint & { isAnomaly?: boolean }>((p) => ({
    ...p,
    isAnomaly: sigma > 0 && Math.abs(p.revenue - meanForFlag) > 2 * sigma,
  }))

  const forecast: ForecastPoint[] = []
  const today = new Date()
  today.setUTCHours(0, 0, 0, 0)

  for (let i = 1; i <= FORECAST_HORIZON_DAYS; i++) {
    const d = new Date(today)
    d.setUTCDate(d.getUTCDate() + i)
    const dow = d.getUTCDay()
    const isWeekend = dow === 0 || dow === 6
    const base = isWeekend ? rolling7 * weekendUplift : rolling7
    // Confidence: 1.0 at day 1, decays with horizon, penalised by noise ratio.
    const horizonDecay = 1 - i / (FORECAST_HORIZON_DAYS * 1.5)
    const confidence = Math.max(0.2, Math.min(0.99, horizonDecay * (1 - Math.min(noiseRatio, 0.6))))

    forecast.push({
      date: d.toISOString().slice(0, 10),
      predictedRevenue: Math.round(base * 100) / 100,
      confidenceScore: Math.round(confidence * 1000) / 1000,
    })
  }

  return {
    modelVersion: FORECAST_MODEL_VERSION,
    generatedAt: new Date().toISOString(),
    lookbackDays: FORECAST_LOOKBACK_DAYS,
    history: annotatedHistory,
    forecast,
    meta: {
      rolling7dAvg: Math.round(rolling7 * 100) / 100,
      weekdayAvg: Math.round(weekdayAvg * 100) / 100,
      weekendAvg: Math.round(weekendAvg * 100) / 100,
      weekendUplift: Math.round(weekendUplift * 1000) / 1000,
      sampleSize: history.length,
    },
  }
}

export async function generateRevenueForecast(
  organizationId: string,
  propertyId: string,
  zoneId: string | null = null,
): Promise<ForecastResult> {
  const history = await loadHistory(organizationId, propertyId, zoneId, FORECAST_LOOKBACK_DAYS)
  return buildForecast(history) as ForecastResult
}
