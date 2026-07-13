import { test, expect } from '@playwright/test'

test('pay stays unavailable until the production feature flag is enabled', async ({ page }) => {
  await page.goto('pay?to=0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045&amount=100')

  await expect(page).toHaveURL(/\/buy$/)
  await expect(page.getByRole('tab', { name: 'Buy', exact: true })).toHaveAttribute('aria-selected', 'true')
  await expect(page.getByRole('link', { name: 'Pay', exact: true })).toHaveCount(0)
})
