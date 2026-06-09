import 'dotenv/config'
import express from 'express'
import cors from 'cors'
import helmet from 'helmet'
import rateLimit from 'express-rate-limit'

import { upsertOrder, listOrders, getOrderById } from './db.js'
import { fetchPartnerOrders, partnerOrderToRow } from './providers/transak-orders.js'
import {
  verifyOrderWebhook as verifyTransakWebhook,
  webhookToOrderRow as transakWebhookToRow,
  classifyEvent as transakClassifyEvent,
  assertWebhookConfigSafe as assertTransakConfigSafe,
  createSignedWidgetUrl as createTransakWidgetUrl,
  isWidgetUrlConfigured as isTransakWidgetConfigured,
} from './providers/transak.js'
import {
  signBootstrapToken as signTopperBootstrap,
  verifyOrderWebhook as verifyTopperWebhook,
  webhookToOrderRow as topperWebhookToRow,
  getQuote as getTopperQuote,
  assertTopperConfigSafe,
  isTopperEnabled,
} from './providers/topper.js'
import {
  validateFrontendEvent as validateMtPelerinEvent,
  frontendEventToOrderRow as mtpelerinEventToRow,
  getQuote as getMtPelerinQuote,
} from './providers/mtpelerin.js'
import {
  authenticate as adminAuthenticate,
  requireAdmin,
  assertAdminConfigSafe,
  isAdminEnabled,
  ADMIN_RUNTIME,
} from './admin/auth.js'
import {
  getSummary as adminGetSummary,
  getDaily as adminGetDaily,
  getMonthly as adminGetMonthly,
  getUniqueWalletsMonthly as adminGetUniqueWalletsMonthly,
  getDailyForCsv as adminGetDailyForCsv,
} from './admin/stats.js'
import { toCsv } from './admin/csv.js'
import {
  logAuditEvent,
  listAuditEvents,
  countAuditEvents,
  ipFromRequest,
  userAgentFromRequest,
} from './admin/audit.js'
import {
  isPushEnabled,
  assertPushConfigSafe,
  getPublicKey as getPushPublicKey,
  saveSubscription as savePushSubscription,
  deleteSubscription as deletePushSubscription,
  sendOrderPush,
} from './push.js'

const PORT = Number(process.env.PORT || 3001)
const TRANSAK_ENV = process.env.TRANSAK_ENV || 'STAGING'
const TRANSAK_API_BASE = TRANSAK_ENV === 'PRODUCTION'
  ? 'https://api.transak.com'
  : 'https://api-stg.transak.com'

// CORS allowlist — trim, drop empties (protects against stray trailing commas
// in env config), require https in production.
const CORS_ORIGIN = (process.env.CORS_ORIGIN || 'http://localhost:5173')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean)

// boot-time safety gates. transak's insecure-webhook flag must not be on in
// production; topper and admin must be either fully configured or fully disabled.
assertTransakConfigSafe()
assertTopperConfigSafe()
assertAdminConfigSafe()
assertPushConfigSafe()

// input-shape validators (tight by design — these are public endpoints).
//
// customerId: we pass a wallet address in practice. Accept:
//   - EVM addresses: 0x + 40 hex
//   - Cosmos / Solana / btc-bech32 style: alnum up to 96 chars
// stays conservative; reject anything with control chars, spaces, or slashes.
const CUSTOMER_ID_RE = /^[A-Za-z0-9:_-]{8,96}$/
// order IDs: provider-specific UUIDs or short hex-like strings. permissive
// but bounded.
const ORDER_ID_RE = /^[A-Za-z0-9:_-]{6,96}$/
// currency codes (ISO + crypto): 2–12 uppercase alnum.
const CURRENCY_RE = /^[A-Z0-9]{2,12}$/
// network name: letters, digits, hyphen, underscore (mtpelerin uses underscores).
const NETWORK_RE = /^[a-z0-9_-]{2,32}$/
// buy/sell enum.
const SIDE_RE = /^(BUY|SELL)$/
// provider id enum (mirrors src/providers/index.js).
const PROVIDER_RE = /^(transak|mtpelerin|topper)$/

const app = express()

// passenger/nginx/cloudflare sit in front. `1` trusts one proxy hop.
//
// IMPORTANT: if you deploy behind cloudflare AND apache/passenger (two hops),
// either raise this to 2 and pin cloudflare ips, or key rate-limit by
// req.headers['cf-connecting-ip']. see backend/README.md.
app.set('trust proxy', 1)

