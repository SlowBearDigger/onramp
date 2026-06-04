import { test, expect } from '@playwright/test'

test('pay page — create mode renders form', async ({ page }) => {
  await page.goto('pay')
  await expect(page.getByRole('heading', { name: 'Pay recipient' })).toBeVisible()
  await expect(page.getByLabel('Recipient address')).toBeVisible()
  await page.screenshot({ path: '/tmp/pay-create.png', fullPage: true })
})

test('pay page — payer link prefills + validates EVM address', async ({ page }) => {
  const addr = '0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045'
  await page.goto(`pay?to=${addr}&asset=USDC&currency=EUR&amount=100&ref=INV-001`)
  await expect(page.getByLabel('Recipient address')).toHaveValue(addr)
  await page.getByRole('button', { name: 'Review payment' }).click()
  await expect(page.getByText('Paying to')).toBeVisible()
  await expect(page.getByText('INV-001')).toBeVisible()
  await page.screenshot({ path: '/tmp/pay-confirm.png', fullPage: true })
})

test('pay page — invalid address shows error', async ({ page }) => {
  await page.goto('pay')
  const input = page.getByLabel('Recipient address')
  await input.fill('0xZZZZ')
  await input.blur()
  await expect(page.getByRole('alert')).toBeVisible()
})
