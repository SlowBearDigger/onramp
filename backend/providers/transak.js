import { jwtVerify, decodeJwt } from 'jose'
import { getValidAccessToken } from './transak-token.js'

// Map Transak webhook eventIDs → canonical status strings we store.
// Reference (verified against docs.transak.com/features/webhooks): the same
// six events fire for both BUY and SELL flows.
const EVENT_TO_STATUS = {
  ORDER_CREATED: 'AWAITING_PAYMENT_FROM_USER',
  ORDER_PAYMENT_VERIFYING: 'PAYMENT_DONE_MARKED_BY_USER',
  ORDER_PROCESSING: 'PROCESSING',
  ORDER_COMPLETED: 'COMPLETED',
  ORDER_FAILED: 'FAILED',
  ORDER_REFUNDED: 'REFUNDED',
}

// KYC webhook events. these arrive at a separate endpoint and aren't tied
// to a specific order — they describe the customer's KYC standing across
// orders. we don't surface them in the order list; they're informational
// and stored in the audit log for ops visibility.
export const KYC_EVENT_IDS = new Set(['KYC_SUBMITTED', 'KYC_APPROVED', 'KYC_REJECTED'])

// Hard guardrail: the insecure escape hatch must never be active in any
// environment tagged as production. Called once at boot from app.js so
// misconfiguration fails fast instead of silently accepting forged webhooks.
export function assertWebhookConfigSafe() {
  const insecure = process.env.TRANSAK_WEBHOOK_INSECURE === 'true'
  const isProd =
    (process.env.NODE_ENV || '').toLowerCase() === 'production' ||
    (process.env.TRANSAK_ENV || '').toUpperCase() === 'PRODUCTION'

  if (insecure && isProd) {
    throw new Error(
      'FATAL: TRANSAK_WEBHOOK_INSECURE=true is not allowed when ' +
      'NODE_ENV=production or TRANSAK_ENV=PRODUCTION. Unset it before boot.'
    )
  }
  if (insecure) {
    // eslint-disable-next-line no-console
    console.warn(
      '[webhook] ⚠️  TRANSAK_WEBHOOK_INSECURE=true — JWT signatures will NOT be verified. ' +
      'This is dev-only; unset before any exposed deployment.'
    )
  }
}

// Verify the webhook JWT. Transak signs the `data` field with the partner's
// access token (HS256 by default until docs confirm otherwise).
//
// Security notes:
//   - algorithms is pinned to HS256. No 'none', no alg confusion.
//   - eventID is ALWAYS taken from the decoded (signed) payload, never from
//     the outer unsigned request body — otherwise an attacker who bypasses
//     the signature could still dictate status transitions.
//   - the insecure escape hatch throws at boot in production (see
//     assertWebhookConfigSafe).
export async function verifyOrderWebhook(body) {
  if (!body || typeof body !== 'object') {
    throw new Error('webhook: body missing')
  }

  const jwt = typeof body.data === 'string' ? body.data : null
  if (!jwt || jwt.split('.').length !== 3) {
    throw new Error('webhook: body.data is not a JWT string')
  }

  // signing-secret resolution. transak's webhooks are signed with the
  // partner access token (per docs.transak.com/guides/how-to-decrypt-
  // webhook-payload). resolution order:
  //   1. explicit TRANSAK_PARTNER_ACCESS_TOKEN  — manual override
  //   2. TRANSAK_API_SECRET (via auto-refresh)  — preferred
  //   3. nothing                                 — only allowed when
  //      TRANSAK_WEBHOOK_INSECURE=true (dev only; throws at boot in prod
  //      via assertWebhookConfigSafe)
  const allowUnverified = process.env.TRANSAK_WEBHOOK_INSECURE === 'true'

  let secret = process.env.TRANSAK_PARTNER_ACCESS_TOKEN
  if (!secret && process.env.TRANSAK_API_SECRET) {
    try {
      secret = await getValidAccessToken()
    } catch {
      // fall through; treat as unconfigured below
    }
  }

  if (!secret && !allowUnverified) {
    throw new Error('webhook: no signing secret available — set TRANSAK_API_SECRET (preferred) or TRANSAK_PARTNER_ACCESS_TOKEN')
  }

  let payload
  if (secret) {
    const key = new TextEncoder().encode(secret)
    try {
      const result = await jwtVerify(jwt, key, { algorithms: ['HS256'] })
      payload = result.payload
    } catch (e) {
      if (!allowUnverified) throw e
      // Dev-only fallback — only reachable when explicitly opted-in AND
      // assertWebhookConfigSafe() passed at boot (i.e. non-prod).
      payload = decodeJwt(jwt)
    }
  } else {
    payload = decodeJwt(jwt)
  }

  // eventID authoritatively from signed payload. The outer body is untrusted.
  const eventID = typeof payload?.eventID === 'string' ? payload.eventID : null
  if (!eventID) {
    throw new Error('webhook: signed payload missing eventID')
  }

  return { eventID, payload }
}