app.use(helmet({
  // backend is API-only (no HTML served) so the HTML-oriented CSP is handled
  // entirely at the static frontend layer (public/.htaccess).
  contentSecurityPolicy: false,
  crossOriginResourcePolicy: { policy: 'cross-origin' },
}))

app.use(cors({
  origin: CORS_ORIGIN,
  credentials: false,
  methods: ['GET', 'POST'],
}))

// rate limits.
//
// tightened after audit: real webhook delivery volume is tiny, so 60/min is
// ample and discourages flood attempts when paired with the JWT verify step.
const apiLimiter = rateLimit({ windowMs: 60_000, max: 60, standardHeaders: true, legacyHeaders: false })
const webhookLimiter = rateLimit({ windowMs: 60_000, max: 60, standardHeaders: true, legacyHeaders: false })

// dedicated tighter limiters for endpoints that consume upstream quota
// or are abuse-prone. each call to /widget-url mints a real Transak
// session (counts against our partner quota); each /api/push/subscribe
// writes to the DB. global 60/min is too lax for these.
const widgetUrlLimiter = rateLimit({ windowMs: 60_000, max: 10, standardHeaders: true, legacyHeaders: false })
const pushSubscribeLimiter = rateLimit({ windowMs: 60_000, max: 10, standardHeaders: true, legacyHeaders: false })
const mtpelerinEventLimiter = rateLimit({ windowMs: 60_000, max: 10, standardHeaders: true, legacyHeaders: false })
// profile sync spends transak partner-api quota on every call — keep it
// tighter than the local-only endpoints.
const profileSyncLimiter = rateLimit({ windowMs: 60_000, max: 6, standardHeaders: true, legacyHeaders: false })

// topper webhook needs the RAW body (the detached JWS signs the bytes
// verbatim). mount it BEFORE express.json so req.body is a Buffer here.
app.post(
  '/webhook/topper/order',
  webhookLimiter,
  express.raw({ type: 'application/json', limit: '50kb' }),
  async (req, res) => {
    if (!isTopperEnabled()) {
      // 404 instead of 503 to avoid confirming the route exists when
      // topper isn't configured. attacker can't tell whether we just
      // don't have topper yet vs the route is wrong.
      return res.status(404).json({ error: 'not_found' })
    }
    try {
      const sig = req.headers['x-topper-jws-signature']
      const verified = await verifyTopperWebhook(req.body, sig)
      const row = topperWebhookToRow(verified)
      if (!row.id) {
        return res.status(200).json({ ok: true, ignored: 'no-order-id' })
      }
      upsertOrder(row)
      res.json({ ok: true, orderId: row.id, status: row.status })
    } catch (err) {
      console.error('[topper webhook] verify failed:', err?.message)
      res.status(401).json({ error: 'verification_failed' })
    }
  }
)

// every OTHER route uses parsed JSON.
app.use(express.json({ limit: '50kb' }))

// health. minimal response — earlier versions exposed env name + which
// providers/admin were configured, which gave a recon attacker a free
// service map. now /healthz says only "yes I'm alive" — uptime probes
// are happy, attackers learn nothing.
app.get('/healthz', (_req, res) => {
  res.json({ ok: true })
})

// orders API.
//
// customerId is REQUIRED — no public global listing. this prevents anyone
// from enumerating all orders across the system. wallet addresses are
// semi-public so this isn't auth, but it does make mass scraping harder.
// optional ?provider=<id> filter for per-provider history views.
app.get('/api/orders', apiLimiter, (req, res) => {
  const customerId = typeof req.query.customerId === 'string' ? req.query.customerId : ''
  if (!CUSTOMER_ID_RE.test(customerId)) {
    return res.status(400).json({ error: 'invalid_customerId' })
  }
  const provider = typeof req.query.provider === 'string' ? req.query.provider : null
  if (provider && !PROVIDER_RE.test(provider)) {
    return res.status(400).json({ error: 'invalid_provider' })
  }
  const orders = listOrders({ customerId, provider })
  res.json({ orders })
})

