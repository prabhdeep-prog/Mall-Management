# POS Circuit Breaker Integration Guide

Successfully implemented a per-provider Redis-based circuit breaker for POS API calls.

## Implementation Details

- **File**: `src/lib/pos/circuit-breaker.ts`
- **Storage**: Redis (Upstash)
- **Threshold**: 5 failures within 60 seconds.
- **Cooldown**: 60 seconds (circuit remains OPEN).
- **Error**: Throws `UnrecoverableError` from `bullmq` when circuit is OPEN.

## Usage Example

The circuit breaker is designed to wrap any outbound provider API call.

```typescript
import { withCircuitBreaker } from "@/lib/pos/circuit-breaker";

async function fetchFromProvider(provider: string, url: string) {
  return withCircuitBreaker(provider, async () => {
    const res = await fetch(url);
    if (!res.ok) throw new Error("API Failed");
    return res.json();
  });
}
```

## Integrated Locations

The circuit breaker has been integrated into the following locations:

1. **`PineLabsProvider`**: Wrapped the base `request` method.
2. **`RazorpayPOSProvider`**: Wrapped the base `request` method.
3. **`POSistProvider`**: Wrapped the base `request` method.
4. **`PetpoojaProvider`**: Wrapped the `testConnection` validator (outbound call).
5. **`ShopifyPOSProvider`**: Wrapped the `fetchSalesRange` method.
6. **`pos-worker.ts`**: Wrapped the `ingestTransaction` call in the job processor.

## Unit Tests

Unit tests verify the state transitions (CLOSED -> OPEN -> HALF_OPEN -> CLOSED).
Run them using:
```bash
pnpm vitest run tests/unit/pos/circuit-breaker.test.ts
```

## Redis Keys

- `pos:circuit:<provider>:failures`: Counter for failures in the current window.
- `pos:circuit:<provider>:state`: Current state (set to `OPEN` for cooldown).
