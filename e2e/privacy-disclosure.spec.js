import { test, expect } from '@playwright/test'

// privacy disclosure banner — GDPR §3.3 requirement for "minimal data
// collection, privacy policy". this banner discloses our localStorage usage
// to first-time visitors and is dismissible (one-shot, persists in
// localStorage so it doesn't nag returning users).
//
// fresh BrowserContext per test means localStorage starts clean — we don't
// need to clear it ourselves. clearing it via addInitScript would also
// wipe across page.reload(), defeating the persistence assertion.

test.describe('privacy disclosure banner', () => {
  test('appears on first visit, after a small delay', async ({ page }) => {
    await page.goto('')
    // banner has a 600ms delay to avoid competing with hero animations.
    const banner = page.getByRole('region', { name: /privacy/i })
    await expect(banner).toBeVisible({ timeout: 5000 })
    await expect(banner.getByRole('link', { name: /read the policy/i })).toBeVisible()
    await expect(banner.getByRole('button', { name: 'Got it' })).toBeVisible()
  })

  test('"Got it" dismisses and persists across reloads', async ({ page }) => {
    await page.goto('')
    const banner = page.getByRole('region', { name: /privacy/i })
    await expect(banner).toBeVisible({ timeout: 5000 })

    await banner.getByRole('button', { name: 'Got it' }).click()
    await expect(banner).not.toBeVisible()

    const flag = await page.evaluate(() => localStorage.getItem('onramp:privacy:disclosed'))
    expect(flag).toBe('1')

    await page.reload()
    await page.waitForTimeout(1200) // past the reveal delay
    await expect(banner).not.toBeVisible()
  })

  test('"Dismiss" close button also dismisses', async ({ page }) => {
    await page.goto('')
    const banner = page.getByRole('region', { name: /privacy/i })
    await expect(banner).toBeVisible({ timeout: 5000 })

    await banner.getByRole('button', { name: 'Dismiss' }).click()
    await expect(banner).not.toBeVisible()
  })

  test('does NOT show on /privacy itself (would be redundant)', async ({ page }) => {
    await page.goto('privacy')
    await page.waitForTimeout(1200)
    await expect(page.getByRole('region', { name: /privacy/i })).not.toBeVisible()
  })

  test('"Read the policy" link navigates to /privacy', async ({ page }) => {
    await page.goto('')
    const banner = page.getByRole('region', { name: /privacy/i })
    await expect(banner).toBeVisible({ timeout: 5000 })

    await banner.getByRole('link', { name: /read the policy/i }).click()
    await expect(page).toHaveURL(/\/privacy$/)
  })
})
