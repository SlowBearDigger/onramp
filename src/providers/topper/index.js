// topper provider — implements the Provider interface.
//
// integration model (verified against docs.topperpay.com):
//   - sandbox app URL:   https://app.sandbox.topperpay.com/?bt=<bootstrap_jwt>
//   - production app URL: https://app.topperpay.com/?bt=<bootstrap_jwt>
//   - the `bt` (bootstrap token) is a JWT signed by us with our private key
//     (ES256 / RS256). validity 3 minutes. signing keys are issued during
//     onboarding and stay server-side only.
//
// we MUST NOT sign the JWT in the browser — the private key would leak. so
// getBootstrap() fetches a freshly-signed JWT from our backend each time.
//
// authoritative status comes from topper webhooks (signed with detached JWS
// using ES256 — see backend/providers/topper.js). frontend postMessage events
// are informational only; treat the webhook as source of truth.

import { API_BASE } from '../../config/api'

const TOPPER_CONFIG = {
  environment: import.meta.env.VITE_TOPPER_ENV || 'STAGING',
}

const TOPPER_ORIGINS = [
  'https://app.sandbox.topperpay.com',
  'https://app.topperpay.com',
]

function getAppBaseUrl() {
  return TOPPER_CONFIG.environment === 'PRODUCTION'
    ? 'https://app.topperpay.com'
    : 'https://app.sandbox.topperpay.com'
}

const topper = {
  getMetadata() {
    return {
      id: 'topper',
      name: 'Topper',
      displayName: 'Topper',
      // initial conservative list — refine after first sandbox flows.
      supportedFiat: ['USD', 'EUR', 'GBP'],
      supportedCrypto: ['BTC', 'ETH', 'USDC', 'USDT', 'SOL', 'MATIC'],
      hasWebhook: true,
    }
  },

  async getBootstrap(params) {
    // ask the backend to mint a fresh bootstrap JWT for this session.
    // the JWT carries the source/target/partner config (see backend
    // signBootstrapToken). the backend holds the private JWK.
    const body = {
      mode: params.mode,
      source: {
        asset: params.fiatCurrency,
        amount: params.fiatAmount,
        paymentMethod: { network: 'card' },
      },
      target: {
        asset: params.cryptoCurrency,
        network: params.cryptoNetwork,
        address: params.walletAddress,
      },
      partner: {
        displayName: 'On-Ramp',
        // continueUrl is where topper sends the user after a successful payment.
        // omit for now — caller can set redirectURL on params when needed.
      },
      partnerOrderId: params.partnerOrderId,
      partnerCustomerId: params.partnerCustomerId,
    }

    const r = await fetch(`${API_BASE}/api/providers/topper/bootstrap`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    })

    if (!r.ok) {
      const detail = await r.text().catch(() => '')
      throw new Error(`topper bootstrap failed: HTTP ${r.status} ${detail.slice(0, 200)}`)
    }

    const json = await r.json()
    if (!json.bt || typeof json.bt !== 'string') {
      throw new Error('topper bootstrap response missing bt')
    }
    return { bt: json.bt }
  },

  buildWidgetUrl(_params, bootstrap) {
    const baseUrl = getAppBaseUrl()
    const qs = new URLSearchParams({ bt: bootstrap.bt })
    return `${baseUrl}/?${qs.toString()}`
  },

  getOrigins() {
    return TOPPER_ORIGINS.slice()
  },

  parseEvent(messageEvent) {
    const data = messageEvent?.data
    if (!data || typeof data !== 'object') return { type: 'unknown' }
    // TODO: verify exact event names at docs.topperpay.com/events/crypto-onramp.
    // until then, log raw events as informational. webhook is source of truth.
    const name = typeof data.name === 'string' ? data.name
      : typeof data.event === 'string' ? data.event
      : typeof data.type === 'string' ? data.type
      : null
    if (!name) return { type: 'unknown' }
    return { type: 'unknown', rawEventId: name }
  },
}

export default topper
