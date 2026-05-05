import { defineConfig, devices } from '@playwright/test'

// e2e config — single browser (chromium) for fast feedback. extend to
// firefox/webkit when we need cross-browser coverage as the spec asks.
//
// the dev server is auto-started by playwright (see webServer below). we
// use VITE_USE_MOCK=true so tests don't depend on a running backend; the
// hooks fall through to mock data, which is what we want for e2e flows
// that don't actually exercise the api.
export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: process.env.CI ? 'list' : 'list',
  timeout: 30_000,

  // baseURL includes the /ramp/ prefix because vite.config.js sets
  // `base: '/ramp/'` — assets and routes both live under that prefix.
  // tests can use relative paths like '/' (resolves to /ramp/) and 'swap'
  // (resolves to /ramp/swap).
  use: {
    baseURL: 'http://localhost:5174/ramp/',
    trace: 'on-first-retry',
    actionTimeout: 5_000,
  },

  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
    {
      name: 'firefox',
      use: { ...devices['Desktop Firefox'] },
    },
    {
      name: 'webkit',
      use: { ...devices['Desktop Safari'] },
    },
  ],

  // run on 5174 (not 5173) so the developer's local `npm run dev` isn't
  // hijacked. reuseExistingServer:false guarantees the env vars below are
  // applied — otherwise a stale dev server would be reused without our
  // overrides.
  //
  // we point VITE_API_BASE_URL at a host that resolves but won't answer
  // (a unique localhost port) so the order/history calls fail fast rather
  // than hitting a real backend with stale data. tests assert on the
  // resulting "couldn't load — try again" badge, which is the real
  // first-visit state for a user without backend connectivity.
  webServer: {
    command: 'vite --port 5174 --strictPort',
    url: 'http://localhost:5174',
    reuseExistingServer: false,
    timeout: 60_000,
    env: {
      VITE_USE_MOCK: 'false',
      VITE_API_BASE_URL: 'http://127.0.0.1:1',
    },
  },
})
