// ============================================================================
// POS Provider Factory
// ============================================================================
// Returns the correct POS provider adapter based on provider key + decrypted config.
// In demo mode (POS_USE_MOCK=true), all providers use the mock adapter.

import type { POSProvider, POSProviderKey, POSProviderMeta, POSProviderConfig } from "./types"
import { POS_PROVIDERS, INDIAN_PROVIDERS, GLOBAL_PROVIDERS } from "./types"
import { MockPOSProvider } from "./providers/mock"
import { ShopifyPOSProvider } from "./providers/shopify"
import { PineLabsProvider } from "./providers/pine-labs"
import { PetpoojaProvider } from "./providers/petpooja"
import { POSistProvider } from "./providers/posist"
import { RazorpayPOSProvider } from "./providers/razorpay-pos"

// In demo mode, all providers use the mock adapter
const USE_MOCK = process.env.POS_USE_MOCK !== "false" // Default: true (mock mode)

/**
 * Get a POS provider adapter instance with the given decrypted config.
 * In demo/dev mode, returns mock provider regardless of key.
 */
export function getPOSProvider(
  providerKey: POSProviderKey,
  config: POSProviderConfig,
): POSProvider {
  if (USE_MOCK) {
    return new MockPOSProvider()
  }

  switch (providerKey) {
    case "pine_labs":
      return new PineLabsProvider(config)
    case "razorpay_pos":
      return new RazorpayPOSProvider(config)
    case "petpooja":
      return new PetpoojaProvider(config)
    case "posist":
      return new POSistProvider(config)
    case "shopify":
      return new ShopifyPOSProvider(config)
    // Square, Lightspeed, Vend — fall back to mock until implemented
    case "square":
    case "lightspeed":
    case "vend":
    default:
      return new MockPOSProvider()
  }
}

/**
 * Get all available POS providers with metadata
 */
export function getAvailableProviders(): POSProviderMeta[] {
  return POS_PROVIDERS
}

/**
 * Get providers grouped by region
 */
export function getProvidersByRegion(): { indian: POSProviderMeta[]; global: POSProviderMeta[] } {
  return {
    indian: INDIAN_PROVIDERS,
    global: GLOBAL_PROVIDERS,
  }
}

/**
 * Check if running in demo/mock mode
 */
export function isDemoMode(): boolean {
  return USE_MOCK
}

export { POS_PROVIDERS, INDIAN_PROVIDERS, GLOBAL_PROVIDERS } from "./types"
export type {
  POSProvider,
  POSProviderKey,
  POSProviderMeta,
  POSConnectionConfig,
  POSProviderConfig,
  POSSalesRecord,
  POSConnectionTestResult,
} from "./types"
