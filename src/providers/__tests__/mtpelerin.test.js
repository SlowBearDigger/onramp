import { describe, it, expect } from 'vitest'
import mtpelerin from '../mtpelerin/index.js'

describe('mtpelerin provider — interface conformance', () => {
  it('declares hasWebhook=false (frontend-event-only)', () => {
    expect(mtpelerin.getMetadata().hasWebhook).toBe(false)
  })

  it('id matches the registry slug', () => {
    expect(mtpelerin.getMetadata().id).toBe('mtpelerin')
  })
})

describe('mtpelerin.buildWidgetUrl', () => {
  it('builds a buy URL with bsc/bdc/bsa params', () => {
    const url = mtpelerin.buildWidgetUrl({
      mode: 'buy',
      fiatCurrency: 'EUR',
      cryptoCurrency: 'BTC',
      cryptoNetwork: 'bitcoin',
      fiatAmount: 100,
    })
    expect(url).toMatch(/^https:\/\/widget\.mtpelerin\.com\/\?/)
    const u = new URL(url)
    expect(u.searchParams.get('tab')).toBe('buy')
    expect(u.searchParams.get('bsc')).toBe('EUR')
    expect(u.searchParams.get('bdc')).toBe('BTC')
    expect(u.searchParams.get('bsa')).toBe('100')
    expect(u.searchParams.get('dnet')).toBe('bitcoin_mainnet')
    expect(u.searchParams.get('pm')).toBe('card')
  })

  it('builds a sell URL with ssc/sdc/sda params (different param names than buy)', () => {
    const url = mtpelerin.buildWidgetUrl({
      mode: 'sell',
      fiatCurrency: 'USD',
      cryptoCurrency: 'ETH',
      cryptoNetwork: 'ethereum',
      fiatAmount: 50,
    })
    const u = new URL(url)
    expect(u.searchParams.get('tab')).toBe('sell')
    expect(u.searchParams.get('ssc')).toBe('ETH')
    expect(u.searchParams.get('sdc')).toBe('USD')
    expect(u.searchParams.get('sda')).toBe('50')
    expect(u.searchParams.get('dnet')).toBe('mainnet')
  })

  it('passes mode=dark for dark theme', () => {
    const url = mtpelerin.buildWidgetUrl({
      mode: 'buy',
      fiatCurrency: 'USD',
      cryptoCurrency: 'BTC',
      cryptoNetwork: 'bitcoin',
      fiatAmount: 100,
      theme: 'dark',
    })
    expect(new URL(url).searchParams.get('mode')).toBe('dark')
  })

  it('omits amount param when fiatAmount is not finite', () => {
    const url = mtpelerin.buildWidgetUrl({
      mode: 'buy',
      fiatCurrency: 'USD',
      cryptoCurrency: 'BTC',
      cryptoNetwork: 'bitcoin',
      fiatAmount: NaN,
    })
    expect(new URL(url).searchParams.has('bsa')).toBe(false)
  })

  it('maps canonical network names to mtpelerin slugs', () => {
    const cases = [
      ['polygon', 'matic_mainnet'],
      ['matic', 'matic_mainnet'],
      ['bsc', 'bsc_mainnet'],
      ['base', 'base_mainnet'],
      ['arbitrum', 'arbitrum_mainnet'],
      ['ethereum', 'mainnet'],
      ['mainnet', 'mainnet'],
    ]
    for (const [input, expected] of cases) {
      const url = mtpelerin.buildWidgetUrl({
        mode: 'buy', fiatCurrency: 'USD', cryptoCurrency: 'USDC',
        cryptoNetwork: input, fiatAmount: 100,
      })
      expect(new URL(url).searchParams.get('dnet'), `network ${input}`).toBe(expected)
    }
  })

  it('preserves unknown networks as-is so misconfigurations surface in the URL', () => {
    const url = mtpelerin.buildWidgetUrl({
      mode: 'buy', fiatCurrency: 'USD', cryptoCurrency: 'BTC',
      cryptoNetwork: 'unknown-chain', fiatAmount: 100,
    })
    expect(new URL(url).searchParams.get('dnet')).toBe('unknown-chain')
  })
})

describe('mtpelerin.parseEvent', () => {
  it('maps paymentSubmitted to type=success-unverified', () => {
    const ev = mtpelerin.parseEvent({
      data: { type: 'paymentSubmitted', data: { paymentId: 'pay_1', paymentType: 'card' } },
    })
    expect(ev.type).toBe('success-unverified')
    expect(ev.orderData.orderId).toBe('pay_1')
    expect(ev.orderData.status).toBe('PAYMENT_SUBMITTED_UNVERIFIED')
  })

  it('maps orderCreated to type=created', () => {
    const ev = mtpelerin.parseEvent({
      data: {
        type: 'orderCreated',
        data: { id: 'ord_1', sourceAmount: 100, sourceCurrency: 'USD', destinationCurrency: 'BTC' },
      },
    })
    expect(ev.type).toBe('created')
    expect(ev.orderData.orderId).toBe('ord_1')
    expect(ev.orderData.fiatCurrency).toBe('USD')
  })

  it('returns type=unknown for unrecognised events', () => {
    const ev = mtpelerin.parseEvent({ data: { type: 'somethingNew' } })
    expect(ev.type).toBe('unknown')
    expect(ev.rawEventId).toBe('somethingNew')
  })

  it('handles malformed events without throwing', () => {
    expect(mtpelerin.parseEvent({}).type).toBe('unknown')
    expect(mtpelerin.parseEvent({ data: null }).type).toBe('unknown')
    expect(mtpelerin.parseEvent(null).type).toBe('unknown')
  })
})

describe('mtpelerin.getOrigins', () => {
  it('returns exactly the widget origin', () => {
    const origins = mtpelerin.getOrigins()
    expect(origins).toEqual(['https://widget.mtpelerin.com'])
  })
})
