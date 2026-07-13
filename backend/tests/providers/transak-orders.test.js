import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { fetchPartnerOrders, partnerOrderToRow } from '../../providers/transak-orders.js'
import { _resetCacheForTests } from '../../providers/transak-token.js'

const SAMPLE_ORDER = {
  id: 'a1b2c3d4-0000-1111-2222-333344445555',
  partnerOrderId: 'po-123',
  partnerCustomerId: '0xabc0000000000000000000000000000000000abc',
  walletAddress: '0xabc0000000000000000000000000000000000abc',
  status: 'COMPLETED',
  isBuyOrSell: 'BUY',
  fiatCurrency: 'EUR',
  fiatAmount: 100,
  cryptoCurrency: 'USDC',
  cryptoAmount: 98.5,
  network: 'ethereum',
  transactionHash: '0xdeadbeef',
  createdAt: '2026-06-01T10:00:00.000Z',
  completedAt: '2026-06-01T10:05:00.000Z',
}

describe('partnerOrderToRow', () => {
  it('maps a complete partner-api order to the db row shape', () => {
    const row = partnerOrderToRow(SAMPLE_ORDER)
    expect(row).toMatchObject({
      id: SAMPLE_ORDER.id,
      provider: 'transak',
      unverified: 0,
      partner_order_id: 'po-123',
      customer_id: SAMPLE_ORDER.partnerCustomerId,
      status: 'COMPLETED',
      event_id: 'PARTNER_API_SYNC',
      product: 'BUY',
      fiat_currency: 'EUR',
      fiat_amount: 100,
      crypto_currency: 'USDC',
      crypto_amount: 98.5,
      wallet_address: SAMPLE_ORDER.walletAddress,
      network: 'ethereum',
      tx_hash: '0xdeadbeef',
    })
    expect(row.created_at).toBe(Date.parse('2026-06-01T10:00:00.000Z'))
    expect(row.updated_at).toBe(Date.parse('2026-06-01T10:05:00.000Z'))
  })

  it('accepts _id when id is missing (older api responses)', () => {
    const { id: _drop, ...rest } = SAMPLE_ORDER
    const row = partnerOrderToRow({ ...rest, _id: 'legacy-id-1' })
    expect(row.id).toBe('legacy-id-1')
  })

  it('returns null when there is no usable id', () => {
    expect(partnerOrderToRow({ status: 'COMPLETED' })).toBeNull()
    expect(partnerOrderToRow(null)).toBeNull()
    expect(partnerOrderToRow(undefined)).toBeNull()
  })

  it('falls back to walletAddress when partnerCustomerId is missing', () => {
    const { partnerCustomerId: _drop, ...rest } = SAMPLE_ORDER
    const row = partnerOrderToRow(rest)
    expect(row.customer_id).toBe(SAMPLE_ORDER.walletAddress)
  })

  it('defaults product to BUY for anything that is not SELL', () => {
    expect(partnerOrderToRow({ ...SAMPLE_ORDER, isBuyOrSell: 'SELL' }).product).toBe('SELL')
    expect(partnerOrderToRow({ ...SAMPLE_ORDER, isBuyOrSell: undefined }).product).toBe('BUY')
  })

  it('tolerates malformed numerics and dates without throwing', () => {
    const row = partnerOrderToRow({
      ...SAMPLE_ORDER,
      fiatAmount: 'not-a-number',
      cryptoAmount: null,
      createdAt: 'garbage',
      completedAt: undefined,
      updatedAt: undefined,
    })
    expect(row.fiat_amount).toBeNull()
    expect(row.crypto_amount).toBeNull()
    expect(Number.isFinite(row.created_at)).toBe(true)
    expect(Number.isFinite(row.updated_at)).toBe(true)
  })
})

describe('fetchPartnerOrders', () => {
  beforeEach(() => {
    _resetCacheForTests()
    vi.stubEnv('TRANSAK_PARTNER_ACCESS_TOKEN', 'test-token')
    vi.stubEnv('TRANSAK_API_KEY', 'test-api-key')
    vi.stubEnv('TRANSAK_API_SECRET', '')
    vi.stubGlobal('fetch', vi.fn())
  })
  afterEach(() => {
    vi.unstubAllEnvs()
    vi.unstubAllGlobals()
  })

  it('calls the staging orders endpoint with access-token header and wallet filter', async () => {
    fetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ data: [SAMPLE_ORDER] }),
    })
    const orders = await fetchPartnerOrders({ walletAddress: '0xabc' })
    expect(orders).toHaveLength(1)

    const [url, opts] = fetch.mock.calls[0]
    expect(url).toContain('https://api-stg.transak.com/partners/api/v2/orders')
    expect(url).toContain(encodeURIComponent('filter[walletAddress]').replace(/%5B/g, '%5B'))
    expect(decodeURIComponent(url)).toContain('filter[walletAddress]=0xabc')
    expect(opts.headers['access-token']).toBe('test-token')
    expect(opts.headers['x-api-key']).toBe('test-api-key')
  })

  it('returns [] when the api responds without a data array', async () => {
    fetch.mockResolvedValueOnce({ ok: true, json: async () => ({}) })
    await expect(fetchPartnerOrders({ walletAddress: '0xabc' })).resolves.toEqual([])
  })

  it('throws auth_failed on 401', async () => {
    fetch.mockResolvedValueOnce({ ok: false, status: 401, text: async () => 'nope' })
    await expect(fetchPartnerOrders({ walletAddress: '0xabc' }))
      .rejects.toMatchObject({ code: 'auth_failed', status: 401 })
  })

  it('throws upstream_error on 5xx', async () => {
    fetch.mockResolvedValueOnce({ ok: false, status: 502, text: async () => 'bad gateway' })
    await expect(fetchPartnerOrders({ walletAddress: '0xabc' }))
      .rejects.toMatchObject({ code: 'upstream_error' })
  })

  it('clamps limit into [1, 100]', async () => {
    fetch.mockResolvedValue({ ok: true, json: async () => ({ data: [] }) })
    await fetchPartnerOrders({ walletAddress: '0xabc', limit: 9999 })
    expect(fetch.mock.calls[0][0]).toContain('limit=100')
    await fetchPartnerOrders({ walletAddress: '0xabc', limit: -5 })
    expect(fetch.mock.calls[1][0]).toContain('limit=1')
  })
})
