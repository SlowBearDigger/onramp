import { SignJWT, importJWK, compactVerify, decodeProtectedHeader } from 'jose'
import { randomUUID } from 'node:crypto'

// topper provider — server-side bootstrap signing + webhook verification.
//
// signing model (verified against docs.topperpay.com/widgets):
//   - the bootstrap token is a JWT carrying the session config.
//   - signed asymmetrically with our private JWK (ES256/ES384/ES512 or RS*).
//   - validity 3 minutes from iat.
//   - kid header must match the key id topper has on file.
//
// webhook model (verified against docs.topperpay.com/webhooks):
//   - header X-Topper-JWS-Signature carries a *detached* JWS (header..signature).
//   - we reattach the body as the JWS payload, then verify with our public JWK.
//   - algorithm is ES256 (P-256) per the docs.

const TOPPER_ENV = (process.env.TOPPER_ENV || 'STAGING').toUpperCase()
const WIDGET_ID = process.env.TOPPER_WIDGET_ID || ''
const KEY_ID = process.env.TOPPER_KEY_ID || ''
const PRIVATE_JWK_RAW = process.env.TOPPER_PRIVATE_KEY_JWK || ''
const PUBLIC_JWK_RAW = process.env.TOPPER_PUBLIC_KEY_JWK || ''

// boot-time config check. throws if topper is partially configured (better
// to fail fast than to expose a half-broken endpoint).
export function assertTopperConfigSafe() {
  const anySet = WIDGET_ID || KEY_ID || PRIVATE_JWK_RAW || PUBLIC_JWK_RAW
  const allSet = WIDGET_ID && KEY_ID && PRIVATE_JWK_RAW && PUBLIC_JWK_RAW
  if (anySet && !allSet) {
    throw new Error(
      'topper: partial configuration. set ALL of TOPPER_WIDGET_ID, ' +
      'TOPPER_KEY_ID, TOPPER_PRIVATE_KEY_JWK, TOPPER_PUBLIC_KEY_JWK — ' +
      'or none of them to leave topper disabled.'
    )
  }
  if (!allSet) {
    // eslint-disable-next-line no-console
    console.warn('[topper] not configured — bootstrap and webhook endpoints will return 503.')
  }
}

export function isTopperEnabled() {
  return Boolean(WIDGET_ID && KEY_ID && PRIVATE_JWK_RAW && PUBLIC_JWK_RAW)
}

function parseJwk(raw, label) {
  try {
    const parsed = JSON.parse(raw)
    if (!parsed || typeof parsed !== 'object') throw new Error('not an object')
    return parsed
  } catch (err) {
    throw new Error(`topper: ${label} is not valid JSON: ${err.message}`)
  }
}

let _privateKeyPromise = null
let _publicKeyPromise = null
function loadPrivateKey() {
  if (!_privateKeyPromise) {
    const jwk = parseJwk(PRIVATE_JWK_RAW, 'TOPPER_PRIVATE_KEY_JWK')
    _privateKeyPromise = importJWK(jwk, jwk.alg || 'ES256')
  }
  return _privateKeyPromise
}
function loadPublicKey() {
  if (!_publicKeyPromise) {
    const jwk = parseJwk(PUBLIC_JWK_RAW, 'TOPPER_PUBLIC_KEY_JWK')
    _publicKeyPromise = importJWK(jwk, jwk.alg || 'ES256')
  }
  return _publicKeyPromise
}

// sign a fresh bootstrap JWT for a single widget session.
// the JWT body shape mirrors topper's session config — see the flows doc.
export async function signBootstrapToken(sessionParams) {
  if (!isTopperEnabled()) {
    throw new Error('topper not configured')
  }

  const privateJwk = parseJwk(PRIVATE_JWK_RAW, 'TOPPER_PRIVATE_KEY_JWK')
  const alg = privateJwk.alg || 'ES256'
  const key = await loadPrivateKey()

  const now = Math.floor(Date.now() / 1000)
  const payload = {
    sub: WIDGET_ID,
    jti: randomUUID(),
    iat: now,
    // 3-minute window per topper docs. set explicit exp as defense-in-depth
    // even though topper enforces the rule server-side.
    exp: now + 3 * 60,
    source: sessionParams.source,
    target: sessionParams.target,
    recipientEditMode: 'not-editable',
    partner: sessionParams.partner || { displayName: 'On-Ramp' },
  }

  // forward our partner identifiers in the bootstrap token's data section.
  // topper echoes these back via webhook so the backend can correlate.
  if (sessionParams.partnerOrderId) payload.partnerOrderId = sessionParams.partnerOrderId
  if (sessionParams.partnerCustomerId) payload.partnerCustomerId = sessionParams.partnerCustomerId

  const jwt = await new SignJWT(payload)
    .setProtectedHeader({ typ: 'JWT', alg, kid: KEY_ID })
    .sign(key)

  return jwt
}

