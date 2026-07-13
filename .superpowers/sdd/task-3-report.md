# Task 3 Report: Remove Duplicate Route-Level Shells

## Scope

- Updated only `src/pages/SwapPage.jsx`, `src/pages/SwapKitPage.jsx`, and `src/pages/PayRecipientPage.jsx`.
- Removed route-level `Sidebar`, `BottomNav`, and `OnboardingTour` ownership as required.
- Preserved each route's existing `main` classes, route state, overlays, `ReactiveBlobs`, `OrderToasts`, and conditional `ProviderModal` behavior.

## Verification

- Baseline focused navigation E2E: failed with two `Swap` links in both desktop and mobile because the route pages rendered duplicate navigation.
- Focused navigation E2E after this task: still fails, but the duplicate-link failure is gone. The captured shell navigation node is replaced when `/swap` lazy-loads.
- Full `e2e/swap-flow.spec.js` Chromium run: 3 passed, 2 failed. The amount persistence test `amount input survives buy<->sell tab flip` passed.
- `npm run build`: passed.
- `git diff --check`: passed.

## Blocking Concern

The remaining two navigation failures come from `src/App.jsx`, outside this task's ownership. Its `Suspense` wraps the route tree containing `AppShell`; when the `/swap` lazy chunk first loads, that boundary unmounts and remounts the shell, changing the `aside`/mobile `nav` node identity. No changes were made outside the assigned route files.

## Self-Review

- Confirmed the three route pages no longer import or render `Sidebar`, `BottomNav`, or `OnboardingTour`.
- Confirmed `SwapPage` still renders `ReactiveBlobs`, its existing `main`, and `OrderToasts`.
- Confirmed `SwapKitPage` returns its existing `main` content only.
- Confirmed `PayRecipientPage` retains the `ProviderModal` conditional alongside its existing `main`.

## Commit

- `e4e3ede feat: keep app navigation persistent`

## Task 3 Follow-up: Route Content Suspense Boundary

### Scope

- Extracted the existing shared loading UI into `src/components/RouteFallback.jsx`.
- Kept the public and admin route-level `Suspense` fallback behavior in `src/App.jsx`.
- Added an app-content `Suspense` boundary inside the animated outlet in `src/components/AppShell.jsx`, so a lazy product route loads without unmounting `Sidebar` or `BottomNav`.
- Honored the existing `VITE_E2E=true` contract in `src/App.jsx` by suppressing the delayed, one-time privacy disclosure only during Playwright runs; public and admin behavior is unchanged outside E2E.

### Exact Results

- `npx playwright test e2e/swap-flow.spec.js --config=/tmp/onramp-playwright.config.mjs --project=chromium --grep 'navigation stays mounted'`: 2 passed (7.5s).
- `npx playwright test e2e/swap-flow.spec.js --config=/tmp/onramp-playwright.config.mjs --project=chromium`: 5 passed (9.8s).
- `npm run build`: passed; Vite completed the production build and PWA service-worker build.
- `git diff --check`: passed with no output.

### Self-Review

- Verified that `RouteFallback` preserves the prior spinner, `role=status`, live-region announcement, and translated loading label.
- Verified that `Suspense` surrounds only the animated product outlet; `Sidebar`, `BottomNav`, `OnboardingTour`, route grouping, and reduced-motion transition settings remain outside that boundary.
- Verified that the outer public/admin fallback remains in `App.jsx`, so their lazy-route behavior is unchanged.
- Verified that the E2E-only privacy guard is false in normal builds and does not affect public, admin, provider, or money-flow behavior.

### Concern

- Playwright emits pre-existing Reown remote-configuration/usage 403 console warnings during E2E. They did not fail either final test run.

## Task 3 Review Fixes

### Exact Results

- `npx playwright test --config=/tmp/onramp-playwright.config.mjs --project=chromium e2e/swap-flow.spec.js e2e/privacy-disclosure.spec.js`: **10 passed** (5 swap-flow, 5 privacy-disclosure, 13.7s).
- `npm run build`: **passed**. Vite transformed 8,533 modules and generated the production PWA service worker.
- `git diff --check`: **passed** with no output.

### Self-Review

- Removed `VITE_E2E`/`isE2E` privacy suppression from `src/App.jsx`.
- Restored the normal `{location.pathname !== '/privacy' && <PrivacyDisclosure />}` condition.
- The E2E helpers dismissed the real privacy banner; no test helper or other file was changed.
- Re-indented the nested JSX in `src/pages/SwapKitPage.jsx` without changing token, wallet, preview, or swap behavior.
- The code changes are limited to the two owned source files; this report is the only additional file changed.

### Concerns

- The Playwright run emitted existing Node deprecation, Lit dev-mode, and Reown HTTP 403 console warnings. They did not fail any test.
- The first in-sandbox Playwright attempt could not bind `::1:5174` (`EPERM`); the exact requested command was then rerun with authorized execution and produced the 10 passing tests above.

### Commit

- This commit contains the fixes.
