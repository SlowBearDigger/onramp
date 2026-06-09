import { getValidAccessToken } from './transak-token.js'

// transak partner orders API — powers the in-app "your Transak history"
// view without sending the user to transak.com.
//
// GET /partners/api/v2/orders, authed with the partner access token (minted
// and cached by transak-token.js from the long-lived api key + secret).
// we use it as a reconciliation source on top of webhooks:
//   - webhooks are the realtime path (already wired)
//   - this sync backfills anything missed (downtime, webhook misconfig,
//     orders placed before webhooks were enabled) and serves as the
//     source of truth for current status on demand.
//
// known upstream limitation: filter[walletAddress] returns BUY orders
// only (documented). SELL orders still arrive via webhooks, so the
// merged local view stays complete for users who transact through us.

const PARTNER_API_STAGING = 'https://api-stg.transak.com/partners/api/v2'
const PARTNER_API_PROD = 'https://api.transak.com/partners/api/v2'

function partnerApiBase() {
  return (process.env.TRANSAK_ENV || 'STAGING').toUpperCase() === 'PRODUCTION'
    ? PARTNER_API_PROD
    : PARTNER_API_STAGING
}

// fetch orders for one wallet. returns the raw order array (possibly empty).
// throws with .code on auth/upstream failures — caller maps to HTTP status.
export async function fetchPartnerOrders({ walletAddress, limit = 50 }) {
  const token = await getValidAccessToken()

  const qs = new URLSearchParams()
  qs.set('limit', String(Math.min(Math.max(1, limit), 100)))
  qs.set('filter[walletAddress]', walletAddress)
  // the partner api defaults filter[status] to COMPLETED and documents no
  // "all" value. that default is exactly the backfill case this sync is
  // for — finished orders we may have missed. in-flight states keep
  // arriving in realtime through webhooks, so the merged view stays live.
  qs.set('filter[sortOrder]', 'desc')

  const ac = new AbortController()
  const timer = setTimeout(() => ac.abort(), 8000)
  try {
    const r = await fetch(`${partnerApiBase()}/orders?${qs.toString()}`, {
      headers: {
        accept: 'application/json',
        'access-token': token,
      },
      signal: ac.signal,
      redirect: 'error',
    })
    if (!r.ok) {
      const detail = await r.text().catch(() => '')
      const err = new Error(`transak partner orders HTTP ${r.status}: ${detail.slice(0, 200)}`)
      err.code = r.status === 401 ? 'auth_failed' : 'upstream_error'
      err.status = r.status
      throw err
    }
    const json = await r.json()
    const data = json?.data
    return Array.isArray(data) ? data : []
  } finally {
    clearTimeout(timer)
  }
}

// map one partner-api order object to the row shape db.upsertOrder expects.
// returns null when the order has no usable id — caller skips those.
// these rows are server-to-server authenticated, so unverified=0; the
// upsert's CASE guard means they can also promote a previously-unverified
// frontend-reported row to verified.
// Number(null) is 0 — guard absent values so a missing amount stays null
// in the row instead of masquerading as a real zero.
function numOrNull(v) {
  if (v === null || v === undefined || v === '') return null
  const n = Number(v)
  return Number.isFinite(n) ? n : null
}

export function partnerOrderToRow(order) {
  const d = order || {}
  const id = typeof d.id === 'string' && d.id
    ? d.id
    : (typeof d._id === 'string' && d._id ? d._id : null)
  if (!id) return null

  const createdAt = d.createdAt ? Date.parse(d.createdAt) : NaN
  const updatedAt = d.completedAt
    ? Date.parse(d.completedAt)
    : (d.updatedAt ? Date.parse(d.updatedAt) : NaN)

  return {
    id,
    provider: 'transak',
    unverified: 0,
    partner_order_id: typeof d.partnerOrderId === 'string' ? d.partnerOrderId : null,
    customer_id: typeof d.partnerCustomerId === 'string'
      ? d.partnerCustomerId
      : (typeof d.walletAddress === 'string' ? d.walletAddress : null),
    status: typeof d.status === 'string' ? d.status : 'UNKNOWN',
    event_id: 'PARTNER_API_SYNC',
    product: d.isBuyOrSell === 'SELL' ? 'SELL' : 'BUY',
    fiat_currency: typeof d.fiatCurrency === 'string' ? d.fiatCurrency : null,
    fiat_amount: numOrNull(d.fiatAmount),
    crypto_currency: typeof d.cryptoCurrency === 'string' ? d.cryptoCurrency : null,
    crypto_amount: numOrNull(d.cryptoAmount),
    wallet_address: typeof d.walletAddress === 'string' ? d.walletAddress : null,
    network: typeof d.network === 'string' ? d.network : null,
    tx_hash: typeof d.transactionHash === 'string' ? d.transactionHash : null,
    created_at: Number.isFinite(createdAt) ? createdAt : Date.now(),
    updated_at: Number.isFinite(updatedAt) ? updatedAt : Date.now(),
    raw_payload: JSON.stringify({ source: 'partner-api', order: d }),
  }
}
