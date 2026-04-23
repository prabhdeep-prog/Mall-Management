import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { db } from "@/lib/db"
import { posIntegrations } from "@/lib/db/schema"
import { getPOSProvider } from "@/lib/pos"
import type { POSProviderKey } from "@/lib/pos/types"
import { eq, and } from "drizzle-orm"
import { encrypt } from "@/lib/crypto/encryption"

// ── GET — fetch POS integrations for a tenant/lease ──────────────────────────
export async function GET(request: NextRequest) {
  try {
    const session = await auth()
    if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

    const { searchParams } = new URL(request.url)
    const tenantId = searchParams.get("tenantId")
    const leaseId  = searchParams.get("leaseId")

    const conditions = []
    if (tenantId) conditions.push(eq(posIntegrations.tenantId, tenantId))
    if (leaseId)  conditions.push(eq(posIntegrations.leaseId, leaseId))

    const rows = await db
      .select()
      .from(posIntegrations)
      .where(conditions.length > 0 ? and(...conditions) : undefined)
      .orderBy(posIntegrations.createdAt)

    return NextResponse.json({ success: true, data: rows })
  } catch (error) {
    console.error("Error fetching POS integrations:", error)
    return NextResponse.json({ success: false, error: "Failed to fetch integrations" }, { status: 500 })
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json()
    const { tenantId, propertyId, leaseId, provider, storeId, locationId, apiKey, syncFrequency } = body

    if (!tenantId || !propertyId || !leaseId || !provider || !storeId || !apiKey) {
      return NextResponse.json(
        { success: false, error: "Missing required fields: tenantId, propertyId, leaseId, provider, storeId, apiKey" },
        { status: 400 }
      )
    }

    // Test the connection first
    const posProvider = getPOSProvider(provider as POSProviderKey, {
      apiKey,
      storeId,
      locationId,
      syncFrequency: syncFrequency || "daily",
    })
    const testResult = await posProvider.testConnection()

    if (!testResult.ok) {
      return NextResponse.json(
        { success: false, error: testResult.error || "Connection test failed" },
        { status: 400 }
      )
    }

    // Check if there's already a POS integration for this lease
    const existing = await db
      .select()
      .from(posIntegrations)
      .where(eq(posIntegrations.leaseId, leaseId))
      .limit(1)

    let integration
    if (existing.length > 0) {
      // Update existing
      const [updated] = await db
        .update(posIntegrations)
        .set({
          provider,
          storeId,
          locationId,
          apiKeyEncrypted: encrypt(apiKey),
          syncFrequency: syncFrequency || "daily",
          status: "connected",
          lastSyncAt: new Date(),
          lastSyncStatus: "success",
          updatedAt: new Date(),
        })
        .where(eq(posIntegrations.id, existing[0].id))
        .returning()
      integration = updated
    } else {
      // Create new
      const [created] = await db
        .insert(posIntegrations)
        .values({
          tenantId,
          propertyId,
          leaseId,
          provider,
          storeId,
          locationId,
          apiKeyEncrypted: encrypt(apiKey),
          syncFrequency: syncFrequency || "daily",
          status: "connected",
          lastSyncAt: new Date(),
          lastSyncStatus: "success",
        })
        .returning()
      integration = created
    }

    return NextResponse.json({
      success: true,
      data: {
        integration,
        connectionTest: testResult,
      },
    })
  } catch (error) {
    console.error("Error connecting POS:", error)
    return NextResponse.json(
      { success: false, error: "Failed to connect POS system" },
      { status: 500 }
    )
  }
}
