// guardarian provider (backend) — quote integration.
//
// guardarian is the client-approved backup ramp (topper unresponsive).
// auth: x-api-key header, server-side only. estimate endpoint verified
// empirically 2026-06-09 against api-payments.guardarian.com:
//   GET /v1/estimate?from_currency=EUR&from_amount=100&to_currency=BTC
//   → { value, service_fees: [{amount, currency, percentage}],
//       estimated_exchange_rate, converted_amount, network_fee }
// both directions work (fiat→crypto = BUY, crypto→fiat = SELL).
//
// checkout = REDIRECT (client decision 2026-06-14). createTransaction below
// POSTs /v1/transaction (x-api-key, server-side) and returns guardarian's
// hosted `redirect_url` (https://payments.guardarian.com/.../checkout?tid=..).
// the user finishes on guardarian's own regulated page — we never embed it,
// which keeps us clear of payment-facilitator framing. guardarian rate-limits
// transaction creation to ~1 request/minute per IP; never call it from a
// quote loop. no webhooks documented → order status would need polling
// GET /v1/transaction/{id} (not wired yet). see docs/PROVIDERS.md.

const GUARDARIAN_API_BASE = 'https://api-payments.guardarian.com/v1'

// canonical-network → guardarian network code. guardarian uses ticker-ish
// codes (ETH, BTC, SOL, ...). unknown networks are omitted from the query —
// guardarian then defaults to the asset's native network.
const NETWORK_MAP = {
  ethereum: 'ETH',
  bitcoin: 'BTC',
  solana: 'SOL',
  bsc: 'BSC',
  polygon: 'MATIC',
  avalanche: 'AVAX',
  base: 'BASE',
  arbitrum: 'ARBITRUM',
  optimism: 'OPTIMISM',
}

export function toGuardarianNetwork(network) {
  if (!network) return null
  return NETWORK_MAP[String(network).toLowerCase().trim()] || null
}

export function isGuardarianEnabled() {
  return Boolean(process.env.GUARDARIAN_API_KEY)
}

// fetch a quote. side BUY: fiat→crypto (fiatAmount in fiat units).
// side SELL: crypto→fiat (cryptoAmount in crypto units).
// returns the canonical quote shape used by all provider quote endpoints:
//   { cryptoAmount, fee, feeAsset, rate, raw }
// (for SELL, cryptoAmount carries the fiat amount received — same
// convention as the topper sell path.)
export async function getQuote({ fiatCurrency, cryptoCurrency, network, fiatAmount, cryptoAmount, side = 'BUY' }) {
  const apiKey = process.env.GUARDARIAN_API_KEY
  if (!apiKey) {
    const err = new Error('guardarian: GUARDARIAN_API_KEY not set')
    err.code = 'not_configured'
    throw err
  }

  const qs = new URLSearchParams()
  const net = toGuardarianNetwork(network)
  if (side === 'SELL') {
    // sell-side estimates need the amount in CRYPTO units. the public quote
    // endpoint only carries fiatAmount, so reaching here without an explicit
    // cryptoAmount would silently misquote (e.g. "500 BTC" instead of
    // "$500 worth") — refuse instead.
    if (!Number.isFinite(Number(cryptoAmount)) || Number(cryptoAmount) <= 0) {
      const err = new Error('guardarian: sell quotes require cryptoAmount')
      err.code = 'sell_not_implemented'
      throw err
    }
    qs.set('from_currency', cryptoCurrency)
    qs.set('from_amount', String(Number(cryptoAmount)))
    qs.set('to_currency', fiatCurrency)
    if (net) qs.set('from_network', net)
  } else {
    qs.set('from_currency', fiatCurrency)
    qs.set('from_amount', String(Number(fiatAmount)))
    qs.set('to_currency', cryptoCurrency)
    if (net) qs.set('to_network', net)
  }

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), 4000)
  try {
    const r = await fetch(`${GUARDARIAN_API_BASE}/estimate?${qs.toString()}`, {
      headers: {
        accept: 'application/json',
        'x-api-key': apiKey,
        'user-agent': 'onramp-backend/1.0 (+https://github.com/SlowBearDigger/onramp)',
      },
      signal: controller.signal,
      redirect: 'error',
    })
    if (!r.ok) {
      const detail = await r.text().catch(() => '')
      const err = new Error(`guardarian upstream HTTP ${r.status}: ${detail.slice(0, 200)}`)
      err.code = r.status === 401 || r.status === 403 ? 'not_configured' : 'upstream_error'
      err.status = r.status
      throw err
    }
    const data = await r.json()
    return parseEstimate(data)
  } finally {
    clearTimeout(timer)
  }
}

