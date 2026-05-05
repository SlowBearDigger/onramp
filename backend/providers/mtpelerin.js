import { randomUUID } from 'node:crypto'

// mtpelerin provider — frontend-event ingest + public quote proxy.
//
// mtpelerin does not expose webhooks. the only signal that a payment has
// been submitted is the in-browser postMessage event paymentSubmitted.
// the frontend forwards that event to /api/providers/mtpelerin/event and
// we persist it with unverified=1 so the admin dashboard knows these rows
// are not webhook-verified.
//
// the public pricing endpoint (https://api.mtpelerin.com/currency_rates/convert)
// is unauthenticated — see getQuote() at the bottom of this file.

const MTPELERIN_API_BASE = 'https://api.mtpelerin.com'

// canonical-network → mtpelerin-slug. keep in sync with src/providers/mtpelerin/index.js
// (frontend uses the same map for widget URL construction).
const NETWORK_MAP = {
  ethereum: 'mainnet',
  mainnet: 'mainnet',
  polygon: 'matic_mainnet',
  matic: 'matic_mainnet',
  bsc: 'bsc_mainnet',
  base: 'base_mainnet',
  arbitrum: 'arbitrum_mainnet',
  optimism: 'optimism_mainnet',
  avalanche: 'avalanche_mainnet',
  bitcoin: 'bitcoin_mainnet',
  tezos: 'tezos_mainnet',
  zksync: 'zksync_mainnet',
  celo: 'celo_mainnet',
  lightning: 'lightning_mainnet',
  rsk: 'rsk_mainnet',
  sonic: 'sonic_mainnet',
  xdai: 'xdai_mainnet',
}

function toMtPelerinNetwork(network) {
  if (!network) return 'mainnet'
  const slug = String(network).toLowerCase().trim()
  return NETWORK_MAP[slug] || slug
}

const FIELD_MAX_LEN = 96

function isString(v, max = FIELD_MAX_LEN) {
  return typeof v === 'string' && v.length > 0 && v.length <= max
}

// validate the frontend payload conservatively. anything fishy → throw.
// the http handler turns the throw into 400.
export function validateFrontendEvent(body) {
  if (!body || typeof body !== 'object') {
    throw new Error('mtpelerin event: body missing')
  }

  const errors = []
  if (body.eventType !== 'paymentSubmitted' && body.eventType !== 'orderCreated') {
    errors.push('eventType must be paymentSubmitted or orderCreated')
  }
  if (body.partnerOrderId && !isString(body.partnerOrderId)) errors.push('partnerOrderId')
  if (body.walletAddress && !isString(body.walletAddress)) errors.push('walletAddress')
  if (body.fiatCurrency && (!isString(body.fiatCurrency, 8) || !/^[A-Z0-9]{2,8}$/.test(body.fiatCurrency))) {
    errors.push('fiatCurrency')
  }
  if (body.cryptoCurrency && (!isString(body.cryptoCurrency, 12) || !/^[A-Z0-9]{2,12}$/.test(body.cryptoCurrency))) {
    errors.push('cryptoCurrency')
  }
  if (body.network && !isString(body.network, 32)) errors.push('network')
  if (body.fiatAmount != null) {
    const n = Number(body.fiatAmount)
    if (!Number.isFinite(n) || n < 0 || n > 1_000_000) errors.push('fiatAmount')
  }
  if (body.cryptoAmount != null) {
    const n = Number(body.cryptoAmount)
    if (!Number.isFinite(n) || n < 0) errors.push('cryptoAmount')
  }

  if (errors.length) {
    throw new Error(`mtpelerin event: invalid fields: ${errors.join(',')}`)
  }
}