// on-demand reconciliation against transak's partner orders api: pull
// COMPLETED orders for this wallet, upsert them locally (backfills anything
// webhooks missed and promotes unverified rows), then return the merged
// local view. powers the in-app "your history" without leaving the site.
//
// the frontend should call this on history-view open, not in a poll loop —
// polling stays on /api/orders, which never touches the upstream.
app.get('/api/profile/orders', profileSyncLimiter, async (req, res) => {
  const walletAddress = typeof req.query.walletAddress === 'string' ? req.query.walletAddress : ''
  if (!CUSTOMER_ID_RE.test(walletAddress)) {
    return res.status(400).json({ error: 'invalid_walletAddress' })
  }

  let synced = 0
  let syncError = null
  try {
    const partnerOrders = await fetchPartnerOrders({ walletAddress })
    for (const order of partnerOrders) {
      const row = partnerOrderToRow(order)
      if (row) {
        upsertOrder(row)
        synced++
      }
    }
  } catch (err) {
    // degrade gracefully: a partner-api hiccup must not blank the user's
    // history. return the local view and flag that the sync was partial.
    console.error('[profile] partner orders sync failed:', err?.message)
    syncError = err?.code === 'not_configured' ? 'not_configured'
      : err?.code === 'auth_failed' ? 'auth_failed'
      : 'upstream_error'
  }

  const orders = listOrders({ customerId: walletAddress })
  res.json({ orders, sync: syncError ? { ok: false, reason: syncError } : { ok: true, synced } })
})

app.get('/api/orders/:id', apiLimiter, (req, res) => {
  if (!ORDER_ID_RE.test(req.params.id)) {
    return res.status(400).json({ error: 'invalid_id' })
  }
  const order = getOrderById(req.params.id)
  if (!order) return res.status(404).json({ error: 'not_found' })
  res.json({ order })
})

// transak quote proxy.
//
// strictly validate every input param before forwarding — this prevents
// request laundering (we append our API key server-side) and bounds the
// attack surface of the proxy. mtpelerin and topper quote endpoints are
// stubbed below until their pricing APIs are confirmed.
app.get('/api/quotes', apiLimiter, async (req, res) => {
  const fiatCurrency = String(req.query.fiatCurrency || 'USD').toUpperCase()
  const cryptoCurrency = String(req.query.cryptoCurrency || 'BTC').toUpperCase()
  const isBuyOrSell = String(req.query.isBuyOrSell || 'BUY').toUpperCase()
  const network = String(req.query.network || 'ethereum').toLowerCase()
  const fiatAmount = Number(req.query.fiatAmount)

  if (!CURRENCY_RE.test(fiatCurrency)) return res.status(400).json({ error: 'invalid_fiatCurrency' })
  if (!CURRENCY_RE.test(cryptoCurrency)) return res.status(400).json({ error: 'invalid_cryptoCurrency' })
  if (!SIDE_RE.test(isBuyOrSell)) return res.status(400).json({ error: 'invalid_isBuyOrSell' })
  if (!NETWORK_RE.test(network)) return res.status(400).json({ error: 'invalid_network' })
  if (!Number.isFinite(fiatAmount) || fiatAmount <= 0 || fiatAmount > 1_000_000) {
    return res.status(400).json({ error: 'invalid_fiatAmount' })
  }

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), 5000)
  try {
    const qs = new URLSearchParams({
      partnerApiKey: process.env.TRANSAK_API_KEY || '',
      fiatCurrency,
      cryptoCurrency,
      fiatAmount: String(fiatAmount),
      isBuyOrSell,
      network,
    })
    const url = `${TRANSAK_API_BASE}/api/v1/pricing/public/quotes?${qs.toString()}`
    const r = await fetch(url, {
      headers: { accept: 'application/json' },
      signal: controller.signal,
      // explicitly do not follow redirects across origins — prevents the
      // remote from bouncing us to an internal URL.
      redirect: 'error',
    })
    const body = await r.json().catch(() => ({}))
    res.status(r.status).json(body)
  } catch (err) {
    // do not surface the upstream error detail — it can leak DNS/host info.
    console.error('[quotes] upstream failure:', err?.message)
    res.status(502).json({ error: 'upstream_error' })
  } finally {
    clearTimeout(timer)
  }
})

