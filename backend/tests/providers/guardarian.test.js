import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { getQuote, toGuardarianNetwork, isGuardarianEnabled, createTransaction } from '../../providers/guardarian.js'

// real response shape captured from the staging probe (2026-06-09).
const SAMPLE_ESTIMATE = {
  to_currency: 'BTC',
  from_currency: 'EUR',
  to_network: 'BTC',
  value: '0.0018112',
  service_fees: [{ amount: '0.5', currency: 'EUR', name: 'Service fee', percentage: '0.5%' }],
  estimated_exchange_rate: '0.00001812',
  converted_amount: { amount: '99.5', currency: 'EUR' },
  network_fee: { currency: 'BTC', amount: '0.0000035' },
}

beforeEach(() => {
  vi.stubEnv('GUARDARIAN_API_KEY', 'test-key')
  vi.stubGlobal('fetch', vi.fn())
})
afterEach(() => {
  vi.unstubAllEnvs()
  vi.unstubAllGlobals()
})

describe('toGuardarianNetwork', () => {
  it('maps canonical networks to guardarian codes', () => {
    expect(toGuardarianNetwork('ethereum')).toBe('ETH')
    expect(toGuardarianNetwork('bitcoin')).toBe('BTC')
    expect(toGuardarianNetwork('solana')).toBe('SOL')
  })
  it('returns null for unknown networks (omitted from the query)', () => {
    expect(toGuardarianNetwork('cardano')).toBeNull()
    expect(toGuardarianNetwork(null)).toBeNull()
  })
})

// real transaction-create response shape captured from the production probe
// (2026-06-14) — guardarian returns a complete hosted redirect_url.
const SAMPLE_TX = {
  id: '5808727624',
  status: 'new',
  redirect_url: 'https://payments.guardarian.com/en/checkout?tid=5808727624',
  expected_to_amount: '0.0017399295410615364',
}

describe('createTransaction — BUY', () => {
  const baseArgs = {
    fiatCurrency: 'EUR',
    cryptoCurrency: 'BTC',
    network: 'bitcoin',
    fiatAmount: 100,
    walletAddress: 'bc1qar0srrr7xfkvy5l643lydnw9re59gtzzwf5mdq',
    partnerOrderId: 'abc-123-def-456',
  }

  it('returns the hosted redirect url and attaches the payout address', async () => {
    fetch.mockResolvedValueOnce({ ok: true, json: async () => SAMPLE_TX })
    const out = await createTransaction(baseArgs)
    expect(out.redirectUrl).toBe('https://payments.guardarian.com/en/checkout?tid=5808727624')
    expect(out.id).toBe('5808727624')

    const [url, opts] = fetch.mock.calls[0]
    expect(url).toMatch(/\/transaction$/)
    expect(opts.method).toBe('POST')
    expect(opts.headers['x-api-key']).toBe('test-key')
    const body = JSON.parse(opts.body)
    expect(body.from_currency).toBe('EUR')
    expect(body.to_currency).toBe('BTC')
    expect(body.to_network).toBe('BTC')
    expect(body.payout_info.payout_address).toBe(baseArgs.walletAddress)
    expect(body.payout_info.skip_choose_payout_address).toBe(true)
  })

  it('falls back to building the checkout url from id when redirect_url is absent', async () => {
    fetch.mockResolvedValueOnce({ ok: true, json: async () => ({ id: '999', status: 'new' }) })
    const out = await createTransaction(baseArgs)
    expect(out.redirectUrl).toBe('https://payments.guardarian.com/checkout?tid=999')
  })

  it('throws not_configured when the api key is missing', async () => {
    vi.stubEnv('GUARDARIAN_API_KEY', '')
    await expect(createTransaction(baseArgs)).rejects.toMatchObject({ code: 'not_configured' })
  })

  it('maps a 429 upstream to a rate_limited error', async () => {
    fetch.mockResolvedValueOnce({ ok: false, status: 429, text: async () => 'slow down' })
    await expect(createTransaction(baseArgs)).rejects.toMatchObject({ code: 'rate_limited' })
  })

  it('throws invalid_response when neither redirect_url nor id is present', async () => {
    fetch.mockResolvedValueOnce({ ok: true, json: async () => ({ status: 'new' }) })
    await expect(createTransaction(baseArgs)).rejects.toMatchObject({ code: 'invalid_response' })
  })
})

describe('isGuardarianEnabled', () => {
  it('reflects GUARDARIAN_API_KEY presence', () => {
    expect(isGuardarianEnabled()).toBe(true)
    vi.stubEnv('GUARDARIAN_API_KEY', '')
    expect(isGuardarianEnabled()).toBe(false)
  })
})

