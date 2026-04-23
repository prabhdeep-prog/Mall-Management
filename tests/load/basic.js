import http from "k6/http";
import { check, sleep, group } from "k6";
import { Rate, Trend } from "k6/metrics";

// ── Custom metrics ──────────────────────────────────────────────────────────

const errorRate = new Rate("errors");
const loginDuration = new Trend("login_duration", true);
const dashboardDuration = new Trend("dashboard_duration", true);
const invoiceListDuration = new Trend("invoice_list_duration", true);
const posWriteDuration = new Trend("pos_write_duration", true);
const camPreviewDuration = new Trend("cam_preview_duration", true);

// ── Configuration ───────────────────────────────────────────────────────────

const BASE_URL = __ENV.BASE_URL || "http://localhost:3000";

export const options = {
  scenarios: {
    // Ramp-up to 200 VUs over 1 minute, sustain for 3 minutes, ramp down
    load_test: {
      executor: "ramping-vus",
      startVUs: 0,
      stages: [
        { duration: "1m", target: 200 },
        { duration: "3m", target: 200 },
        { duration: "1m", target: 0 },
      ],
    },
  },

  thresholds: {
    http_req_duration: ["p(95)<500", "p(99)<1000"],
    http_req_failed: ["rate<0.01"],
    errors: ["rate<0.01"],
    login_duration: ["p(95)<800"],
    dashboard_duration: ["p(95)<500"],
    invoice_list_duration: ["p(95)<500"],
    pos_write_duration: ["p(95)<500"],
    cam_preview_duration: ["p(95)<1000"],
  },
};

// ── Helpers ─────────────────────────────────────────────────────────────────

const headers = { "Content-Type": "application/json" };

function getCSRFToken() {
  const res = http.get(`${BASE_URL}/api/auth/csrf`);
  try {
    return JSON.parse(res.body).csrfToken;
  } catch {
    return "";
  }
}

function login(email, password) {
  const csrf = getCSRFToken();
  const payload = {
    email,
    password,
    csrfToken: csrf,
    callbackUrl: `${BASE_URL}/dashboard`,
    json: "true",
  };

  const res = http.post(
    `${BASE_URL}/api/auth/callback/credentials`,
    JSON.stringify(payload),
    {
      headers,
      redirects: 0,
      tags: { name: "login" },
    }
  );

  loginDuration.add(res.timings.duration);

  // NextAuth sets session cookie on successful login
  const success = res.status === 200 || res.status === 302;
  errorRate.add(!success);

  return success;
}

// ── Test Scenarios ──────────────────────────────────────────────────────────

export default function () {
  const vuId = __VU;
  const email = `loadtest+${vuId}@mallos.com`;
  const password = "LoadTest2026!";

  // ── 1. Login ────────────────────────────────────────────────────────────
  group("Login", () => {
    login(email, password);
  });

  sleep(1);

  // ── 2. Dashboard Fetch ──────────────────────────────────────────────────
  group("Dashboard", () => {
    const res = http.get(`${BASE_URL}/api/dashboard`, {
      tags: { name: "dashboard" },
    });

    dashboardDuration.add(res.timings.duration);

    check(res, {
      "dashboard status 200": (r) => r.status === 200,
      "dashboard has data": (r) => {
        try {
          return JSON.parse(r.body).success === true;
        } catch {
          return false;
        }
      },
    });

    errorRate.add(res.status !== 200);
  });

  sleep(0.5);

  // ── 3. Invoice List ─────────────────────────────────────────────────────
  group("Invoice List", () => {
    const res = http.get(`${BASE_URL}/api/invoices`, {
      tags: { name: "invoice_list" },
    });

    invoiceListDuration.add(res.timings.duration);

    check(res, {
      "invoices status 200": (r) => r.status === 200,
    });

    errorRate.add(res.status !== 200);
  });

  sleep(0.5);

  // ── 4. POS Sale Write ──────────────────────────────────────────────────
  group("POS Write", () => {
    const sale = {
      posIntegrationId: __ENV.POS_INTEGRATION_ID || "test-integration",
      startDate: "2026-03-01",
      endDate: "2026-03-30",
    };

    const res = http.post(`${BASE_URL}/api/pos/sales`, JSON.stringify(sale), {
      headers,
      tags: { name: "pos_write" },
    });

    posWriteDuration.add(res.timings.duration);

    check(res, {
      "pos write status ok": (r) => r.status === 200 || r.status === 201,
    });

    errorRate.add(res.status >= 400);
  });

  sleep(0.5);

  // ── 5. CAM Preview ────────────────────────────────────────────────────
  group("CAM Preview", () => {
    const preview = {
      propertyId: __ENV.PROPERTY_ID || "test-property",
      category: "electricity",
      totalAmount: "100000",
      allocationMethod: "per_sqft",
      periodStart: "2026-03-01",
      periodEnd: "2026-03-31",
    };

    const res = http.post(
      `${BASE_URL}/api/cam/preview`,
      JSON.stringify(preview),
      {
        headers,
        tags: { name: "cam_preview" },
      }
    );

    camPreviewDuration.add(res.timings.duration);

    check(res, {
      "cam preview status ok": (r) => r.status === 200,
    });

    errorRate.add(res.status >= 400);
  });

  sleep(1);
}

// ── Summary ─────────────────────────────────────────────────────────────────

export function handleSummary(data) {
  const p95 = (m) => m?.values?.["p(95)"]?.toFixed(1) ?? "N/A";
  const rate = (m) => ((m?.values?.rate ?? 0) * 100).toFixed(2);

  const report = {
    summary: {
      total_requests: data.metrics.http_reqs?.values?.count ?? 0,
      error_rate_pct: rate(data.metrics.http_req_failed),
      p95_latency_ms: p95(data.metrics.http_req_duration),
    },
    endpoints: {
      login: { p95_ms: p95(data.metrics.login_duration) },
      dashboard: { p95_ms: p95(data.metrics.dashboard_duration) },
      invoice_list: { p95_ms: p95(data.metrics.invoice_list_duration) },
      pos_write: { p95_ms: p95(data.metrics.pos_write_duration) },
      cam_preview: { p95_ms: p95(data.metrics.cam_preview_duration) },
    },
    thresholds: Object.fromEntries(
      Object.entries(data.metrics).map(([k, v]) => [
        k,
        v.thresholds
          ? Object.fromEntries(
              Object.entries(v.thresholds).map(([t, ok]) => [t, ok ? "PASS" : "FAIL"])
            )
          : undefined,
      ]).filter(([, v]) => v)
    ),
  };

  return {
    stdout: JSON.stringify(report, null, 2) + "\n",
    "tests/load/report.json": JSON.stringify(report, null, 2),
  };
}