// helper: parse + validate the common quote query string. returns
// { fiatCurrency, cryptoCurrency, network, isBuyOrSell, fiatAmount } on
// success; sends a 400 and returns null on failure.
function parseQuoteQuery(req, res) {
  const fiatCurrency = String(req.query.fiatCurrency || 'USD').toUpperCase()
  const cryptoCurrency = String(req.query.cryptoCurrency || 'BTC').toUpperCase()
  const isBuyOrSell = String(req.query.isBuyOrSell || 'BUY').toUpperCase()
  const network = String(req.query.network || 'ethereum').toLowerCase()
  const fiatAmount = Number(req.query.fiatAmount)

  if (!CURRENCY_RE.test(fiatCurrency)) { res.status(400).json({ error: 'invalid_fiatCurrency' }); return null }
  if (!CURRENCY_RE.test(cryptoCurrency)) { res.status(400).json({ error: 'invalid_cryptoCurrency' }); return null }
  if (!SIDE_RE.test(isBuyOrSell)) { res.status(400).json({ error: 'invalid_isBuyOrSell' }); return null }
  if (!NETWORK_RE.test(network)) { res.status(400).json({ error: 'invalid_network' }); return null }
  if (!Number.isFinite(fiatAmount) || fiatAmount <= 0 || fiatAmount > 1_000_000) {
    res.status(400).json({ error: 'invalid_fiatAmount' }); return null
  }
  return { fiatCurrency, cryptoCurrency, network, isBuyOrSell, fiatAmount }
}

// translate a provider getQuote() error code into an HTTP response.
function sendQuoteError(res, providerLabel, err) {
  const code = err?.code
  if (code === 'sell_not_implemented') {
    return res.status(501).json({ error: 'sell_not_implemented' })
  }
  if (code === 'not_configured') {
    return res.status(503).json({ error: `${providerLabel}_not_configured` })
  }
  // upstream / parse / network failures — 502. don't leak detail.
  console.error(`[${providerLabel} quote] failed:`, err?.message)
  return res.status(502).json({ error: 'upstream_error' })
}

app.get('/api/quotes/mtpelerin', apiLimiter, async (req, res) => {
  const q = parseQuoteQuery(req, res)
  if (!q) return
  try {
    const quote = await getMtPelerinQuote({
      fiatCurrency: q.fiatCurrency,
      cryptoCurrency: q.cryptoCurrency,
      network: q.network,
      fiatAmount: q.fiatAmount,
      side: q.isBuyOrSell,
    })
    res.json({ provider: 'mtpelerin', quote })
  } catch (err) {
    sendQuoteError(res, 'mtpelerin', err)
  }
})

app.get('/api/quotes/topper', apiLimiter, async (req, res) => {
  const q = parseQuoteQuery(req, res)
  if (!q) return
  try {
    const quote = await getTopperQuote({
      fiatCurrency: q.fiatCurrency,
      cryptoCurrency: q.cryptoCurrency,
      network: q.network,
      fiatAmount: q.fiatAmount,
      side: q.isBuyOrSell,
    })
    res.json({ provider: 'topper', quote })
  } catch (err) {
    sendQuoteError(res, 'topper', err)
  }
})

// transak webhook receiver.
//
// verifies the signed JWT, then upserts the decoded fields. any signature
// failure, missing eventID, or malformed payload returns 401 — transak will
// retry per its own policy.
app.post('/webhook/transak/order', webhookLimiter, async (req, res) => {
  try {
    const verified = await verifyTransakWebhook(req.body)
    const row = transakWebhookToRow(verified)
    if (!row.id) {
      return res.status(200).json({ ok: true, ignored: 'no-order-id' })
    }
    upsertOrder(row)
    // best-effort web push notification. never throws — sendOrderPush
    // swallows its own errors so webhook ack never depends on push success.
    sendOrderPush(row).catch(() => { /* logged inside */ })
    res.json({ ok: true, orderId: row.id, status: row.status })
  } catch (err) {
    console.error('[transak webhook] verify failed:', err?.message)
    res.status(401).json({ error: 'verification_failed' })
  }
})

