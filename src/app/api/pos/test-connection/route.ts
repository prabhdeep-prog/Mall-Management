import { NextResponse } from "next/server"
import { getPOSProvider } from "@/lib/pos"
import type { POSProviderKey } from "@/lib/pos/types"

export async function POST(request: Request) {
  try {
    const body = await request.json()
    const { provider, storeId, locationId, apiKey } = body

    if (!provider || !storeId || !apiKey) {
      return NextResponse.json(
        { success: false, error: "Missing required fields: provider, storeId, apiKey" },
        { status: 400 }
      )
    }

    const posProvider = getPOSProvider(provider as POSProviderKey, {
      apiKey,
      storeId,
      locationId,
      syncFrequency: "daily",
    })
    const result = await posProvider.testConnection()

    return NextResponse.json({
      success: result.ok,
      data: { ...result, message: result.ok ? "Connection successful! (demo mode)" : result.error },
    })
  } catch (error) {
    console.error("Error testing POS connection:", error)
    return NextResponse.json(
      { success: false, error: "Failed to test POS connection" },
      { status: 500 }
    )
  }
}
