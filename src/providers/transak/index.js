// transak provider — implements the Provider interface.
//
// integration model (signed widget URL pattern, current 2025 standard):
//   1. our backend signs a one-shot widget URL via POST /api/v2/auth/session
//      with the partner access token (server-only credential).
//   2. backend returns the URL; we open the iframe at it.
//   3. URL is single-use and expires after 5 minutes — we always mint a
//      fresh one per startOrder call.
//
// security wins vs the legacy `?apiKey=...&...` URL pattern:
//   - the public api key never reaches the browser bundle.
//   - widget params are baked into a session token transak signs; clients
//     can't tamper with walletAddress or amount mid-flight.
//   - rotating credentials is a backend-only operation.

const TRANSAK_CONFIG = {
  // VITE_TRANSAK_ENV is still used so we know which iframe origin to trust
  // for postMessage validation.
  environment: import.meta.env.VITE_TRANSAK_ENV || 'STAGING',
}

const API_BASE = import.meta.env.VITE_API_BASE_URL || 'http://localhost:3001'

// origins the widget can postMessage from. used for strict validation in
// useProvider — any message from another origin is dropped.
const TRANSAK_ORIGINS = [
  'https://global-stg.transak.com',
  'https://global.transak.com',
  'https://staging-global.transak.com',
]

// transak postMessage event ids we care about.
const TRANSAK_EVENTS = {
  WIDGET_OPEN: 'TRANSAK_WIDGET_OPEN',
  WIDGET_CLOSE: 'TRANSAK_WIDGET_CLOSE',
  WIDGET_INITIALISED: 'TRANSAK_WIDGET_INITIALISED',
  ORDER_CREATED: 'TRANSAK_ORDER_CREATED',
  ORDER_SUCCESSFUL: 'TRANSAK_ORDER_SUCCESSFUL',
  ORDER_FAILED: 'TRANSAK_ORDER_FAILED',
  ORDER_CANCELLED: 'TRANSAK_ORDER_CANCELLED',
}

// our internal network ids (CRYPTOS[].network) → transak network ids.
// transak rejects unknown ids with "Invalid network id", so anything not
// in this map passes through unchanged (EVM ids and solana already match).
// verified empirically against the staging pricing API (2026-06-09):
// BTC/XRP/ADA/DOGE all live on transak's "mainnet"; DOT quotes are not
// available on staging at all — it stays mapped so the widget can still
// try, and the quote card degrades to "unavailable".
const TRANSAK_NETWORK_MAP = {
  bitcoin: 'mainnet',
  ripple: 'mainnet',
  cardano: 'mainnet',
  dogecoin: 'mainnet',
  polkadot: 'mainnet',
}

export function toTransakNetwork(network) {
  return TRANSAK_NETWORK_MAP[network] || network
}

// normalise a transak event payload into the canonical order shape.
// transak nests actual order fields inside .status (legacy) or directly (newer
// events) — this flattens both shapes.
function parseOrderData(eventData) {
  const data = eventData?.status || eventData || {}
  return {
    orderId: data?.id || data?.orderId || null,
    partnerOrderId: data?.partnerOrderId || null,
    partnerCustomerId: data?.partnerCustomerId || null,
    status: data?.status || null,
    fiatCurrency: data?.fiatCurrency || null,
    fiatAmount: data?.fiatAmount || null,
    cryptoCurrency: data?.cryptoCurrency || null,
    cryptoAmount: data?.cryptoAmount || null,
    walletAddress: data?.walletAddress || null,
    network: data?.network || null,
    txHash: data?.transactionHash || data?.transactionLink || null,
    createdAt: data?.createdAt || null,
  }
}

const transak = {
  getMetadata() {
    return {
      id: 'transak',
      name: 'Transak',
      displayName: 'Transak',
      supportedFiat: ['USD', 'EUR', 'GBP', 'AUD', 'CAD', 'CHF', 'JPY', 'SGD'],
      supportedCrypto: ['BTC', 'ETH', 'USDC', 'USDT', 'SOL', 'AVAX', 'MATIC', 'DOGE', 'DOT'],
      hasWebhook: true,
    }
  },

  async getBootstrap(params) {
    // backend signs the widget URL with the partner access token. we forward
    // the canonical session params and trust the response. the URL we get
    // back is the iframe src; buildWidgetUrl just hands it through.
    const body = {
      mode: params.mode,
      cryptoCurrency: params.cryptoCurrency,
      cryptoNetwork: toTransakNetwork(params.cryptoNetwork),
      fiatCurrency: params.fiatCurrency,
      fiatAmount: params.fiatAmount,
      cryptoAmount: params.cryptoAmount,
      walletAddress: params.walletAddress,
      partnerOrderId: params.partnerOrderId,
      partnerCustomerId: params.partnerCustomerId,
      email: params.email,
      themeColor: params.themeColor,
      theme: params.theme,
      redirectURL: params.redirectURL,
    }

    const r = await fetch(`${API_BASE}/api/providers/transak/widget-url`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    })

    if (!r.ok) {
      const detail = await r.text().catch(() => '')
      throw new Error(`transak widget-url failed: HTTP ${r.status} ${detail.slice(0, 200)}`)
    }

    const json = await r.json()
    if (!json.widgetUrl || typeof json.widgetUrl !== 'string') {
      throw new Error('transak widget-url response missing widgetUrl')
    }
    return { widgetUrl: json.widgetUrl, expiresAt: json.expiresAt }
  },

  buildWidgetUrl(_params, bootstrap) {
    // the URL is fully formed by the backend (transak's session endpoint
    // returns a complete URL with embedded session token). nothing to do
    // here except hand it through.
    if (!bootstrap?.widgetUrl) {
      throw new Error('transak: missing widgetUrl in bootstrap')
    }
    return bootstrap.widgetUrl
  },

  getOrigins() {
    return TRANSAK_ORIGINS.slice()
  },

  parseEvent(messageEvent) {
    const data = messageEvent?.data
    if (!data || typeof data !== 'object') return { type: 'unknown' }
    const eventId = typeof data.event_id === 'string' ? data.event_id : null
    if (!eventId) return { type: 'unknown' }

    switch (eventId) {
      case TRANSAK_EVENTS.WIDGET_INITIALISED:
      case TRANSAK_EVENTS.WIDGET_OPEN:
        return { type: 'open', rawEventId: eventId }
      case TRANSAK_EVENTS.ORDER_CREATED:
        return { type: 'created', orderData: parseOrderData(data.data), rawEventId: eventId }
      case TRANSAK_EVENTS.ORDER_SUCCESSFUL:
        return { type: 'success', orderData: parseOrderData(data.data), rawEventId: eventId }
      case TRANSAK_EVENTS.ORDER_FAILED:
        return { type: 'failed', orderData: parseOrderData(data.data), rawEventId: eventId }
      case TRANSAK_EVENTS.ORDER_CANCELLED:
        return { type: 'cancelled', orderData: parseOrderData(data.data), rawEventId: eventId }
      case TRANSAK_EVENTS.WIDGET_CLOSE:
        return { type: 'closed', rawEventId: eventId }
      default:
        return { type: 'unknown', rawEventId: eventId }
    }
  },
}

export default transak

// legacy named exports — useTransak.js still references some of these via
// the backwards-compat shim. once useTransak is removed (post full migration
// to useProvider), drop these.
export { TRANSAK_ORIGINS, TRANSAK_EVENTS, parseOrderData }
export const isTransakOrigin = (origin) => TRANSAK_ORIGINS.includes(origin)