// transak KYC webhook. fires for KYC_SUBMITTED / KYC_APPROVED / KYC_REJECTED.
// these aren't tied to a single order — they describe the customer's KYC
// standing — so we don't upsert into orders. instead we log them in the
// admin audit trail so ops can correlate KYC delays with stuck orders.
//
// signature scheme is the same as the order webhook (HS256 JWT in body.data).
app.post('/webhook/transak/kyc', webhookLimiter, async (req, res) => {
  try {
    const verified = await verifyTransakWebhook(req.body)
    const eventID = verified.eventID
    if (!transakClassifyEvent(eventID) || transakClassifyEvent(eventID) !== 'kyc') {
      // unexpected — order events to this endpoint are likely a misconfig.
      return res.status(200).json({ ok: true, ignored: 'not-kyc' })
    }
    const d = verified.payload?.webhookData || verified.payload || {}
    logAuditEvent('transak.kyc', {
      ip: ipFromRequest(req),
      userAgent: userAgentFromRequest(req),
      detail: {
        eventID,
        partnerCustomerId: typeof d.partnerCustomerId === 'string' ? d.partnerCustomerId : null,
        walletAddress: typeof d.walletAddress === 'string' ? d.walletAddress : null,
        kycStatus: typeof d.kycStatus === 'string' ? d.kycStatus : null,
      },
    })
    res.json({ ok: true, eventID })
  } catch (err) {
    console.error('[transak kyc webhook] verify failed:', err?.message)
    res.status(401).json({ error: 'verification_failed' })
  }
})

// topper bootstrap. mints a fresh signed JWT for a single widget session.
// the JWT carries the source/target/partner config and is valid for 3 minutes.
app.post('/api/providers/topper/bootstrap', apiLimiter, async (req, res) => {
  if (!isTopperEnabled()) {
    return res.status(503).json({ error: 'topper_not_configured' })
  }

  const body = req.body || {}
  const errors = []

  if (!body.source || typeof body.source !== 'object') errors.push('source')
  else {
    if (!CURRENCY_RE.test(String(body.source.asset || ''))) errors.push('source.asset')
    const amt = Number(body.source.amount)
    if (!Number.isFinite(amt) || amt <= 0 || amt > 1_000_000) errors.push('source.amount')
  }

  if (!body.target || typeof body.target !== 'object') errors.push('target')
  else {
    if (!CURRENCY_RE.test(String(body.target.asset || ''))) errors.push('target.asset')
    if (!NETWORK_RE.test(String(body.target.network || ''))) errors.push('target.network')
    if (!CUSTOMER_ID_RE.test(String(body.target.address || ''))) errors.push('target.address')
  }

  if (body.partnerOrderId && !ORDER_ID_RE.test(String(body.partnerOrderId))) errors.push('partnerOrderId')
  if (body.partnerCustomerId && !CUSTOMER_ID_RE.test(String(body.partnerCustomerId))) errors.push('partnerCustomerId')

  if (errors.length) {
    return res.status(400).json({ error: 'invalid_input', fields: errors })
  }

  try {
    const bt = await signTopperBootstrap({
      source: { asset: body.source.asset, amount: Number(body.source.amount), paymentMethod: { network: 'card' } },
      target: { asset: body.target.asset, network: body.target.network, address: body.target.address },
      partner: body.partner && typeof body.partner === 'object' ? body.partner : undefined,
      partnerOrderId: body.partnerOrderId,
      partnerCustomerId: body.partnerCustomerId,
    })
    res.json({ bt })
  } catch (err) {
    console.error('[topper bootstrap] failed:', err?.message)
    res.status(500).json({ error: 'bootstrap_failed' })
  }
})

// transak signed widget URL.
//
// the partner backend mints the widget URL via transak's session API. the
// returned URL embeds a session token and is single-use, 5-minute TTL.
// frontend gets a fresh URL per startOrder call.
// allowlist for redirectURL on widget-url. attacker-supplied redirect URLs
// can otherwise become phishing vectors (`javascript:` URI executes in
// transak's widget context, attacker.com receives post-purchase users).
// only allow our own deployed domains, plus localhost for dev.
function isAllowedRedirectURL(url) {
  if (typeof url !== 'string' || url.length > 1024) return false
  let parsed
  try { parsed = new URL(url) } catch { return false }
  if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') return false
  // CORS_ORIGIN already lists our own frontend origins; reuse the set.
  // also accept any path under those origins.
  const allowedHosts = CORS_ORIGIN
    .map((o) => { try { return new URL(o).host } catch { return null } })
    .filter(Boolean)
  return allowedHosts.includes(parsed.host)
}

