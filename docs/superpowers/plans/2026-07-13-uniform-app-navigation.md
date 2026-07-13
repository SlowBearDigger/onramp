# Uniform App Navigation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Keep the product navigation mounted and apply one consistent content transition across Buy, Sell, History, Swap, and Pay.

**Architecture:** Add a route-level `AppShell` that owns the desktop sidebar, mobile bottom navigation, onboarding layer, and the animated `Outlet`. Group Buy, Sell, and History under one transition key so the existing `SwapPage` state survives mode changes; use distinct keys for Swap and Pay.

**Tech Stack:** React 19, React Router 7, Motion, Vitest, Playwright, Vite.

## Global Constraints

- Preserve the amount-input state across `/buy` to `/sell` to `/buy`.
- Keep public, legal, not-found, and admin routes outside the product shell.
- Keep provider behavior, credentials, and money-flow logic unchanged.
- Honor `prefers-reduced-motion`.
- Do not add dependencies.

---

### Task 1: Reproduce Product-Shell Remounting

**Files:**
- Modify: `e2e/swap-flow.spec.js`

**Interfaces:**
- Consumes: Existing desktop sidebar with `aria-label="Main navigation"` and mobile bar with `aria-label="Mobile navigation"`.
- Produces: E2E regression coverage proving each shared navigation DOM node remains mounted across route changes.

- [ ] **Step 1: Add the failing desktop navigation test**

Append a test that stores the actual sidebar DOM node before navigating and compares object identity after each route change:

```js
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
```

- [ ] **Step 2: Add the failing mobile navigation test**

```js
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
```

- [ ] **Step 3: Run the focused E2E tests and verify the expected failure**

Run:

```bash
npx playwright test e2e/swap-flow.spec.js --project=chromium --grep "navigation stays mounted"
```

Expected: both tests fail because navigating to `/swap`, `/pay`, or back to the ramp workspace replaces the stored navigation node.

- [ ] **Step 4: Commit the failing regression tests**

```bash
git add e2e/swap-flow.spec.js
git commit -m "test: cover persistent app navigation"
```

---

### Task 2: Add The Persistent App Shell

**Files:**
- Create: `src/components/AppShell.jsx`
- Modify: `src/App.jsx`

**Interfaces:**
- Consumes: React Router `Outlet` and `useLocation`; existing `Sidebar`, `BottomNav`, and `OnboardingTour` components.
- Produces: `AppShell` as the layout route for all product surfaces and `getAppContentKey(pathname)` for stable transition grouping.

- [ ] **Step 1: Create `AppShell.jsx` with stable route grouping and reduced-motion support**

```jsx
import { useLocation, useOutlet } from 'react-router-dom'
import { AnimatePresence, motion, useReducedMotion } from 'motion/react'
import Sidebar from './Sidebar'
import BottomNav from './BottomNav'
import OnboardingTour from './OnboardingTour'

export function getAppContentKey(pathname) {
  if (pathname === '/buy' || pathname === '/sell' || pathname === '/history') return '/ramp'
  if (pathname === '/swap') return '/swap'
  if (pathname === '/pay') return '/pay'
  return pathname
}

export default function AppShell() {
  const location = useLocation()
  const outlet = useOutlet()
  const reduceMotion = useReducedMotion()
  const contentKey = getAppContentKey(location.pathname)

  const transition = reduceMotion
    ? { duration: 0 }
    : { duration: 0.2, ease: [0.16, 1, 0.3, 1] }

  return (
    <div className="min-h-screen transition-colors duration-300 relative">
      <Sidebar />
      <AnimatePresence initial={false} mode="wait">
        <motion.div
          key={contentKey}
          initial={reduceMotion ? { opacity: 1 } : { opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          exit={reduceMotion ? { opacity: 1 } : { opacity: 0, y: -8 }}
          transition={transition}
        >
          {outlet}
        </motion.div>
      </AnimatePresence>
      <BottomNav />
      <OnboardingTour />
    </div>
  )
}
```

- [ ] **Step 2: Nest product routes under `AppShell` in `App.jsx`**

Import `AppShell`, then replace the five sibling product routes with:

```jsx
<Route element={<AppShell />}>
  <Route path="/buy" element={<SwapPage />} />
  <Route path="/sell" element={<SwapPage />} />
  <Route path="/history" element={<SwapPage />} />
  <Route path="/swap" element={<SwapKitPage />} />
  <Route path="/pay" element={<PayRecipientPage />} />
</Route>
```

