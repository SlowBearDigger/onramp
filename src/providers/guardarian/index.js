// guardarian provider — implements the Provider interface in REDIRECT mode.
//
// unlike transak/mtpelerin/topper (iframe widgets driven by postMessage),
// guardarian hands off to its own hosted, regulated checkout page. the flow:
//   1. our backend POSTs /v1/transaction (api key server-side) and returns
//      guardarian's `redirect_url`.
//   2. getBootstrap surfaces that URL; buildWidgetUrl hands it through as the
//      "widget url" (ProviderModal renders a redirect handoff card, not an
//      iframe, because metadata.checkout === 'redirect').
//   3. the user opens the hosted page and finishes there. there is no
//      postMessage channel — getOrigins is empty and parseEvent is a no-op.
//
// keeping the api key server-side and never embedding the page is the clean
// legal posture: guardarian (the regulated party) takes the money and
// delivers the crypto; we only originate the transaction and link out.

import { API_BASE } from '../../config/api'

const guardarian = {
  getMetadata() {
    return {
      id: 'guardarian',
      name: 'Guardarian',
      displayName: 'Guardarian',
      supportedFiat: ['EUR', 'USD', 'GBP', 'CHF', 'CAD', 'AUD', 'JPY'],
      supportedCrypto: ['BTC', 'ETH', 'USDC', 'USDT', 'SOL', 'AVAX', 'MATIC', 'DOT'],
      hasWebhook: false,
      // tells useProvider + ProviderModal to use the redirect handoff path
      // instead of mounting an iframe.
      checkout: 'redirect',
    }
  },

  async getBootstrap(params) {
    // guardarian is buy-only here (fiat→crypto). the backend validates and
    // creates the transaction; we forward the canonical session params plus
    // our origin so guardarian can bounce the user back when they're done.
    const redirectURL = typeof window !== 'undefined' ? window.location.href : undefined
    const body = {
      cryptoCurrency: params.cryptoCurrency,
      cryptoNetwork: params.cryptoNetwork,
      fiatCurrency: params.fiatCurrency,
      fiatAmount: params.fiatAmount,
      walletAddress: params.walletAddress,
      partnerOrderId: params.partnerOrderId,
      redirectURL,
    }

    const r = await fetch(`${API_BASE}/api/providers/guardarian/transaction`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    })

    if (!r.ok) {
      const detail = await r.text().catch(() => '')
      throw new Error(`guardarian transaction failed: HTTP ${r.status} ${detail.slice(0, 200)}`)
    }

    const json = await r.json()
    if (!json.redirectUrl || typeof json.redirectUrl !== 'string') {
      throw new Error('guardarian transaction response missing redirectUrl')
    }
    return { redirectUrl: json.redirectUrl, id: json.id, expectedToAmount: json.expectedToAmount }
  },

  buildWidgetUrl(_params, bootstrap) {
    if (!bootstrap?.redirectUrl) {
      throw new Error('guardarian: missing redirectUrl in bootstrap')
    }
    return bootstrap.redirectUrl
  },

  // redirect provider — no embedded iframe, so no postMessage origins to trust.
  getOrigins() {
    return []
  },

  // no postMessage channel; the hosted page reports nothing back to us.
  parseEvent() {
    return { type: 'unknown' }
  },
}

export default guardarian