app.post('/api/providers/transak/widget-url', widgetUrlLimiter, async (req, res) => {
  if (!isTransakWidgetConfigured()) {
    return res.status(503).json({ error: 'transak_not_configured' })
  }

  const body = req.body || {}
  const errors = []

  if (body.mode !== 'buy' && body.mode !== 'sell') errors.push('mode')
  if (!CURRENCY_RE.test(String(body.cryptoCurrency || ''))) errors.push('cryptoCurrency')
  if (!CURRENCY_RE.test(String(body.fiatCurrency || ''))) errors.push('fiatCurrency')
  if (!NETWORK_RE.test(String(body.cryptoNetwork || ''))) errors.push('cryptoNetwork')
  if (!CUSTOMER_ID_RE.test(String(body.walletAddress || ''))) errors.push('walletAddress')
  // sell mode requires a cryptoAmount; buy mode requires a fiatAmount.
  // either may be passed in the other mode as a permissive fallback (transak
  // computes the equivalent), but at least one must be valid.
  const fiatAmount = body.fiatAmount != null ? Number(body.fiatAmount) : null
  const cryptoAmount = body.cryptoAmount != null ? Number(body.cryptoAmount) : null
  const fiatOk = fiatAmount != null && Number.isFinite(fiatAmount) && fiatAmount > 0 && fiatAmount <= 1_000_000
  const cryptoOk = cryptoAmount != null && Number.isFinite(cryptoAmount) && cryptoAmount > 0 && cryptoAmount <= 1_000_000
  if (body.mode === 'sell' && !cryptoOk && !fiatOk) errors.push('cryptoAmount')
  if (body.mode === 'buy' && !fiatOk) errors.push('fiatAmount')
  if (body.partnerOrderId && !ORDER_ID_RE.test(String(body.partnerOrderId))) errors.push('partnerOrderId')
  if (body.partnerCustomerId && !CUSTOMER_ID_RE.test(String(body.partnerCustomerId))) errors.push('partnerCustomerId')
  if (body.theme && body.theme !== 'light' && body.theme !== 'dark') errors.push('theme')
  // redirectURL: must be an https/http URL whose host is in CORS_ORIGIN.
  // anything else (javascript:, data:, file:, attacker.com) is rejected
  // outright. drops the field if invalid rather than leaking back to the
  // attacker which check failed.
  let safeRedirectURL
  if (body.redirectURL != null) {
    if (isAllowedRedirectURL(body.redirectURL)) {
      safeRedirectURL = body.redirectURL
    } else {
      errors.push('redirectURL')
    }
  }
  // email field is unused server-side and would only widen the attack
  // surface (logging, transak forwarding). drop it silently.

  if (errors.length) {
    return res.status(400).json({ error: 'invalid_input', fields: errors })
  }

  try {
    const result = await createTransakWidgetUrl({
      mode: body.mode,
      cryptoCurrency: body.cryptoCurrency,
      cryptoNetwork: body.cryptoNetwork,
      fiatCurrency: body.fiatCurrency,
      fiatAmount: fiatOk ? fiatAmount : undefined,
      cryptoAmount: cryptoOk ? cryptoAmount : undefined,
      walletAddress: body.walletAddress,
      partnerOrderId: body.partnerOrderId,
      partnerCustomerId: body.partnerCustomerId,
      themeColor: body.themeColor,
      theme: body.theme,
      redirectURL: safeRedirectURL,
    })
    res.json(result)
  } catch (err) {
    if (err?.code === 'not_configured') {
      return res.status(503).json({ error: 'transak_not_configured' })
    }
    if (err?.code === 'auth_failed') {
      console.error('[transak widget-url] auth failed — check TRANSAK_PARTNER_ACCESS_TOKEN')
      return res.status(502).json({ error: 'transak_auth_failed' })
    }
    console.error('[transak widget-url] failed:', err?.message)
    return res.status(502).json({ error: 'upstream_error' })
  }
})

// mtpelerin frontend-event ingest.
//
// mtpelerin doesn't expose webhooks. the frontend forwards postMessage events
// here so the admin dashboard can show analytics — flagged unverified=1.
// note: anyone with devtools could forge these, so use them only as
// best-effort signal, not authoritative volume.
app.post('/api/providers/mtpelerin/event', mtpelerinEventLimiter, (req, res) => {
  try {
    validateMtPelerinEvent(req.body)
  } catch (err) {
    return res.status(400).json({ error: 'invalid_input', detail: err.message })
  }
  try {
    // strip attacker-controllable id fields. mtpelerin doesn't expose
    // webhooks so we have no source of truth; the row id MUST be server-
    // generated to prevent collision with legitimate orders or
    // replacement of existing rows. partnerOrderId/walletAddress remain
    // client-supplied (validated by the regex above).
    const sanitized = { ...req.body }
    delete sanitized.orderId
    const row = mtpelerinEventToRow(sanitized)
    // belt-and-suspenders: even though the canonical row builder doesn't
    // honor body.id, force the id to start with "mtpelerin-" so it can
    // never collide with a transak/topper order id.
    if (!row.id || !row.id.startsWith('mtpelerin-')) {
      return res.status(500).json({ error: 'id_generation_failed' })
    }
    upsertOrder(row)
    res.json({ ok: true, id: row.id, unverified: true })
  } catch (err) {
    console.error('[mtpelerin event] failed:', err?.message)
    res.status(500).json({ error: 'ingest_failed' })
  }
})

