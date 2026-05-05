// custom service worker (injectManifest mode).
//
// vite-plugin-pwa injects the precache manifest into self.__WB_MANIFEST.
// everything else — runtime caching strategies and our push event handler —
// is hand-written here.
//
// migrated from generateSW mode so we could add the push event handler.
// the runtime caching block below mirrors the previous workbox.runtimeCaching
// config in vite.config.js, byte-for-byte.

import { precacheAndRoute, cleanupOutdatedCaches } from 'workbox-precaching'
import { registerRoute } from 'workbox-routing'
import { CacheFirst, StaleWhileRevalidate, NetworkFirst } from 'workbox-strategies'
import { ExpirationPlugin } from 'workbox-expiration'
import { CacheableResponsePlugin } from 'workbox-cacheable-response'

self.skipWaiting()
self.addEventListener('activate', () => self.clients.claim())

cleanupOutdatedCaches()
precacheAndRoute(self.__WB_MANIFEST)

// google fonts stylesheets
registerRoute(
  ({ url }) => url.origin === 'https://fonts.googleapis.com',
  new StaleWhileRevalidate({
    cacheName: 'google-fonts-stylesheets',
    plugins: [new ExpirationPlugin({ maxEntries: 10, maxAgeSeconds: 365 * 24 * 60 * 60 })],
  })
)

// google fonts webfonts
registerRoute(
  ({ url }) => url.origin === 'https://fonts.gstatic.com',
  new CacheFirst({
    cacheName: 'google-fonts-webfonts',
    plugins: [
      new ExpirationPlugin({ maxEntries: 30, maxAgeSeconds: 365 * 24 * 60 * 60 }),
      new CacheableResponsePlugin({ statuses: [0, 200] }),
    ],
  })
)

// images
registerRoute(
  ({ request }) => request.destination === 'image',
  new CacheFirst({
    cacheName: 'images',
    plugins: [
      new ExpirationPlugin({ maxEntries: 80, maxAgeSeconds: 30 * 24 * 60 * 60 }),
      new CacheableResponsePlugin({ statuses: [0, 200] }),
    ],
  })
)

// scripts + styles
registerRoute(
  ({ request }) => request.destination === 'script' || request.destination === 'style',
  new StaleWhileRevalidate({ cacheName: 'static-resources' })
)

// navigations
registerRoute(
  ({ request }) => request.mode === 'navigate',
  new NetworkFirst({
    cacheName: 'pages',
    networkTimeoutSeconds: 3,
    plugins: [new ExpirationPlugin({ maxEntries: 20 })],
  })
)

// ─── web push ──────────────────────────────────────────────────────────
//
// payload shape from the backend:
//   { title, body, orderId?, status?, url? }
//
// `url` is a relative path (e.g. "/swap/history"); we prefix the BASE_URL
// at click time so this works under /ramp/ in dev and /onramp/ on pages.
self.addEventListener('push', (event) => {
  if (!event.data) return
  let payload
  try {
    payload = event.data.json()
  } catch {
    payload = { title: 'Order update', body: event.data.text() }
  }

  const title = payload.title || 'Order update'
  const options = {
    body: payload.body || '',
    icon: '/onramp/pwa-192.png',
    badge: '/onramp/pwa-192.png',
    // tag = orderId so subsequent updates for the same order REPLACE the
    // previous notification instead of stacking.
    tag: payload.orderId || 'order-update',
    renotify: true,
    data: {
      orderId: payload.orderId,
      status: payload.status,
      url: payload.url || '/swap/history',
    },
  }

  event.waitUntil(self.registration.showNotification(title, options))
})

self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const targetPath = event.notification.data?.url || '/swap/history'

  // try to focus an existing tab on the target URL; otherwise open a new one.
  event.waitUntil((async () => {
    const allClients = await self.clients.matchAll({ type: 'window', includeUncontrolled: true })
    for (const client of allClients) {
      if (client.url.includes(targetPath) && 'focus' in client) {
        return client.focus()
      }
    }
    // best-effort URL composition. SW doesn't know the BASE_URL at runtime,
    // so we navigate relative to the SW scope, which equals the app base.
    if (self.clients.openWindow) {
      return self.clients.openWindow(`${self.registration.scope}${targetPath.replace(/^\//, '')}`)
    }
  })())
})
