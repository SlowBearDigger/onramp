import { test, expect } from '@playwright/test'

// landing page smoke tests. covers the highest-value user-facing surface:
// hero loads, primary CTA navigates to /buy, footer links work.
//
// playwright gives each test a fresh BrowserContext so localStorage is
// clean by default — no need to clear it manually (which would otherwise
// also wipe persistence on reload, breaking those assertions).

test('landing page renders and primary CTA goes to /buy', async ({ page }) => {
  await page.goto('')

  await expect(page.getByRole('heading', { level: 1 })).toBeVisible()

  const buyButton = page.getByRole('button', { name: /buy now/i }).first()
  await expect(buyButton).toBeVisible()
  await buyButton.click()

  await expect(page).toHaveURL(/\/buy$/)
})

test('header CTA "Open" goes to /buy', async ({ page }) => {
  await page.goto('')
  // header CTA renders the i18n string `header.openApp` which is "Open" in EN.
  // it's a Link, so role=link.
  await page.getByRole('link', { name: 'Open' }).click()
  await expect(page).toHaveURL(/\/buy/)
})

test('footer links to /privacy and /terms work', async ({ page }) => {
  await page.goto('')
  const footer = page.locator('footer')
  await footer.scrollIntoViewIfNeeded()

  await footer.getByRole('link', { name: /privacy/i }).click()
  await expect(page).toHaveURL(/\/privacy$/)
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible()

  await page.goto('')
  await footer.scrollIntoViewIfNeeded()
  await footer.getByRole('link', { name: /terms/i }).click()
  await expect(page).toHaveURL(/\/terms$/)
})

test('404 page shows for unknown routes', async ({ page }) => {
  const response = await page.goto('this-route-does-not-exist')
  // vite dev server returns 404 status for unknown SPA routes (the static
  // server doesn't know about react-router), but still serves the SPA
  // shell so the in-app NotFoundPage renders. accept either 200 or 404.
  expect([200, 404]).toContain(response?.status() ?? 0)
  // notFound.title = "We can't find that page"
  await expect(page.getByText(/can'?t find that page/i)).toBeVisible()
  await expect(page.getByRole('link', { name: /back home/i })).toBeVisible()
})
