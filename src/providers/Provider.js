// abstract on-ramp provider interface.
//
// every concrete provider (transak, mtpelerin, topper, ...) lives under
// src/providers/<id>/index.js and exposes the same shape so the registry
// (src/providers/index.js) can treat them interchangeably.
//
// the SwapWidget reads metadata to render comparison cards; useProvider
// reads bootstrap + buildWidgetUrl + parseEvent to drive the iframe lifecycle.

/**
 * @typedef {Object} ProviderMetadata
 * @property {string} id            short id, e.g. 'transak' (used in URLs, db rows)
 * @property {string} name          marketing name, e.g. 'Transak'
 * @property {string} displayName   user-facing label (may differ from name)
 * @property {string} [logoUrl]     optional logo path
 * @property {string[]} supportedFiat   ISO 4217 codes
 * @property {string[]} supportedCrypto symbols (BTC, ETH, ...)
 * @property {boolean} hasWebhook   true if backend receives signed webhooks (authoritative)
 *                                  false if we rely on frontend events (best-effort, unverified)
 */

/**
 * @typedef {Object} StartParams
 * @property {'buy'|'sell'} mode
 * @property {string} cryptoCurrency       symbol (BTC, ETH, USDC, ...)
 * @property {string} cryptoNetwork        network slug (mainnet, base_mainnet, polygon, ...)
 * @property {string} fiatCurrency         ISO 4217
 * @property {number} fiatAmount
 * @property {string} walletAddress
 * @property {string} partnerOrderId       UUID we generate
 * @property {string} partnerCustomerId    typically the wallet address
 * @property {string} [email]
 * @property {'light'|'dark'} [theme]
 * @property {string} [themeColor]         hex without '#'
 * @property {string} [redirectURL]
 */

/**
 * @typedef {Object} CanonicalEvent
 * @property {'open'|'created'|'success'|'success-unverified'|'failed'|'cancelled'|'closed'|'unknown'} type
 * @property {Object} [orderData]   normalized order shape (id, status, amounts, ...)
 * @property {string} [rawEventId]  original provider event name, for debugging
 */

/**
 * @typedef {Object} Provider
 * @property {() => ProviderMetadata} getMetadata
 *   returns static info used for UI rendering and analytics filters.
 *
 * @property {(params: StartParams) => Promise<*>} getBootstrap
 *   resolves the per-session bootstrap value. for Transak/MtPelerin this is
 *   just the public api key from env; for Topper this hits the backend to
 *   get a freshly signed JWT (3-min TTL).
 *
 * @property {(params: StartParams, bootstrap: *) => string} buildWidgetUrl
 *   sync URL constructor. all params are pre-validated by the caller.
 *
 * @property {() => string[]} getOrigins
 *   trusted iframe origins for postMessage validation. useProvider drops any
 *   message whose event.origin isn't in this list.
 *
 * @property {(messageEvent: MessageEvent) => CanonicalEvent} parseEvent
 *   normalize a provider-specific postMessage into the canonical shape.
 *   return { type: 'unknown' } for events we don't care about — never throw.
 */

// runtime guard used by tests and the registry to fail fast on bad provider
// modules. checks shape only; doesn't validate behavior.
export function assertIsProvider(p, label = 'provider') {
  if (!p || typeof p !== 'object') {
    throw new Error(`${label}: not an object`)
  }
  for (const fn of ['getMetadata', 'getBootstrap', 'buildWidgetUrl', 'getOrigins', 'parseEvent']) {
    if (typeof p[fn] !== 'function') {
      throw new Error(`${label}: missing function ${fn}`)
    }
  }
  const meta = p.getMetadata()
  for (const k of ['id', 'name', 'displayName', 'supportedFiat', 'supportedCrypto', 'hasWebhook']) {
    if (meta[k] === undefined) throw new Error(`${label}: metadata missing ${k}`)
  }
}