// create a BUY (fiat→crypto) transaction and return guardarian's hosted
// checkout URL. payout_address is the recipient wallet (where the crypto
// lands). redirects = { successful, cancelled, failed } — guardarian sends
// the user back to these after the hosted flow. all inputs are pre-validated
// by the route; we still String()/whitelist here as defence in depth.
export async function createTransaction({ fiatCurrency, cryptoCurrency, network, fiatAmount, walletAddress, partnerOrderId, redirects }) {
  const apiKey = process.env.GUARDARIAN_API_KEY
  if (!apiKey) {
    const err = new Error('guardarian: GUARDARIAN_API_KEY not set')
    err.code = 'not_configured'
    throw err
  }

  const net = toGuardarianNetwork(network)
  const body = {
    from_amount: String(Number(fiatAmount)),
    from_currency: fiatCurrency,
    to_currency: cryptoCurrency,
    ...(net ? { to_network: net } : {}),
    payout_address: walletAddress,
    // payout_info mirrors payout_address + asks guardarian to pre-fill it so
    // the payer doesn't retype the address on the hosted page.
    payout_info: { payout_address: walletAddress, skip_choose_payout_address: true },
    ...(redirects ? { redirects } : {}),
    ...(partnerOrderId ? { external_partner_link_id: String(partnerOrderId) } : {}),
  }

  // create is slower than estimate and guardarian throttles it hard — give it
  // a 12s budget instead of the quote path's 4s.
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), 12_000)
  try {
    const r = await fetch(`${GUARDARIAN_API_BASE}/transaction`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        accept: 'application/json',
        'x-api-key': apiKey,
        'user-agent': 'onramp-backend/1.0 (+https://github.com/SlowBearDigger/onramp)',
      },
      body: JSON.stringify(body),
      signal: controller.signal,
      redirect: 'error',
    })
    if (!r.ok) {
      const detail = await r.text().catch(() => '')
      const err = new Error(`guardarian transaction HTTP ${r.status}: ${detail.slice(0, 200)}`)
      // 429 = guardarian's per-IP create throttle; surface it distinctly so
      // the UI can say "try again in a moment" rather than a generic failure.
      err.code = r.status === 401 || r.status === 403
        ? 'not_configured'
        : r.status === 429
          ? 'rate_limited'
          : 'upstream_error'
      err.status = r.status
      throw err
    }
    const data = await r.json()
    const redirectUrl = typeof data?.redirect_url === 'string' && data.redirect_url
      ? data.redirect_url
      : (data?.id ? `https://payments.guardarian.com/checkout?tid=${data.id}` : null)
    if (!redirectUrl) {
      const err = new Error('guardarian: transaction response missing redirect_url')
      err.code = 'invalid_response'
      throw err
    }
    return {
      redirectUrl,
      id: data?.id ?? null,
      expectedToAmount: data?.expected_to_amount ?? null,
    }
  } finally {
    clearTimeout(timer)
  }
}

function parseEstimate(data) {
  const value = Number(data?.value)
  if (!Number.isFinite(value) || value <= 0) {
    const err = new Error('guardarian: invalid value in estimate response')
    err.code = 'invalid_response'
    throw err
  }

  // service_fees come itemised in source-currency units; sum them. the
  // network fee is denominated in the destination asset, so it's already
  // reflected in `value` — surfacing it as a fiat fee would double-count.
  let fee = 0
  let feeAsset = null
  for (const f of Array.isArray(data?.service_fees) ? data.service_fees : []) {
    const amount = Number(f?.amount)
    if (Number.isFinite(amount)) {
      fee += amount
      feeAsset = feeAsset || f?.currency || null
    }
  }

  const rate = Number(data?.estimated_exchange_rate)

  return {
    cryptoAmount: value,
    fee,
    feeAsset,
    rate: Number.isFinite(rate) ? rate : null,
    raw: data,
  }
}