// verify an incoming X-Topper-JWS-Signature header against the request body.
// the header is a detached JWS in compact form: "<header>..<signature>".
// we reconstruct the full JWS by base64url-encoding the body and inserting
// it as the middle segment.
export async function verifyOrderWebhook(rawBody, signatureHeader) {
  if (!isTopperEnabled()) {
    throw new Error('topper not configured')
  }
  if (typeof signatureHeader !== 'string' || !signatureHeader.includes('..')) {
    throw new Error('webhook: missing or malformed X-Topper-JWS-Signature')
  }
  if (!rawBody || (typeof rawBody !== 'string' && !Buffer.isBuffer(rawBody))) {
    throw new Error('webhook: missing raw body')
  }

  const [encodedHeader, encodedSignature] = signatureHeader.split('..')
  if (!encodedHeader || !encodedSignature) {
    throw new Error('webhook: malformed detached JWS')
  }

  // base64url encode the raw body for the JWS payload segment.
  const bodyBuf = typeof rawBody === 'string' ? Buffer.from(rawBody, 'utf8') : rawBody
  const encodedPayload = bodyBuf
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '')

  const reconstructed = `${encodedHeader}.${encodedPayload}.${encodedSignature}`

  // sanity-check the algorithm before importing the key.
  const protectedHeader = decodeProtectedHeader(reconstructed)
  const alg = protectedHeader?.alg
  if (alg !== 'ES256') {
    throw new Error(`webhook: unexpected alg=${alg}, expected ES256`)
  }

  const key = await loadPublicKey()
  const { payload } = await compactVerify(reconstructed, key)

  let parsed
  try {
    parsed = JSON.parse(Buffer.from(payload).toString('utf8'))
  } catch (err) {
    throw new Error(`webhook: payload is not JSON: ${err.message}`)
  }

  if (!parsed || typeof parsed !== 'object') {
    throw new Error('webhook: payload not an object')
  }
  if (typeof parsed.name !== 'string') {
    throw new Error('webhook: missing event name')
  }

  return parsed
}

// canonical event name → status mapping.
const EVENT_TO_STATUS = {
  'order:crypto-onramp:committed': 'AWAITING_PAYMENT_FROM_USER',
  'order:crypto-onramp:charged': 'PROCESSING',
  'order:crypto-onramp:crypto-sent': 'PROCESSING',
  'order:crypto-onramp:completed': 'COMPLETED',
  'order:crypto-onramp:failed': 'FAILED',
  'order:crypto-onramp:refund:completed': 'REFUNDED',
}

// map a verified webhook into the row shape expected by db.upsertOrder.
export function webhookToOrderRow(verified) {
  const d = verified?.data || {}
  const eventName = verified.name
  const now = Date.now()

  // topper exposes the bootstrap jti so we can correlate back to the widget
  // session, but the canonical id used for upsert is the topper order id.
  const orderId = (typeof d.id === 'string' && d.id) ||
                  (typeof d.orderId === 'string' && d.orderId) ||
                  (typeof verified.id === 'string' ? verified.id : null)

  // wallet address may be nested under target depending on event shape.
  const target = d.target || d
  const source = d.source || d

  return {
    id: orderId,
    provider: 'topper',
    unverified: 0,
    partner_order_id: typeof d.partnerOrderId === 'string' ? d.partnerOrderId : null,
    customer_id: typeof d.partnerCustomerId === 'string'
      ? d.partnerCustomerId
      : (typeof target?.address === 'string' ? target.address : null),
    status: EVENT_TO_STATUS[eventName] || 'UNKNOWN',
    event_id: eventName,
    product: 'BUY',
    fiat_currency: typeof source?.asset === 'string' ? source.asset : null,
    fiat_amount: Number.isFinite(Number(source?.amount)) ? Number(source.amount) : null,
    crypto_currency: typeof target?.asset === 'string' ? target.asset : null,
    crypto_amount: Number.isFinite(Number(target?.amount)) ? Number(target.amount) : null,
    wallet_address: typeof target?.address === 'string' ? target.address : null,
    network: typeof target?.network === 'string' ? target.network : null,
    tx_hash: typeof d.transactionHash === 'string' ? d.transactionHash : null,
    created_at: d.createdAt ? new Date(d.createdAt).getTime() : now,
    updated_at: now,
    raw_payload: JSON.stringify(verified),
  }
}

