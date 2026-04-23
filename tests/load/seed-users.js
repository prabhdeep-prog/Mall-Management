import http from "k6/http";
import { check } from "k6";

// ── Seed Script ─────────────────────────────────────────────────────────────
// Pre-creates 500 virtual tenant users for load testing.
// Run once before the main load test:
//   k6 run --vus 50 --iterations 500 tests/load/seed-users.js
//
// Requires an admin session cookie or API key to create users.
// ─────────────────────────────────────────────────────────────────────────────

const BASE_URL = __ENV.BASE_URL || "http://localhost:3000";
const PROPERTY_ID = __ENV.PROPERTY_ID || "test-property";
const headers = { "Content-Type": "application/json" };

export const options = {
  vus: 50,
  iterations: 500,
};

export default function () {
  const i = __ITER + 1;

  // 1. Create tenant
  const tenantRes = http.post(
    `${BASE_URL}/api/tenants`,
    JSON.stringify({
      propertyId: PROPERTY_ID,
      businessName: `LoadTest Store ${i}`,
      email: `loadtest+${i}@mallos.com`,
      contactPerson: `Test User ${i}`,
      category: "retail",
    }),
    { headers }
  );

  check(tenantRes, {
    "tenant created": (r) => r.status === 201 || r.status === 200,
  });

  // 2. Create lease for tenant
  let tenantId;
  try {
    const body = JSON.parse(tenantRes.body);
    tenantId = body.id || body.data?.id;
  } catch {
    return;
  }

  if (!tenantId) return;

  const leaseRes = http.post(
    `${BASE_URL}/api/leases`,
    JSON.stringify({
      tenantId,
      propertyId: PROPERTY_ID,
      unitNumber: `LT-${i}`,
      areaSqft: `${500 + Math.floor(Math.random() * 2000)}`,
      leaseType: "fixed_rent",
      baseRent: `${25000 + Math.floor(Math.random() * 75000)}`,
      startDate: "2025-01-01",
      endDate: "2027-12-31",
    }),
    { headers }
  );

  check(leaseRes, {
    "lease created": (r) => r.status === 201 || r.status === 200,
  });
}
