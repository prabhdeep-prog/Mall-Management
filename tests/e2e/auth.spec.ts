import { test, expect } from "@playwright/test"

const BASE_URL = process.env.TEST_BASE_URL || "http://localhost:3001"

// ── Helpers ───────────────────────────────────────────────────────────────────

async function fillLoginForm(
  page: import("@playwright/test").Page,
  email: string,
  password: string
) {
  await page.fill('input[type="email"]', email)
  await page.fill('input[type="password"]', password)
  await page.click('button[type="submit"]')
}

// ─── Login page structure ─────────────────────────────────────────────────────

test.describe("Login page", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(`${BASE_URL}/auth/login`)
  })

  test("renders the login form", async ({ page }) => {
    await expect(page.locator('input[type="email"]')).toBeVisible()
    await expect(page.locator('input[type="password"]')).toBeVisible()
    await expect(page.locator('button[type="submit"]')).toBeVisible()
  })

  test("shows validation errors for empty form submission", async ({ page }) => {
    await page.click('button[type="submit"]')

    // Zod resolver shows inline validation errors
    await expect(page.locator("text=valid email").or(page.locator("text=email"))).toBeVisible({
      timeout: 3000,
    })
  })

  test("shows validation error for invalid email format", async ({ page }) => {
    await page.fill('input[type="email"]', "not-an-email")
    await page.fill('input[type="password"]', "password123")
    await page.click('button[type="submit"]')

    await expect(
      page.locator("text=valid email").or(page.locator("[role='alert']"))
    ).toBeVisible({ timeout: 3000 })
  })

  test("shows error message for wrong credentials", async ({ page }) => {
    await fillLoginForm(page, "wrong@example.com", "wrongpassword")

    // Waits for the async signIn call to complete and show the error
    await expect(
      page.locator("text=Invalid email or password").or(page.locator("[role='alert']"))
    ).toBeVisible({ timeout: 10000 })
  })

  test("redirects unauthenticated users to login when accessing /dashboard", async ({
    page,
  }) => {
    await page.goto(`${BASE_URL}/dashboard`)
    await expect(page).toHaveURL(/auth\/login/, { timeout: 10000 })
  })
})

// ─── Protected routes ─────────────────────────────────────────────────────────

test.describe("Protected route guards", () => {
  test("redirects /tenants to login when not authenticated", async ({ page }) => {
    await page.goto(`${BASE_URL}/tenants`)
    await expect(page).toHaveURL(/auth\/login/, { timeout: 10000 })
  })

  test("redirects /analytics to login when not authenticated", async ({ page }) => {
    await page.goto(`${BASE_URL}/analytics`)
    await expect(page).toHaveURL(/auth\/login/, { timeout: 10000 })
  })

  test("redirects /financials to login when not authenticated", async ({ page }) => {
    await page.goto(`${BASE_URL}/financials`)
    await expect(page).toHaveURL(/auth\/login/, { timeout: 10000 })
  })

  test("the login page itself is accessible without auth", async ({ page }) => {
    const res = await page.goto(`${BASE_URL}/auth/login`)
    expect(res?.status()).not.toBe(403)
    expect(res?.status()).not.toBe(500)
  })
})
