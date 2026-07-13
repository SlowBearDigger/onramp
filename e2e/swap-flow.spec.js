import { test, expect } from '@playwright/test'

// ramp app flow — covers the high-value path:
//   /buy → toggle to /sell → toggle back → form values survive
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

function sampleMotion(selector) {
  window.__onrampMotionSamples = []

  const sample = () => {
    const target = document.querySelector(selector)
    let node = target

    while (node && node !== document.body) {
      const style = getComputedStyle(node)
      const matrix = style.transform === 'none'
        ? null
        : new DOMMatrixReadOnly(style.transform)

      if (node.style.transform || node.style.translate || node.style.opacity || matrix) {
        window.__onrampMotionSamples.push({
          opacity: Number(style.opacity),
          translate: style.translate,
          x: matrix?.m41 || 0,
          y: matrix?.m42 || 0,
          z: matrix?.m43 || 0,
        })
      }

      node = node.parentElement
    }

    window.__onrampMotionFrame = requestAnimationFrame(sample)
  }

  sample()
}

async function startMotionSampler(page, targetSelector) {
  await page.evaluate(sampleMotion, targetSelector)
}

async function installInitialMotionSampler(page, targetSelector) {
  await page.addInitScript(sampleMotion, targetSelector)
}

async function readMotionSamples(page) {
  return page.evaluate(() => {
    cancelAnimationFrame(window.__onrampMotionFrame)
    return window.__onrampMotionSamples
  })
}

function hasPositionalMotion(sample) {
  const individualTranslate = sample.translate === 'none'
    ? []
    : sample.translate.match(/-?\d*\.?\d+/g)?.map(Number) || []

  return Math.abs(sample.x) > 0.01 ||
    Math.abs(sample.y) > 0.01 ||
    Math.abs(sample.z) > 0.01 ||
    individualTranslate.some((value) => Math.abs(value) > 0.01)
}

test('amount input survives buy↔sell tab flip', async ({ page }) => {
  await page.goto('buy')
  await dismissBanner(page)

  const amountInput = page.locator('#swap-pay-amount')
  await amountInput.fill('250')
  await expect(amountInput).toHaveValue('250')

  // tabs are role="tab" inside a tablist, with localized text "Buy" / "Sell"
  await page.getByRole('tab', { name: 'Sell' }).click()
  await expect(page).toHaveURL(/\/sell$/)

  await page.getByRole('tab', { name: 'Buy' }).click()
  await expect(page).toHaveURL(/\/buy$/)

  // value should still be there since the widget stays mounted across
  // mode flips. this regressed twice during the route refactor.
  await expect(amountInput).toHaveValue('250')
})

test('exiting sell view never mutates to buy during app-section navigation', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 })
  await page.goto('sell')
  await dismissBanner(page)
  await expect(page.getByRole('tab', { name: 'Sell' })).toHaveAttribute('aria-selected', 'true')

  await page.evaluate(() => {
    window.__onrampRampModes = []

    const sample = () => {
      const selectedTab = document.querySelector('[role="tab"][aria-selected="true"]')
      if (selectedTab) window.__onrampRampModes.push(selectedTab.textContent.trim())
      window.__onrampRampModeFrame = requestAnimationFrame(sample)
    }

    sample()
  })

  await page.getByRole('link', { name: 'Swap', exact: true }).click()
  await expect(page).toHaveURL(/\/swap$/)
  await expect(page.getByRole('heading', { name: /swap/i }).first()).toBeVisible()

  const sampledModes = await page.evaluate(() => {
    cancelAnimationFrame(window.__onrampRampModeFrame)
    return window.__onrampRampModes
  })

  expect(sampledModes.length).toBeGreaterThan(1)
  expect(sampledModes).not.toContain('Buy')
  expect(new Set(sampledModes)).toEqual(new Set(['Sell']))
})

test('reduced motion removes positional animation from buy→history', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.goto('buy')
  await dismissBanner(page)
  await expect(page.getByRole('tablist')).toBeVisible()
  await startMotionSampler(page, '[role="tablist"]')

  await page.getByRole('link', { name: 'History', exact: true }).click()
  await expect(page.getByRole('heading', { name: /Transaction History/i })).toBeVisible()

  const samples = await readMotionSamples(page)
  expect(samples.length).toBeGreaterThan(1)
  expect(samples.every((sample) => Number.isFinite(sample.opacity))).toBe(true)
  expect(samples.some(hasPositionalMotion)).toBe(false)
  expect(samples.every((sample) => sample.opacity === 1)).toBe(true)
})

