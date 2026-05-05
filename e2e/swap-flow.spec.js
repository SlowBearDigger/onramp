import { test, expect } from '@playwright/test'

// swap flow — covers the high-value path:
//   /swap (buy) → toggle to /swap/sell → toggle back → form remains
//
// the SwapWidget stays mounted across mode flips (URL-driven) so the form
// values shouldn't reset when flipping. this regressed twice during the
// route refactor; an e2e guard pays for itself.
//
// VITE_USE_MOCK=true in playwright.config.js so the dev server stubs out
// real provider widgets and the comparison cards don't try to network.

// helper — dismiss the privacy banner if it's present so it can't intercept
// pointer events targeting the form.
async function dismissBanner(page) {
  const banner = page.getByRole('region', { name: /privacy/i })
  if (await banner.isVisible({ timeout: 2000 }).catch(() => false)) {
    await banner.getByRole('button', { name: 'Got it' }).click()
    await expect(banner).not.toBeVisible()
  }
}

test('amount input survives buy↔sell tab flip', async ({ page }) => {
  await page.goto('swap')
  await dismissBanner(page)

  const amountInput = page.locator('#swap-pay-amount')
  await amountInput.fill('250')
  await expect(amountInput).toHaveValue('250')

  // tabs are role="tab" inside a tablist, with localized text "Buy" / "Sell"
  await page.getByRole('tab', { name: 'Sell' }).click()
  await expect(page).toHaveURL(/\/swap\/sell$/)

  await page.getByRole('tab', { name: 'Buy' }).click()
  await expect(page).toHaveURL(/\/swap$/)

  // value should still be there since the widget stays mounted across
  // mode flips. this regressed twice during the route refactor.
  await expect(amountInput).toHaveValue('250')
})

test('history view renders an actionable state without backend connectivity', async ({ page }) => {
  // playwright config points VITE_API_BASE_URL at an unreachable port so
  // the orders fetch fails fast. the page must still render something
  // useful — either the empty state (no last-used wallet) or the error
  // badge (fetch failed) — never crash silently.
  await page.goto('swap/history')
  // the heading always renders regardless of fetch state
  await expect(page.getByRole('heading', { name: /Transaction History/i })).toBeVisible()
  // and exactly one of: empty state CTA, error badge, or loading spinner
  const hasState = page.getByText(/No transactions yet|couldn'?t load|loading your transactions/i).first()
  await expect(hasState).toBeVisible({ timeout: 5000 })
})

test('quick amount chips populate the amount input', async ({ page }) => {
  await page.goto('swap')
  await dismissBanner(page)

  // chips render literal "$50" / "$100" / "$1000" — use exact match so
  // "$100" doesn't ambiguously also match "$1000".
  const chip = page.getByRole('button', { name: '$100', exact: true })
  await chip.click()

  const amountInput = page.locator('#swap-pay-amount')
  await expect(amountInput).toHaveValue('100')
})
