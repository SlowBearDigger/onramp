import webpush from 'web-push'
import { db } from './db.js'

// web push notifications.
//
// model:
//   - frontend asks the user for Notification permission via the browser
//     prompt, then registers a PushSubscription with VAPID public key.
//   - the subscription object is POSTed to /api/push/subscribe and stored
//     in push_subscriptions, keyed by (endpoint, customer_id) — wallet
//     address. one wallet can have multiple subscriptions (phone +
//     desktop), so we don't dedupe by wallet alone.
//   - when a transak webhook upserts an order, we look up subscriptions
//     for that wallet and send a push to each via web-push library.
//   - if a subscription returns 404/410, it's gone (unsubscribed,
//     uninstalled, etc.) — we delete the row.
//
// vapid keys:
//   - generate ONCE per deployment with `npx web-push generate-vapid-keys`.
//   - public key: shipped to the frontend via /api/push/vapid-public-key
//     (it's PUBLIC by design; the math behind ECDSA gives you a public
//     identifier without revealing the signing key).
//   - private key: server-only.
//   - mailto: contact email per the web push spec — used by browser push
//     services to reach you if your pushes look abusive.

const VAPID_PUBLIC_KEY = process.env.VAPID_PUBLIC_KEY || ''
const VAPID_PRIVATE_KEY = process.env.VAPID_PRIVATE_KEY || ''
const VAPID_CONTACT = process.env.VAPID_CONTACT || 'mailto:admin@example.com'

export function isPushEnabled() {
  return Boolean(VAPID_PUBLIC_KEY && VAPID_PRIVATE_KEY)
}

export function assertPushConfigSafe() {
  const anySet = VAPID_PUBLIC_KEY || VAPID_PRIVATE_KEY
  const allSet = VAPID_PUBLIC_KEY && VAPID_PRIVATE_KEY
  if (anySet && !allSet) {
    throw new Error('push: partial configuration. set BOTH VAPID_PUBLIC_KEY and VAPID_PRIVATE_KEY (or NEITHER to disable push).')
  }
  if (allSet) {
    webpush.setVapidDetails(VAPID_CONTACT, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY)
  } else {
    // eslint-disable-next-line no-console
    console.warn('[push] not configured — /api/push/* endpoints will return 503.')
  }
}

// public key getter for the frontend. base64url string.
export function getPublicKey() {
  return VAPID_PUBLIC_KEY
}

// schema (idempotent).
db.exec(`
  CREATE TABLE IF NOT EXISTS push_subscriptions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    customer_id TEXT NOT NULL,           -- wallet address
    endpoint TEXT NOT NULL UNIQUE,       -- subscription endpoint URL
    keys_p256dh TEXT NOT NULL,
    keys_auth TEXT NOT NULL,
    user_agent TEXT,
    created_at INTEGER NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_push_customer ON push_subscriptions(customer_id);
`)

const insertStmt = db.prepare(`
  INSERT INTO push_subscriptions (customer_id, endpoint, keys_p256dh, keys_auth, user_agent, created_at)
  VALUES (@customer_id, @endpoint, @keys_p256dh, @keys_auth, @user_agent, @created_at)
  ON CONFLICT(endpoint) DO UPDATE SET
    customer_id = excluded.customer_id,
    keys_p256dh = excluded.keys_p256dh,
    keys_auth = excluded.keys_auth,
    user_agent = excluded.user_agent
`)

const listByCustomerStmt = db.prepare(`SELECT * FROM push_subscriptions WHERE customer_id = ?`)
const countByCustomerStmt = db.prepare(`SELECT COUNT(*) AS n FROM push_subscriptions WHERE customer_id = ?`)
// keyed delete: requires endpoint + p256dh + auth. an attacker who only
// knows the endpoint (e.g. observed in the network tab once) can't
// unsubscribe a victim — they need the full subscription material that
// was generated client-side and sent only to our server.
const deleteByKeyedStmt = db.prepare(`
  DELETE FROM push_subscriptions
  WHERE endpoint = ? AND keys_p256dh = ? AND keys_auth = ?
`)