test('reduced motion removes positional animation from initial SwapKit content', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await installInitialMotionSampler(page, 'input[aria-label="You pay"]')
  await page.goto('swap')
  const payInput = page.getByRole('textbox', { name: 'You pay' })
  await expect(payInput).toBeVisible()
  await page.waitForTimeout(800)

  const samples = await readMotionSamples(page)
  expect(samples.length).toBeGreaterThan(1)
  expect(samples.every((sample) => Number.isFinite(sample.opacity))).toBe(true)
  expect(samples.some(hasPositionalMotion)).toBe(false)
  expect(samples.every((sample) => sample.opacity === 1)).toBe(true)
})

test('normal motion keeps the buy→history positional transition', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'no-preference' })
  await page.goto('buy')
  await dismissBanner(page)
  await expect(page.getByRole('tablist')).toBeVisible()
  await startMotionSampler(page, '[role="tablist"]')

  await page.getByRole('link', { name: 'History', exact: true }).click()
  await expect(page.getByRole('heading', { name: /Transaction History/i })).toBeVisible()

  const samples = await readMotionSamples(page)
  expect(samples.length).toBeGreaterThan(1)
  expect(samples.some(hasPositionalMotion)).toBe(true)
})

test('history view renders an actionable state without backend connectivity', async ({ page }) => {
  // playwright config points VITE_API_BASE_URL at an unreachable port so
  // the orders fetch fails fast. the page must still render something
  // useful — either the empty state (no last-used wallet) or the error
  // badge (fetch failed) — never crash silently.
  await page.goto('history')
  // the heading always renders regardless of fetch state
  await expect(page.getByRole('heading', { name: /Transaction History/i })).toBeVisible()
  // and exactly one of: empty state CTA, error badge, or loading spinner
  const hasState = page.getByText(/No transactions yet|couldn'?t load|loading your transactions/i).first()
  await expect(hasState).toBeVisible({ timeout: 5000 })
})

test('quick amount chips populate the amount input', async ({ page }) => {
  await page.goto('buy')
  await dismissBanner(page)

  // chips render literal "$50" / "$100" / "$1000" — use exact match so
  // "$100" doesn't ambiguously also match "$1000".
  const chip = page.getByRole('button', { name: '$100', exact: true })
  await chip.click()

  const amountInput = page.locator('#swap-pay-amount')
  await expect(amountInput).toHaveValue('100')
})

test('desktop product navigation stays mounted across app sections', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 })
  await page.goto('buy')
  await dismissBanner(page)

  await page.evaluate(() => {
    window.__onrampNavigationNode = document.querySelector('aside[aria-label="Main navigation"]')
    window.__onrampDocument = document
  })

  const expectPersistentShell = async () => {
    await expect.poll(() => page.evaluate(() => (
      window.__onrampDocument === document &&
      window.__onrampNavigationNode === document.querySelector('aside[aria-label="Main navigation"]')
    ))).toBe(true)
  }

  await page.getByRole('link', { name: 'Swap', exact: true }).click()
  await expect(page).toHaveURL(/\/swap$/)
  await expect(page.getByRole('heading', { name: /swap/i }).first()).toBeVisible()
  await expectPersistentShell()

  await page.getByRole('link', { name: 'Pay', exact: true }).click()
  await expect(page).toHaveURL(/\/pay$/)
  await expect(page.getByRole('heading', { name: /pay/i }).first()).toBeVisible()
  await expectPersistentShell()

  await page.getByRole('link', { name: 'History', exact: true }).click()
  await expect(page).toHaveURL(/\/history$/)
  await expect(page.getByRole('heading', { name: /transaction history/i })).toBeVisible()
  await expectPersistentShell()
})

test('mobile product navigation stays mounted across app sections', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto('buy')
  await dismissBanner(page)

  await page.evaluate(() => {
    window.__onrampNavigationNode = document.querySelector('nav[aria-label="Mobile navigation"]')
    window.__onrampDocument = document
  })

  const expectPersistentShell = async () => {
    await expect.poll(() => page.evaluate(() => (
      window.__onrampDocument === document &&
      window.__onrampNavigationNode === document.querySelector('nav[aria-label="Mobile navigation"]')
    ))).toBe(true)
  }

  await page.getByRole('link', { name: 'Swap', exact: true }).click()
  await expect(page).toHaveURL(/\/swap$/)
  await expectPersistentShell()

  await page.getByRole('link', { name: 'History', exact: true }).click()
  await expect(page).toHaveURL(/\/history$/)
  await expectPersistentShell()

  await page.getByRole('link', { name: 'Buy', exact: true }).click()
  await expect(page).toHaveURL(/\/buy$/)
  await expectPersistentShell()
})