// classify a verified webhook by event family. order events upsert into the
// orders table; KYC events are logged for ops but don't touch orders.
export function classifyEvent(eventID) {
  if (KYC_EVENT_IDS.has(eventID)) return 'kyc'
  if (eventID && eventID.startsWith('ORDER_')) return 'order'
  return 'unknown'
}

// Map a verified webhook into the row shape expected by db.upsertOrder.
export function webhookToOrderRow({ eventID, payload }) {
  const d = payload?.webhookData || payload || {}
  const now = Date.now()

  return {
    id: typeof d.id === 'string' ? d.id : (typeof d.orderId === 'string' ? d.orderId : null),
    provider: 'transak',
    unverified: 0,
    partner_order_id: typeof d.partnerOrderId === 'string' ? d.partnerOrderId : null,
    customer_id: typeof d.partnerCustomerId === 'string'
      ? d.partnerCustomerId
      : (typeof d.walletAddress === 'string' ? d.walletAddress : null),
    status: EVENT_TO_STATUS[eventID] || (typeof d.status === 'string' ? d.status : 'UNKNOWN'),
    event_id: eventID,
    product: d.isBuyOrSell || (d.productsAvailed === 'SELL' ? 'SELL' : 'BUY'),
    fiat_currency: typeof d.fiatCurrency === 'string' ? d.fiatCurrency : null,
    fiat_amount: Number.isFinite(Number(d.fiatAmount)) ? Number(d.fiatAmount) : null,
    crypto_currency: typeof d.cryptoCurrency === 'string' ? d.cryptoCurrency : null,
    crypto_amount: Number.isFinite(Number(d.cryptoAmount)) ? Number(d.cryptoAmount) : null,
    wallet_address: typeof d.walletAddress === 'string' ? d.walletAddress : null,
    network: typeof d.network === 'string' ? d.network : null,
    tx_hash: typeof d.transactionHash === 'string'
      ? d.transactionHash
      : (typeof d.transactionLink === 'string' ? d.transactionLink : null),
    created_at: d.createdAt ? new Date(d.createdAt).getTime() : now,
    updated_at: now,
    raw_payload: JSON.stringify({ eventID, payload }),
  }
}

// signed-widget-URL flow.
//
// transak's recommended pattern (as of 2025): the partner backend POSTs to
// /api/v2/auth/session with the partner access token in the `access-token`
// header. transak responds with a one-shot widget URL that bakes in a
// session token. the frontend opens the iframe at that URL.
//
// the response widgetUrl is single-use and expires 5 minutes after creation,
// so we mint a fresh one per startOrder call (the frontend already does
// that — useProvider.startOrder calls getBootstrap() each time).
//
// security wins over the legacy `?apiKey=...&...` pattern:
//   - api key never reaches the browser bundle
//   - widget params are signed by transak; client can't tamper mid-flight
//   - rotating the access token invalidates the integration server-side only
const TRANSAK_API_BASE_STAGING = 'https://api-gateway-stg.transak.com'
const TRANSAK_API_BASE_PROD = 'https://api-gateway.transak.com'

function transakApiBase() {
  return (process.env.TRANSAK_ENV || 'STAGING').toUpperCase() === 'PRODUCTION'
    ? TRANSAK_API_BASE_PROD
    : TRANSAK_API_BASE_STAGING
}

// throws on missing config so callers can map to a clean 503.
//
// auth model has two acceptable shapes:
//   1. preferred: TRANSAK_API_KEY + TRANSAK_API_SECRET — backend mints
//      and refreshes the 7-day access token automatically.
//   2. legacy/emergency: TRANSAK_API_KEY + TRANSAK_PARTNER_ACCESS_TOKEN
//      — operator pasted a token they generated externally; no
//      auto-refresh, expires in 7 days.
// either path satisfies the config gate.
function assertWidgetUrlConfig() {
  const apiKey = process.env.TRANSAK_API_KEY
  const apiSecret = process.env.TRANSAK_API_SECRET
  const overrideToken = process.env.TRANSAK_PARTNER_ACCESS_TOKEN
  const referrerDomain = process.env.TRANSAK_REFERRER_DOMAIN
  const hasAuth = apiSecret || overrideToken
  if (!apiKey || !hasAuth || !referrerDomain) {
    const err = new Error(
      'transak signed-url not fully configured: TRANSAK_API_KEY, ' +
      '(TRANSAK_API_SECRET or TRANSAK_PARTNER_ACCESS_TOKEN), and ' +
      'TRANSAK_REFERRER_DOMAIN are required.'
    )
    err.code = 'not_configured'
    throw err
  }
  return { apiKey, referrerDomain }
}

export function isWidgetUrlConfigured() {
  return Boolean(
    process.env.TRANSAK_API_KEY &&
    (process.env.TRANSAK_API_SECRET || process.env.TRANSAK_PARTNER_ACCESS_TOKEN) &&
    process.env.TRANSAK_REFERRER_DOMAIN
  )
}