// map a validated frontend event to the canonical row shape.
// id falls back to a random uuid so we always have a primary key — the
// real mtpelerin order id comes through later if at all.
export function frontendEventToOrderRow(body) {
  const now = Date.now()
  const id = (isString(body.orderId) && body.orderId) ||
             (isString(body.partnerOrderId) && body.partnerOrderId) ||
             `mtpelerin-${randomUUID()}`

  const status = body.eventType === 'paymentSubmitted'
    ? 'PAYMENT_SUBMITTED_UNVERIFIED'
    : 'CREATED_UNVERIFIED'

  return {
    id,
    provider: 'mtpelerin',
    unverified: 1,
    partner_order_id: isString(body.partnerOrderId) ? body.partnerOrderId : null,
    customer_id: isString(body.partnerCustomerId)
      ? body.partnerCustomerId
      : (isString(body.walletAddress) ? body.walletAddress : null),
    status,
    event_id: body.eventType,
    product: body.mode === 'sell' ? 'SELL' : 'BUY',
    fiat_currency: isString(body.fiatCurrency, 8) ? body.fiatCurrency : null,
    fiat_amount: Number.isFinite(Number(body.fiatAmount)) ? Number(body.fiatAmount) : null,
    crypto_currency: isString(body.cryptoCurrency, 12) ? body.cryptoCurrency : null,
    crypto_amount: Number.isFinite(Number(body.cryptoAmount)) ? Number(body.cryptoAmount) : null,
    wallet_address: isString(body.walletAddress) ? body.walletAddress : null,
    network: isString(body.network, 32) ? body.network : null,
    tx_hash: null,
    created_at: now,
    updated_at: now,
    raw_payload: JSON.stringify(body),
  }
}

// fetch a buy-side quote from mtpelerin's public pricing endpoint.
// returns the canonical shape `{ cryptoAmount, fee, rate, raw }` or throws.
//
// notes:
//   - mtpelerin's API has no auth. we still rate-limit our own proxy.
//   - destAmount is "net final amount, includes all applicable fees" (per docs).
//   - sell-side quotes are NOT implemented — the API expects sourceAmount of
//     the SOURCE currency (crypto for sell), but our frontend currently passes
//     fiat-equivalent amounts in both directions. revisit when sell flow gains
//     a separate cryptoAmount param.
export async function getQuote({ fiatCurrency, cryptoCurrency, network, fiatAmount, side = 'BUY' }) {
  if (side !== 'BUY') {
    const err = new Error('mtpelerin: sell-side quotes not implemented')
    err.code = 'sell_not_implemented'
    throw err
  }

  const body = {
    sourceCurrency: fiatCurrency,
    sourceNetwork: 'fiat',
    destCurrency: cryptoCurrency,
    destNetwork: toMtPelerinNetwork(network),
    sourceAmount: Number(fiatAmount),
    isCardPayment: true,
  }

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), 4000)
  try {
    const r = await fetch(`${MTPELERIN_API_BASE}/currency_rates/convert`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', accept: 'application/json' },
      body: JSON.stringify(body),
      signal: controller.signal,
      redirect: 'error',
    })
    if (!r.ok) {
      const detail = await r.text().catch(() => '')
      const err = new Error(`mtpelerin upstream HTTP ${r.status}: ${detail.slice(0, 200)}`)
      err.code = 'upstream_error'
      err.status = r.status
      throw err
    }
    const data = await r.json()
    return parseQuoteResponse(data, body)
  } finally {
    clearTimeout(timer)
  }
}

function parseQuoteResponse(data, request) {
  // expected shape (verified from docs):
  //   { sourceCurrency, destCurrency, sourceAmount, destAmount,
  //     fees: { networkFee: "2.26", fixFee: 0 }, sourceNetwork, destNetwork }
  const cryptoAmount = Number(data?.destAmount)
  const sourceAmount = Number(data?.sourceAmount ?? request.sourceAmount)
  const networkFee = Number(data?.fees?.networkFee) || 0
  const fixFee = Number(data?.fees?.fixFee) || 0
  const fee = networkFee + fixFee

  if (!Number.isFinite(cryptoAmount) || cryptoAmount <= 0) {
    const err = new Error('mtpelerin: invalid destAmount in response')
    err.code = 'invalid_response'
    throw err
  }

  // implied rate: how many fiat per 1 crypto.
  const rate = cryptoAmount > 0 ? sourceAmount / cryptoAmount : null

  return {
    cryptoAmount,
    fee,
    feeAsset: data?.sourceCurrency || request.sourceCurrency,
    rate,
    raw: data,
  }
}
