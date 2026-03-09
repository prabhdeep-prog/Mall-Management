import { defineConfig, devices } from "@playwright/test"

const BASE_URL = process.env.TEST_BASE_URL || "http://localhost:3001"

export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : 1,
  reporter: [
    ["list"],
    ["html", { open: "never", outputFolder: "playwright-report" }],
    ...(process.env.CI ? [["github"] as [string]] : []),
  ],
  use: {
    baseURL: BASE_URL,
    trace: "on-first-retry",
    screenshot: "only-on-failure",
    video: "on-first-retry",
    actionTimeout: 15000,
    navigationTimeout: 30000,
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
  // Start the dev server automatically in CI
  ...(process.env.CI
    ? {
        webServer: {
          command: "pnpm dev -p 3001",
          url: BASE_URL,
          reuseExistingServer: false,
          timeout: 60000,
        },
      }
    : {}),
})
