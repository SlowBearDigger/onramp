import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { VitePWA } from 'vite-plugin-pwa'

// base path. defaults to '/ramp/' for compatibility with the existing
// dev/test setup. on github pages the deploy workflow sets BASE_PATH to
// `/<repo-name>/` automatically (see .github/workflows/deploy-frontend.yml).
const BASE_PATH = process.env.BASE_PATH || '/ramp/'

export default defineConfig({
  base: BASE_PATH,
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
      },
    }),
  ],
})