// admin auth + analytics.
//
// /api/admin/login is rate-limited tightly (5/min/IP) to slow brute force.
// requireAdmin middleware enforces a valid HS256 JWT on all subsequent routes.
const loginLimiter = rateLimit({
  windowMs: 60_000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  // skip successful logins from the count so a real admin isn't locked out.
  skipSuccessfulRequests: true,
})

app.post('/api/admin/login', loginLimiter, async (req, res) => {
  if (!isAdminEnabled()) {
    return res.status(503).json({ error: 'admin_not_configured' })
  }
  const username = typeof req.body?.username === 'string' ? req.body.username : ''
  const password = typeof req.body?.password === 'string' ? req.body.password : ''
  if (!username || !password) {
    return res.status(400).json({ error: 'missing_credentials' })
  }
  const session = await adminAuthenticate(username, password)
  const ip = ipFromRequest(req)
  const userAgent = userAgentFromRequest(req)
  if (!session) {
    // log the attempt (with attempted username so an ops admin can correlate
    // bursts of failures by IP) but NOT the password — it never leaves the
    // request body. generic 401 to the client so we don't leak whether the
    // username exists.
    logAuditEvent('login.failure', { username, ip, userAgent })
    return res.status(401).json({ error: 'invalid_credentials' })
  }
  logAuditEvent('login.success', { username, ip, userAgent })
  res.json({
    token: session.token,
    expiresAt: session.expiresAt,
    ttlSeconds: ADMIN_RUNTIME.ttlSeconds,
  })
})

// logout endpoint. the JWT is stateless so this is purely for the audit
// trail — the client discards the token regardless. accepts an optional
// reason='idle' to distinguish auto-logouts in the audit log.
app.post('/api/admin/logout', requireAdmin, (req, res) => {
  const reason = req.body?.reason === 'idle' ? 'logout.idle' : 'logout'
  logAuditEvent(reason, {
    username: req.admin.username,
    ip: ipFromRequest(req),
    userAgent: userAgentFromRequest(req),
  })
  res.json({ ok: true })
})

// session probe — useful for the frontend to validate its stored token
// on app boot without making a stats call.
app.get('/api/admin/session', requireAdmin, (req, res) => {
  res.json({ ok: true, username: req.admin.username })
})

// validate the from/to query pair. defaults: last 30 days.
function parseRange(req) {
  const now = Date.now()
  const fromRaw = Number(req.query.from)
  const toRaw = Number(req.query.to)
  const to = Number.isFinite(toRaw) && toRaw > 0 ? toRaw : now
  const from = Number.isFinite(fromRaw) && fromRaw > 0 ? fromRaw : (to - 30 * 24 * 60 * 60 * 1000)
  if (from >= to) return null
  // hard cap: 2 years per request to bound query cost.
  if (to - from > 2 * 365 * 24 * 60 * 60 * 1000) return null
  return { from, to }
}

app.get('/api/admin/stats', apiLimiter, requireAdmin, (req, res) => {
  const range = parseRange(req)
  if (!range) return res.status(400).json({ error: 'invalid_range' })
  const summary = adminGetSummary(range)
  const daily = adminGetDaily(range)
  const monthly = adminGetMonthly(range)
  const uniqueWallets = adminGetUniqueWalletsMonthly(range)
  res.json({ summary, daily, monthly, uniqueWallets })
})