// hard cap: at most this many subscriptions per wallet. raises the bar
// for the IDOR attacker — they can't stuff hundreds of attacker-owned
// endpoints under a victim's wallet to silently mirror push traffic.
// real users have at most a few devices; 5 covers phone + tablet + laptop.
export const MAX_SUBSCRIPTIONS_PER_CUSTOMER = 5

export function saveSubscription({ customerId, endpoint, keys, userAgent }) {
  if (!customerId || !endpoint || !keys?.p256dh || !keys?.auth) {
    throw new Error('saveSubscription: missing required fields')
  }
  // enforce per-customer cap. ignore the cap when this exact endpoint
  // already exists (the upsert will refresh keys, not add a row).
  const existing = listByCustomerStmt.all(customerId)
  const isExistingEndpoint = existing.some((s) => s.endpoint === endpoint)
  if (!isExistingEndpoint && existing.length >= MAX_SUBSCRIPTIONS_PER_CUSTOMER) {
    const err = new Error('subscription cap reached for this wallet')
    err.code = 'cap_reached'
    throw err
  }
  insertStmt.run({
    customer_id: String(customerId).slice(0, 96),
    endpoint: String(endpoint).slice(0, 1024),
    keys_p256dh: String(keys.p256dh).slice(0, 256),
    keys_auth: String(keys.auth).slice(0, 64),
    user_agent: userAgent ? String(userAgent).slice(0, 256) : null,
    created_at: Date.now(),
  })
}

// unsubscribe requires the full keyed material so an attacker who only
// observed an endpoint URL can't silence a victim's notifications.
export function deleteSubscription({ endpoint, keys }) {
  if (!endpoint || !keys?.p256dh || !keys?.auth) return 0
  return deleteByKeyedStmt.run(endpoint, keys.p256dh, keys.auth).changes
}

// canonical status → human-readable title/body.
function buildPayload(order) {
  const sym = order.crypto_currency || 'crypto'
  const amount = order.crypto_amount != null ? `${order.crypto_amount} ${sym}` : sym
  switch (order.status) {
    case 'COMPLETED':
      return { title: `${amount} sent`, body: 'Crypto delivered to your wallet.' }
    case 'PROCESSING':
      return { title: `${amount} processing`, body: 'Provider is sending your crypto on-chain.' }
    case 'PAYMENT_DONE_MARKED_BY_USER':
      return { title: `${amount} payment confirmed`, body: 'Awaiting provider confirmation.' }
    case 'FAILED':
      return { title: `${amount} order failed`, body: 'Check the history for details.' }
    case 'CANCELLED':
      return { title: `${amount} order cancelled`, body: 'No funds were taken.' }
    case 'EXPIRED':
      return { title: `${amount} order expired`, body: 'You can start a new one any time.' }
    case 'REFUNDED':
      return { title: `${amount} refunded`, body: 'Funds returned to your payment method.' }
    default:
      return null // skip noisy / initial states
  }
}

// fan-out to every subscription for the order's customer. dead
// subscriptions (404/410 from push service) get cleaned up. all errors
// are logged and swallowed — push is best-effort and must NEVER block
// the webhook handler.
export async function sendOrderPush(order) {
  if (!isPushEnabled()) return
  if (!order?.customer_id) return
  const payload = buildPayload(order)
  if (!payload) return

  payload.orderId = order.id
  payload.status = order.status
  payload.url = '/history'

  const subs = listByCustomerStmt.all(order.customer_id)
  if (subs.length === 0) return

  await Promise.allSettled(
    subs.map(async (sub) => {
      try {
        await webpush.sendNotification(
          {
            endpoint: sub.endpoint,
            keys: { p256dh: sub.keys_p256dh, auth: sub.keys_auth },
          },
          JSON.stringify(payload),
        )
      } catch (err) {
        const status = err?.statusCode
        if (status === 404 || status === 410) {
          // gone — drop it. internal cleanup uses the row's own keys
          // (we trust our own DB), not just the endpoint.
          deleteByKeyedStmt.run(sub.endpoint, sub.keys_p256dh, sub.keys_auth)
        } else {
          // eslint-disable-next-line no-console
          console.warn('[push] send failed:', status || err?.message)
        }
      }
    }),
  )
}
