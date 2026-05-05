import { defineConfig } from 'vitest/config'

// frontend test config — separate from vite.config.js so we don't pull in
// the PWA plugin or react-fast-refresh for unit tests. node environment by
// default; individual tests can opt into jsdom via `// @vitest-environment jsdom`.
export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.test.js', 'src/**/*.test.jsx'],
    testTimeout: 5000,
    globals: false,
    // env vars our provider modules read at import time. keep these fixed
    // for deterministic tests; individual tests can override before importing.
    env: {
      VITE_TRANSAK_ENV: 'STAGING',
      VITE_MTPELERIN_ENV: 'STAGING',
      VITE_MTPELERIN_CTKN: 'test-ctkn-fixed-1234',
      VITE_TOPPER_ENV: 'STAGING',
      VITE_API_BASE_URL: 'http://test-api',
    },
  },
})
