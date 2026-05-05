import { test, expect } from '@playwright/test'

// theme + i18n persistence. both are stored in localStorage and applied at
// boot, so a reload must keep the user's choice. these tests catch
// regressions in:
//   - ThemeContext write/read cycle (key: onramp-theme)
//   - i18next-browser-languagedetector cache (key: offramp:lang)
//   - the html lang attribute syncing with i18n on language change
//
// fresh BrowserContext per test → localStorage starts clean. NO global
// addInitScript clearing storage, because that would wipe values on the
// reload step and defeat the test.

test('theme toggle persists across reloads', async ({ page }) => {
  await page.goto('')

  const html = page.locator('html')

  // initial state — capture html className. depends on prefers-color-scheme,
  // typically empty on chromium default.
  const before = await html.evaluate((el) => el.className)

  const toggle = page.getByRole('button', { name: /switch to (dark|light) mode/i }).first()
  await toggle.click()

  // localStorage write is synchronous in the toggle handler — assert on
  // that first, since className depends on a useEffect that fires after
  // commit (and webkit lands the read before the effect on fast hardware).
  await expect.poll(
    () => page.evaluate(() => localStorage.getItem('onramp-theme')),
    { timeout: 2000 },
  ).toMatch(/^(dark|light)$/)

  // wait for the className to settle (it changes either to "dark" or away
  // from "dark"). using the locator API auto-retries until the page paints.
  if (before.includes('dark')) {
    await expect(html).not.toHaveClass(/dark/)
  } else {
    await expect(html).toHaveClass(/dark/)
  }

  // capture the post-toggle className AFTER the wait so we compare apples to
  // apples after reload.
  const afterToggle = await html.evaluate((el) => el.className)
  expect(afterToggle).not.toBe(before)

  await page.reload()

  // after reload, ThemeContext re-applies the class via useEffect. assert
  // on the locator (which retries) instead of evaluating immediately.
  if (afterToggle.includes('dark')) {
    await expect(html).toHaveClass(/dark/)
  } else {
    await expect(html).not.toHaveClass(/dark/)
  }
})

test('language switcher persists across reloads', async ({ page }) => {
  await page.goto('')

  // open the language picker. the trigger button has aria-label "Language"
  // (or the localized equivalent — but we start in EN by default).
  const langTrigger = page.getByRole('button', { name: 'Language' }).first()
  await langTrigger.click()

  // pick spanish from the listbox
  await page.getByRole('option', { name: /Español/ }).click()

  // html lang attribute updates synchronously
  await expect(page.locator('html')).toHaveAttribute('lang', 'es')

  // and the localStorage key is set
  const stored = await page.evaluate(() => localStorage.getItem('offramp:lang'))
  expect(stored).toBe('es')

  await page.reload()
  await expect(page.locator('html')).toHaveAttribute('lang', 'es')
})
