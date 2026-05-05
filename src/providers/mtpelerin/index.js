// mtpelerin provider — implements the Provider interface.
//
// integration model (verified against developers.mtpelerin.com):
//   - widget URL: https://widget.mtpelerin.com/?_ctkn=<activation>&...params
//   - the activation key (_ctkn) is public — embedded in the URL.
//   - test key for localhost dev only: bec6626e-8913-497d-9835-6e6ae9edb144
//   - production keys are issued via integrate@mtpelerin.com onboarding
//     (similar to transak — not self-service). see docs/PROVIDERS.md.
//
// no webhooks — mtpelerin only emits browser postMessage events. all events
// arriving via this channel are best-effort and unverified; the backend
// stores them with unverified=1 (see backend/providers/mtpelerin.js).
//
// wallet-address locking via addr/code/hash requires an ECDSA signature of
// `MtPelerin-<code>` produced with the user's private key. that is only
// possible when the user connects via metamask / wallet-connect, which is
// out of scope for the current paste-an-address flow. without those params,
// mtpelerin's widget asks the user to confirm the address inside its UI.

const TEST_CTKN = 'bec6626e-8913-497d-9835-6e6ae9edb144'

const MTPELERIN_CONFIG = {
  ctkn: import.meta.env.VITE_MTPELERIN_CTKN || TEST_CTKN,
  environment: import.meta.env.VITE_MTPELERIN_ENV || 'STAGING',
}

const MTPELERIN_ORIGIN = 'https://widget.mtpelerin.com'

// mapping from our canonical network names to mtpelerin's network slugs.
// mtpelerin only supports the networks listed in their docs (general-parameters).
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

const mtpelerin = {
  getMetadata() {
    return {
      id: 'mtpelerin',
      name: 'MtPelerin',
      displayName: 'Mt Pelerin',
      // verified against on-ramp-parameters docs.
      supportedFiat: ['EUR', 'USD', 'GBP', 'CHF', 'AUD', 'CAD', 'CZK', 'DKK', 'HKD', 'HUF', 'JPY', 'MXN', 'NOK', 'NZD', 'PLN', 'SEK', 'SGD', 'ZAR'],
      supportedCrypto: ['BTC', 'ETH', 'USDC', 'USDT', 'AVAX', 'BNB', 'XTZ'],
      hasWebhook: false,
    }
  },

  async getBootstrap() {
    if (!MTPELERIN_CONFIG.ctkn) {
      throw new Error('mtpelerin: VITE_MTPELERIN_CTKN is not set')
    }
    return { ctkn: MTPELERIN_CONFIG.ctkn, environment: MTPELERIN_CONFIG.environment }
  },

  buildWidgetUrl(params) {
    const {
      cryptoCurrency,
      cryptoNetwork,
      fiatCurrency = 'USD',
      fiatAmount,
      mode = 'buy',
      theme,
    } = params

    const qs = new URLSearchParams({
      _ctkn: MTPELERIN_CONFIG.ctkn,
      type: 'web',
      lang: 'en',
      tab: mode === 'sell' ? 'sell' : 'buy',
      tabs: 'buy,sell',
      pm: 'card',
    })

    if (theme === 'dark') qs.set('mode', 'dark')

    // buy-tab params (bsc=source fiat, bdc=destination crypto, bsa=source amount).
    if (mode === 'buy') {
      qs.set('bsc', fiatCurrency)
      qs.set('bdc', cryptoCurrency)
      if (Number.isFinite(fiatAmount)) qs.set('bsa', String(fiatAmount))
    } else {
      // sell-tab params (ssc=source crypto, sdc=destination fiat, ssa=source amount).
      qs.set('ssc', cryptoCurrency)
      qs.set('sdc', fiatCurrency)
      if (Number.isFinite(fiatAmount)) qs.set('sda', String(fiatAmount))
    }

    if (cryptoNetwork) qs.set('dnet', toMtPelerinNetwork(cryptoNetwork))

    // TODO: wallet-address locking via addr+code+hash requires user's private
    // key signature. revisit when wallet-connect is added.

    return `${MTPELERIN_ORIGIN}/?${qs.toString()}`
  },

  getOrigins() {
    return [MTPELERIN_ORIGIN]
  },

  parseEvent(messageEvent) {
    const data = messageEvent?.data
    if (!data || typeof data !== 'object') return { type: 'unknown' }
    const eventType = typeof data.type === 'string' ? data.type : null
    if (!eventType) return { type: 'unknown' }

    switch (eventType) {
      case 'orderCreated':
        // payload shape varies by buy/sell/swap. we only flatten the fields
        // we care about; let the rest pass through for debugging.
        return {
          type: 'created',
          rawEventId: 'orderCreated',
          orderData: parseOrderData(data.data),
        }
      case 'paymentSubmitted':
        // mtpelerin emits this when the user completes payment inside the widget.
        // there's no signed callback to verify this — backend stores with
        // unverified=1. treat as best-effort success.
        return {
          type: 'success-unverified',
          rawEventId: 'paymentSubmitted',
          orderData: parsePaymentSubmitted(data.data),
        }
      default:
        return { type: 'unknown', rawEventId: eventType }
    }
  },
}

function parseOrderData(d) {
  if (!d || typeof d !== 'object') return {}
  return {
    orderId: d.id || null,
    fiatCurrency: d.sourceCurrency || d.fiatCurrency || null,
    fiatAmount: d.sourceAmount || d.fiatAmount || null,
    cryptoCurrency: d.destinationCurrency || d.cryptoCurrency || null,
    cryptoAmount: d.destinationAmount || d.cryptoAmount || null,
    walletAddress: d.address || d.walletAddress || null,
    network: d.network || null,
    status: d.status || 'CREATED',
  }
}

function parsePaymentSubmitted(d) {
  if (!d || typeof d !== 'object') return {}
  return {
    orderId: d.paymentId || null,
    paymentType: d.paymentType || null,
    status: 'PAYMENT_SUBMITTED_UNVERIFIED',
  }
}

export default mtpelerin