// fetch a buy-side quote from topper's `/simulations` endpoint.
//
// topper expects a "bootstrap token similar to one you'd use to open the
// widget" — i.e., the same JWT shape we sign in signBootstrapToken. for
// pricing simulation we don't have a real wallet yet, so we sign a token
// WITHOUT recipientEditMode (so target.address isn't strictly required) and
// pass a placeholder zero-address. topper's server uses the source/target
// pair to compute pricing.
//
// returns canonical shape `{ cryptoAmount, fee, feeAsset, rate, raw }`.
// throws on transport / signing / parsing failures — the http handler
// turns those into 502/503.
//
// sell-side quotes are NOT implemented (same reasoning as mtpelerin).
export async function getQuote({ fiatCurrency, cryptoCurrency, network, fiatAmount, side = 'BUY' }) {
  if (!isTopperEnabled()) {
    const err = new Error('topper not configured')
    err.code = 'not_configured'
    throw err
  }
  if (side !== 'BUY') {
    const err = new Error('topper: sell-side quotes not implemented')
    err.code = 'sell_not_implemented'
    throw err
  }

  // sign a quote-only JWT. omit recipientEditMode so address is treated as
  // hint, not lock. zero-address is a placeholder — pricing only depends
  // on source/target asset+network+amount.
  const privateJwk = parseJwk(PRIVATE_JWK_RAW, 'TOPPER_PRIVATE_KEY_JWK')
  const alg = privateJwk.alg || 'ES256'
  const key = await loadPrivateKey()
  const now = Math.floor(Date.now() / 1000)
  const payload = {
    sub: WIDGET_ID,
    jti: randomUUID(),
    iat: now,
    exp: now + 3 * 60,
    source: {
      asset: fiatCurrency,
      amount: Number(fiatAmount),
      paymentMethod: { network: 'card' },
    },
    target: {
      asset: cryptoCurrency,
      network,
    },
  }
  const bootstrapToken = await new SignJWT(payload)
    .setProtectedHeader({ typ: 'JWT', alg, kid: KEY_ID })
    .sign(key)

  const apiBase = TOPPER_ENV === 'PRODUCTION'
    ? 'https://api.topperpay.com'
    : 'https://api.sandbox.topperpay.com'

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), 5000)
  try {
    const r = await fetch(`${apiBase}/simulations`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', accept: 'application/json' },
      body: JSON.stringify({ bootstrapToken }),
      signal: controller.signal,
      redirect: 'error',
    })
    if (!r.ok) {
      const detail = await r.text().catch(() => '')
      const err = new Error(`topper upstream HTTP ${r.status}: ${detail.slice(0, 200)}`)
      err.code = 'upstream_error'
      err.status = r.status
      throw err
    }
    const data = await r.json()
    return parseQuoteResponse(data, fiatCurrency)
  } finally {
    clearTimeout(timer)
  }
}

function parseQuoteResponse(data, fiatCurrency) {
  // expected shape (from openapi spec):
  //   { simulation: { origin: {amount, asset, rate}, destination: {amount, asset, rate}, fees: [{amount, asset, type}] } }
  const sim = data?.simulation || {}
  const cryptoAmount = Number(sim?.destination?.amount)
  const rate = Number(sim?.destination?.rate) || Number(sim?.origin?.rate) || null

  // sum fees in fiat asset (topper returns fees as an array possibly across
  // assets; we only sum the entries denominated in the source fiat).
  const fees = Array.isArray(sim?.fees) ? sim.fees : []
  const fee = fees
    .filter((f) => f && f.asset === fiatCurrency)
    .reduce((acc, f) => acc + (Number(f.amount) || 0), 0)

  if (!Number.isFinite(cryptoAmount) || cryptoAmount <= 0) {
    const err = new Error('topper: invalid simulation response')
    err.code = 'invalid_response'
    throw err
  }

  return {
    cryptoAmount,
    fee,
    feeAsset: fiatCurrency,
    rate,
    raw: data,
  }
}

export const TOPPER_RUNTIME = {
  env: TOPPER_ENV,
  enabled: () => isTopperEnabled(),
}
