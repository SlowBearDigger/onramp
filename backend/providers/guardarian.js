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
// checkout flow (POST /v1/transaction → redirect_url) is deliberately NOT
// wired yet: creating transactions has side effects in guardarian's
// system, and whether we embed (iframe) or redirect is a product call
// pending the client's decision on guardarian's role (pay backup vs 4th
// comparison provider). until then this module is quote-only and the
// provider is NOT registered in the frontend registry — no dead-click
// cards. see docs/PROVIDERS.md.

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