describe('getQuote — BUY', () => {
  it('calls /v1/estimate with fiat→crypto params and x-api-key', async () => {
    fetch.mockResolvedValueOnce({ ok: true, json: async () => SAMPLE_ESTIMATE })
    const q = await getQuote({ fiatCurrency: 'EUR', cryptoCurrency: 'BTC', network: 'bitcoin', fiatAmount: 100 })

    const [url, opts] = fetch.mock.calls[0]
    expect(url).toContain('https://api-payments.guardarian.com/v1/estimate?')
    expect(decodeURIComponent(url)).toContain('from_currency=EUR')
    expect(decodeURIComponent(url)).toContain('from_amount=100')
    expect(decodeURIComponent(url)).toContain('to_currency=BTC')
    expect(decodeURIComponent(url)).toContain('to_network=BTC')
    expect(opts.headers['x-api-key']).toBe('test-key')

    expect(q.cryptoAmount).toBeCloseTo(0.0018112)
    expect(q.fee).toBeCloseTo(0.5)
    expect(q.feeAsset).toBe('EUR')
    expect(q.rate).toBeCloseTo(0.00001812)
    expect(q.raw).toBe(SAMPLE_ESTIMATE)
  })

  it('omits to_network for unmapped networks', async () => {
    fetch.mockResolvedValueOnce({ ok: true, json: async () => SAMPLE_ESTIMATE })
    await getQuote({ fiatCurrency: 'USD', cryptoCurrency: 'ADA', network: 'cardano', fiatAmount: 50 })
    expect(fetch.mock.calls[0][0]).not.toContain('to_network')
  })

  it('sums multiple service fees', async () => {
    fetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        ...SAMPLE_ESTIMATE,
        service_fees: [
          { amount: '0.5', currency: 'EUR' },
          { amount: '1.25', currency: 'EUR' },
        ],
      }),
    })
    const q = await getQuote({ fiatCurrency: 'EUR', cryptoCurrency: 'BTC', network: 'bitcoin', fiatAmount: 100 })
    expect(q.fee).toBeCloseTo(1.75)
  })
})

describe('getQuote — SELL', () => {
  it('quotes crypto→fiat when cryptoAmount is provided', async () => {
    fetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ ...SAMPLE_ESTIMATE, value: '257.75', to_currency: 'EUR', from_currency: 'BTC' }),
    })
    const q = await getQuote({ fiatCurrency: 'EUR', cryptoCurrency: 'BTC', network: 'bitcoin', cryptoAmount: 0.005, side: 'SELL' })
    expect(decodeURIComponent(fetch.mock.calls[0][0])).toContain('from_currency=BTC')
    expect(decodeURIComponent(fetch.mock.calls[0][0])).toContain('from_amount=0.005')
    expect(q.cryptoAmount).toBeCloseTo(257.75)
  })

  it('refuses SELL without an explicit cryptoAmount (would misquote)', async () => {
    await expect(getQuote({ fiatCurrency: 'EUR', cryptoCurrency: 'BTC', fiatAmount: 500, side: 'SELL' }))
      .rejects.toMatchObject({ code: 'sell_not_implemented' })
    expect(fetch).not.toHaveBeenCalled()
  })
})

describe('getQuote — failure modes', () => {
  it('throws not_configured without an api key', async () => {
    vi.stubEnv('GUARDARIAN_API_KEY', '')
    await expect(getQuote({ fiatCurrency: 'EUR', cryptoCurrency: 'BTC', fiatAmount: 100 }))
      .rejects.toMatchObject({ code: 'not_configured' })
  })

  it('maps 401/403 to not_configured (bad key)', async () => {
    fetch.mockResolvedValueOnce({ ok: false, status: 403, text: async () => 'forbidden' })
    await expect(getQuote({ fiatCurrency: 'EUR', cryptoCurrency: 'BTC', fiatAmount: 100 }))
      .rejects.toMatchObject({ code: 'not_configured' })
  })

  it('maps 5xx to upstream_error', async () => {
    fetch.mockResolvedValueOnce({ ok: false, status: 502, text: async () => 'bad gateway' })
    await expect(getQuote({ fiatCurrency: 'EUR', cryptoCurrency: 'BTC', fiatAmount: 100 }))
      .rejects.toMatchObject({ code: 'upstream_error' })
  })

  it('rejects malformed estimates (no value)', async () => {
    fetch.mockResolvedValueOnce({ ok: true, json: async () => ({ service_fees: [] }) })
    await expect(getQuote({ fiatCurrency: 'EUR', cryptoCurrency: 'BTC', fiatAmount: 100 }))
      .rejects.toMatchObject({ code: 'invalid_response' })
  })
})