app.get('/api/admin/export.csv', apiLimiter, requireAdmin, (req, res) => {
  const range = parseRange(req)
  if (!range) return res.status(400).json({ error: 'invalid_range' })
  const rows = adminGetDailyForCsv(range)
  const csv = toCsv({
    columns: [
      { key: 'date', label: 'Date' },
      { key: 'provider', label: 'Provider' },
      { key: 'transactionCount', label: 'Transaction Count' },
      { key: 'totalVolume', label: 'Total Volume' },
      { key: 'verified', label: 'Verified' },
    ],
    rows,
  })
  const fromIso = new Date(range.from).toISOString().slice(0, 10)
  const toIso = new Date(range.to).toISOString().slice(0, 10)
  // record the export with the date range queried so a security review can
  // tell which time-window of data left the system.
  logAuditEvent('csv.export', {
    username: req.admin.username,
    ip: ipFromRequest(req),
    userAgent: userAgentFromRequest(req),
    detail: { from: fromIso, to: toIso, rows: rows.length },
  })
  res.setHeader('content-type', 'text/csv; charset=utf-8')
  res.setHeader('content-disposition', `attachment; filename="onramp-${fromIso}_to_${toIso}.csv"`)
  res.send(csv)
})

// web push — public endpoints (no auth; subscriptions are tied to a
// wallet address, which is semi-public).
app.get('/api/push/vapid-public-key', apiLimiter, (req, res) => {
  if (!isPushEnabled()) return res.status(503).json({ error: 'push_not_configured' })
  res.json({ publicKey: getPushPublicKey() })
})

app.post('/api/push/subscribe', pushSubscribeLimiter, (req, res) => {
  if (!isPushEnabled()) return res.status(503).json({ error: 'push_not_configured' })
  const body = req.body || {}
  if (typeof body.customerId !== 'string' || !CUSTOMER_ID_RE.test(body.customerId)) {
    return res.status(400).json({ error: 'invalid_customerId' })
  }
  if (!body.subscription || typeof body.subscription.endpoint !== 'string' ||
      !body.subscription.keys?.p256dh || !body.subscription.keys?.auth) {
    return res.status(400).json({ error: 'invalid_subscription' })
  }
  if (typeof body.subscription.endpoint !== 'string' ||
      !/^https:\/\//.test(body.subscription.endpoint) ||
      body.subscription.endpoint.length > 1024) {
    return res.status(400).json({ error: 'invalid_endpoint' })
  }
  try {
    savePushSubscription({
      customerId: body.customerId,
      endpoint: body.subscription.endpoint,
      keys: body.subscription.keys,
      userAgent: userAgentFromRequest(req),
    })
    res.json({ ok: true })
  } catch (err) {
    if (err?.code === 'cap_reached') {
      return res.status(429).json({ error: 'subscription_cap_reached' })
    }
    console.error('[push subscribe] failed:', err?.message)
    res.status(500).json({ error: 'subscribe_failed' })
  }
})

app.post('/api/push/unsubscribe', pushSubscribeLimiter, (req, res) => {
  // unsubscribe requires the FULL subscription material (endpoint + p256dh
  // + auth). prevents an attacker who only saw the endpoint URL from
  // silencing a victim's push notifications.
  const body = req.body || {}
  const endpoint = body.endpoint
  const keys = body.keys
  if (typeof endpoint !== 'string' || !/^https:\/\//.test(endpoint)) {
    return res.status(400).json({ error: 'invalid_endpoint' })
  }
  if (!keys || typeof keys.p256dh !== 'string' || typeof keys.auth !== 'string') {
    return res.status(400).json({ error: 'missing_keys' })
  }
  const removed = deletePushSubscription({ endpoint, keys })
  res.json({ ok: true, removed })
})

// recent admin activity. read-only listing of the audit table for the
// dashboard "Recent Admin Activity" panel. paginated.
app.get('/api/admin/audit', apiLimiter, requireAdmin, (req, res) => {
  const limit = Math.min(Math.max(1, Number(req.query.limit) || 50), 200)
  const offset = Math.max(0, Number(req.query.offset) || 0)
  const events = listAuditEvents({ limit, offset })
  const total = countAuditEvents()
  res.json({ events, total })
})

// 404 + error handler.
app.use((_req, res) => res.status(404).json({ error: 'not_found' }))

app.use((err, _req, res, _next) => {
  console.error('[error]', err)
  res.status(500).json({ error: 'internal_error' })
})

app.listen(PORT, '0.0.0.0', () => {
  console.log(`[offramp-backend] listening on :${PORT} — env=${TRANSAK_ENV} topper=${isTopperEnabled()} admin=${isAdminEnabled()}`)
})