// build the widgetParams payload that goes in the POST body.
//
// field names verified against transak's customization/query-parameters docs:
//   - fiatAmount        : fixed fiat amount, customer cannot change
//   - defaultFiatAmount : preset, customer can change
//   - cryptoAmount      : fixed crypto amount, customer cannot change (sell)
//   - defaultCryptoAmount: preset, customer can change
//
// our SwapWidget collects the amount in our own UI before opening the
// widget, so we lock it in (fixed flavour). semantics differ by mode:
//   buy  → user picked a FIAT amount        → pass fiatAmount
//   sell → user picked a CRYPTO amount      → pass cryptoAmount
function buildWidgetParams({ apiKey, referrerDomain, session }) {
  const isSell = session.mode === 'sell'

  const params = {
    apiKey,
    referrerDomain,
    productsAvailed: isSell ? 'SELL' : 'BUY',
    cryptoCurrencyCode: session.cryptoCurrency,
    fiatCurrency: session.fiatCurrency || 'USD',
    network: session.cryptoNetwork,
    walletAddress: session.walletAddress,
    disableWalletAddressForm: true,
    hideMenu: true,
    exchangeScreenTitle: isSell ? 'Off-Ramp' : 'On-Ramp',
  }

  // sell: cryptoAmount is what the user already entered in our UI. fall
  // back to fiatAmount only if the caller passed it (rare — old flows).
  // buy: fiatAmount is the locked-in amount.
  if (isSell) {
    if (Number.isFinite(Number(session.cryptoAmount))) {
      params.cryptoAmount = Number(session.cryptoAmount)
    } else if (Number.isFinite(Number(session.fiatAmount))) {
      // permissive fallback — transak will compute equivalent crypto.
      params.fiatAmount = Number(session.fiatAmount)
    }
  } else {
    if (Number.isFinite(Number(session.fiatAmount))) {
      params.fiatAmount = Number(session.fiatAmount)
    }
  }

  if (session.partnerOrderId) params.partnerOrderId = session.partnerOrderId
  if (session.partnerCustomerId) params.partnerCustomerId = session.partnerCustomerId
  if (session.email) params.email = session.email
  if (session.themeColor) params.themeColor = session.themeColor
  if (session.theme) params.colorMode = session.theme === 'dark' ? 'DARK' : 'LIGHT'
  if (session.redirectURL) params.redirectURL = session.redirectURL
  return params
}

// mint a single-use signed widget URL.
// `session` follows our canonical shape (mode, cryptoCurrency, fiatCurrency,
// fiatAmount, walletAddress, cryptoNetwork, partnerOrderId, ...).
// returns `{ widgetUrl, expiresAt }`.
//
// access-token resolution:
//   - if TRANSAK_PARTNER_ACCESS_TOKEN is set → use verbatim (override path)
//   - else → mint via /partners/api/v2/refresh-token using TRANSAK_API_SECRET,
//     cached for 7 days minus a 1h safety margin (see transak-token.js).
//
// retry semantics: if the cached token is expired/rejected, transak returns
// 401. we catch that, force-refresh once, and retry — covers the edge case
// where transak rotated the token early or our cached expiry was off.
export async function createSignedWidgetUrl(session) {
  const { apiKey, referrerDomain } = assertWidgetUrlConfig()
  const url = `${transakApiBase()}/api/v2/auth/session`

  const body = {
    widgetParams: buildWidgetParams({ apiKey, referrerDomain, session }),
  }

  const callOnce = async (token) => {
    const ac = new AbortController()
    const timer = setTimeout(() => ac.abort(), 5000)
    try {
      const r = await fetch(url, {
        method: 'POST',
        headers: {
          'access-token': token,
          'content-type': 'application/json',
          accept: 'application/json',
          'user-agent': 'onramp-backend/1.0 (+https://github.com/SlowBearDigger/onramp)',
        },
        body: JSON.stringify(body),
        signal: ac.signal,
        redirect: 'error',
      })
      return r
    } finally {
      clearTimeout(timer)
    }
  }

  let accessToken = await getValidAccessToken()
  let r = await callOnce(accessToken)

  // retry on 401 only when we minted the token ourselves (no override env).
  // override tokens are user-provided; failing on those should surface
  // immediately instead of silently re-minting (which may not be possible
  // if api-secret isn't set).
  if (r.status === 401 && !process.env.TRANSAK_PARTNER_ACCESS_TOKEN) {
    const { _resetCacheForTests } = await import('./transak-token.js')
    _resetCacheForTests()
    accessToken = await getValidAccessToken()
    r = await callOnce(accessToken)
  }

  if (!r.ok) {
    const detail = await r.text().catch(() => '')
    const err = new Error(`transak session HTTP ${r.status}: ${detail.slice(0, 200)}`)
    err.code = r.status === 401 ? 'auth_failed' : 'upstream_error'
    err.status = r.status
    throw err
  }
  const data = await r.json()
  const widgetUrl = data?.data?.widgetUrl
  if (typeof widgetUrl !== 'string' || !widgetUrl.startsWith('https://')) {
    const err = new Error('transak session returned no widgetUrl')
    err.code = 'invalid_response'
    throw err
  }
  const expiresAt = Math.floor(Date.now() / 1000) + 5 * 60
  return { widgetUrl, expiresAt }
}
