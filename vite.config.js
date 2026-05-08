import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { VitePWA } from 'vite-plugin-pwa'

// base path. defaults to '/ramp/' for compatibility with the existing
// dev/test setup. on github pages the deploy workflow sets BASE_PATH to
// `/<repo-name>/` automatically (see .github/workflows/deploy-frontend.yml).
const BASE_PATH = process.env.BASE_PATH || '/ramp/'

export default defineConfig(({ mode }) => ({
  base: BASE_PATH,
  // strip console.* in production via compile-time substitution. each
  // call site `console.log("...")` becomes `(()=>{})("...")` after
  // parse — args still evaluate (template strings, etc.) but the call
  // is a no-op. cleanest path that works with vite 8 / rolldown.
  // dev keeps them so devtools debugging still works.
  define: mode === 'production' ? {
    'console.log': '(()=>{})',
    'console.warn': '(()=>{})',
    'console.error': '(()=>{})',
    'console.info': '(()=>{})',
    'console.debug': '(()=>{})',
  } : {},
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      // injectManifest mode lets us write a custom service worker (src/sw.js)
      // — needed for the push event handler. workbox precaching is still
      // baked in via self.__WB_MANIFEST.
      strategies: 'injectManifest',
      srcDir: 'src',
      filename: 'sw.js',
      registerType: 'autoUpdate',
      // 'script-defer' adds the SW registration as <script src="registerSW.js"
      // defer> instead of the default render-blocking <script>. saves ~70ms
      // off first paint per Lighthouse. 'inline' would be even faster but
      // breaks our CSP `script-src 'self'` (no 'unsafe-inline' for scripts).
      injectRegister: 'script-defer',
      includeAssets: ['pwa-192.png', 'pwa-512.png'],
      manifest: {
        name: 'On-Ramp — Premium Crypto Gateway',
        short_name: 'On-Ramp',
        description: 'Buy and sell crypto in seconds. No signup required. Best rates guaranteed.',
        theme_color: '#047857',
        background_color: '#f9f9f9',
        display: 'standalone',
        orientation: 'portrait',
        scope: BASE_PATH,
        start_url: BASE_PATH,
        icons: [
          { src: 'pwa-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'pwa-512.png', sizes: '512x512', type: 'image/png', purpose: 'any maskable' },
        ],
      },
      // injectManifest config — only the precache glob lives here. all
      // runtime caching strategies and event handlers are in src/sw.js.
      injectManifest: {
        globPatterns: ['**/*.{js,css,html,ico,png,svg,woff2}'],
        // skip the wallet stack (~150-500KB chunks) from precache.
        // these load only when the user opens the WalletButton or
        // visits a swap route, and runtime caching (StaleWhileRevalidate
        // for scripts, see src/sw.js) takes over once fetched.
        // patterns cover Reown's chunk names (wui-*, dist-*, exports-*,
        // proxy-*, ApiController-*, SolanaConstantsUtil-*) plus our own
        // WalletButton chunk. these are stable across builds because
        // vite/rolldown derives chunk names from imported module paths.
        globIgnores: [
          '**/wui-*.js',
          '**/dist-*.js',
          '**/exports-*.js',
          '**/proxy-*.js',
          '**/ApiController-*.js',
          '**/Solana*.js',
          '**/chains-*.js',
          '**/WalletButton-*.js',
        ],
        // safety cap. anything else > 2MB still triggers a warning.
        maximumFileSizeToCacheInBytes: 2 * 1024 * 1024,
      },
    }),
  ],
}))
