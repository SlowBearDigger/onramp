import { test, expect } from '@playwright/test'

test('pay page — create mode renders form', async ({ page }) => {
  await page.goto('pay')
  await expect(page.getByRole('heading', { name: 'Pay recipient' })).toBeVisible()
  await expect(page.getByLabel('Recipient address')).toBeVisible()
  await page.screenshot({ path: '/tmp/pay-create.png', fullPage: true })
})

test('pay page — payer link prefills + validates EVM address', async ({ page }) => {
  const addr = '0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045'
  await page.goto(`pay?to=${addr}&asset=USDC&currency=EUR&amount=100`)
  await expect(page.getByLabel('Recipient address')).toHaveValue(addr)
  await page.getByRole('button', { name: 'Review payment' }).click()
  await expect(page.getByText('Paying to')).toBeVisible()
  await page.screenshot({ path: '/tmp/pay-confirm.png', fullPage: true })
})

test('pay page — invalid address shows error', async ({ page }) => {
  await page.goto('pay')
  const input = page.getByLabel('Recipient address')
  await input.fill('0xZZZZ')
  await input.blur()
  await expect(page.getByRole('alert')).toBeVisible()
})

test('pay page — QR modal renders a scannable code', async ({ page }) => {
  const addr = '0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045'
  // pre-dismiss the privacy banner — it floats bottom-right over the QR
  // button and intercepts the click otherwise.
  await page.addInitScript(() => localStorage.setItem('onramp:privacy:disclosed', '1'))
  await page.goto('pay')
  await page.getByLabel('Recipient address').fill(addr)
  await page.locator('#pay-amount').fill('100')
  await page.getByRole('button', { name: 'Show QR code' }).click()
  await expect(page.getByRole('dialog', { name: 'Payment QR' })).toBeVisible()
  // qr-code-styling renders an svg inside the mount div
  await expect(page.locator('[role="dialog"] svg').first()).toBeVisible()
  await page.screenshot({ path: '/tmp/pay-qr.png', fullPage: true })
})