Keep both legacy redirects outside the layout route so their `Navigate` elements resolve immediately.

- [ ] **Step 3: Run the focused tests**

Run:

```bash
npx playwright test e2e/swap-flow.spec.js --project=chromium --grep "navigation stays mounted"
```

Expected at this intermediate stage: tests still fail because route pages continue to render duplicate navigation inside the new shell.

---

### Task 3: Remove Duplicate Route-Level Shells

**Files:**
- Modify: `src/pages/SwapPage.jsx`
- Modify: `src/pages/SwapKitPage.jsx`
- Modify: `src/pages/PayRecipientPage.jsx`

**Interfaces:**
- Consumes: Layout spacing and navigation supplied by `AppShell`.
- Produces: Route components that own only their route-specific main content and overlays.

- [ ] **Step 1: Make `SwapPage` route-content only**

Remove imports for `Sidebar`, `BottomNav`, and `OnboardingTour`. Replace the outer `div` with a fragment, retain `ReactiveBlobs`, `main`, and `OrderToasts`, and remove the three shared-shell elements:

```jsx
return (
  <>
    <ReactiveBlobs color={activeCrypto.color} className="fixed z-0 hidden md:block" warpPhase={warpPhase} />
    <main className="min-h-screen flex items-center justify-center px-4 py-8 pb-28 sm:py-12 md:pb-12 md:pl-64 relative z-10">
      {/* existing ramp/history content unchanged */}
    </main>
    <OrderToasts />
  </>
)
```

- [ ] **Step 2: Make `SwapKitPage` route-content only**

Remove imports for `Sidebar`, `BottomNav`, and `OnboardingTour`. Return only its existing `main` element; do not change token, wallet, or preview behavior.

- [ ] **Step 3: Make `PayRecipientPage` route-content only**

Remove imports for `Sidebar` and `BottomNav`. Return a fragment containing the existing `main` element and conditional `ProviderModal`; preserve all query-string, address, and provider behavior.

- [ ] **Step 4: Run the focused E2E tests and verify green**

```bash
npx playwright test e2e/swap-flow.spec.js --project=chromium --grep "navigation stays mounted"
```

Expected: 2 passed.

- [ ] **Step 5: Run the complete ramp-flow E2E file**

```bash
npx playwright test e2e/swap-flow.spec.js --project=chromium
```

Expected: all tests pass, including amount preservation across Buy and Sell.

- [ ] **Step 6: Commit the implementation**

```bash
git add src/App.jsx src/components/AppShell.jsx src/pages/SwapPage.jsx src/pages/SwapKitPage.jsx src/pages/PayRecipientPage.jsx
git commit -m "feat: keep app navigation persistent"
```

---

### Task 4: Full Regression And Rendered QA

**Files:**
- Modify only if a verified regression requires a scoped fix.

**Interfaces:**
- Consumes: Completed persistent-shell implementation.
- Produces: Evidence that routing, build output, responsive navigation, and console behavior remain correct.

- [ ] **Step 1: Run the frontend unit suite**

```bash
npm test
```

Expected: all frontend tests pass.

- [ ] **Step 2: Run the production build**

```bash
VITE_API_BASE_URL=https://api.onoff.finance npm run build
```

Expected: Vite exits successfully and creates `dist/`.

- [ ] **Step 3: Run the complete Chromium E2E suite**

```bash
npx playwright test --project=chromium
```

Expected: all Chromium tests pass.

- [ ] **Step 4: Verify rendered desktop navigation**

At 1280x800, follow `/buy` to `/sell` to `/swap` to `/pay` to `/history`. Verify the sidebar never disappears, content does not overlap, route headings render, and no relevant console errors occur.

- [ ] **Step 5: Verify rendered mobile navigation**

At 390x844, follow `/buy` to `/sell` to `/swap` to `/history`. Verify the bottom bar remains fixed, labels fit, content clears the safe-area padding, no controls overlap, and no relevant console errors occur.

- [ ] **Step 6: Verify reduced motion**

Emulate `prefers-reduced-motion: reduce`, navigate between product routes, and confirm content changes without positional animation.

- [ ] **Step 7: Check the final diff and commit any QA-only correction**

```bash
git diff --check
git status --short
```

Expected: no whitespace errors and only intentional files changed.
